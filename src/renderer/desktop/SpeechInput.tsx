import { useEffect, useRef, useState } from 'react';
import { MAX_SPEECH_BYTES, MAX_SPEECH_DURATION_MS, MAX_TRANSCRIPT_LENGTH, type SpeechSettings } from '../../shared/speech';
import { prepareSpeechAudio } from './speechAudio';

interface Props {
  onOpenSettings: () => void;
  /** Returns an explanation when the current draft cannot accept the transcript. */
  onApply: (text: string) => string | null;
}
type Phase = 'loading' | 'idle' | 'requesting' | 'recording' | 'stopping' | 'recorded' | 'transcribing' | 'cancelling' | 'cancel-failed' | 'review';
interface Recording {
  stream: MediaStream | null;
  recorder: MediaRecorder | null;
  chunks: Blob[];
  bytes: number;
  startedAt: number;
  durationMs: number;
  stopping: boolean;
  invalidReason: string;
  stopMessage: string;
  interval?: number;
  timeout?: number;
  ended: () => void;
}
interface RecordedAudio { blob: Blob; mimeType: string; durationMs: number }
interface Transcription { id: string; cancelled: boolean; cancelPending: boolean; settled: boolean; uploaded: boolean; controller: AbortController }
const RECORDING_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/mp4'];

function clearRecordingTimers(recording: Recording) {
  window.clearInterval(recording.interval);
  window.clearTimeout(recording.timeout);
}
function releaseMicrophone(recording: Recording) {
  recording.stream?.getTracks().forEach((track) => {
    track.removeEventListener('ended', recording.ended);
    track.stop();
  });
  recording.stream = null;
}
function disposeRecording(recording: Recording) {
  clearRecordingTimers(recording);
  if (recording.recorder) {
    recording.recorder.ondataavailable = null;
    recording.recorder.onstop = null;
    recording.recorder.onerror = null;
    if (recording.recorder.state !== 'inactive') {
      try { recording.recorder.stop(); } catch { /* Tracks are still stopped below. */ }
    }
  }
  releaseMicrophone(recording);
  recording.chunks = [];
}
function describeRecordingError(reason: unknown): string {
  if (reason instanceof DOMException) {
    if (reason.name === 'NotAllowedError' || reason.name === 'SecurityError') return '麦克风权限未开启，请在系统设置中允许后重试。';
    if (reason.name === 'NotFoundError') return '未找到麦克风，请连接设备后重试。';
    if (reason.name === 'NotReadableError' || reason.name === 'AbortError') return '麦克风暂时无法使用，请检查设备或其他正在录音的应用。';
  }
  return reason instanceof Error ? reason.message : '录音未能开始，请检查麦克风后重试。';
}
function serviceHost(endpoint: string) {
  try { return new URL(endpoint).host; } catch { return '已配置的语音服务'; }
}
function formatDuration(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
}

export function SpeechInput({ onOpenSettings, onApply }: Props) {
  const [settings, setSettings] = useState<SpeechSettings | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [recorded, setRecorded] = useState<RecordedAudio | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const mounted = useRef(false);
  const recordingRef = useRef<Recording | null>(null);
  const requestRef = useRef<Transcription | null>(null);
  const applied = useRef(false);
  const onHidden = useRef<() => void>(() => undefined);

  useEffect(() => {
    mounted.current = true;
    let current = true;
    void window.gu.getSpeechSettings().then((value) => {
      if (!current) return;
      setSettings(value);
      setPhase('idle');
    }).catch((reason: unknown) => {
      if (!current) return;
      setError(reason instanceof Error ? reason.message : '无法读取语音设置，请重新打开设置。');
      setPhase('idle');
    });
    const hidden = () => { if (document.hidden) onHidden.current(); };
    document.addEventListener('visibilitychange', hidden);
    return () => {
      current = false;
      mounted.current = false;
      document.removeEventListener('visibilitychange', hidden);
      const recording = recordingRef.current;
      recordingRef.current = null;
      if (recording) disposeRecording(recording);
      const request = requestRef.current;
      requestRef.current = null;
      if (request) {
        request.cancelled = true;
        request.controller.abort();
        if (request.uploaded) void window.gu.cancelSpeechTranscription(request.id).catch(() => undefined);
      }
    };
  }, []);

  function discardRecording() {
    const recording = recordingRef.current;
    recordingRef.current = null;
    if (recording) disposeRecording(recording);
    setRecorded(null);
    setTranscript('');
    setElapsedMs(0);
    setError('');
    setNotice('');
    setPhase('idle');
    applied.current = false;
  }
  function finishRecording(recording: Recording) {
    if (recordingRef.current !== recording || !mounted.current) { disposeRecording(recording); return; }
    const mimeType = (recording.recorder?.mimeType || recording.chunks[0]?.type || '').split(';')[0]!.toLowerCase();
    const blob = new Blob(recording.chunks, { type: mimeType });
    const durationMs = recording.durationMs || Math.min(MAX_SPEECH_DURATION_MS, Math.max(1, Math.round(performance.now() - recording.startedAt)));
    recordingRef.current = null;
    disposeRecording(recording);
    setElapsedMs(durationMs);
    if (recording.invalidReason || !blob.size || durationMs < 300 || blob.size > MAX_SPEECH_BYTES) {
      setRecorded(null);
      setPhase('idle');
      setError(recording.invalidReason || (blob.size > MAX_SPEECH_BYTES ? '录音超过 8 MB，请缩短后重新录音。' : '没有录到可用声音，请说完一句话后再停止。'));
      return;
    }
    setRecorded({ blob, mimeType, durationMs });
    setNotice(recording.stopMessage || '录音已保留在当前窗口，尚未上传。');
    setPhase('recorded');
  }
  function stopRecording(recording: Recording, message = '') {
    if (recordingRef.current !== recording || recording.stopping) return;
    recording.stopping = true;
    recording.stopMessage = message;
    recording.durationMs = Math.min(MAX_SPEECH_DURATION_MS, Math.max(1, Math.round(performance.now() - recording.startedAt)));
    clearRecordingTimers(recording);
    setElapsedMs(recording.durationMs);
    setPhase('stopping');
    if (recording.recorder?.state === 'recording' || recording.recorder?.state === 'paused') {
      try { recording.recorder.stop(); }
      catch {
        recording.invalidReason = '录音未能正常结束，请重新录音。';
        finishRecording(recording);
      }
    } else {
      finishRecording(recording);
    }
    // Keep the final data/stop callbacks, but release the actual microphone immediately.
    releaseMicrophone(recording);
  }
  async function startRecording() {
    if (recordingRef.current || requestRef.current || !settings?.hasApiKey) return;
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('当前环境不支持录音，请使用系统听写或键盘输入。');
      return;
    }
    const mimeType = RECORDING_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
    if (!mimeType) { setError('当前环境没有可用的录音格式，请使用系统听写或键盘输入。'); return; }
    const recording: Recording = {
      stream: null, recorder: null, chunks: [], bytes: 0, startedAt: 0, durationMs: 0,
      stopping: false, invalidReason: '', stopMessage: '', ended: () => undefined,
    };
    recordingRef.current = recording;
    setPhase('requesting');
    setError('');
    setNotice('');
    setRecorded(null);
    setTranscript('');
    setElapsedMs(0);
    applied.current = false;
    try {
      const allowed = await window.gu.requestMicrophoneAccess();
      if (recordingRef.current !== recording || !mounted.current) return;
      if (!allowed) throw new DOMException('Microphone permission denied', 'NotAllowedError');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      if (recordingRef.current !== recording || !mounted.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      recording.stream = stream;
      if (!stream.getAudioTracks().some((track) => track.readyState === 'live')) throw new Error('麦克风已断开，请连接设备后重试。');
      const recorder = new MediaRecorder(stream, { mimeType });
      recording.recorder = recorder;
      recorder.ondataavailable = (event: BlobEvent) => {
        if (recordingRef.current !== recording || !event.data.size) return;
        if (recording.bytes + event.data.size > MAX_SPEECH_BYTES) {
          recording.invalidReason = '录音超过 8 MB，本次未上传。请缩短后重新录音。';
          stopRecording(recording);
          return;
        }
        recording.chunks.push(event.data);
        recording.bytes += event.data.size;
        if (recording.bytes >= MAX_SPEECH_BYTES) stopRecording(recording, '已达到录音大小上限，尚未上传。');
      };
      recorder.onstop = () => finishRecording(recording);
      recorder.onerror = () => {
        recording.invalidReason = '录音发生错误，本次未上传。请检查麦克风后重试。';
        stopRecording(recording);
      };
      recording.ended = () => stopRecording(recording, '麦克风已断开，已保留录下的部分。请检查后再转成文字。');
      stream.getAudioTracks().forEach((track) => track.addEventListener('ended', recording.ended));
      recording.startedAt = performance.now();
      recorder.start(250);
      setPhase('recording');
      recording.interval = window.setInterval(() => {
        if (recordingRef.current === recording) setElapsedMs(Math.min(MAX_SPEECH_DURATION_MS, performance.now() - recording.startedAt));
      }, 250);
      recording.timeout = window.setTimeout(() => stopRecording(recording, '已录满 3 分钟，尚未上传。'), MAX_SPEECH_DURATION_MS);
    } catch (reason) {
      if (recordingRef.current !== recording || !mounted.current) { disposeRecording(recording); return; }
      recordingRef.current = null;
      disposeRecording(recording);
      setPhase('idle');
      setError(describeRecordingError(reason));
    }
  }
  async function transcribe() {
    if (!recorded || recordingRef.current || requestRef.current || !settings?.hasApiKey) return;
    const request: Transcription = { id: crypto.randomUUID(), cancelled: false, cancelPending: false, settled: false, uploaded: false, controller: new AbortController() };
    requestRef.current = request;
    setPhase('transcribing');
    setError('');
    setNotice('');
    try {
      const audio = await prepareSpeechAudio(recorded.blob, request.controller.signal);
      if (!mounted.current || requestRef.current !== request || request.cancelled) return;
      request.uploaded = true;
      const result = await window.gu.transcribeSpeech({ requestId: request.id, ...audio });
      if (!mounted.current || requestRef.current !== request || request.cancelled) return;
      if (typeof result.text !== 'string' || !result.text.trim()) throw new Error('没有识别到文字，可以重试或重新录音。');
      if (result.text.length > MAX_TRANSCRIPT_LENGTH) throw new Error('识别结果过长，请分段重新录音。');
      setTranscript(result.text);
      setPhase('review');
      setNotice('先检查文字，再填入想法。');
    } catch (reason) {
      if (!mounted.current || requestRef.current !== request || request.cancelled) return;
      setError(reason instanceof Error ? reason.message : '转录未完成，录音仍在，可以重试。');
      setPhase('recorded');
    } finally {
      request.settled = true;
      if (mounted.current && requestRef.current === request && !request.cancelPending) {
        requestRef.current = null;
        if (request.cancelled) {
          setPhase('recorded');
          setError('已停止等待结果，未确认服务端处理状态。录音仍在。');
        }
      }
    }
  }
  async function cancelTranscription() {
    const request = requestRef.current;
    if (!request || request.cancelPending) return;
    request.cancelled = true;
    request.controller.abort();
    request.cancelPending = true;
    setPhase('cancelling');
    setError('');
    try {
      if (request.uploaded) await window.gu.cancelSpeechTranscription(request.id);
      if (!mounted.current || requestRef.current !== request) return;
      requestRef.current = null;
      setPhase('recorded');
      setNotice(request.uploaded ? '已取消等待，录音仍在；服务可能已产生用量。' : '已取消转文字，录音仍在，尚未上传。');
    } catch (reason) {
      if (!mounted.current || requestRef.current !== request) return;
      if (request.settled) {
        requestRef.current = null;
        setPhase('recorded');
      } else {
        setPhase('cancel-failed');
      }
      setError('取消未确认，录音仍在。' + (reason instanceof Error ? ' ' + reason.message : ''));
    } finally {
      request.cancelPending = false;
    }
  }
  onHidden.current = () => {
    const recording = recordingRef.current;
    if (recording?.recorder) stopRecording(recording, '窗口已切到后台，录音已停止，尚未上传。');
    else if (recording) discardRecording();
    if (requestRef.current) void cancelTranscription();
  };
  function applyTranscript() {
    if (applied.current || requestRef.current || recordingRef.current || !transcript.trim()) return;
    applied.current = true;
    const failure = onApply(transcript);
    if (failure) { applied.current = false; setError(failure); }
  }

  const recordingBusy = phase === 'requesting' || phase === 'recording' || phase === 'stopping';
  const uploading = phase === 'transcribing' || phase === 'cancelling' || phase === 'cancel-failed';
  return <div className="desktop-speech">
    <div className="desktop-terminal-head">C:\CREATE&gt; VOICE INPUT</div>
    <h2>把想法说出来</h2>
    {phase === 'loading' ? <p role="status">正在读取语音设置…</p> : !settings?.hasApiKey ? <>
      <p>先连接语音转文字服务。</p>
      <button type="button" className="desktop-button primary" onClick={onOpenSettings}>配置语音服务</button>
    </> : <>
      {phase !== 'review' && <div className={'desktop-speech-monitor' + (phase === 'recording' ? ' recording' : '')} aria-live="polite">
        <span className="desktop-speech-signal" aria-hidden="true">▂ ▅ █ ▃ ▆</span>
        <span className="desktop-speech-time">{formatDuration(elapsedMs)} <small>/ 03:00</small></span>
        <span>{phase === 'requesting' ? '等待麦克风权限' : phase === 'recording' ? '正在录音' : phase === 'stopping' ? '正在保存录音' : uploading ? '正在转录' : recorded ? '录音就绪' : '等待开始'}</span>
      </div>}
      {phase === 'review' ? <>
        <label className="desktop-speech-review">检查识别文字
          <textarea aria-label="检查语音识别文字" value={transcript} rows={5} spellCheck={false} onChange={(event) => {
            if (event.target.value.length > MAX_TRANSCRIPT_LENGTH) { setError('识别文字最多 ' + MAX_TRANSCRIPT_LENGTH + ' 字，本次修改未保存。'); return; }
            setTranscript(event.target.value); setError('');
          }} />
        </label>
        <div className="desktop-actions">
          <button type="button" className="desktop-button quiet" onClick={() => void startRecording()}>重新录音</button>
          <button type="button" className="desktop-button primary" disabled={!transcript.trim()} onClick={applyTranscript}>填入想法</button>
        </div>
      </> : <div className="desktop-actions">
        {phase === 'idle' && <button type="button" className="desktop-button pink" onClick={() => void startRecording()}>开始录音</button>}
        {phase === 'requesting' && <button type="button" className="desktop-button quiet" onClick={discardRecording}>取消录音</button>}
        {phase === 'recording' && <>
          <button type="button" className="desktop-button primary" onClick={() => { if (recordingRef.current) stopRecording(recordingRef.current); }}>停止录音</button>
          <button type="button" className="desktop-button quiet" onClick={discardRecording}>放弃录音</button>
        </>}
        {phase === 'stopping' && <button type="button" className="desktop-button quiet" onClick={discardRecording}>放弃录音</button>}
        {phase === 'recorded' && <>
          <button type="button" className="desktop-button quiet" onClick={() => void startRecording()}>重新录音</button>
          <button type="button" className="desktop-button primary" onClick={() => void transcribe()}>转成文字</button>
          <button type="button" className="desktop-button quiet" onClick={discardRecording}>放弃录音</button>
        </>}
        {uploading && <button type="button" className="desktop-button quiet" disabled={phase === 'cancelling'} onClick={() => void cancelTranscription()}>{phase === 'cancelling' ? '正在取消…' : phase === 'cancel-failed' ? '重试取消' : '取消转录'}</button>}
      </div>}
      {phase !== 'review' && <p className="desktop-speech-note">点击“转成文字”才会上传到 {serviceHost(settings.endpoint)} 并使用服务额度。录音只保留在当前窗口，关闭或最小化后清除。</p>}
      {!recordingBusy && !uploading && phase === 'idle' && <button type="button" className="desktop-speech-settings" onClick={onOpenSettings}>语音设置</button>}
    </>}
    {notice && <p className="desktop-speech-note" role="status">{notice}</p>}
    {error && <p className="desktop-error" role="alert">{error}</p>}
  </div>;
}
