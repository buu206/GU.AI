import { useConfirmation } from './Confirmation';
import {
  Boxes,
  Cable,
  CheckCircle2,
  Cpu,
  ExternalLink,
  FileCode2,
  FileText,
  FolderOpen,
  KeyRound,
  LogIn,
  LogOut,
  Mic,
  Monitor,
  Palette,
  RefreshCw,
  Save,
  Settings2,
  SquareTerminal,
  SunMoon,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';

import type {
  AppSettings,
  LoginStartResult,
  RuntimeStatus,
} from '../../shared/contracts';
import {
  DEFAULT_GU_CREW,
  DEFAULT_GU_PACK_ID,
  DEFAULT_GU_SCENE_ID,
  DEFAULT_GU_SOLO_SCENE_ID,
  DEFAULT_GU_STAGE_MODE,
} from '../../shared/contracts';
import { runtimeLabel, toMessage } from '../ui';
import { Modal } from './Modal';
import { EnvironmentSettings } from './EnvironmentSettings';
import { SpeechSettings } from './SpeechSettings';
import { GuCrewPicker } from './GuCrewPicker';
import { GuPackPicker } from './GuPackPicker';
import { GuScenePicker, GuSoloScenePicker } from './GuScenePicker';
import {
  McpSettings,
  MediaApiSettings,
  PromptSettings,
  SkillsSettings,
  useExtensionSettings,
} from './SettingsExtensions';

export type SettingsSection = 'account' | 'environment' | 'media' | 'speech' | 'defaults' | 'gu' | 'skills' | 'mcp' | 'prompts' | 'appearance';

interface SettingsModalProps {
  value: AppSettings;
  runtime: RuntimeStatus;
  initialSection?: SettingsSection;
  onClose: () => void;
  onSaved: (settings: AppSettings) => void;
  onRuntime: (runtime: RuntimeStatus) => void;
}

const SECTIONS = [
  { id: 'account', label: 'Codex 账户', detail: '登录与运行时', icon: KeyRound },
  { id: 'environment', label: '环境管理', detail: 'Node、Codex、Godot', icon: Cpu },
  { id: 'media', label: '媒体 API', detail: '图像、音频、3D', icon: Boxes },
  { id: 'speech', label: '语音识别', detail: '录音转文字', icon: Mic },
  { id: 'defaults', label: '项目默认值', detail: '目录、模型、推理', icon: Settings2 },
  { id: 'gu', label: '赛博工作台', detail: '游侠装备与场景', icon: Palette },
  { id: 'skills', label: 'Skills', detail: 'Agent 专业能力', icon: FileCode2 },
  { id: 'mcp', label: 'MCP Servers', detail: '工具与数据连接', icon: Cable },
  { id: 'prompts', label: '提示词', detail: '分角色模板', icon: FileText },
  { id: 'appearance', label: '外观', detail: '像素赛博主题', icon: SunMoon },
] as const;

export function SettingsModal({
  value,
  runtime,
  initialSection = 'account',
  onClose,
  onSaved,
  onRuntime,
}: SettingsModalProps) {
  const confirm = useConfirmation();
  const [section, setSection] = useState<SettingsSection>(initialSection);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [login, setLogin] = useState<LoginStartResult | null>(null);
  const [promptDirty, setPromptDirty] = useState(false);
  const [promptBusy, setPromptBusy] = useState(false);
  const [speechBusy, setSpeechBusy] = useState(false);
  const extensions = useExtensionSettings(setMessage, ['media', 'skills', 'mcp', 'prompts'].includes(section));

  useEffect(() => setDraft(value), [value]);

  const selectedModel = useMemo(
    () => runtime.models.find((item) => item.model === draft.defaultModel),
    [draft.defaultModel, runtime.models],
  );
  const efforts = selectedModel?.efforts.length
    ? selectedModel.efforts
    : ['minimal', 'low', 'medium', 'high', 'xhigh'];
  const guStageMode = draft.defaultGuStageMode ?? DEFAULT_GU_STAGE_MODE;

  async function refreshRuntime() {
    setBusy(true);
    setMessage('');
    try {
      onRuntime(await window.gu.refreshRuntime());
      setMessage('运行时状态已刷新。');
    } catch (error) {
      setMessage(toMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function startLogin() {
    setBusy(true);
    setMessage('');
    try {
      const result = await window.gu.startLogin();
      setLogin(result);
      setMessage('请在官方页面完成 Codex 登录。');
    } catch (error) {
      setMessage(toMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    setMessage('');
    try {
      onRuntime(await window.gu.logout());
      setLogin(null);
      setMessage('已退出 Codex 账户。');
    } catch (error) {
      setMessage(toMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function chooseDirectory() {
    const directory = await window.gu.chooseDirectory();
    if (directory) setDraft((current) => ({ ...current, defaultWorkspace: directory }));
  }

  async function save() {
    setBusy(true);
    setMessage('');
    try {
      const saved = await window.gu.saveSettings(draft);
      setDraft(saved);
      onSaved(saved);
      setMessage('设置已保存。');
    } catch (error) {
      setMessage(toMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function confirmPromptDiscard(): Promise<boolean> {
    return !promptDirty || await confirm('提示词有未保存更改。离开此页面会放弃这些更改，是否继续？');
  }

  async function closeSettings() {
    if (promptBusy || speechBusy || !(await confirmPromptDiscard())) return;
    setPromptDirty(false);
    onClose();
  }

  async function selectSection(next: SettingsSection) {
    if (next === section || promptBusy || speechBusy || !(await confirmPromptDiscard())) return;
    setPromptDirty(false);
    setSection(next);
    setMessage('');
  }

  return (
    <Modal
      eyebrow="SYSTEM / CONTROL CENTER"
      title="设置"
      description="配置 Agent 运行时、媒体服务、扩展能力和制作规范。"
      className="settings-modal"
      onClose={busy || promptBusy || speechBusy ? undefined : closeSettings}
      footer={
        <>
          <span className="settings-feedback" role="status">{message}</span>
          {section === 'defaults' || section === 'gu' ? (
            <button className="primary-button" type="button" disabled={busy} onClick={() => void save()}>
              <Save size={15} /> {busy ? '保存中…' : '保存设置'}
            </button>
          ) : null}
        </>
      }
    >
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="设置分类">
          {SECTIONS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                type="button"
                key={item.id}
                className={section === item.id ? 'is-active' : ''}
                aria-current={section === item.id ? 'page' : undefined}
                disabled={promptBusy || speechBusy}
                onClick={() => selectSection(item.id)}
              >
                <Icon size={16} />
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.detail}</small>
                </span>
              </button>
            );
          })}
        </nav>

        <div className="settings-page">
          {section === 'account' ? (
            <AccountSettings
              runtime={runtime}
              login={login}
              busy={busy}
              onRefresh={() => void refreshRuntime()}
              onLogin={() => void startLogin()}
              onLogout={() => void logout()}
            />
          ) : null}

          {section === 'environment' ? <EnvironmentSettings onMessage={setMessage} /> : null}

          {section === 'media' ? <MediaApiSettings controller={extensions} /> : null}

          {section === 'speech' ? <SpeechSettings onBusyChange={setSpeechBusy} /> : null}

          {section === 'defaults' ? (
            <section>
              <SettingsHeading
                eyebrow="PROJECT DEFAULTS"
                title="新项目默认值"
                description="这些值只作为新任务起点，每个项目仍可单独选择模型和推理强度。"
              />
              <div className="settings-form">
                <label>
                  <span>默认工作区</span>
                  <div className="path-control">
                    <input
                      value={draft.defaultWorkspace}
                      onChange={(event) => setDraft((current) => ({ ...current, defaultWorkspace: event.target.value }))}
                    />
                    <button type="button" onClick={() => void chooseDirectory()}>
                      <FolderOpen size={14} /> 选择
                    </button>
                  </div>
                </label>
                <label>
                  <span>默认模型</span>
                  <select
                    value={draft.defaultModel ?? ''}
                    onChange={(event) => {
                      const model = runtime.models.find((item) => item.model === event.target.value);
                      setDraft((current) => ({
                        ...current,
                        defaultModel: event.target.value || null,
                        defaultEffort: model?.defaultEffort ?? current.defaultEffort,
                      }));
                    }}
                  >
                    <option value="">使用 Codex 默认模型</option>
                    {runtime.models.map((item) => (
                      <option value={item.model} key={item.id}>{item.displayName}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>默认推理强度</span>
                  <select
                    value={draft.defaultEffort}
                    onChange={(event) => setDraft((current) => ({ ...current, defaultEffort: event.target.value }))}
                  >
                    {efforts.map((effort) => (
                      <option value={effort} key={effort}>{effort.toUpperCase()}</option>
                    ))}
                  </select>
                </label>
              </div>
            </section>
          ) : null}

          {section === 'gu' ? (
            <section>
              <SettingsHeading
                eyebrow="GAME//OS STUDIO"
                title="选择默认搭档与工作场景"
                description="选择游侠装备与控制台场景，也可以组建多人编队。"
              />

              <section
                className={`gu-mode-panel gu-solo-panel${guStageMode === 'solo' ? ' is-active' : ''}`}
                aria-label="默认单人搭档与工作室"
              >
                <header className="gu-mode-panel-heading">
                  <div>
                    <small>SOLO / DEFAULT</small>
                    <strong>一位搭档，一个工作室</strong>
                    <p>角色和场景分别选择，可以自由组合；选择任一项都会把单人模式设为默认。</p>
                  </div>
                  <span className="gu-mode-state">
                    {guStageMode === 'solo' ? '当前默认' : '点击选项启用'}
                  </span>
                </header>

                <section className="gu-setup-step" aria-labelledby="gu-character-step-title">
                  <header className="gu-setup-step-heading">
                    <span aria-hidden="true">01</span>
                    <div>
                      <small>SOLO PARTNER</small>
                      <strong id="gu-character-step-title">先选择一位默认角色</strong>
                      <p>游侠会在制作台中随任务阶段行动。</p>
                    </div>
                  </header>
                  <GuPackPicker
                    value={draft.defaultGuPackId ?? DEFAULT_GU_PACK_ID}
                    mode="global"
                    presentation="character"
                    busy={busy}
                    onChange={(defaultGuPackId) => {
                      if (!defaultGuPackId) return;
                      setDraft((current) => ({
                        ...current,
                        defaultGuPackId,
                        defaultGuStageMode: 'solo',
                      }));
                    }}
                  />
                </section>

                <GuSoloScenePicker
                  value={draft.defaultGuSoloSceneId ?? DEFAULT_GU_SOLO_SCENE_ID}
                  busy={busy}
                  onChange={(defaultGuSoloSceneId) => {
                    setDraft((current) => ({
                      ...current,
                      defaultGuSoloSceneId,
                      defaultGuStageMode: 'solo',
                    }));
                  }}
                />
              </section>

              <section
                className={`gu-mode-panel gu-multiplayer-panel${guStageMode === 'crew' ? ' is-active' : ''}`}
                aria-label="多人协作与多人场景"
              >
                <header className="gu-mode-panel-heading">
                  <div>
                    <small>MULTIPLAYER / OPTIONAL</small>
                    <strong>需要时，再组建多人编队</strong>
                    <p>先配置 2–4 位伙伴的岗位，再在最下方选择一个多人舞台。</p>
                  </div>
                  <span className="gu-mode-state">
                    {guStageMode === 'crew' ? '当前默认' : '可选模式'}
                  </span>
                </header>

                <GuCrewPicker
                  value={draft.defaultGuCrew ?? DEFAULT_GU_CREW}
                  busy={busy}
                  onChange={(defaultGuCrew) => {
                    setDraft((current) => ({ ...current, defaultGuCrew }));
                  }}
                />
                <GuScenePicker
                  value={guStageMode === 'crew'
                    ? draft.defaultGuSceneId ?? DEFAULT_GU_SCENE_ID
                    : null}
                  busy={busy}
                  onChange={(defaultGuSceneId) => {
                    setDraft((current) => ({
                      ...current,
                      defaultGuSceneId,
                      defaultGuStageMode: 'crew',
                    }));
                  }}
                />
                <p className="gu-pack-settings-note">
                  选择多人场景后启用编队；指挥站和天台均显示你配置的伙伴。
                </p>
              </section>
            </section>
          ) : null}

          {section === 'skills' ? <SkillsSettings controller={extensions} /> : null}

          {section === 'mcp' ? <McpSettings controller={extensions} /> : null}

          {section === 'prompts' ? (
            <PromptSettings
              controller={extensions}
              onDirtyChange={setPromptDirty}
              onBusyChange={setPromptBusy}
            />
          ) : null}

          {section === 'appearance' ? (
            <section>
              <SettingsHeading eyebrow="APPEARANCE" title="赛博像素桌面"
                description="主桌面、制作窗口与所有应用弹窗使用同一套像素主题。" />
              <div className="pixel-theme-preview">
                <span aria-hidden="true"><i /><i /><i /></span>
                <div><strong>GAME//OS</strong><p>深紫底色 · 青色操作 · 洋红强调</p></div>
                <CheckCircle2 size={20} aria-label="当前主题" />
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}

function AccountSettings({
  runtime,
  login,
  busy,
  onRefresh,
  onLogin,
  onLogout,
}: {
  runtime: RuntimeStatus;
  login: LoginStartResult | null;
  busy: boolean;
  onRefresh: () => void;
  onLogin: () => void;
  onLogout: () => void;
}) {
  return (
    <section>
      <SettingsHeading
        eyebrow="CODEX APP SERVER"
        title="运行时与账户"
        description="GU 通过官方 App Server 使用 Codex；认证在系统浏览器中完成。"
        action={
          <button className="secondary-button compact" type="button" disabled={busy} onClick={onRefresh}>
            <RefreshCw size={13} className={busy ? 'spin' : ''} /> 刷新
          </button>
        }
      />

      <div className={`runtime-card state-${runtime.state}`}>
        <div className="runtime-card-heading">
          <span className={`runtime-dot state-${runtime.state}`} />
          <div>
            <strong>{runtimeLabel(runtime)}</strong>
            <small>{runtime.version ?? 'VERSION UNKNOWN'}</small>
          </div>
        </div>
        {runtime.error ? <p className="runtime-error">{runtime.error}</p> : null}
        <dl>
          <div><dt>Binary</dt><dd>{runtime.binaryPath ?? '尚未定位'}</dd></div>
          <div><dt>Codex Home</dt><dd>{runtime.codexHome ?? '尚未启动'}</dd></div>
          <div><dt>Models</dt><dd>{runtime.models.length}</dd></div>
          <div><dt>Image route</dt><dd>{runtime.capabilities.externalImageGeneration ? '外部 API 优先' : runtime.capabilities.imageGeneration ? 'Codex ImageGen' : '当前不可用'}</dd></div>
          <div><dt>Media tools</dt><dd>{runtime.state === 'ready' ? '素材库 / 音效已接入' : '等待运行时'}</dd></div>
        </dl>
      </div>

      <div className="account-card">
        <div className="account-icon"><SquareTerminal size={20} /></div>
        <div className="account-copy">
          <span>CHATGPT / CODEX ACCOUNT</span>
          <strong>{runtime.account?.email ?? '尚未登录'}</strong>
          <small>{runtime.account?.planType ?? runtime.account?.type ?? '使用 ChatGPT 账号授权 Codex'}</small>
        </div>
        {runtime.account ? (
          <button className="secondary-button compact" type="button" disabled={busy} onClick={onLogout}>
            <LogOut size={13} /> 退出
          </button>
        ) : (
          <button className="primary-button compact" type="button" disabled={busy} onClick={onLogin}>
            <LogIn size={13} /> 登录
          </button>
        )}
      </div>

      {login ? (
        <div className="login-instructions">
          <Monitor size={17} />
          <div>
            <strong>在官方页面完成登录</strong>
            {login.userCode ? <code>{login.userCode}</code> : null}
            {login.verificationUrl || login.authUrl ? (
              <a href={login.verificationUrl ?? login.authUrl} target="_blank" rel="noreferrer">
                打开验证页面 <ExternalLink size={12} />
              </a>
            ) : (
              <span>系统浏览器已打开，请在那里完成授权。</span>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function SettingsHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="settings-page-heading">
      <div>
        <span>{eyebrow}</span>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      {action}
    </header>
  );
}
