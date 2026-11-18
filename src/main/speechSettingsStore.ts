import { constants } from 'node:fs';
import { chmod, mkdir, open, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, isAbsolute } from 'node:path';
import type { MediaProviderSecretCodec } from './mediaProviderStore.js';
import {
  DEFAULT_SPEECH_ENDPOINT,
  DEFAULT_SPEECH_MODEL,
  validateSpeechEndpoint,
  validateSpeechModel,
  type SaveSpeechSettingsInput,
  type SpeechSettings,
} from '../shared/speech.js';

interface StoredSpeechSettings {
  version: 1;
  endpoint: string;
  model: string;
  sealedApiKey: string | null;
}
/** Main-process only; never return this object through IPC. */
export interface ResolvedSpeechProvider { endpoint: string; model: string; apiKey: string }
const MAX_STORAGE_BYTES = 128 * 1024;
const SECRET_PREFIX = 'gu-speech-secret:v1\n';

export class SpeechSettingsStore {
  readonly #path: string;
  readonly #codec: MediaProviderSecretCodec;
  #state: StoredSpeechSettings | null = null;
  #initializing: Promise<void> | null = null;
  #tail: Promise<unknown> = Promise.resolve();

  constructor(storageFile: string, secretCodec: MediaProviderSecretCodec) {
    if (!isAbsolute(storageFile)) throw new Error('语音设置文件必须使用绝对路径');
    this.#path = storageFile;
    this.#codec = secretCodec;
  }

  async init(): Promise<void> {
    if (this.#state) return;
    if (!this.#initializing) this.#initializing = this.#load().finally(() => { this.#initializing = null; });
    await this.#initializing;
  }

  async get(): Promise<SpeechSettings> {
    await this.init();
    await this.#tail;
    return summary(this.#state!);
  }

  async save(value: SaveSpeechSettingsInput): Promise<SpeechSettings> {
    await this.init();
    const next = this.#tail.then(async () => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('语音服务设置无效');
      const endpoint = validateSpeechEndpoint(value.endpoint);
      const model = validateSpeechModel(value.model);
      if (value.clearApiKey !== undefined && typeof value.clearApiKey !== 'boolean') throw new Error('清除密钥选项无效');
      const submittedKey = value.apiKey === undefined || value.apiKey === '' ? null : validateKey(value.apiKey);
      if (submittedKey && value.clearApiKey) throw new Error('不能同时保存新密钥和清除密钥');
      const current = this.#state!;
      const origin = new URL(endpoint).origin;
      if (current.sealedApiKey && origin !== new URL(current.endpoint).origin && !submittedKey && !value.clearApiKey) {
        throw new Error('更换服务域名后，请重新填写 API 密钥或清除原密钥');
      }
      let sealedApiKey = value.clearApiKey ? null : current.sealedApiKey;
      if (submittedKey) {
        this.#assertCodec();
        const plaintext = SECRET_PREFIX + JSON.stringify({ origin, apiKey: submittedKey });
        try { sealedApiKey = this.#codec.seal(plaintext); }
        catch { throw new Error('系统未能加密语音 API 密钥，设置未保存'); }
        if (!sealedApiKey || sealedApiKey === plaintext || sealedApiKey.length > 100_000) {
          throw new Error('系统密钥加密结果无效，设置未保存');
        }
      }
      const updated: StoredSpeechSettings = { version: 1, endpoint, model, sealedApiKey };
      await this.#write(updated);
      this.#state = updated;
      return summary(updated);
    });
    this.#tail = next.catch(() => undefined);
    return next;
  }

  async withProvider<T>(callback: (provider: ResolvedSpeechProvider) => Promise<T>): Promise<T> {
    await this.init();
    await this.#tail;
    const settings = this.#state!;
    if (!settings.sealedApiKey) throw new Error('请先在设置中配置语音识别 API 密钥');
    this.#assertCodec();
    let decoded: unknown;
    try {
      const plaintext = this.#codec.open(settings.sealedApiKey);
      const prefix = [SECRET_PREFIX, 'noobi-speech-secret:v1\n'].find((value) => plaintext.startsWith(value));
      if (!prefix) throw new Error('Invalid secret envelope');
      decoded = JSON.parse(plaintext.slice(prefix.length));
    } catch { throw new Error('无法解密语音 API 密钥，请在设置中重新保存'); }
    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) throw new Error('语音 API 密钥数据无效');
    const binding = decoded as Record<string, unknown>;
    if (binding.origin !== new URL(settings.endpoint).origin) throw new Error('语音 API 密钥与服务地址不匹配，请重新配置');
    const apiKey = validateKey(binding.apiKey);
    return callback({ endpoint: settings.endpoint, model: settings.model, apiKey });
  }

  #assertCodec() {
    if (!this.#codec.isAvailable()) throw new Error('系统密钥加密不可用，无法保存或使用语音 API 密钥');
  }

  async #load(): Promise<void> {
    await mkdir(dirname(this.#path), { recursive: true, mode: 0o700 });
    let file;
    try { file = await open(this.#path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)); }
    catch (error) {
      if (!isNodeError(error, 'ENOENT')) throw new Error('无法读取本地语音设置');
      const initial: StoredSpeechSettings = { version: 1, endpoint: DEFAULT_SPEECH_ENDPOINT, model: DEFAULT_SPEECH_MODEL, sealedApiKey: null };
      await this.#write(initial);
      this.#state = initial;
      return;
    }
    try {
      const info = await file.stat();
      if (!info.isFile() || info.size > MAX_STORAGE_BYTES) throw new Error('语音设置文件无效');
      const parsed = JSON.parse(await file.readFile('utf8')) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('语音设置文件无效');
      const data = parsed as Record<string, unknown>;
      if (data.version !== 1 || (data.sealedApiKey !== null && (typeof data.sealedApiKey !== 'string' || !data.sealedApiKey || data.sealedApiKey.length > 100_000))) {
        throw new Error('语音设置文件版本或密钥数据无效');
      }
      this.#state = {
        version: 1,
        endpoint: validateSpeechEndpoint(data.endpoint),
        model: validateSpeechModel(data.model),
        sealedApiKey: data.sealedApiKey as string | null,
      };
      await chmod(this.#path, 0o600).catch(() => undefined);
    } catch { throw new Error('本地语音设置文件无效，请检查配置文件'); }
    finally { await file.close(); }
  }

  async #write(settings: StoredSpeechSettings): Promise<void> {
    const temporary = this.#path + '.' + randomUUID() + '.tmp';
    try {
      await writeFile(temporary, JSON.stringify(settings, null, 2) + '\n', { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      await rename(temporary, this.#path);
    } finally { await rm(temporary, { force: true }).catch(() => undefined); }
  }
}

function summary(settings: StoredSpeechSettings): SpeechSettings {
  return { endpoint: settings.endpoint, model: settings.model, hasApiKey: Boolean(settings.sealedApiKey) };
}
function validateKey(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 16_384 || /[^\x21-\x7e]/u.test(value)) {
    throw new Error('API 密钥无效，请勿包含空格或换行');
  }
  return value;
}
function isNodeError(value: unknown, code: string): boolean {
  return Boolean(value && typeof value === 'object' && 'code' in value && value.code === code);
}
