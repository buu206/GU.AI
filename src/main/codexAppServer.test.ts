import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CodexAppServer, type JsonValue } from './codexAppServer.js';

vi.mock('./systemProxy.js', () => ({ systemProxyEnvironment: async () => ({}) }));

const wire = vi.hoisted(() => ({
  peers: [] as Array<EventEmitter & { request: ReturnType<typeof vi.fn> }>,
  spawn: vi.fn(),
  respond: vi.fn(),
}));
vi.mock('node:child_process', () => ({ spawn: wire.spawn }));
vi.mock('./codexLocator.js', () => ({
  locateCodexBinary: vi.fn(async () => '/fake/codex'),
  readCodexVersion: vi.fn(() => 'codex-cli test'),
}));
vi.mock('./jsonRpcPeer.js', async () => {
  const { EventEmitter: Emitter } = await import('node:events');
  return {
    JsonRpcPeer: class extends Emitter {
      request = vi.fn((method: string, params: unknown) => wire.respond(method, params));
      constructor() { super(); wire.peers.push(this); }
      start() {}
      notify() {}
      endOutput() {}
      close(error: Error) { this.emit('closed', error); }
    },
  };
});

const runtimes: CodexAppServer[] = [];
const options = { threadId: 'thread-1', prompt: 'Create an editable game brief.' };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
async function flush() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
function peer() { return wire.peers.at(-1)!; }
function complete(turnId: string, text: string, status = 'completed') {
  peer().emit('notification', { method: 'item/completed', params: { turnId, item: { type: 'agentMessage', text } } });
  peer().emit('notification', { method: 'turn/completed', params: { turn: { id: turnId, status } } });
}
async function fixture() {
  const runtime = new CodexAppServer();
  runtimes.push(runtime);
  await runtime.start();
  return runtime;
}
function bootstrapReply(method: string) {
  if (method === 'initialize') return { codexHome: '/fake/home', userAgent: 'test', platformFamily: 'unix', platformOs: 'test' };
  if (method === 'account/read') return { account: null };
  if (method === 'model/list') return { data: [], nextCursor: null };
  if (method === 'modelProvider/capabilities/read') return { namespaceTools: false, imageGeneration: false, webSearch: false };
  if (method === 'thread/start') return { thread: { id: 'thread-1' } };
  if (method === 'turn/start') return { turn: { id: 'turn-1' } };
  if (method === 'turn/interrupt') return {};
  throw new Error('Unexpected wire request: ' + method);
}
beforeEach(() => {
  wire.peers.length = 0;
  wire.respond.mockReset().mockImplementation(async (method: string) => bootstrapReply(method));
  wire.spawn.mockReset().mockImplementation(() => {
    const child = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(), stdin: new PassThrough(), stderr: new PassThrough(),
      exitCode: 0, kill: vi.fn(),
    });
    return child;
  });
});
afterEach(async () => {
  for (const runtime of runtimes.splice(0)) await runtime.stop();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('CodexAppServer planning turn boundaries', () => {
  it('passes per-thread restrictions and structured output to the wire without host-only signal or timeout', async () => {
    const runtime = await fixture();
    const config = { features: { shell_tool: false }, mcp_servers: { demo: { enabled: false } } };
    await runtime.startThread({
      cwd: '/fake/planning', sandbox: 'read-only', approvalPolicy: 'never', ephemeral: true,
      dynamicTools: [], config, environments: [], runtimeWorkspaceRoots: ['/fake/planning'],
      baseInstructions: 'Design only.', developerInstructions: 'Return JSON only.',
    });
    expect(peer().request).toHaveBeenCalledWith('thread/start', expect.objectContaining({
      config, environments: [], runtimeWorkspaceRoots: ['/fake/planning'], dynamicTools: [],
      sandbox: 'read-only', ephemeral: true, baseInstructions: 'Design only.',
    }));
    const schema: JsonValue = { type: 'object', properties: { name: { type: 'string' } }, required: ['name'], additionalProperties: false };
    const controller = new AbortController();
    const result = runtime.runTurn({ ...options, signal: controller.signal, timeoutMs: 5000,
      outputSchema: schema, sandboxPolicy: { type: 'readOnly', networkAccess: false } });
    await flush();
    const sent = peer().request.mock.calls.find(([method]) => method === 'turn/start')![1];
    expect(sent).toMatchObject({ outputSchema: schema, sandboxPolicy: { type: 'readOnly', networkAccess: false } });
    expect(sent).not.toHaveProperty('signal');
    expect(sent).not.toHaveProperty('timeoutMs');
    complete('turn-1', '{"name":"森林小队"}');
    await expect(result).resolves.toMatchObject({ status: 'completed', text: '{"name":"森林小队"}' });
  });

  it('retains early completion received before turn/start returns for existing callers without a signal', async () => {
    const runtime = await fixture();
    wire.respond.mockImplementation(async (method: string) => {
      if (method === 'turn/start') {
        peer().emit('notification', { method: 'item/agentMessage/delta', params: { turnId: 'fast', delta: 'partial' } });
        complete('fast', 'final result');
        return { turn: { id: 'fast' } };
      }
      return bootstrapReply(method);
    });
    await expect(runtime.runTurn(options)).resolves.toMatchObject({ turnId: 'fast', status: 'completed', text: 'final result' });
    expect(peer().request.mock.calls.filter(([method]) => method === 'turn/interrupt')).toHaveLength(0);
  });

  it('does not start pre-cancelled work and interrupts the late turn id when cancellation occurs during start', async () => {
    const runtime = await fixture();
    const alreadyCancelled = new AbortController();
    alreadyCancelled.abort();
    await expect(runtime.runTurn({ ...options, signal: alreadyCancelled.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(peer().request.mock.calls.filter(([method]) => method === 'turn/start')).toHaveLength(0);

    const start = deferred<{ turn: { id: string } }>();
    wire.respond.mockImplementation((method: string) => method === 'turn/start' ? start.promise : Promise.resolve(bootstrapReply(method)));
    const controller = new AbortController();
    const result = runtime.runTurn({ ...options, signal: controller.signal });
    const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    await flush();
    controller.abort();
    expect(peer().request.mock.calls.filter(([method]) => method === 'turn/interrupt')).toHaveLength(0);
    start.resolve({ turn: { id: 'late' } });
    await flush();
    expect(peer().request).toHaveBeenCalledWith('turn/interrupt', { threadId: 'thread-1', turnId: 'late' });
    complete('late', '', 'interrupted');
    await rejected;
  });

  it('waits for terminal notification after an interrupt ACK instead of claiming cancellation immediately', async () => {
    const runtime = await fixture();
    const controller = new AbortController();
    const result = runtime.runTurn({ ...options, signal: controller.signal });
    let settled = false;
    void result.then(() => { settled = true; }, () => { settled = true; });
    const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    await flush();
    controller.abort();
    await flush();
    expect(peer().request).toHaveBeenCalledWith('turn/interrupt', { threadId: 'thread-1', turnId: 'turn-1' });
    expect(settled).toBe(false);
    complete('turn-1', '', 'interrupted');
    await rejected;
    expect(settled).toBe(true);
  });

  it('reports an unconfirmed cancellation as an ordinary error after its deadline', async () => {
    vi.useFakeTimers();
    const runtime = await fixture();
    const controller = new AbortController();
    const removed = vi.spyOn(controller.signal, 'removeEventListener');
    const result = runtime.runTurn({ ...options, signal: controller.signal });
    const caught = result.catch((error: Error) => error);
    await flush();
    controller.abort();
    await vi.advanceTimersByTimeAsync(10000);
    const error = await caught;
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ name: 'Error' });
    expect((error as Error).message).toContain('尚未确认模型停止');
    expect(removed).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it('removes the abort listener on normal completion and ignores subsequent abort', async () => {
    const runtime = await fixture();
    const controller = new AbortController();
    const removed = vi.spyOn(controller.signal, 'removeEventListener');
    const result = runtime.runTurn({ ...options, signal: controller.signal });
    await flush();
    complete('turn-1', 'finished');
    await expect(result).resolves.toMatchObject({ text: 'finished' });
    expect(removed).toHaveBeenCalledWith('abort', expect.any(Function));
    controller.abort();
    await flush();
    expect(peer().request.mock.calls.filter(([method]) => method === 'turn/interrupt')).toHaveLength(0);
  });
});
