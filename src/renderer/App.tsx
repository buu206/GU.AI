import { X } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
} from 'react';

import type {
  AgentEvent,
  AppSettings,
  AssetPlanRecord,
  ApprovalAnswers,
  ApprovalDecision,
  ApprovalRequest,
  BootstrapPayload,
  ProjectRecord,
  RuntimeStatus,
} from '../shared/contracts';
import { ApprovalModal } from './components/ApprovalModal';
import { ProjectStart } from './components/ProjectStart';
import { Composer } from './components/Composer';
import { DeleteProjectModal } from './components/DeleteProjectModal';
import { EventStream } from './components/EventStream';
import type { CreationBrief, CreationPlanInput } from '../shared/creationBrief';
import { ProductionDesktop } from './desktop/ProductionDesktop';
import { DesktopHome } from './desktop/DesktopHome';
import { CYBER_AVATARS, CYBER_SCENES } from './cyberArtAssets';
import { Inspector } from './components/Inspector';
import { Pipeline } from './components/Pipeline';
import {
  PIXEL_COVER_DURATION_MS,
  PIXEL_REVEAL_DURATION_MS,
  PixelPageTransition,
  type PixelTransitionDirection,
} from './components/PixelPageTransition';
import { RenameProjectModal } from './components/RenameProjectModal';
import { SettingsModal, type SettingsSection } from './components/SettingsModal';
import { PROJECT_STATUS_LABELS, toMessage } from './ui';
import {
  WORKSPACE_HOME_TARGET,
  createWorkspaceViewTransitionState,
  workspaceProjectTarget,
  workspaceViewTransitionReducer,
  type WorkspaceViewAnimatedPhase,
} from './workspaceViewTransition';

type EventMap = Record<string, AgentEvent[]>;

export function App() {
  const [bootstrap, setBootstrap] = useState<BootstrapPayload | null>(null);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [viewTransition, dispatchViewTransition] = useReducer(
    workspaceViewTransitionReducer,
    undefined,
    () => createWorkspaceViewTransitionState(
      WORKSPACE_HOME_TARGET,
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    ),
  );
  const [events, setEvents] = useState<EventMap>({});
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [homeFocusSignal, setHomeFocusSignal] = useState(0);
  const [homeLaunching, setHomeLaunching] = useState(false);
  const [canChooseAnotherDirectory, setCanChooseAnotherDirectory] = useState(false);
  const [startingProjectId, setStartingProjectId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsInitialSection, setSettingsInitialSection] = useState<SettingsSection>('account');
  const [error, setError] = useState('');
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [loadingError, setLoadingError] = useState('');
  const [renameTarget, setRenameTarget] = useState<ProjectRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectRecord | null>(null);
  const [projectActionBusy, setProjectActionBusy] = useState(false);
  const creationInFlight = useRef(false);
  const runInFlight = useRef(new Set<string>());
  const creationRequest = useRef<{ signature: string; projectDirectory: string; requestId: string } | null>(null);
  const workspaceRef = useRef<HTMLElement>(null);
  const focusHomeCreatorRef = useRef(false);

  const selectedId = viewTransition.visible.kind === 'project'
    ? viewTransition.visible.projectId
    : undefined;

  const selected = useMemo(
    () => projects.find((project) => project.id === selectedId),
    [projects, selectedId],
  );
  const selectedEvents = selected ? (events[selected.id] ?? []) : [];
  const latestSelectedEvent = selectedEvents[selectedEvents.length - 1] ?? null;
  const studioStage = selected
    ? selected.status === 'running' && latestSelectedEvent
      ? latestSelectedEvent.stage
      : selected.stage
    : null;
  const imageGenerationAvailable = Boolean(
    runtime?.capabilities.imageGeneration || runtime?.capabilities.externalImageGeneration,
  );

  const loadBootstrap = useCallback(async () => {
    setLoadingError('');
    try {
      const state = await window.gu.bootstrap();
      setBootstrap(state);
      setProjects(state.projects);
      setSettings(state.settings);
      setRuntime(state.runtime);
      setEvents(state.events ?? {});
      dispatchViewTransition({
        type: 'SYNC_PROJECTS',
        projectIds: state.projects.map((project) => project.id),
      });
    } catch (reason) {
      setLoadingError(toMessage(reason));
    }
  }, []);

  useEffect(() => {
    void loadBootstrap();

    const stopAgentEvents = window.gu.onAgentEvent((event) => {
      setEvents((current) => ({
        ...current,
        [event.projectId]: mergeEvent(current[event.projectId] ?? [], event),
      }));
      if (event.kind === 'file' || event.kind === 'lifecycle') {
        setRefreshSignal((value) => value + 1);
      }
    });

    const stopProjects = window.gu.onProjectChanged((project) => {
      setProjects((current) => upsertProject(current, project));
    });

    const stopRuntime = window.gu.onRuntimeChanged((status) => {
      setRuntime(status);
    });

    const stopApprovals = window.gu.onApproval((approval) => {
      setApprovals((current) =>
        current.some((item) => item.token === approval.token)
          ? current
          : [...current, approval],
      );
    });
    const stopApprovalClosed = window.gu.onApprovalClosed((token) => {
      setApprovals((current) => current.filter((item) => item.token !== token));
    });

    return () => {
      stopAgentEvents();
      stopProjects();
      stopRuntime();
      stopApprovals();
      stopApprovalClosed();
    };
  }, [loadBootstrap]);

  useEffect(() => {
    if (!settings) return;
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.style.colorScheme = settings.theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', settings.theme === 'dark' ? '#151611' : '#f2f1eb');
  }, [settings]);

  useEffect(() => {
    dispatchViewTransition({
      type: 'SYNC_PROJECTS',
      projectIds: projects.map((project) => project.id),
    });
  }, [projects]);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncPreference = () => {
      dispatchViewTransition({
        type: 'SET_REDUCED_MOTION',
        enabled: preference.matches,
      });
    };
    preference.addEventListener('change', syncPreference);
    return () => preference.removeEventListener('change', syncPreference);
  }, []);

  function openSettings(initialSection: SettingsSection = 'account') {
    setSettingsInitialSection(initialSection);
    setShowSettings(true);
  }

  function navigateHome() {
    focusHomeCreatorRef.current = false;
    dispatchViewTransition({ type: 'NAVIGATE', target: WORKSPACE_HOME_TARGET });
  }

  function navigateToProject(project: ProjectRecord) {
    focusHomeCreatorRef.current = false;
    dispatchViewTransition({ type: 'NAVIGATE', target: workspaceProjectTarget(project.id) });
  }

  function openHomeCreator() {
    focusHomeCreatorRef.current = true;
    dispatchViewTransition({ type: 'NAVIGATE', target: WORKSPACE_HOME_TARGET });
    setHomeFocusSignal((value) => value + 1);
  }

  const completeViewTransition = useCallback((
    phase: WorkspaceViewAnimatedPhase,
    runId: number,
  ) => {
    dispatchViewTransition({ type: 'PHASE_COMPLETE', phase, runId });
    if (phase === 'revealing') {
      const creatorWillOwnFocus = viewTransition.visible.kind === 'home'
        && focusHomeCreatorRef.current;
      focusHomeCreatorRef.current = false;
      if (!creatorWillOwnFocus) {
        window.requestAnimationFrame(() => workspaceRef.current?.focus({ preventScroll: true }));
      }
    }
  }, [viewTransition.visible.kind]);

  async function runProject(
    prompt: string,
    model: string | null,
    effort: string | null,
  ) {
    if (!selected) return;
    await runProjectFor(selected, prompt, model, effort);
  }

  function ensureRunReady(): boolean {
    setError('');
    if (!runtime) {
      setError('GU.AI 正在读取 Codex 运行时，请稍后再试。');
      return false;
    }
    if (runtime.state !== 'ready') {
      setError('Codex App Server 尚未就绪，请先检查运行时或完成登录。');
      openSettings();
      return false;
    }
    if (!runtime.account) {
      setError('请先登录 ChatGPT，再启动游戏 Agent。');
      openSettings();
      return false;
    }
    if (!runtime.capabilities.imageGeneration && !runtime.capabilities.externalImageGeneration) {
      setError('图像 API 与 Codex ImageGen 均不可用，请先在设置中配置图像服务或修复运行时。');
      openSettings('media');
      return false;
    }
    return true;
  }

  async function runProjectFor(
    project: ProjectRecord,
    prompt: string,
    model: string | null,
    effort: string | null,
  ) {
    if (!ensureRunReady()) throw new Error('请先完成运行时与素材服务配置');
    if (runInFlight.current.has(project.id)) return;
    runInFlight.current.add(project.id);
    setStartingProjectId(project.id);
    try {
      const running = await window.gu.runProject({
        projectId: project.id,
        prompt,
        model,
        effort,
      });
      setProjects((current) => upsertProject(current, running));
    } catch (reason) {
      setError(toMessage(reason));
      throw reason;
    } finally {
      runInFlight.current.delete(project.id);
      setStartingProjectId((current) => current === project.id ? null : current);
    }
  }

  async function planBriefFromHome(input: CreationPlanInput): Promise<CreationBrief> {
    if (runtime?.state !== 'ready' || !runtime.account) {
      openSettings('account');
      throw new Error('请先在设置中连接 Codex 并登录，也可以使用本地模板。');
    }
    return window.gu.planCreationBrief(input);
  }

  async function createDraftFromHome(brief: CreationBrief): Promise<boolean> {
    if (!settings || creationInFlight.current) return false;
    creationInFlight.current = true;
    setHomeLaunching(true);
    setCanChooseAnotherDirectory(false);
    setError('');
    try {
      const signature = JSON.stringify(brief);
      if (creationRequest.current?.signature !== signature) {
        const projectDirectory = await window.gu.chooseProjectDirectory();
        if (!projectDirectory) return false;
        creationRequest.current = { signature, projectDirectory, requestId: crypto.randomUUID() };
      }
      const request = creationRequest.current!;
      const project = await window.gu.createDraftProject({
        brief,
        projectDirectory: request.projectDirectory,
        requestId: request.requestId,
        model: settings.defaultModel,
      });
      if (project.status === 'failed') throw new Error(project.lastError ?? '项目创建失败');
      setProjects((current) => upsertProject(current, project));
      creationRequest.current = null;
      navigateToProject(project);
      return true;
    } catch (reason) {
      setCanChooseAnotherDirectory(Boolean(creationRequest.current));
      setError(toMessage(reason));
      return false;
    } finally {
      creationInFlight.current = false;
      setHomeLaunching(false);
    }
  }

  async function revealProject(projectId: string) {
    setError('');
    try {
      const relocated = await window.gu.revealProject(projectId);
      if (relocated) setProjects((current) => upsertProject(current, relocated));
    } catch (reason) {
      setError(toMessage(reason));
    }
  }

  async function stopProject() {
    if (!selected) return;
    try {
      const project = await window.gu.stopProject(selected.id);
      setProjects((current) => upsertProject(current, project));
    } catch (reason) {
      setError(toMessage(reason));
    }
  }

  async function regenerateAsset(plan: AssetPlanRecord) {
    if (!selected || !settings || selected.status === 'running') return;
    setError('');
    try {
      await window.gu.retryAssetPlan(selected.id, plan.id);
      setRefreshSignal((value) => value + 1);
      await runProject(
        `重新生成并完整接入素材工单 ${plan.id}（${plan.kind} / ${plan.name}）。必须使用该 planId 调用对应的 GU 素材工具；生成成功后更新生产代码中的真实引用，运行构建和玩法验证，直到宿主验收通过。不要停留在占位或仅生成未接入状态。`,
        selected.model ?? settings.defaultModel,
        settings.defaultEffort,
      );
    } catch (reason) {
      setError(toMessage(reason));
      setRefreshSignal((value) => value + 1);
    }
  }

  async function renameProject(name: string) {
    if (!renameTarget || projectActionBusy) return;
    setProjectActionBusy(true);
    setError('');
    try {
      const project = await window.gu.renameProject(renameTarget.id, name);
      setProjects((current) => upsertProject(current, project));
      setRenameTarget(null);
    } catch (reason) {
      setError(toMessage(reason));
    } finally {
      setProjectActionBusy(false);
    }
  }

  async function toggleProjectPinned(project: ProjectRecord) {
    setError('');
    try {
      const updated = await window.gu.setProjectPinned(project.id, !project.pinned);
      setProjects((current) => upsertProject(current, updated));
    } catch (reason) {
      setError(toMessage(reason));
    }
  }

  async function deleteProject() {
    if (!deleteTarget || projectActionBusy) return;
    const projectId = deleteTarget.id;
    setProjectActionBusy(true);
    setError('');
    try {
      await window.gu.deleteProject(projectId);
      setProjects((current) => current.filter((project) => project.id !== projectId));
      setEvents((current) => {
        const next = { ...current };
        delete next[projectId];
        return next;
      });
      setDeleteTarget(null);
    } catch (reason) {
      setError(toMessage(reason));
    } finally {
      setProjectActionBusy(false);
    }
  }

  async function resolveApproval(
    token: string,
    decision: ApprovalDecision,
    answers?: ApprovalAnswers,
  ) {
    await window.gu.resolveApproval(token, decision, answers);
    setApprovals((current) => current.filter((item) => item.token !== token));
  }

  if (!bootstrap || !settings || !runtime) {
    return (
      <main className="loading-screen">
        <div className="loading-cyber-scene" aria-hidden="true">
          <img src={CYBER_SCENES.classic} alt="" />
          <img className="loading-cyber-ranger" src={CYBER_AVATARS.classic} alt="" />
        </div>
        <div className="loading-brand">
          <div><strong>GAME//OS</strong><small>CREATOR DESKTOP</small></div>
        </div>
        {loadingError ? (
          <div className="loading-error" role="alert">
            <strong>无法连接桌面运行时</strong>
            <p>{loadingError}</p>
            <button className="primary-button" type="button" onClick={() => void loadBootstrap()}>
              重试连接
            </button>
          </div>
        ) : (
          <div className="loading-progress"><span /> 正在连接 Codex App Server…</div>
        )}
      </main>
    );
  }

  const transitionDirection: PixelTransitionDirection = viewTransition.phase === 'covering'
    ? viewTransition.visible.kind === 'home' ? 'forward' : 'backward'
    : viewTransition.visible.kind === 'project' ? 'forward' : 'backward';
  const transitionClass = viewTransition.phase === 'idle'
    ? ''
    : ` is-page-transitioning phase-${viewTransition.phase} direction-${transitionDirection}`;
  const transitionStyle = viewTransition.phase === 'idle'
    ? undefined
    : {
        '--pixel-phase-duration': `${viewTransition.phase === 'covering'
          ? PIXEL_COVER_DURATION_MS
          : PIXEL_REVEAL_DURATION_MS}ms`,
      } as CSSProperties;

  return (
    <div
      className={`app-shell ${selected ? 'view-workbench pixel-desktop-home' : 'view-home pixel-desktop-home'}${transitionClass}`}
      style={transitionStyle}
    >
      <main ref={workspaceRef} className="workspace desktop-workspace" tabIndex={-1}>
        {selected ? (
          <ProductionDesktop key={selected.id} project={selected} runtime={runtime}
            onHome={navigateHome} onCreate={openHomeCreator} onSettings={openSettings}
            onRename={() => setRenameTarget(selected)} onPin={() => void toggleProjectPinned(selected)} onDelete={() => setDeleteTarget(selected)}
            terminal={
            <section className="production-center">
              <header className="agent-pane-heading">
                <div>
                  <span>GU AGENT</span>
                  <button
                    className="agent-project-name"
                    type="button"
                    title="重命名游戏"
                    aria-label={`重命名 ${selected.name}`}
                    onClick={() => setRenameTarget(selected)}
                  >
                    {selected.name}
                  </button>
                  <small>{selected.status === 'draft' ? '草案已保存，等待开始生成' : selected.status === 'running' ? '正在持续制作与验证' : '可以继续提出修改要求'}</small>
                </div>
                <span className={`status-chip status-${selected.status}`}>
                  {PROJECT_STATUS_LABELS[selected.status]}
                </span>
              </header>
              {selected.status === 'draft' ? (
                <ProjectStart
                  key={`start-${selected.id}`}
                  projectId={selected.id}
                  initialModel={selected.model ?? settings.defaultModel}
                  models={runtime.models}
                  busy={startingProjectId === selected.id}
                  settingsOpen={showSettings}
                  onSettings={openSettings}
                  onLocate={() => revealProject(selected.id)}
                  onRun={(model) => runProjectFor(selected, selected.idea, model, settings.defaultEffort)}
                />
              ) : null}
              <EventStream project={selected} events={selectedEvents} />
              <Composer
                key={`composer-${selected.id}`}
                project={selected}
                models={runtime.models}
                settings={settings}
                imageGenerationAvailable={imageGenerationAvailable}
                disabled={
                  runtime.state !== 'ready' ||
                  !runtime.account ||
                  !imageGenerationAvailable ||
                  startingProjectId === selected.id
                }
                onRun={runProject}
                onStop={stopProject}
              />
            </section>}
            preview={<section className="studio-canvas">
              <Pipeline stage={studioStage ?? selected.stage} status={selected.status} compact />
              <Inspector
                project={selected}
                settings={settings}
                activityStage={studioStage ?? selected.stage}
                refreshSignal={refreshSignal}
                onError={setError}
                onRegenerate={regenerateAsset}
                onRevealProject={() => revealProject(selected.id)}
                onProjectUpdated={(project) => {
                  setProjects((current) => upsertProject(current, project));
                }}
              />
            </section>}
          />
        ) : (
          <DesktopHome
            runtime={runtime}
            projects={projects}
            busy={homeLaunching}
            focusSignal={homeFocusSignal}
            onCreateProject={createDraftFromHome}
            onPlanBrief={planBriefFromHome}
            onCancelPlan={(requestId) => window.gu.cancelCreationBrief(requestId)}
            onOpenProject={navigateToProject}
            onOpenSettings={() => openSettings()}
            onOpenSpeechSettings={() => openSettings('speech')}
          />
        )}
      </main>

      {showSettings ? (
        <SettingsModal
          value={settings}
          runtime={runtime}
          initialSection={settingsInitialSection}
          onClose={() => setShowSettings(false)}
          onSaved={setSettings}
          onRuntime={setRuntime}
        />
      ) : null}

      {renameTarget ? (
        <RenameProjectModal
          project={renameTarget}
          busy={projectActionBusy}
          onClose={() => setRenameTarget(null)}
          onRename={(name) => void renameProject(name)}
        />
      ) : null}

      {deleteTarget ? (
        <DeleteProjectModal
          project={deleteTarget}
          busy={projectActionBusy}
          onClose={() => setDeleteTarget(null)}
          onDelete={() => void deleteProject()}
        />
      ) : null}

      {approvals[0] ? (
        <ApprovalModal
          key={approvals[0].token}
          approval={approvals[0]}
          pendingCount={approvals.length}
          onResolve={resolveApproval}
        />
      ) : null}

      {error ? (
        <div className="error-toast" role="alert">
          <span>{error}</span>
          {canChooseAnotherDirectory && !selected ? (
            <button type="button" className="creation-change-directory" onClick={() => {
              creationRequest.current = null;
              setCanChooseAnotherDirectory(false);
              setError('草案已保留。再次点击“创建项目”选择新的空文件夹。');
            }}>换个文件夹</button>
          ) : null}
          <button type="button" aria-label="关闭错误提示" onClick={() => setError('')}>
            <X size={14} />
          </button>
        </div>
      ) : null}

      {viewTransition.phase !== 'idle' ? (
        <PixelPageTransition
          direction={transitionDirection}
          phase={viewTransition.phase}
          runId={viewTransition.runId}
          onComplete={completeViewTransition}
        />
      ) : null}
    </div>
  );
}

function upsertProject(
  projects: readonly ProjectRecord[],
  project: ProjectRecord,
): ProjectRecord[] {
  const next = projects.some((item) => item.id === project.id)
    ? projects.map((item) => (item.id === project.id ? project : item))
    : [project, ...projects];
  return [...next].sort((a, b) => Number(b.pinned) - Number(a.pinned)
    || b.updatedAt.localeCompare(a.updatedAt));
}

function mergeEvent(events: readonly AgentEvent[], incoming: AgentEvent): AgentEvent[] {
  const index = events.findIndex((event) => event.id === incoming.id);
  const next = [...events];
  if (index >= 0) {
    const previous = next[index]!;
    next[index] = {
      ...previous,
      ...incoming,
      message: incoming.isDelta
        ? `${previous.message}${incoming.message}`.slice(-120_000)
        : incoming.message,
    };
  } else {
    next.push(incoming);
  }
  return next
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .slice(-500);
}
