import { MAX_SPEECH_BYTES, MAX_SPEECH_DURATION_MS } from '../../shared/speech';

const SAMPLE_RATE = 16_000;
const MAX_SAMPLES = SAMPLE_RATE * MAX_SPEECH_DURATION_MS / 1000;

export interface PreparedSpeechAudio {
  audio: Uint8Array<ArrayBuffer>;
  mimeType: 'audio/wav';
  durationMs: number;
}

/** Encode mono PCM locally. WAV is accepted by both MiniMax and OpenAI ASR. */
export function encodeSpeechWav(samples: Float32Array): PreparedSpeechAudio {
  if (!samples.length || samples.length > MAX_SAMPLES) throw new Error('每段录音不能超过 3 分钟，请重新录音。');
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeText = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index++) view.setUint8(offset + index, text.charCodeAt(index));
  };
  writeText(0, 'RIFF');
  view.setUint32(4, buffer.byteLength - 8, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let index = 0; index < samples.length; index++) {
    const value = Number.isFinite(samples[index]) ? Math.max(-1, Math.min(1, samples[index]!)) : 0;
    view.setInt16(44 + index * 2, Math.round(value * (value < 0 ? 0x8000 : 0x7fff)), true);
  }
  return { audio: new Uint8Array(buffer), mimeType: 'audio/wav', durationMs: samples.length / SAMPLE_RATE * 1000 };
}

function ensureActive(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('已取消本地录音处理', 'AbortError');
}

/** No microphone or network access: decode, downmix and resample only in memory. */
export async function prepareSpeechAudio(blob: Blob, signal: AbortSignal): Promise<PreparedSpeechAudio> {
  ensureActive(signal);
  if (!blob.size || blob.size > MAX_SPEECH_BYTES) throw new Error('录音为空或超过 8 MB，请重新录音。');
  if (typeof OfflineAudioContext === 'undefined') throw new Error('当前环境无法处理录音，请使用系统听写或键盘输入。');
  const encoded = await blob.arrayBuffer();
  ensureActive(signal);
  let decoded: AudioBuffer;
  try {
    const decoder = new OfflineAudioContext(1, 1, SAMPLE_RATE);
    decoded = await decoder.decodeAudioData(encoded);
  } catch {
    ensureActive(signal);
    throw new Error('录音未能解码，尚未上传。请重新录音。');
  }
  ensureActive(signal);
  // MediaRecorder may append a partial codec packet at the 3-minute boundary.
  // Allow only that small tail, and never include it in the uploaded WAV.
  if (!Number.isFinite(decoded.duration) || decoded.duration <= 0 || decoded.duration * 1000 > MAX_SPEECH_DURATION_MS + 500) {
    throw new Error('每段录音不能超过 3 分钟，请重新录音。');
  }
  const length = Math.min(MAX_SAMPLES, Math.max(1, Math.round(decoded.duration * SAMPLE_RATE)));
  const context = new OfflineAudioContext(1, length, SAMPLE_RATE);
  const source = context.createBufferSource();
  source.buffer = decoded;
  source.connect(context.destination);
  source.start();
  try {
    const rendered = await context.startRendering();
    ensureActive(signal);
    return encodeSpeechWav(rendered.getChannelData(0));
  } catch (reason) {
    ensureActive(signal);
    throw reason instanceof Error ? reason : new Error('录音处理失败，尚未上传。请重新录音。');
  } finally {
    source.disconnect();
    source.buffer = null;
  }
}
