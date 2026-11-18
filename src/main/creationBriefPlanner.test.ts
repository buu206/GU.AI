import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CreationPlanInput } from '../shared/creationBrief.js';
import type { StartThreadOptions, StartTurnOptions, TurnResult } from './codexAppServer.js';
import { CreationBriefPlanner, parseCreationPlan } from './creationBriefPlanner.js';

const input: CreationPlanInput = {
  requestId: 'request-one',
  idea: '  做一个送信小猫的横版游戏。\n只能跳跃，不能战斗。  ',
  reference: '  参考像素冒险的温暖配色。\n',
  genre: 'custom',
};
const designed = {
  name: '云间猫邮局',
  genre: 'platform',
  visualStyle: '温暖的 2D 像素浮空岛',
  coreLoop: '跳过断桥 → 收集信件 → 将信交给岛上居民',
  winCondition: '送完三封信后抵达终点；跌落可在最近的检查点重新开始。',
  controls: 'A/D 移动，空格跳跃，不设置攻击操作。',
  scope: '先做一个小猫角色、一座浮空岛和三封信；暂按键盘操作，可在确认前修改。',
};
const response = (text = JSON.stringify(designed)): TurnResult => ({ turnId: 'turn-one', status: 'completed', text, raw: {} });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function abortError() { const error = new Error('canceled after confirmation'); error.name = 'AbortError'; return error; }
class FakeRuntime {
  readonly configCwds: Array<string | undefined> = [];
  readonly threads: StartThreadOptions[] = [];
  readonly turns: StartTurnOptions[] = [];
  readonly unsubscribed: string[] = [];
  thread = async () => 'planner-thread';
  turn = async (_options: StartTurnOptions) => response();
  async readConfig(cwd?: string): Promise<Record<string, unknown>> {
    this.configCwds.push(cwd);
    return { mcp_servers: { private_tools: { command: '/private/command', env: { TOKEN: 'never-in-prompt' } } } };
  }
  async startThread(options: StartThreadOptions) { this.threads.push(options); return this.thread(); }
  async runTurn(options: StartTurnOptions) { this.turns.push(options); return this.turn(options); }
  async unsubscribeThread(threadId: string) { this.unsubscribed.push(threadId); }
}
const fixtures: Array<{ planner: CreationBriefPlanner; root: string }> = [];
afterEach(async () => {
  for (const { planner, root } of fixtures.splice(0)) {
    await planner.dispose();
    await rm(root, { recursive: true, force: true });
  }
});
async function setup(runtime = new FakeRuntime()) {
  const root = await mkdtemp(join(tmpdir(), 'gu-plan-'));
  const workspaceRoot = join(root, 'scratch');
  const planner = new CreationBriefPlanner(runtime, { workspaceRoot });
  fixtures.push({ planner, root });
  return { planner, runtime, workspaceRoot };
}

describe('CreationBriefPlanner', () => {
  it('maps the model design while preserving original text and runs once in an isolated, tool-disabled thread', async () => {
    const { planner, runtime, workspaceRoot } = await setup();
    const [first, duplicate] = await Promise.all([planner.plan(input), planner.plan(input)]);
    expect(first).toEqual({ version: 1, ...designed, idea: input.idea, reference: input.reference });
    expect(duplicate).toEqual(first);
    expect(runtime.threads).toHaveLength(1);
    expect(runtime.turns).toHaveLength(1);
    expect(runtime.threads[0]).toMatchObject({
      sandbox: 'read-only', approvalPolicy: 'never', ephemeral: true, dynamicTools: [], environments: [],
      config: { web_search: 'disabled', features: { shell_tool: false, image_generation: false, multi_agent: false }, mcp_servers: { private_tools: { enabled: false, command: '/private/command', env: { TOKEN: 'never-in-prompt' } } } },
    });
    expect(runtime.threads[0]!.cwd.startsWith(workspaceRoot)).toBe(true);
    expect(runtime.configCwds).toEqual([runtime.threads[0]!.cwd]);
    expect(runtime.threads[0]!.runtimeWorkspaceRoots).toEqual([runtime.threads[0]!.cwd]);
    expect(runtime.turns[0]!.prompt).not.toContain('never-in-prompt');
    expect(JSON.stringify(first)).not.toContain('never-in-prompt');
    expect(runtime.turns[0]).toMatchObject({ effort: 'low', timeoutMs: 60000, sandboxPolicy: { type: 'readOnly', networkAccess: false } });
    expect(runtime.turns[0]!.outputSchema).toMatchObject({ additionalProperties: false });
    expect(runtime.unsubscribed).toEqual(['planner-thread']);
    expect(await readdir(workspaceRoot)).toEqual([]);
    first.name = 'mutated outside service';
    expect((await planner.plan(input)).name).toBe(designed.name);
    expect(runtime.turns).toHaveLength(1);
    await expect(planner.plan({ ...input, idea: '改成解谜游戏' })).rejects.toThrow('同一方案请求');
  });

  it('does not convert bad output or failed/timeout turns into successful local templates or automatic retries', async () => {
    const { planner, runtime, workspaceRoot } = await setup();
    runtime.turn = async () => response('not valid json');
    await expect(planner.plan(input)).rejects.toThrow('格式无效');
    await expect(planner.plan(input)).rejects.toThrow('格式无效');
    expect(runtime.turns).toHaveLength(1);
    runtime.turn = async () => ({ ...response(), status: 'failed' });
    await expect(planner.plan({ ...input, requestId: 'failed' })).rejects.toThrow('未完成');
    runtime.turn = async () => { throw new Error('Codex turn timed out'); };
    await expect(planner.plan({ ...input, requestId: 'timeout' })).rejects.toThrow('timed out');
    expect(runtime.unsubscribed).toHaveLength(3);
    expect(await readdir(workspaceRoot)).toEqual([]);
    for (const bad of [
      { ...designed, idea: 'overwrite user input' },
      { ...designed, scope: '' },
      { ...designed, genre: 'unknown' },
      { ...designed, controls: 'x'.repeat(501) },
    ]) expect(() => parseCreationPlan(JSON.stringify(bad), input)).toThrow();
  });

  it('rejects late results after cancellation and blocks a new request until cleanup finishes', async () => {
    const runtime = new FakeRuntime();
    const turn = deferred<TurnResult>();
    runtime.turn = () => turn.promise;
    const { planner, workspaceRoot } = await setup(runtime);
    const pending = planner.plan(input);
    const rejection = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(runtime.turns).toHaveLength(1));
    let canceled = false;
    const canceling = planner.cancel(input.requestId).then(() => { canceled = true; });
    expect(runtime.turns[0]!.signal!.aborted).toBe(true);
    await expect(planner.plan({ ...input, requestId: 'different' })).rejects.toThrow('已有正在整理');
    await Promise.resolve();
    expect(canceled).toBe(false);
    // Deliberately simulate a runtime that ignores abort and returns a valid, stale result.
    turn.resolve(response());
    await Promise.all([rejection, canceling]);
    expect(canceled).toBe(true);
    expect(runtime.unsubscribed).toEqual(['planner-thread']);
    expect(await readdir(workspaceRoot)).toEqual([]);
  });

  it('handles cancellation before plan arrives and during thread startup without starting a model turn', async () => {
    const runtime = new FakeRuntime();
    const start = deferred<string>();
    runtime.thread = () => start.promise;
    const { planner, workspaceRoot } = await setup(runtime);
    await planner.cancel('pre-canceled');
    await expect(planner.plan({ ...input, requestId: 'pre-canceled' })).rejects.toMatchObject({ name: 'AbortError' });
    const pending = planner.plan(input);
    const rejection = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(runtime.threads).toHaveLength(1));
    const canceling = planner.cancel(input.requestId);
    start.resolve('late-thread');
    await Promise.all([rejection, canceling]);
    expect(runtime.turns).toEqual([]);
    expect(runtime.unsubscribed).toEqual(['late-thread']);
    expect(await readdir(workspaceRoot)).toEqual([]);
  });

  it('waits for confirmed abort and reports interruption failure instead of claiming it stopped', async () => {
    const runtime = new FakeRuntime();
    const turn = deferred<TurnResult>();
    runtime.turn = () => turn.promise;
    const { planner } = await setup(runtime);
    const pending = planner.plan(input);
    const rejected = expect(pending).rejects.toThrow('无法确认停止');
    await vi.waitFor(() => expect(runtime.turns).toHaveLength(1));
    const canceling = planner.cancel(input.requestId);
    const cancellationRejected = expect(canceling).rejects.toThrow('无法确认停止');
    turn.reject(new Error('无法确认停止，请检查运行时状态'));
    await Promise.all([rejected, cancellationRejected]);
    expect(runtime.unsubscribed).toHaveLength(1);
    await expect(planner.cancel(input.requestId)).rejects.toThrow('无法确认停止');

    runtime.turn = async (options) => new Promise<TurnResult>((_resolve, reject) => {
      options.signal!.addEventListener('abort', () => reject(abortError()), { once: true });
    });
    const next = planner.plan({ ...input, requestId: 'confirmed' });
    const nextRejected = expect(next).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(runtime.turns).toHaveLength(2));
    await planner.cancel('confirmed');
    await nextRejected;
  });

  it('validates before any runtime or filesystem work, and disposal cancels only its own pending request', async () => {
    const runtime = new FakeRuntime();
    const turn = deferred<TurnResult>();
    runtime.turn = () => turn.promise;
    const { planner, workspaceRoot } = await setup(runtime);
    await expect(planner.plan({ ...input, idea: '' })).rejects.toThrow('想法');
    expect(runtime.threads).toEqual([]);
    await expect(readdir(workspaceRoot)).rejects.toMatchObject({ code: 'ENOENT' });
    const pending = planner.plan(input);
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(runtime.turns).toHaveLength(1));
    const disposing = planner.dispose();
    expect(runtime.turns[0]!.signal!.aborted).toBe(true);
    turn.reject(abortError());
    await Promise.all([disposing, rejected]);
    expect(runtime.unsubscribed).toEqual(['planner-thread']);
    await expect(planner.plan({ ...input, requestId: 'later' })).rejects.toThrow('已关闭');
    expect(await readdir(workspaceRoot)).toEqual([]);
  });

  it('fails before thread creation if an inherited MCP entry is malformed', async () => {
    const { planner, runtime, workspaceRoot } = await setup();
    runtime.readConfig = async () => ({ mcp_servers: { broken: null } });
    await expect(planner.plan(input)).rejects.toThrow('工具配置');
    expect(runtime.threads).toEqual([]);
    expect(runtime.turns).toEqual([]);
    expect(await readdir(workspaceRoot)).toEqual([]);
  });
});
