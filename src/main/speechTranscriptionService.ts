import { createHash } from 'node:crypto';
import {
  MAX_SPEECH_BYTES,
  MAX_SPEECH_DURATION_MS,
  MAX_TRANSCRIPT_LENGTH,
  normalizeSpeechMimeType,
  validateSpeechRequestId,
  type SpeechTranscript,
  type TranscribeSpeechInput,
} from '../shared/speech.js';
import type { SpeechSettingsStore } from './speechSettingsStore.js';

interface RequestEntry {
  fingerprint: string;
  controller: AbortController;
  promise: Promise<SpeechTranscript>;
  settled: boolean;
}
export interface SpeechTranscriptionServiceOptions {
  settingsStore: Pick<SpeechSettingsStore, 'withProvider'>;
  fetch?: typeof fetch;
  requestTimeoutMs?: number;
}
const MAX_REMEMBERED_REQUESTS = 64;
const MAX_RESPONSE_BYTES = 64 * 1024;
const FILE_EXTENSIONS: Record<string, string> = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'mp4', 'audio/wav': 'wav' };

/** Recordings never touch the filesystem; the UI reviews the returned text. */
export class SpeechTranscriptionService {
  readonly #settings: Pick<SpeechSettingsStore, 'withProvider'>;
  readonly #fetch: typeof fetch;
  readonly #timeout: number;
  readonly #requests = new Map<string, RequestEntry>();
  readonly #cancelled = new Set<string>();
  // Keep small ID tombstones for this service lifetime even after response eviction:
  // an old IPC retry must never start a second billable upload.
  readonly #retired = new Set<string>();
  #disposed = false;

  constructor(options: SpeechTranscriptionServiceOptions) {
    this.#settings = options.settingsStore;
    this.#fetch = options.fetch ?? fetch;
    this.#timeout = Math.min(60_000, Math.max(1, options.requestTimeoutMs ?? 60_000));
  }

  transcribe(value: TranscribeSpeechInput): Promise<SpeechTranscript> {
    try {
      if (this.#disposed) throw new Error('语音识别服务已关闭');
      const input = validateInput(value);
      if (this.#cancelled.has(input.requestId)) throw abortedError();
      if (this.#retired.has(input.requestId)) throw new Error('此语音请求已经处理，请重新录音后使用新请求');
      const fingerprint = createHash('sha256').update(input.audio).update('\n' + input.mimeType + '\n' + input.durationMs).digest('hex');
      const existing = this.#requests.get(input.requestId);
      if (existing) {
        if (existing.fingerprint !== fingerprint) throw new Error('同一语音请求不能更换录音');
        return existing.promise.then((result) => ({ ...result }));
      }
      if ([...this.#requests.values()].some((entry) => !entry.settled)) throw new Error('已有录音正在转文字，请先等待或取消');
      const entry: RequestEntry = {
        fingerprint,
        controller: new AbortController(),
        promise: Promise.resolve().then(() => this.#execute(input, entry.controller)),
        settled: false,
      };
      this.#requests.set(input.requestId, entry);
      const settle = () => {
        entry.settled = true;
        for (const [id, request] of this.#requests) {
          if (this.#requests.size <= MAX_REMEMBERED_REQUESTS) break;
          if (request.settled) {
            this.#retired.add(id);
            this.#requests.delete(id);
          }
        }
      };
      void entry.promise.then(settle, settle);
      return entry.promise.then((result) => ({ ...result }));
    } catch (error) { return Promise.reject(error); }
  }

  async cancel(value: string): Promise<void> {
    const id = validateSpeechRequestId(value);
    const entry = this.#requests.get(id);
    if (!entry) {
      this.#cancelled.add(id);
      return;
    }
    if (entry.settled) return;
    entry.controller.abort();
    await entry.promise.catch((error) => { if (!(error instanceof Error && error.name === 'AbortError')) throw error; });
  }

  async dispose(): Promise<void> {
    this.#disposed = true;
    for (const entry of this.#requests.values()) if (!entry.settled) entry.controller.abort();
    await Promise.allSettled([...this.#requests.values()].map((entry) => entry.promise));
    this.#requests.clear();
    this.#cancelled.clear();
    this.#retired.clear();
  }

  async #execute(input: TranscribeSpeechInput, controller: AbortController): Promise<SpeechTranscript> {
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, this.#timeout);
    timer.unref();
    const signal = controller.signal;
    const cancellation = () => timedOut ? new Error('语音转录超时，请检查服务后手动重试') : abortedError();
    try {
      return await withAbort(this.#settings.withProvider(async (provider) => {
        throwIfAborted(signal, cancellation);
        const body = new FormData();
        body.append('file', new Blob([input.audio], { type: input.mimeType }), 'recording.' + FILE_EXTENSIONS[input.mimeType]);
        body.append('model', provider.model);
        let response: Response;
        try {
          response = await this.#fetch(provider.endpoint, {
            method: 'POST', redirect: 'manual', signal,
            headers: { Authorization: 'Bearer ' + provider.apiKey }, body,
          });
        } catch {
          throwIfAborted(signal, cancellation);
          throw new Error('无法连接语音识别服务，请检查网络或接口设置');
        }
        if (signal.aborted) {
          void response.body?.cancel().catch(() => undefined);
          throw cancellation();
        }
        if (!response.ok) {
          void response.body?.cancel().catch(() => undefined);
          throw responseError(response.status);
        }
        const text = await readBoundedResponse(response, signal, cancellation);
        throwIfAborted(signal, cancellation);
        let parsed: unknown;
        try { parsed = JSON.parse(text); } catch { throw new Error('语音服务返回格式无效，请检查接口设置'); }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || typeof (parsed as { text?: unknown }).text !== 'string') {
          throw new Error('语音服务没有返回有效文字');
        }
        const transcript = (parsed as { text: string }).text;
        if (!transcript.trim()) throw new Error('没有识别到清晰语音，请重录后再试');
        if (transcript.length > MAX_TRANSCRIPT_LENGTH) throw new Error('识别文字超过 ' + MAX_TRANSCRIPT_LENGTH + ' 字，请分段录音');
        if (transcript.includes('\0')) throw new Error('语音服务返回了无效文字');
        return { text: transcript };
      }), signal, cancellation);
    } finally { clearTimeout(timer); }
  }
}

function validateInput(value: TranscribeSpeechInput): TranscribeSpeechInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('录音请求无效');
  const requestId = validateSpeechRequestId(value.requestId);
  const mimeType = normalizeSpeechMimeType(value.mimeType);
  if (!(value.audio instanceof Uint8Array) || value.audio.byteLength < 16 || value.audio.byteLength > MAX_SPEECH_BYTES) {
    throw new Error('录音为空或超过 8 MiB，请重新录音');
  }
  if (typeof value.durationMs !== 'number' || !Number.isFinite(value.durationMs) || value.durationMs <= 0 || value.durationMs > MAX_SPEECH_DURATION_MS) {
    throw new Error('每段录音不能超过 3 分钟');
  }
  const audio = Uint8Array.from(value.audio);
  const ascii = (start: number, end: number) => String.fromCharCode(...audio.slice(start, end));
  const valid = mimeType === 'audio/webm' ? [0x1a, 0x45, 0xdf, 0xa3].every((byte, index) => audio[index] === byte)
    : mimeType === 'audio/ogg' ? ascii(0, 4) === 'OggS'
    : mimeType === 'audio/wav' ? ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE'
    : ascii(4, 8) === 'ftyp';
  if (!valid) throw new Error('录音数据与格式不匹配，请重新录音');
  return { requestId, mimeType, audio, durationMs: value.durationMs };
}

async function readBoundedResponse(response: Response, signal: AbortSignal, cancellation: () => Error): Promise<string> {
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > MAX_RESPONSE_BYTES) {
    void response.body?.cancel().catch(() => undefined);
    throw new Error('语音服务返回内容过大，请分段录音');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('语音服务返回为空');
  const decoder = new TextDecoder();
  let bytes = 0, text = '';
  const abort = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    while (true) {
      throwIfAborted(signal, cancellation);
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) throw new Error('语音服务返回内容过大，请分段录音');
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } catch (error) {
    void reader.cancel().catch(() => undefined);
    throwIfAborted(signal, cancellation);
    if (error instanceof Error && error.message === '语音服务返回内容过大，请分段录音') throw error;
    throw new Error('读取语音识别结果失败，请手动重试');
  } finally { signal.removeEventListener('abort', abort); reader.releaseLock(); }
}

function withAbort<T>(operation: Promise<T>, signal: AbortSignal, reason: () => Error): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); reject(reason()); };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    void operation.then(
      (value) => { signal.removeEventListener('abort', abort); signal.aborted ? reject(reason()) : resolve(value); },
      (error) => { signal.removeEventListener('abort', abort); reject(signal.aborted ? reason() : error); },
    );
  });
}
function throwIfAborted(signal: AbortSignal, reason: () => Error) { if (signal.aborted) throw reason(); }
function abortedError(): Error { const error = new Error('已取消本机语音转录请求'); error.name = 'AbortError'; return error; }
function responseError(status: number): Error {
  if (status === 401 || status === 403) return new Error('语音服务认证失败，请检查 API 密钥与访问权限');
  if (status === 402) return new Error('语音服务余额或额度不足，请检查服务商账户');
  if (status === 429) return new Error('语音服务额度不足或请求过于频繁，请稍后手动重试');
  if (status === 413) return new Error('录音超过服务允许的大小，请缩短后重录');
  if (status === 422) return new Error('语音服务拒绝处理这段录音，请检查服务限制或更换录音');
  if (status >= 300 && status < 400) return new Error('语音接口发生重定向，请填写最终 HTTPS 接口地址');
  if (status === 400 || status === 404 || status === 415) return new Error('语音接口、模型或录音格式不受支持，请检查设置');
  return new Error('语音服务暂时不可用，请稍后手动重试');
}
