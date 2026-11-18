import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SPEECH_ENDPOINT, DEFAULT_SPEECH_MODEL } from '../shared/speech.js';
import { importLocalSpeechConfig } from './localSpeechConfig.js';
import { SpeechSettingsStore } from './speechSettingsStore.js';

const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'gu-local-speech-'));
  temporaryDirectories.push(directory);
  const store = new SpeechSettingsStore(join(directory, 'speech.json'), {
    isAvailable: () => true,
    seal: () => 'test-ciphertext',
    open: () => 'test-only-key',
  });
  return { directory, path: join(directory, '.env.local'), store };
}

describe('importLocalSpeechConfig', () => {
  it('skips missing or empty configuration and never overwrites a saved key', async () => {
    const { path, store } = await fixture();
    expect(await importLocalSpeechConfig(path, store)).toBe('missing');
    await writeFile(path, 'GU_SPEECH_API_KEY="   "\n');
    expect(await importLocalSpeechConfig(path, store)).toBe('empty');
    await store.save({ endpoint: DEFAULT_SPEECH_ENDPOINT, model: DEFAULT_SPEECH_MODEL, apiKey: 'saved-key' });
    await writeFile(path, 'GU_SPEECH_API_KEY=replacement-key\nGU_SPEECH_ENDPOINT=https://other.example.test/stt');
    const save = vi.spyOn(store, 'save');
    expect(await importLocalSpeechConfig(path, store)).toBe('existing');
    expect(save).not.toHaveBeenCalled();
    expect(await store.get()).toMatchObject({ endpoint: DEFAULT_SPEECH_ENDPOINT, hasApiKey: true });
  });

  it('imports only the speech fields through the encrypted store without changing process.env', async () => {
    const { path, store } = await fixture();
    const before = { ...process.env };
    await writeFile(path, [
      'GU_SPEECH_API_KEY="test-only-key"',
      'GU_SPEECH_ENDPOINT=https://speech.example.test/transcriptions',
      'GU_SPEECH_MODEL=custom-asr',
      'OPENAI_API_KEY=must-not-be-forwarded',
      'GU_TEST_UNRELATED=must-not-be-forwarded',
    ].join('\n'));
    const save = vi.spyOn(store, 'save');
    expect(await importLocalSpeechConfig(path, store)).toBe('imported');
    expect(save).toHaveBeenCalledExactlyOnceWith({
      endpoint: 'https://speech.example.test/transcriptions', model: 'custom-asr', apiKey: 'test-only-key',
    });
    expect(await store.get()).toEqual({ endpoint: 'https://speech.example.test/transcriptions', model: 'custom-asr', hasApiKey: true });
    expect(process.env).toEqual(before);
  });

  it('uses shared defaults and hides arbitrary storage errors including credentials', async () => {
    const { path, store } = await fixture();
    await writeFile(path, 'GU_SPEECH_API_KEY=test-only-key');
    const save = vi.spyOn(store, 'save').mockRejectedValue(new Error('provider leaked test-only-key and env contents'));
    await expect(importLocalSpeechConfig(path, store)).rejects.toThrow('本地语音配置导入失败');
    expect(save).toHaveBeenCalledExactlyOnceWith({ endpoint: DEFAULT_SPEECH_ENDPOINT, model: DEFAULT_SPEECH_MODEL, apiKey: 'test-only-key' });
    await expect(importLocalSpeechConfig(path, store)).rejects.not.toThrow('test-only-key');
  });

  it('rejects unsafe configuration, oversized files, symlinks and non-files without saving', async () => {
    const { directory, path, store } = await fixture();
    for (const contents of [
      'GU_SPEECH_API_KEY=test-only-key\nGU_SPEECH_ENDPOINT=http://speech.example.test/stt',
      'GU_SPEECH_API_KEY="invalid key"',
      'GU_SPEECH_API_KEY=test-only-key\0',
      'x'.repeat(64 * 1024 + 1),
      Buffer.from([0xff]),
    ]) {
      await writeFile(path, contents);
      await expect(importLocalSpeechConfig(path, store)).rejects.toThrow('本地语音配置导入失败');
      expect(await store.get()).toMatchObject({ hasApiKey: false });
    }
    const link = join(directory, 'linked.env');
    await symlink(path, link);
    await expect(importLocalSpeechConfig(link, store)).rejects.toThrow('本地语音配置导入失败');
    const folder = join(directory, 'folder.env');
    await mkdir(folder);
    await expect(importLocalSpeechConfig(folder, store)).rejects.toThrow('本地语音配置导入失败');
  });
});
