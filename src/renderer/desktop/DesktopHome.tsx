import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import type { ProjectRecord, RuntimeStatus } from '../../shared/contracts';
import { createCreationBrief, validateCreationBrief, CREATION_BRIEF_LIMITS, MAX_CREATION_IDEA_LENGTH, type CreationBrief, type CreationPlanInput } from '../../shared/creationBrief';
import { PROJECT_STATUS_LABELS, toMessage } from '../ui';
import { DesktopWindow, type DesktopBounds, type WindowGeometry } from './DesktopWindow';
import { DesktopPet, DesktopWallpaper } from './DesktopPet';
import { SpeechInput } from './SpeechInput';

interface Props {
  projects: readonly ProjectRecord[];
  runtime: RuntimeStatus;
  busy: boolean;
  focusSignal: number;
  onCreateProject: (brief: CreationBrief) => Promise<boolean>;
  onPlanBrief: (input: CreationPlanInput) => Promise<CreationBrief>;
  onCancelPlan: (requestId: string) => Promise<void>;
  onOpenProject: (project: ProjectRecord) => void;
  onOpenSettings: () => void;
  onOpenSpeechSettings: () => void;
}
type WindowId = 'create' | 'games' | 'ideas' | 'voice';
type Windows = Record<WindowId, WindowGeometry>;
interface Draft { idea: string; reference: string; genre: CreationBrief['genre']; brief: CreationBrief | null; briefSource: 'ai' | 'template' }
type PlanningState = 'idle' | 'planning' | 'cancelling' | 'cancel-failed';
interface ActivePlan { requestId: string; cancelled: boolean; settled: boolean; cancelPending: boolean; failure?: string }
const DRAFT_KEY = 'game-os.creation-draft.v1';
const WINDOWS_KEY = 'game-os.windows.v1';
const EMPTY_DRAFT: Draft = { idea: '', reference: '', genre: 'custom', brief: null, briefSource: 'template' };
const labels: Record<WindowId, string> = { create: '新建', games: '游戏', ideas: '灵感', voice: '语音' };
const genres: Array<{ value: CreationBrief['genre']; label: string }> = [
  { value: 'legion', label: '像素军团' }, { value: 'platform', label: '横版闯关' },
  { value: 'puzzle', label: '房间解谜' }, { value: 'custom', label: '自由创作' },
];
const starters = [
  { genre: 'legion' as const, label: '像素军团', color: 'pink', idea: '做一个像素风小队冒险游戏。随机招募伙伴，培养不同阵容，再自动迎战。第一版先做三个角色和一个森林关卡。' },
  { genre: 'platform' as const, label: '横版闯关', color: 'blue', idea: '做一个像素风横版游戏。小邮差在浮空岛上跳跃、收集星星，把信送到终点。第一版先做一个完整关卡。' },
  { genre: 'puzzle' as const, label: '房间解谜', color: 'gold', idea: '做一个像素风房间解谜游戏。寻找线索，移动箱子，触发机关，打开出口。第一版先做一间小屋。' },
];
const briefFields: Array<{ key: 'visualStyle' | 'coreLoop' | 'winCondition' | 'controls' | 'scope'; label: string }> = [
  { key: 'coreLoop', label: '怎么玩' }, { key: 'winCondition', label: '怎样获胜' },
  { key: 'controls', label: '怎么操作' }, { key: 'visualStyle', label: '画面风格' },
  { key: 'scope', label: '第一版做什么' },
];

function readDraft(): Draft {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null');
    if (!raw || typeof raw !== 'object') return { ...EMPTY_DRAFT };
    const value = raw as Record<string, unknown>;
    const idea = typeof value.idea === 'string' ? value.idea : '';
    const reference = typeof value.reference === 'string' ? value.reference : '';
    const selectedGenre = genres.find((item) => item.value === value.genre)?.value ?? 'custom';
    const briefSource = value.briefSource === 'ai' ? 'ai' : 'template';
    if (!value.brief || typeof value.brief !== 'object') return { idea, reference, genre: selectedGenre, brief: null, briefSource };
    const saved = value.brief as Record<string, unknown>;
    const genre = genres.find((item) => item.value === saved.genre)?.value;
    const base = createCreationBrief(idea, genre);
    const brief = { ...base };
    for (const key of ['name', 'visualStyle', 'coreLoop', 'winCondition', 'controls', 'scope', 'reference'] as const) {
      if (typeof saved[key] === 'string') brief[key] = saved[key];
    }
    return { idea, reference, genre: genre ?? selectedGenre, brief, briefSource };
  } catch {
    return { ...EMPTY_DRAFT };
  }
}
function initialWindows(): Windows {
  const make = (x: number, y: number, width: number, height: number, z: number, open = false): WindowGeometry =>
    ({ x, y, width, height, z, open, minimized: false, maximized: false });
  const base: Windows = {
    create: make(168, 64, 660, 500, 3, true),
    games: make(260, 70, 570, 370, 4),
    ideas: make(220, 110, 590, 350, 5),
    voice: make(240, 100, 540, 440, 6),
  };
  try {
    const saved = JSON.parse(localStorage.getItem(WINDOWS_KEY) ?? 'null') as Partial<Windows> | null;
    if (!saved || typeof saved !== 'object') return base;
    for (const id of Object.keys(base) as WindowId[]) {
      const item = saved[id];
      if (!item || typeof item !== 'object') continue;
      for (const key of ['x', 'y', 'width', 'height', 'z'] as const) {
        if (typeof item[key] === 'number' && Number.isFinite(item[key])) base[id][key] = Math.max(0, Math.min(item[key], 10000));
      }
      for (const key of ['open', 'minimized', 'maximized'] as const) {
        if (typeof item[key] === 'boolean') base[id][key] = item[key];
      }
    }
  } catch { /* Invalid local UI preferences do not block opening the desktop. */ }
  return base;
}
function Folder({ color = '', plus = false }: { color?: string; plus?: boolean }) {
  return <span className={'desktop-folder ' + color} aria-hidden="true">{plus && <i>+</i>}</span>;
}

export function DesktopHome({ projects, runtime, busy, focusSignal, onCreateProject, onPlanBrief, onCancelPlan, onOpenProject, onOpenSettings, onOpenSpeechSettings }: Props) {
  const [draft, setDraft] = useState<Draft>(readDraft);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const [windows, setWindows] = useState<Windows>(initialWindows);
  const [active, setActive] = useState<WindowId>('create');
  const [bounds, setBounds] = useState<DesktopBounds>({ width: 1000, height: 660 });
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [planningState, setPlanningState] = useState<PlanningState>('idle');
  const [planFailed, setPlanFailed] = useState(false);
  const activePlan = useRef<ActivePlan | null>(null);
  const mounted = useRef(true);
  const cancelPlanRef = useRef(onCancelPlan);
  cancelPlanRef.current = onCancelPlan;
  const [showReference, setShowReference] = useState(Boolean(draft.reference));
  const [startMenu, setStartMenu] = useState(false);
  const [clock, setClock] = useState(() => new Date());
  const [canUndo, setCanUndo] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);
  const compositionEnded = useRef(-1000);
  const submissionLock = useRef(false);
  const briefReadyAt = useRef(-1000);
  const undo = useRef<Draft | null>(null);
  const nextZ = useRef(Math.max(...Object.values(windows).map((item) => item.z), 6));
  const previousFocus = useRef(focusSignal);
  const planning = planningState !== 'idle';
  const locked = busy || submitting || planning;
  const shortcut = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const request = activePlan.current;
      activePlan.current = null;
      if (request) {
        request.cancelled = true;
        void cancelPlanRef.current(request.requestId).catch(() => undefined);
      }
    };
  }, []);
  useEffect(() => {
    const element = canvasRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setBounds({ width: element.clientWidth, height: element.clientHeight }));
    observer.observe(element);
    setBounds({ width: element.clientWidth, height: element.clientHeight });
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); }
    catch { setNotice('本机暂时无法保存草稿，请保持窗口打开。'); }
  }, [draft]);
  useEffect(() => {
    const timer = setTimeout(() => {
      try { localStorage.setItem(WINDOWS_KEY, JSON.stringify(windows)); } catch { /* Window geometry is optional. */ }
    }, 120);
    return () => clearTimeout(timer);
  }, [windows]);
  useEffect(() => {
    if (focusSignal === previousFocus.current) return;
    previousFocus.current = focusSignal;
    openWindow('create');
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [focusSignal]);

  function openWindow(id: WindowId) {
    setActive(id);
    setStartMenu(false);
    const z = ++nextZ.current;
    setWindows((current) => ({ ...current, [id]: { ...current[id], open: true, minimized: false, z } }));
  }
  function activate(id: WindowId) {
    setActive(id);
    const z = ++nextZ.current;
    setWindows((current) => ({ ...current, [id]: { ...current[id], z } }));
  }
  function changeWindow(id: WindowId, change: Partial<WindowGeometry>) {
    if (id === 'create' && change.open === false) {
      if (busy || submitting) return;
      if (activePlan.current) { void cancelPlanning(true); return; }
    }
    setWindows((current) => ({ ...current, [id]: { ...current[id], ...change } }));
  }
  function canPrepare(eventDetail: number): boolean {
    if (locked || activePlan.current || submissionLock.current || composing.current
      || performance.now() - compositionEnded.current < 150 || eventDetail > 1) return false;
    if (draft.idea.trim().length < 4) { setError('先写一句游戏想法。'); inputRef.current?.focus(); return false; }
    if (draft.idea.length > MAX_CREATION_IDEA_LENGTH) { setError('想法超过字数上限，请缩短后再整理。'); return false; }
    return true;
  }
  function prepareLocalBrief(eventDetail = 1) {
    if (!canPrepare(eventDetail)) return;
    submissionLock.current = true;
    try {
      const brief = createCreationBrief(draft.idea, draft.genre);
      brief.reference = draft.reference;
      briefReadyAt.current = performance.now();
      setDraft((current) => ({ ...current, brief, briefSource: 'template' }));
      setError('');
      setPlanFailed(false);
    } catch (reason) {
      setError(reason instanceof Error ? toMessage(reason) : '请检查想法后再整理。');
    } finally {
      queueMicrotask(() => { submissionLock.current = false; });
    }
  }
  async function prepareAiBrief(eventDetail = 1) {
    if (!canPrepare(eventDetail)) return;
    const request: ActivePlan = { requestId: crypto.randomUUID(), cancelled: false, settled: false, cancelPending: false };
    activePlan.current = request;
    setPlanningState('planning');
    setPlanFailed(false);
    setError('');
    setNotice('');
    const input: CreationPlanInput = { requestId: request.requestId, idea: draft.idea, reference: draft.reference, genre: draft.genre };
    try {
      const result = await onPlanBrief(input);
      if (!mounted.current || activePlan.current !== request || request.cancelled) return;
      const brief = validateCreationBrief({ ...result, idea: input.idea, reference: input.reference });
      briefReadyAt.current = performance.now();
      setDraft((current) => ({ ...current, brief, genre: brief.genre, briefSource: 'ai' }));
    } catch (reason) {
      request.failure = reason instanceof Error ? toMessage(reason) : 'AI 整理未完成';
      if (!mounted.current || activePlan.current !== request || request.cancelled) return;
      setError(request.failure);
      setPlanFailed(true);
    } finally {
      request.settled = true;
      if (mounted.current && activePlan.current === request && !request.cancelPending) {
        activePlan.current = null;
        setPlanningState('idle');
        if (request.cancelled) {
          setError((current) => current || '暂未确认模型停止，请检查运行时后再试。原文已保留。' + (request.failure ? ' ' + request.failure : ''));
          setPlanFailed(true);
        }
      }
    }
  }
  async function cancelPlanning(closeWindow = false) {
    const request = activePlan.current;
    if (!request || request.cancelPending) return;
    // Reject late answers immediately; wait for the host before enabling another request.
    request.cancelled = true;
    request.cancelPending = true;
    setPlanningState('cancelling');
    setError('');
    try {
      await onCancelPlan(request.requestId);
      if (!mounted.current || activePlan.current !== request) return;
      activePlan.current = null;
      setPlanningState('idle');
      setNotice('已取消整理，原文已保留。');
      if (closeWindow) setWindows((current) => ({ ...current, create: { ...current.create, open: false } }));
    } catch (reason) {
      if (!mounted.current || activePlan.current !== request) return;
      if (request.settled) {
        activePlan.current = null;
        setPlanningState('idle');
        setError('暂未确认模型停止，请检查运行时后再试。原文已保留。' + (reason instanceof Error ? ' ' + reason.message : ''));
        setPlanFailed(true);
      } else {
        setPlanningState('cancel-failed');
        setError('暂未确认停止，请重试取消。原文已保留。' + (reason instanceof Error ? ' ' + reason.message : ''));
      }
    } finally {
      request.cancelPending = false;
    }
  }
  async function createProject(detail: number) {
    if (locked || activePlan.current || submissionLock.current || composing.current || detail > 1 || !draft.brief || performance.now() - briefReadyAt.current < 550) return;
    let brief: CreationBrief;
    try {
      brief = validateCreationBrief({ ...draft.brief, idea: draft.idea });
    } catch (reason) {
      setError(reason instanceof Error ? toMessage(reason) : '请补全创作草案。');
      return;
    }
    submissionLock.current = true;
    setSubmitting(true);
    setError('');
    try {
      const created = await onCreateProject({ ...brief, idea: draft.idea });
      if (created) {
        // Persist immediately: the parent may navigate away on successful creation.
        try { localStorage.removeItem(DRAFT_KEY); } catch { /* The parent already owns the saved project. */ }
        setDraft({ ...EMPTY_DRAFT });
        undo.current = null;
        setCanUndo(false);
        setShowReference(false);
        setNotice('项目已保存在本机。');
      }
    } catch (reason) {
      setError(reason instanceof Error ? toMessage(reason) : '项目未创建，草稿已保留。');
    } finally {
      submissionLock.current = false;
      setSubmitting(false);
    }
  }
  function paste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const input = event.currentTarget;
    const length = input.value.length - (input.selectionEnd - input.selectionStart) + event.clipboardData.getData('text/plain').length;
    if (length > MAX_CREATION_IDEA_LENGTH) {
      event.preventDefault();
      setError('粘贴后超过 ' + MAX_CREATION_IDEA_LENGTH + ' 字，本次未粘贴，原文已保留。');
    }
  }
  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing || composing.current || event.keyCode === 229) return;
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.altKey) {
      event.preventDefault();
      if (!event.repeat) void prepareAiBrief();
    }
  }
  function applySpeechTranscript(text: string): string | null {
    if (locked || activePlan.current || submissionLock.current) return '正在整理方案或创建项目，请完成后再填入。识别文字已保留。';
    const current = draftRef.current;
    if (current.brief) return '请先在方案窗口点击“修改想法”，再填入识别文字。';
    if (!text.trim()) return '先检查识别文字，再填入想法。';
    const idea = current.idea + (current.idea && !current.idea.endsWith('\n') ? '\n' : '') + text;
    if (idea.length > MAX_CREATION_IDEA_LENGTH) return '合并后超过 ' + MAX_CREATION_IDEA_LENGTH + ' 字，请缩短识别文字或已有想法后再填入。两边原文均已保留。';
    const next = { ...current, idea };
    draftRef.current = next;
    setDraft(next);
    setError('');
    setPlanFailed(false);
    setNotice('语音已填入想法，检查后再整理方案。');
    changeWindow('voice', { open: false });
    openWindow('create');
    requestAnimationFrame(() => inputRef.current?.focus());
    return null;
  }
  function setBriefField(key: keyof CreationBrief, value: string) {
    setDraft((current) => current.brief ? { ...current, brief: { ...current.brief, [key]: value } } : current);
    setError('');
  }
  function chooseStarter(starter: typeof starters[number]) {
    openWindow('create');
    if (locked || activePlan.current) return;
    if (draft.idea.trim()) { setNotice('已有想法已保留，清空后可选用模板。'); return; }
    setDraft({ idea: starter.idea, reference: '', genre: starter.genre, brief: null, briefSource: 'template' });
    setPlanFailed(false);
    setNotice('已填入可编辑模板。');
    requestAnimationFrame(() => inputRef.current?.focus());
  }
  const windowProps = (id: WindowId, title: string) => ({
    id, title, bounds, geometry: windows[id], active: active === id,
    onActivate: () => activate(id), onChange: (change: Partial<WindowGeometry>) => changeWindow(id, change),
  });
  const online = runtime.state === 'ready' && Boolean(runtime.account);

  return (
    <section id="game-desktop" aria-label="像素游戏创作桌面">
      <header className="desktop-menubar">
        <div className="desktop-wordmark"><i aria-hidden="true" />GAME//OS</div>
        <div className="desktop-clock"><span>CREATOR DESKTOP</span>{clock.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}</div>
      </header>
      <div className="desktop-canvas" ref={canvasRef}>
        <DesktopWallpaper />
        <nav className="desktop-icons" aria-label="桌面文件夹">
          <button type="button" onClick={() => openWindow('create')}><Folder plus /><span>新建游戏</span></button>
          <button type="button" onClick={() => openWindow('games')}><Folder color="pink" /><span>我的游戏</span></button>
          <button type="button" onClick={() => openWindow('ideas')}><Folder color="gold" /><span>灵感库</span></button>
          <button type="button" onClick={onOpenSettings}><Folder color="blue" /><span>设置</span></button>
        </nav>
        <DesktopPet />
        <DesktopWindow {...windowProps('create', draft.brief ? 'BLUEPRINT.EXE' : 'NEW GAME.EXE')} blocked={busy || submitting || planningState === 'cancelling'}>
          {draft.brief ? (
            <div className="desktop-brief">
              <div className="desktop-terminal-head">C:\CREATE&gt; {draft.briefSource === 'ai' ? 'AI 方案' : '本地模板'}</div>
              <div className="desktop-brief-grid">
                <label>游戏名称<input value={draft.brief.name} maxLength={CREATION_BRIEF_LIMITS.name} disabled={locked} onChange={(event) => setBriefField('name', event.target.value)} /></label>
                <label>玩法<select value={draft.brief.genre} disabled={locked} onChange={(event) => setBriefField('genre', event.target.value)}>{genres.map((genre) => <option key={genre.value} value={genre.value}>{genre.label}</option>)}</select></label>
                {briefFields.map(({ key, label }) => <label key={key} className={key === 'scope' ? 'wide' : ''}>{label}<textarea rows={2} maxLength={CREATION_BRIEF_LIMITS[key]} disabled={locked} value={draft.brief![key]} onChange={(event) => setBriefField(key, event.target.value)} /></label>)}
                <label className="wide">参考游戏（可选）<input value={draft.brief.reference} disabled={locked} maxLength={CREATION_BRIEF_LIMITS.reference} onChange={(event) => setBriefField('reference', event.target.value)} /></label>
              </div>
              <p className="desktop-brief-note">确认后保存本地项目；开始生成由你另行点击。</p>
              <div className="desktop-actions">
                <button type="button" className="desktop-button quiet" disabled={locked} onClick={() => { setDraft((current) => ({ ...current, genre: current.brief?.genre ?? current.genre, reference: current.brief?.reference ?? current.reference, brief: null })); setError(''); }}>← 修改想法</button>
                <button type="button" className="desktop-button primary" disabled={locked} onClick={(event) => void createProject(event.detail)}>{locked ? '正在创建…' : '创建项目'}</button>
              </div>
              {error && <p className="desktop-error" role="alert">{error}</p>}
            </div>
          ) : (
            <div className="desktop-create">
              <div className="desktop-terminal-head">C:\CREATE&gt; NEW PROJECT</div>
              <h1>你想创造什么游戏？</h1>
              <div className="desktop-terminal-input">
                <span className="desktop-prompt">&gt; YOUR IDEA</span>
                <textarea ref={inputRef} value={draft.idea} maxLength={MAX_CREATION_IDEA_LENGTH} spellCheck={false}
                  aria-label="输入你的游戏想法" aria-describedby="desktop-input-help" placeholder="慢慢说清楚你的想法…" disabled={locked}
                  onChange={(event) => { const idea = event.target.value; draftRef.current = { ...draftRef.current, idea }; setDraft((current) => ({ ...current, idea })); setError(''); setPlanFailed(false); }}
                  onPaste={paste} onKeyDown={keyDown}
                  onCompositionStart={() => { composing.current = true; }}
                  onCompositionEnd={() => { composing.current = false; compositionEnded.current = performance.now(); }}
                />
                <div className="desktop-input-base"><span id="desktop-input-help">Enter 换行 · {shortcut}+Enter AI 整理</span><span>{draft.idea.length}/{MAX_CREATION_IDEA_LENGTH}</span></div>
              </div>
              {showReference && <label className="desktop-reference"><span className="desktop-sr">参考游戏名称</span><input placeholder="参考游戏名称或链接" value={draft.reference} maxLength={CREATION_BRIEF_LIMITS.reference} disabled={locked} onChange={(event) => setDraft((current) => ({ ...current, reference: event.target.value }))} /></label>}
              <div className="desktop-actions">
                <div className="desktop-left-actions">
                  <button type="button" className="desktop-button pink" disabled={locked} onClick={() => openWindow('voice')}>语音输入</button>
                  <button type="button" className="desktop-button quiet" disabled={locked} onClick={() => setShowReference((value) => !value)}>＋ 参考</button>
                  {draft.idea && <button type="button" className="desktop-button quiet" disabled={locked} onClick={() => { undo.current = draft; setCanUndo(true); setDraft({ ...EMPTY_DRAFT }); setNotice('已清空想法。'); setError(''); setPlanFailed(false); }}>清空</button>}
                </div>
                <div className="desktop-plan-actions">
                  {planning ? <div className="desktop-planning" role="status" aria-live="polite">
                    <span>{planningState === 'cancelling' ? '正在取消…' : planningState === 'cancel-failed' ? '等待停止确认' : 'AI 正在整理方案…'}</span>
                    <button type="button" className="desktop-button quiet" disabled={planningState === 'cancelling'} onClick={() => void cancelPlanning()}>{planningState === 'cancel-failed' ? '重试取消' : '取消整理'}</button>
                  </div> : <>
                    <button type="button" className="desktop-button quiet" disabled={locked || !draft.idea.trim()} onClick={(event) => prepareLocalBrief(event.detail)}>用本地模板</button>
                    <button type="button" className="desktop-button primary" disabled={locked || !draft.idea.trim()} onClick={(event) => void prepareAiBrief(event.detail)}>{planFailed ? '重试 AI 整理' : 'AI 整理方案'}</button>
                  </>}
                </div>
              </div>
              <p className="desktop-plan-note">AI 整理会使用模型额度，确认方案后才创建项目。</p>
              {error && <p className="desktop-error" role="alert">{error}</p>}
            </div>
          )}
        </DesktopWindow>
        <DesktopWindow {...windowProps('games', '我的游戏')}>
          <div className="desktop-path">MY GAMES / {projects.length}</div>
          {projects.length ? <div className="desktop-files">{projects.map((project, index) => (
            <button type="button" className="desktop-file" key={project.id} title={project.name} onClick={() => onOpenProject(project)}>
              <Folder color={['pink', 'blue', 'gold'][index % 3]} /><span>{project.name}</span><small>{PROJECT_STATUS_LABELS[project.status]}</small>
            </button>
          ))}</div> : <div className="desktop-empty"><p>这里还没有游戏。</p><button type="button" className="desktop-button primary" onClick={() => openWindow('create')}>新建游戏</button></div>}
        </DesktopWindow>
        <DesktopWindow {...windowProps('ideas', '灵感库')}>
          <div className="desktop-path">IDEAS / 可编辑的起点</div>
          <div className="desktop-files">{starters.map((starter) => <button type="button" className="desktop-file" key={starter.genre} disabled={locked} onClick={() => chooseStarter(starter)}><Folder color={starter.color} /><span>{starter.label}</span></button>)}</div>
        </DesktopWindow>
        <DesktopWindow {...windowProps('voice', 'VOICE.INPUT')}>
          <SpeechInput onApply={applySpeechTranscript} onOpenSettings={() => { changeWindow('voice', { open: false }); onOpenSpeechSettings(); }} />
        </DesktopWindow>
        {notice && <div className="desktop-notice" role="status"><span>{notice}</span>{canUndo && <button type="button" disabled={locked} onClick={() => { if (locked || activePlan.current) return; if (undo.current) setDraft(undo.current); undo.current = null; setCanUndo(false); setNotice('已恢复想法。'); }}>撤回清空</button>}<button type="button" aria-label="关闭提示" onClick={() => setNotice('')}>×</button></div>}
      </div>
      <footer className="desktop-taskbar">
        <button type="button" className="desktop-start" aria-label="开始菜单" aria-expanded={startMenu} onClick={() => setStartMenu((value) => !value)}>▦ <span>开始</span></button>
        <div className="desktop-tasks">{(Object.keys(windows) as WindowId[]).filter((id) => windows[id].open).map((id) => <button type="button" key={id} className={active === id && !windows[id].minimized ? 'active' : ''} onClick={() => active === id && !windows[id].minimized ? changeWindow(id, { minimized: true }) : openWindow(id)}>▣ {labels[id]}</button>)}</div>
        <button type="button" className="desktop-runtime" onClick={onOpenSettings}>{online ? 'Codex 已连接' : '本地创作'}</button>
        <button type="button" className="desktop-show" aria-label="显示桌面" onClick={() => setWindows((current) => Object.fromEntries(Object.entries(current).map(([id, value]) => [id, { ...value, minimized: true }])) as Windows)} />
        {startMenu && <div className="desktop-start-menu">{(['create', 'games', 'ideas'] as WindowId[]).map((id) => <button type="button" key={id} onClick={() => openWindow(id)}>{id === 'create' ? '新建游戏' : id === 'games' ? '我的游戏' : '灵感库'}</button>)}<button type="button" onClick={() => { setStartMenu(false); onOpenSettings(); }}>设置</button></div>}
      </footer>
    </section>
  );
}
