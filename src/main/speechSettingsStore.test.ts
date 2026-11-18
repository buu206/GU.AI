import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_SPEECH_ENDPOINT, DEFAULT_SPEECH_MODEL } from '../shared/speech.js';
import type { MediaProviderSecretCodec } from './mediaProviderStore.js';
import { SpeechSettingsStore } from './speechSettingsStore.js';

const temporaryDirectories: string[] = [];
afterEach(async () => { await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'gu-speech-settings-'));
  temporaryDirectories.push(directory);
  const secrets = new Map<string, string>();
  const codec: MediaProviderSecretCodec = {
    isAvailable: () => true,
    seal: (plaintext) => { const sealed = 'opaque-test-ciphertext-' + secrets.size; secrets.set(sealed, plaintext); return sealed; },
    open: (sealed) => { const value = secrets.get(sealed); if (!value) throw new Error('test codec unavailable'); return value; },
  };
  const path = join(directory, 'speech.json');
  return { path, codec, store: new SpeechSettingsStore(path, codec) };
}
const configuration = { endpoint: DEFAULT_SPEECH_ENDPOINT, model: DEFAULT_SPEECH_MODEL };

describe('SpeechSettingsStore', () => {
  it('starts unconfigured and persists only encrypted secrets, with safe IPC summaries after restart', async () => {
    const { store, path, codec } = await fixture();
    expect(await store.get()).toEqual({ ...configuration, hasApiKey: false });
    await expect(store.withProvider(async () => 'unused')).rejects.toThrow('配置');
    const saved = await store.save({ ...configuration, apiKey: 'fake-speech-secret' });
    expect(saved).toEqual({ ...configuration, hasApiKey: true });
    expect(await readFile(path, 'utf8')).not.toContain('fake-speech-secret');
    const reloaded = new SpeechSettingsStore(path, codec);
    expect(await reloaded.get()).toEqual(saved);
    await reloaded.withProvider(async (provider) => { expect(provider).toEqual({ ...configuration, apiKey: 'fake-speech-secret' }); });
  });

  it('requires a fresh secret when the service origin changes and checks the encrypted origin binding', async () => {
    const { store, path, codec } = await fixture();
    await store.save({ ...configuration, apiKey: 'original-fake-secret' });
    const changed = { endpoint: 'https://speech.example.test/transcriptions', model: 'custom-transcribe' };
    await expect(store.save(changed)).rejects.toThrow('更换服务域名');
    expect((await store.get()).endpoint).toBe(DEFAULT_SPEECH_ENDPOINT);
    await store.save({ ...configuration, endpoint: 'https://api.openai.com/custom/transcriptions' });
    await store.withProvider(async ({ apiKey }) => { expect(apiKey).toBe('original-fake-secret'); });
    const tampered = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
    await writeFile(path, JSON.stringify({ ...tampered, endpoint: changed.endpoint }));
    await expect(new SpeechSettingsStore(path, codec).withProvider(async () => 'never')).rejects.toThrow('不匹配');
    await store.save({ ...changed, apiKey: 'replacement-fake-secret' });
    await store.withProvider(async ({ apiKey }) => { expect(apiKey).toBe('replacement-fake-secret'); });
    expect(await store.save({ ...configuration, clearApiKey: true })).toMatchObject({ hasApiKey: false });
  });

  it('rejects insecure endpoints and fails closed when OS encryption is unavailable', async () => {
    const { store, path, codec } = await fixture();
    await store.init();
    for (const endpoint of ['http://example.test/stt', 'https://user:pass@example.test/stt', 'https://example.test/stt?key=secret', 'https://example.test/stt#part']) {
      await expect(store.save({ ...configuration, endpoint, apiKey: 'fake-key' })).rejects.toThrow('HTTPS');
    }
    const unavailable = new SpeechSettingsStore(path, { ...codec, isAvailable: () => false });
    await expect(unavailable.save({ ...configuration, apiKey: 'must-not-persist' })).rejects.toThrow('加密不可用');
    expect(await readFile(path, 'utf8')).not.toContain('must-not-persist');
    expect(await store.get()).toMatchObject({ hasApiKey: false });
  });
});
