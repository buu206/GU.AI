import { KeyRound, RefreshCw, Save, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import {
  DEFAULT_SPEECH_ENDPOINT,
  DEFAULT_SPEECH_MODEL,
  validateSpeechEndpoint,
  validateSpeechModel,
  type SaveSpeechSettingsInput,
  type SpeechSettings as SpeechSettingsValue,
} from '../../shared/speech';
import { toMessage } from '../ui';
import './speechSettings.css';

interface SpeechSettingsProps {
  onBusyChange: (busy: boolean) => void;
}

function endpointOrigin(endpoint: string): string | null {
  try { return new URL(endpoint).origin; } catch { return null; }
}

export function SpeechSettings({ onBusyChange }: SpeechSettingsProps) {
  const [saved, setSaved] = useState<SpeechSettingsValue | null>(null);
  const [endpoint, setEndpoint] = useState(DEFAULT_SPEECH_ENDPOINT);
  const [model, setModel] = useState(DEFAULT_SPEECH_MODEL);
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const savingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    void window.gu.getSpeechSettings().then((settings) => {
      if (cancelled) return;
      setSaved(settings);
      setEndpoint(settings.endpoint);
      setModel(settings.model);
    }).catch((cause: unknown) => {
      if (!cancelled) setError(toMessage(cause));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [loadAttempt]);

  const originChanged = Boolean(saved && endpointOrigin(endpoint)
    && endpointOrigin(endpoint) !== endpointOrigin(saved.endpoint));
  const needsNewKey = Boolean(saved?.hasApiKey && originChanged);
  const disabled = loading || busy || !saved;

  async function persist(clearApiKey = false) {
    if (!saved || savingRef.current) return;
    setError('');
    setMessage('');
    let input: SaveSpeechSettingsInput;
    try {
      if (clearApiKey) {
        // Removing a stored key must not also save unrelated, unfinished edits.
        input = { endpoint: saved.endpoint, model: saved.model, clearApiKey: true };
      } else {
        const nextEndpoint = validateSpeechEndpoint(endpoint.trim());
        const nextModel = validateSpeechModel(model);
        const nextKey = apiKey.trim();
        if (saved.hasApiKey && endpointOrigin(nextEndpoint) !== endpointOrigin(saved.endpoint) && !nextKey) {
          throw new Error('接口域名已更换，请填写新服务的 API Key；不会转用原有密钥。');
        }
        input = { endpoint: nextEndpoint, model: nextModel, ...(nextKey ? { apiKey: nextKey } : {}) };
      }
    } catch (cause) {
      setError(toMessage(cause));
      return;
    }

    savingRef.current = true;
    setBusy(true);
    onBusyChange(true);
    try {
      const result = await window.gu.saveSpeechSettings(input);
      setSaved(result);
      setApiKey('');
      if (clearApiKey) {
        setMessage('已移除已保存密钥，后续转录需重新配置。');
      } else {
        setEndpoint(result.endpoint);
        setModel(result.model);
        setMessage('已保存配置，尚未验证服务。');
      }
    } catch (cause) {
      setError(toMessage(cause));
    } finally {
      savingRef.current = false;
      setBusy(false);
      onBusyChange(false);
    }
  }

  return (
    <section className="speech-settings" aria-busy={loading || busy}>
      <header className="settings-page-heading">
        <div>
          <span>SPEECH TO TEXT</span>
          <h3>语音识别</h3>
          <p>把录音转成文字。此处独立配置 API，Codex 登录不会自动提供这枚密钥。</p>
        </div>
      </header>

      <div className="speech-settings-status">
        <KeyRound size={16} aria-hidden="true" />
        <span>{loading ? '正在读取配置…' : !saved ? '配置读取失败' : saved.hasApiKey ? '已保存密钥，服务尚未验证' : '尚未配置密钥'}</span>
      </div>

      <form className="settings-form" onSubmit={(event) => { event.preventDefault(); void persist(); }}>
        <label>
          <span>转录接口地址</span>
          <input
            type="url"
            value={endpoint}
            disabled={disabled}
            onChange={(event) => setEndpoint(event.target.value)}
            placeholder={DEFAULT_SPEECH_ENDPOINT}
            autoComplete="off"
            spellCheck={false}
            aria-describedby="speech-endpoint-help"
          />
          <small id="speech-endpoint-help" className="speech-settings-help">支持 MiniMax 语音识别及 OpenAI 兼容转录接口。填写完整 HTTPS 地址。</small>
        </label>

        <label>
          <span>语音模型</span>
          <input value={model} disabled={disabled} onChange={(event) => setModel(event.target.value)} placeholder={DEFAULT_SPEECH_MODEL} autoComplete="off" spellCheck={false} />
        </label>

        <label>
          <span>API Key</span>
          <input
            type="password"
            value={apiKey}
            disabled={disabled}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={needsNewKey ? '请输入新服务的 API Key' : saved?.hasApiKey ? '留空保留已保存的密钥' : '输入语音服务的 API Key'}
            autoComplete="new-password"
            spellCheck={false}
            aria-describedby="speech-key-help"
          />
          <small id="speech-key-help" className="speech-settings-help">
            {needsNewKey ? '接口域名已更换，保存时需填写新密钥。原有密钥不会发送至新域名。' : '密钥保存在本机，保存后不回显。留空不会删除已保存的密钥。'}
          </small>
        </label>

        <div className="speech-settings-actions">
          <button className="primary-button" type="submit" disabled={disabled}><Save size={15} />{busy ? '保存中…' : '保存配置'}</button>
          {saved?.hasApiKey ? <button className="secondary-button compact" type="button" disabled={disabled} onClick={() => void persist(true)}><Trash2 size={15} />移除已保存密钥</button> : null}
          {!loading && !saved ? <button className="secondary-button compact" type="button" onClick={() => setLoadAttempt((value) => value + 1)}><RefreshCw size={15} />重新读取</button> : null}
        </div>
        <p className="speech-settings-help">保存仅更新本地配置，不会录音或调用服务。使用语音输入时，录音将发送至此接口，并按服务商规则计费。</p>
      </form>
      {error ? <p className="speech-settings-error" role="alert">{error}</p> : null}
      {message ? <p className="speech-settings-feedback" role="status">{message}</p> : null}
    </section>
  );
}
