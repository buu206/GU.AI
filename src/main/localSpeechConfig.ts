import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { DEFAULT_SPEECH_ENDPOINT, DEFAULT_SPEECH_MODEL } from '../shared/speech.js';
import type { SpeechSettingsStore } from './speechSettingsStore.js';

const MAX_CONFIG_BYTES = 64 * 1024;
const IMPORT_ERROR = '本地语音配置导入失败，请检查 .env.local 文件、接口地址、模型和 API Key。';

export type LocalSpeechConfigImportResult = 'missing' | 'empty' | 'existing' | 'imported';

/** Imports a fixed local-development configuration without exposing it to child processes. */
export async function importLocalSpeechConfig(
  filePath: string,
  store: Pick<SpeechSettingsStore, 'get' | 'save'>,
): Promise<LocalSpeechConfigImportResult> {
  try {
    // Saved, encrypted settings take precedence over a leftover development file.
    if ((await store.get()).hasApiKey) return 'existing';

    let file;
    try {
      // NONBLOCK allows us to reject a FIFO without waiting for a writer.
      file = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'missing';
      throw error;
    }

    let contents: string;
    try {
      const metadata = await file.stat();
      if (!metadata.isFile() || metadata.size > MAX_CONFIG_BYTES) throw new Error(IMPORT_ERROR);
      // Bound the read too: the file can grow after stat().
      const buffer = Buffer.alloc(MAX_CONFIG_BYTES + 1);
      let length = 0;
      while (length < buffer.length) {
        const { bytesRead } = await file.read(buffer, length, buffer.length - length, null);
        if (bytesRead === 0) break;
        length += bytesRead;
      }
      if (length > MAX_CONFIG_BYTES) throw new Error(IMPORT_ERROR);
      contents = new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, length));
      if (contents.includes('\0')) throw new Error(IMPORT_ERROR);
    } finally {
      await file.close();
    }

    // parseEnv returns data only; never load this file into process.env.
    const config = parseEnv(contents);
    // Treat each namespace as one configuration so a legacy key never goes to a new origin.
    const prefix = Object.keys(config).some((name) => name.startsWith('GU_SPEECH_')) ? 'GU_SPEECH_' : 'NOOBI_SPEECH_';
    const apiKey = config[prefix + 'API_KEY']?.trim();
    if (!apiKey) return 'empty';

    await store.save({
      endpoint: config[prefix + 'ENDPOINT']?.trim() || DEFAULT_SPEECH_ENDPOINT,
      model: config[prefix + 'MODEL']?.trim() || DEFAULT_SPEECH_MODEL,
      apiKey,
    });
    return 'imported';
  } catch {
    // File/parser/provider errors may include user input. Never forward their messages or causes.
    throw new Error(IMPORT_ERROR);
  }
}
