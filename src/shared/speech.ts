/** Speech recognition is separate from game audio generation. */
export interface SpeechSettings {
  endpoint: string;
  model: string;
  hasApiKey: boolean;
}
export interface SaveSpeechSettingsInput {
  endpoint: string;
  model: string;
  /** Omitted or empty keeps the existing key only for the same endpoint origin. */
  apiKey?: string;
  clearApiKey?: boolean;
}
export interface TranscribeSpeechInput {
  requestId: string;
  audio: Uint8Array;
  mimeType: string;
  durationMs: number;
}
export interface SpeechTranscript { text: string }

export const DEFAULT_SPEECH_ENDPOINT = 'https://api.openai.com/v1/audio/transcriptions';
export const DEFAULT_SPEECH_MODEL = 'gpt-transcribe';
export const MAX_SPEECH_BYTES = 8 * 1024 * 1024;
export const MAX_SPEECH_DURATION_MS = 180_000;
export const MAX_TRANSCRIPT_LENGTH = 8_000;

export function validateSpeechRequestId(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/u.test(value)) {
    throw new Error('语音请求标识无效');
  }
  return value;
}

export function normalizeSpeechMimeType(value: unknown): string {
  if (typeof value !== 'string') throw new Error('录音格式不受支持');
  const type = value.toLowerCase().replace(/\s+/gu, '');
  const allowed = ['audio/webm', 'audio/webm;codecs=opus', 'audio/ogg', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/wav'];
  if (!allowed.includes(type)) throw new Error('录音格式不受支持，请使用 WebM、Ogg、MP4 或 WAV');
  return type.split(';')[0]!;
}

export function validateSpeechEndpoint(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2048 || /[\s\u0000-\u001f]/u.test(value)) {
    throw new Error('请填写有效的 HTTPS 语音转录接口地址');
  }
  let endpoint: URL;
  try { endpoint = new URL(value); } catch { throw new Error('请填写有效的 HTTPS 语音转录接口地址'); }
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || !endpoint.hostname) {
    throw new Error('语音接口必须使用 HTTPS，不能包含账号、查询参数或片段');
  }
  return endpoint.toString();
}

export function validateSpeechModel(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 200 || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error('请填写有效的语音识别模型名称');
  }
  return value.trim();
}
