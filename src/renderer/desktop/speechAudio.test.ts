import { describe, expect, it } from 'vitest';
import { MAX_SPEECH_BYTES } from '../../shared/speech';
import { encodeSpeechWav, prepareSpeechAudio } from './speechAudio';

describe('speech WAV preparation', () => {
  it('writes mono 16 kHz PCM with bounded samples and matching RIFF sizes', () => {
    const result = encodeSpeechWav(new Float32Array([-2, -1, 0, 0.5, 1, 2, NaN]));
    const view = new DataView(result.audio.buffer);
    expect(new TextDecoder().decode(result.audio.subarray(0, 4))).toBe('RIFF');
    expect(new TextDecoder().decode(result.audio.subarray(8, 12))).toBe('WAVE');
    expect(new TextDecoder().decode(result.audio.subarray(36, 40))).toBe('data');
    expect(view.getUint32(4, true)).toBe(result.audio.length - 8);
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(14);
    expect(Array.from({ length: 7 }, (_, index) => view.getInt16(44 + index * 2, true))).toEqual([-32768, -32768, 0, 16384, 32767, 32767, 0]);
    expect(result.mimeType).toBe('audio/wav');
  });

  it('keeps a full 3-minute recording below the upload limit and rejects invalid lengths', () => {
    const result = encodeSpeechWav(new Float32Array(180 * 16_000));
    expect(result.durationMs).toBe(180_000);
    expect(result.audio.length).toBeLessThan(MAX_SPEECH_BYTES);
    expect(() => encodeSpeechWav(new Float32Array())).toThrow('请重新录音');
    expect(() => encodeSpeechWav(new Float32Array(180 * 16_000 + 1))).toThrow('3 分钟');
  });

  it('does not start decoding cancelled or empty recordings', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(prepareSpeechAudio(new Blob(['audio']), controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    await expect(prepareSpeechAudio(new Blob(), new AbortController().signal)).rejects.toThrow('录音为空');
  });
});
