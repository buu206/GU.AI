import { useEffect, useState } from 'react';
import type { ModelOption, ProjectReadiness } from '../../shared/contracts';
import type { SettingsSection } from './SettingsModal';
import { toMessage } from '../ui';

interface Props {
  projectId: string;
  initialModel: string | null;
  models: ModelOption[];
  busy: boolean;
  settingsOpen: boolean;
  onRun: (model: string | null) => Promise<void>;
  onSettings: (section: SettingsSection) => void;
  onLocate: () => Promise<void>;
}

export function ProjectStart({ projectId, initialModel, models, busy, settingsOpen, onRun, onSettings, onLocate }: Props) {
  const [model, setModel] = useState(initialModel ?? '');
  const [attempt, setAttempt] = useState(0);
  const [readiness, setReadiness] = useState<ProjectReadiness | null>(null);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(true);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    let current = true;
    setChecking(true);
    setReadiness(null);
    setError('');
    if (!settingsOpen) {
      void window.gu.getProjectReadiness(projectId, model || null)
        .then((result) => { if (current) setReadiness(result); })
        .catch((reason) => { if (current) setError(toMessage(reason)); })
        .finally(() => { if (current) setChecking(false); });
    }
    return () => { current = false; };
  }, [projectId, model, settingsOpen, attempt]);

  async function locate() {
    setLocating(true);
    try { await onLocate(); setAttempt((value) => value + 1); }
    catch (reason) { setError(toMessage(reason)); }
    finally { setLocating(false); }
  }

  return <div className="creation-ready">
    <div>
      <strong>方案已保存，准备开工</strong>
      <p>开始生成将使用模型和图片生成额度。</p>
      <label>制作模型 <select value={model} disabled={busy || locating} onChange={(event) => setModel(event.target.value)}>
        <option value="">使用项目默认模型</option>
        {model && !models.some((item) => item.model === model) && <option value={model}>原模型已不可用</option>}
        {models.map((item) => <option key={item.model} value={item.model}>{item.displayName}</option>)}
      </select></label>
      {checking ? <p role="status">正在检查生成条件…</p> : readiness?.ready ? <p role="status">生成条件已就绪</p> : null}
      {readiness?.issues.map((issue, index) => <p key={index} role="status">
        {issue.message}{' '}
        {issue.action === 'locate' ? <button className="secondary-button compact" disabled={busy || locating} onClick={() => void locate()}>连接文件夹</button>
          : issue.action !== 'wait' ? <button className="secondary-button compact" disabled={busy} onClick={() => { if (issue.action === 'account' || issue.action === 'media' || issue.action === 'environment') onSettings(issue.action); }}>打开设置</button> : null}
      </p>)}
      {error && <p role="alert">{error}</p>}
      {!checking && !readiness?.ready && <button className="secondary-button compact" disabled={busy || locating} onClick={() => setAttempt((value) => value + 1)}>重新检查</button>}
    </div>
    <button className="primary-button" disabled={busy || checking || locating || !readiness?.ready}
      onClick={() => void onRun(model || null).catch(() => undefined)}>
      {busy ? '正在启动…' : '开始生成'}
    </button>
  </div>;
}
