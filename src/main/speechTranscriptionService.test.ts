import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_SPEECH_BYTES, MAX_SPEECH_DURATION_MS, MAX_TRANSCRIPT_LENGTH, type TranscribeSpeechInput } from '../shared/speech.js';
import { SpeechTranscriptionService, type SpeechTranscriptionServiceOptions } from './speechTranscriptionService.js';

const provider = { endpoint: 'https://speech.example.test/transcribe', model: 'test-transcribe', apiKey: 'fake-private-token' };
const audio = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, ...new Array<number>(20).fill(0)]);
const input: TranscribeSpeechInput = { requestId: 'speech-one', audio, mimeType: 'audio/webm;codecs=opus', durationMs: 1200 };
const services: SpeechTranscriptionService[] = [];
afterEach(async () => { await Promise.all(services.splice(0).map((service) => service.dispose())); });
function fixture(run: typeof fetch, options: Partial<SpeechTranscriptionServiceOptions> = {}) {
  const service = new SpeechTranscriptionService({ settingsStore: { withProvider: async (callback) => callback(provider) }, fetch: run, ...options });
  services.push(service);
  return service;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
}

describe('SpeechTranscriptionService', () => {
  it('sends a minimal multipart upload once and preserves the complete recognized text', async () => {
    const request = vi.fn<typeof fetch>(async (url, init) => {
      expect(url).toBe(provider.endpoint);
      expect(init).toMatchObject({ method: 'POST', redirect: 'manual', headers: { Authorization: 'Bearer fake-private-token' } });
      const form = init!.body as FormData;
      expect([...form.keys()]).toEqual(['file', 'model']);
      expect(form.get('model')).toBe(provider.model);
      const file = form.get('file') as File;
      expect(file.name).toBe('recording.webm');
      expect(file.type).toBe('audio/webm');
      expect(new Uint8Array(await file.arrayBuffer())).toEqual(audio);
      return Response.json({ text: '  做一个猫咪冒险游戏。\n保留原话。  ' });
    });
    const service = fixture(request);
    const [first, duplicate] = await Promise.all([service.transcribe(input), service.transcribe(input)]);
    expect(first).toEqual({ text: '  做一个猫咪冒险游戏。\n保留原话。  ' });
    expect(duplicate).toEqual(first);
    expect(request).toHaveBeenCalledTimes(1);
    first.text = 'consumer mutation';
    expect((await service.transcribe(input)).text).toContain('保留原话');
    await expect(service.transcribe({ ...input, durationMs: 1800 })).rejects.toThrow('不能更换录音');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('validates format, size, and duration before contacting the provider', async () => {
    const request = vi.fn<typeof fetch>();
    const service = fixture(request);
    for (const invalid of [
      { ...input, audio: new Uint8Array(MAX_SPEECH_BYTES + 1) },
      { ...input, audio: new Uint8Array(24) },
      { ...input, mimeType: 'text/html' },
      { ...input, durationMs: MAX_SPEECH_DURATION_MS + 1 },
      { ...input, durationMs: Number.NaN },
    ]) await expect(service.transcribe(invalid)).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });

  it('sanitizes provider errors, refuses redirects, and never retries a failed request automatically', async () => {
    const request = vi.fn<typeof fetch>(async () => new Response('private provider detail: fake-private-token', { status: 401 }));
    const service = fixture(request);
    await expect(service.transcribe(input)).rejects.toThrow('认证失败');
    await expect(service.transcribe(input)).rejects.not.toThrow('fake-private-token');
    expect(request).toHaveBeenCalledTimes(1);
    request.mockResolvedValueOnce(new Response(null, { status: 307, headers: { location: 'https://other.test/' } }));
    await expect(service.transcribe({ ...input, requestId: 'redirect' })).rejects.toThrow('重定向');
    request.mockRejectedValueOnce(new Error('network exception fake-private-token'));
    await expect(service.transcribe({ ...input, requestId: 'network' })).rejects.toThrow('无法连接');
    expect(request).toHaveBeenCalledTimes(3);
  });

  it('requires valid bounded text instead of truncating or accepting empty output', async () => {
    const request = vi.fn<typeof fetch>();
    const service = fixture(request);
    for (const [index, response] of [
      new Response('not-json'),
      Response.json({ text: '   ' }),
      Response.json({ text: '字'.repeat(MAX_TRANSCRIPT_LENGTH + 1) }),
      new Response('x'.repeat(65 * 1024)),
    ].entries()) {
      request.mockResolvedValueOnce(response);
      await expect(service.transcribe({ ...input, requestId: 'invalid-' + index })).rejects.toThrow();
    }
    expect(request).toHaveBeenCalledTimes(4);
  });

  it('handles cancellation before upload, blocks concurrent requests, and discards late results', async () => {
    const response = deferred<Response>();
    const request = vi.fn<typeof fetch>(() => response.promise); // Deliberately ignores the abort signal.
    const service = fixture(request);
    await service.cancel('pre-canceled');
    await expect(service.transcribe({ ...input, requestId: 'pre-canceled' })).rejects.toMatchObject({ name: 'AbortError' });
    expect(request).not.toHaveBeenCalled();
    const pending = service.transcribe(input);
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    await expect(service.transcribe({ ...input, requestId: 'concurrent' })).rejects.toThrow('已有录音');
    await service.cancel(input.requestId);
    await rejected;
    expect(request.mock.calls[0]![1]!.signal!.aborted).toBe(true);
    response.resolve(Response.json({ text: '迟到的文字不应被应用' }));
    await expect(service.transcribe(input)).rejects.toMatchObject({ name: 'AbortError' });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('times out a stalled provider without exposing errors or starting a retry', async () => {
    const request = vi.fn<typeof fetch>(() => new Promise<Response>(() => undefined));
    const service = fixture(request, { requestTimeoutMs: 10 });
    await expect(service.transcribe(input)).rejects.toThrow('超时');
    await expect(service.transcribe(input)).rejects.toThrow('超时');
    expect(request).toHaveBeenCalledTimes(1);
  });
});
