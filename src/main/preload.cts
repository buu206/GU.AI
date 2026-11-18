import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { CreationBrief, CreationPlanInput } from '../shared/creationBrief.js';
import type { SaveSpeechSettingsInput, SpeechSettings, SpeechTranscript, TranscribeSpeechInput } from '../shared/speech.js';
import type {
  AgentEvent,
  AppSettings,
  ApprovalAnswers,
  ApprovalDecision,
  ApprovalRequest,
  AssetPlanRecord,
  BootstrapPayload,
  CreateProjectInput,
  CreateDraftProjectInput,
  EnvironmentStatusSnapshot,
  FileReadResult,
  GameAssetRecord,
  GameplayExperienceReport,
  ExtensionSettingsSnapshot,
  LoginStartResult,
  McpServerSetting,
  MediaCapability,
  MediaProviderSetting,
  MediaProviderTestResult,
  GuCrewMember,
  GuPackId,
  GuApi,
  PromptTemplateId,
  PromptTemplateSetting,
  ProjectInspectorPayload,
  ProjectIconData,
  ProjectRecord,
  RunProjectInput,
  RuntimeStatus,
  SaveMcpServerInput,
  SaveMediaProviderInput,
  SkillSetting,
} from '../shared/contracts.js';

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const wrapped = (_event: Electron.IpcRendererEvent, payload: T) => listener(payload);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

const api: GuApi = {
  getProjectReadiness: (projectId, model) => ipcRenderer.invoke('gu:project:readiness', projectId, model),
  bootstrap: () => ipcRenderer.invoke('gu:bootstrap') as Promise<BootstrapPayload>,
  refreshRuntime: () => ipcRenderer.invoke('gu:runtime:refresh') as Promise<RuntimeStatus>,
  startLogin: () => ipcRenderer.invoke('gu:runtime:login') as Promise<LoginStartResult>,
  logout: () => ipcRenderer.invoke('gu:runtime:logout') as Promise<RuntimeStatus>,
  chooseDirectory: () => ipcRenderer.invoke('gu:dialog:directory') as Promise<string | null>,
  chooseProjectDirectory: () =>
    ipcRenderer.invoke('gu:dialog:project-directory') as Promise<string | null>,
  createDraftProject: (input: CreateDraftProjectInput) =>
    ipcRenderer.invoke('gu:project:create-draft', input) as Promise<ProjectRecord>,
  planCreationBrief: (input: CreationPlanInput) =>
    ipcRenderer.invoke('gu:brief:plan', input) as Promise<CreationBrief>,
  cancelCreationBrief: (requestId: string) =>
    ipcRenderer.invoke('gu:brief:cancel', requestId) as Promise<void>,
  getSpeechSettings: () => ipcRenderer.invoke('gu:speech:settings') as Promise<SpeechSettings>,
  saveSpeechSettings: (input: SaveSpeechSettingsInput) =>
    ipcRenderer.invoke('gu:speech:settings:save', input) as Promise<SpeechSettings>,
  requestMicrophoneAccess: () => ipcRenderer.invoke('gu:speech:microphone') as Promise<boolean>,
  transcribeSpeech: (input: TranscribeSpeechInput) =>
    ipcRenderer.invoke('gu:speech:transcribe', input) as Promise<SpeechTranscript>,
  cancelSpeechTranscription: (requestId: string) =>
    ipcRenderer.invoke('gu:speech:cancel', requestId) as Promise<void>,
  createProject: (input: CreateProjectInput, files: readonly unknown[] = []) => {
    if (!Array.isArray(files) || files.length > 50) {
      return Promise.reject(new Error('一次最多上传 50 个附件'));
    }
    let paths: string[];
    try {
      paths = files.map((file) => webUtils.getPathForFile(file as File)).filter(Boolean);
    } catch {
      return Promise.reject(new Error('无法读取上传文件的本地路径'));
    }
    if (paths.length !== files.length) return Promise.reject(new Error('上传文件缺少本地路径'));
    return ipcRenderer.invoke('gu:project:create', input, paths) as Promise<ProjectRecord>;
  },
  renameProject: (projectId: string, name: string) =>
    ipcRenderer.invoke('gu:project:rename', projectId, name) as Promise<ProjectRecord>,
  setProjectPinned: (projectId: string, pinned: boolean) =>
    ipcRenderer.invoke('gu:project:pin', projectId, pinned) as Promise<ProjectRecord>,
  deleteProject: (projectId: string) =>
    ipcRenderer.invoke('gu:project:delete', projectId) as Promise<ProjectRecord>,
  runProject: (input: RunProjectInput) =>
    ipcRenderer.invoke('gu:project:run', input) as Promise<ProjectRecord>,
  stopProject: (projectId: string) =>
    ipcRenderer.invoke('gu:project:stop', projectId) as Promise<ProjectRecord>,
  revealProject: (projectId: string) =>
    ipcRenderer.invoke('gu:project:reveal', projectId) as Promise<ProjectRecord | null>,
  importProjectAssets: (projectId: string) =>
    ipcRenderer.invoke('gu:project:assets:import', projectId) as Promise<GameAssetRecord[]>,
  importDroppedProjectAssets: (projectId: string, files: readonly unknown[]) => {
    if (!Array.isArray(files) || files.length === 0 || files.length > 50) {
      return Promise.reject(new Error('一次只能拖入 1–50 张图片'));
    }
    let paths: string[];
    try {
      paths = files.map((file) => webUtils.getPathForFile(file as File)).filter(Boolean);
    } catch {
      return Promise.reject(new Error('无法读取拖入文件的本地路径'));
    }
    if (paths.length !== files.length) return Promise.reject(new Error('拖入文件缺少本地路径'));
    return ipcRenderer.invoke('gu:project:assets:import-paths', projectId, paths) as Promise<GameAssetRecord[]>;
  },
  retryAssetPlan: (projectId: string, planId: string) =>
    ipcRenderer.invoke('gu:project:asset-plan:retry', projectId, planId) as Promise<AssetPlanRecord>,
  inspectProject: (projectId: string) =>
    ipcRenderer.invoke('gu:project:inspect', projectId) as Promise<ProjectInspectorPayload>,
  evaluateProjectExperience: (projectId: string) =>
    ipcRenderer.invoke('gu:project:experience:evaluate', projectId) as Promise<GameplayExperienceReport>,
  cancelProjectExperience: (projectId: string) =>
    ipcRenderer.invoke('gu:project:experience:cancel', projectId) as Promise<void>,
  readProjectFile: (projectId: string, relativePath: string) =>
    ipcRenderer.invoke('gu:project:read', projectId, relativePath) as Promise<FileReadResult>,
  getProjectIcon: (projectId: string) =>
    ipcRenderer.invoke('gu:project:icon', projectId) as Promise<ProjectIconData | null>,
  saveProjectGuPack: (projectId: string, packId: GuPackId | null) =>
    ipcRenderer.invoke('gu:project:gu-pack:save', projectId, packId) as Promise<ProjectRecord>,
  saveProjectGuCrew: (projectId: string, crew: readonly GuCrewMember[] | null) =>
    ipcRenderer.invoke('gu:project:gu-crew:save', projectId, crew) as Promise<ProjectRecord>,
  saveSettings: (patch: Partial<AppSettings>) =>
    ipcRenderer.invoke('gu:settings:save', patch) as Promise<AppSettings>,
  getEnvironmentStatus: () =>
    ipcRenderer.invoke('gu:environment:get') as Promise<EnvironmentStatusSnapshot>,
  refreshEnvironmentStatus: () =>
    ipcRenderer.invoke('gu:environment:refresh') as Promise<EnvironmentStatusSnapshot>,
  chooseGodotExecutable: () =>
    ipcRenderer.invoke('gu:environment:godot:choose') as Promise<string | null>,
  saveGodotExecutable: (binaryPath: string | null) =>
    ipcRenderer.invoke('gu:environment:godot:save', binaryPath) as Promise<EnvironmentStatusSnapshot>,
  getExtensionSettings: () =>
    ipcRenderer.invoke('gu:extensions:get') as Promise<ExtensionSettingsSnapshot>,
  saveMediaProvider: (input: SaveMediaProviderInput) =>
    ipcRenderer.invoke('gu:media-provider:save', input) as Promise<MediaProviderSetting>,
  testMediaProvider: (capability: MediaCapability) =>
    ipcRenderer.invoke('gu:media-provider:test', capability) as Promise<MediaProviderTestResult>,
  listSkills: () => ipcRenderer.invoke('gu:skills:list') as Promise<SkillSetting[]>,
  setSkillEnabled: (input: { id: string; enabled: boolean }) =>
    ipcRenderer.invoke('gu:skills:set-enabled', input) as Promise<SkillSetting>,
  listMcpServers: () => ipcRenderer.invoke('gu:mcp:list') as Promise<McpServerSetting[]>,
  saveMcpServer: (input: SaveMcpServerInput) =>
    ipcRenderer.invoke('gu:mcp:save', input) as Promise<McpServerSetting>,
  removeMcpServer: (id: string) => ipcRenderer.invoke('gu:mcp:remove', id) as Promise<void>,
  listPromptTemplates: () =>
    ipcRenderer.invoke('gu:prompts:list') as Promise<PromptTemplateSetting[]>,
  savePromptTemplate: (input: { id: PromptTemplateId; content: string; enabled: boolean }) =>
    ipcRenderer.invoke('gu:prompts:save', input) as Promise<PromptTemplateSetting>,
  resetPromptTemplate: (id: PromptTemplateId) =>
    ipcRenderer.invoke('gu:prompts:reset', id) as Promise<PromptTemplateSetting>,
  resolveApproval: (token: string, decision: ApprovalDecision, answers?: ApprovalAnswers) =>
    ipcRenderer.invoke('gu:approval:resolve', token, decision, answers) as Promise<void>,
  onAgentEvent: (listener: (event: AgentEvent) => void) =>
    subscribe('gu:event:agent', listener),
  onProjectChanged: (listener: (project: ProjectRecord) => void) =>
    subscribe('gu:event:project', listener),
  onRuntimeChanged: (listener: (status: RuntimeStatus) => void) =>
    subscribe('gu:event:runtime', listener),
  onApproval: (listener: (approval: ApprovalRequest) => void) =>
    subscribe('gu:event:approval', listener),
  onApprovalClosed: (listener: (token: string) => void) =>
    subscribe('gu:event:approval-closed', listener),
  onAssetsChanged: (listener: (payload: { projectId: string; assets: GameAssetRecord[] }) => void) =>
    subscribe('gu:event:assets', listener),
  onAssetPlansChanged: (listener: (payload: { projectId: string; assetPlans: AssetPlanRecord[] }) => void) =>
    subscribe('gu:event:asset-plans', listener),
};

contextBridge.exposeInMainWorld('gu', Object.freeze(api));
