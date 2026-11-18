import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isAbsolute, join } from 'node:path';
import type { ProjectRecord } from '../shared/contracts.js';
import {
  type CreationBrief,
  formatCreationBrief,
  validateCreationBrief,
} from '../shared/creationBrief.js';
import { ProjectStore, resolveExistingProjectDirectory } from './projectStore.js';

export interface CreateDraftProjectInput {
  brief: CreationBrief;
  projectDirectory: string;
  model?: string | null;
  requestId?: string;
}

interface PendingCreation {
  fingerprint: string;
  promise: Promise<ProjectRecord>;
  projectId?: string;
}

const FAILURE_PREFIX = '创作方案文件保存失败：';
const BRIEF_FILE = 'creation-brief.json';
const MAX_BRIEF_FILE_BYTES = 64 * 1024;

/**
 * Creates a local Web workspace after the user has confirmed the editable brief.
 * This service has no runtime, model, media-provider, or network dependency.
 */
export class CreationDraftService {
  readonly #store: ProjectStore;
  readonly #requests = new Map<string, PendingCreation>();
  readonly #directories = new Map<string, PendingCreation>();

  constructor(projectStore: ProjectStore) {
    this.#store = projectStore;
  }

  async create(input: CreateDraftProjectInput): Promise<ProjectRecord> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new Error('项目创建参数无效');
    }
    const brief = validateCreationBrief(input.brief);
    const model = validateModel(input.model);
    const requestId = validateRequestId(input.requestId);
    const directory = await canonicalSelectedDirectory(input.projectDirectory);
    const fingerprint = createHash('sha256')
      .update(JSON.stringify({ brief, directory, model }))
      .digest('hex');

    if (requestId) {
      const request = this.#requests.get(requestId);
      if (request) {
        if (request.fingerprint !== fingerprint) throw new Error('同一创建请求不能修改方案或目标文件夹');
        return request.projectId ? this.#store.get(request.projectId) : request.promise;
      }
    }

    let pending = this.#directories.get(directory);
    if (pending && pending.fingerprint !== fingerprint) {
      throw new Error('这个文件夹正在创建另一份方案，请等待完成或选择其他空文件夹');
    }
    if (!pending) {
      pending = { fingerprint, promise: this.#createLocal(directory, brief, model) };
      this.#directories.set(directory, pending);
      const entry = pending;
      void entry.promise.then(
        (project) => {
          entry.projectId = project.id;
          if (this.#directories.get(directory) === entry) this.#directories.delete(directory);
        },
        () => {
          if (this.#directories.get(directory) === entry) this.#directories.delete(directory);
          for (const [id, request] of this.#requests) {
            if (request === entry) this.#requests.delete(id);
          }
        },
      );
    }
    if (requestId) this.#requests.set(requestId, pending);
    return pending.promise;
  }

  async #createLocal(
    directory: string,
    brief: CreationBrief,
    model: string | null,
  ): Promise<ProjectRecord> {
    const idea = formatCreationBrief(brief);
    const existing = (await this.#store.list()).find((project) => project.root === directory);
    if (existing) {
      if (existing.engine !== 'web' || existing.name !== brief.name || existing.idea !== idea || existing.model !== model) {
        throw new Error('此文件夹已属于另一份项目或方案；原有内容未修改，请选择其他空文件夹');
      }
      await resolveExistingProjectDirectory(directory, existing.id);
      await ensureBriefFile(directory, brief);
      if (existing.status === 'failed' && existing.lastError?.startsWith(FAILURE_PREFIX)) {
        return this.#store.update(existing.id, { status: 'draft', stage: 'brief', lastError: null });
      }
      return existing;
    }

    const project = await this.#store.create({
      name: brief.name,
      idea,
      projectDirectory: directory,
      engine: 'web',
      model,
    });
    try {
      await ensureBriefFile(project.root, brief);
    } catch (error) {
      const message = FAILURE_PREFIX + (error instanceof Error ? error.message : String(error));
      await this.#store.update(project.id, { status: 'failed', stage: 'brief', lastError: message })
        .catch(() => undefined);
      throw new Error(message + '。项目文件已保留；修复后可使用同一方案和文件夹重试。');
    }
    return project;
  }
}

async function canonicalSelectedDirectory(value: unknown): Promise<string> {
  if (typeof value !== 'string' || !value.trim() || value.length > 4000 || value.includes('\0') || !isAbsolute(value)) {
    throw new Error('请选择有效的绝对路径项目文件夹');
  }
  const info = await lstat(value);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('项目文件夹必须是普通目录，不能是符号链接');
  return realpath(value);
}

function validateModel(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !value.trim() || value.length > 256 || value.includes('\0')) {
    throw new Error('模型标识无效');
  }
  return value.trim();
}

function validateRequestId(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !value.trim() || value.length > 128 || value.includes('\0')) {
    throw new Error('创建请求标识无效');
  }
  return value;
}

async function ensureBriefFile(directory: string, brief: CreationBrief): Promise<void> {
  const metadataDirectory = join(directory, '.gu');
  const metadataInfo = await lstat(metadataDirectory);
  if (!metadataInfo.isDirectory() || metadataInfo.isSymbolicLink()) {
    throw new Error('项目元数据目录无效，未写入创作方案');
  }
  const path = join(metadataDirectory, BRIEF_FILE);
  const stored = await readBriefFile(path);
  if (stored) {
    if (JSON.stringify(stored) !== JSON.stringify(brief)) throw new Error('已有创作方案与本次请求不一致，未覆盖文件');
    return;
  }

  let handle;
  try {
    handle = await open(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
  } catch (error) {
    if (!isNodeError(error, 'EEXIST')) throw error;
    const raced = await readBriefFile(path);
    if (!raced || JSON.stringify(raced) !== JSON.stringify(brief)) {
      throw new Error('已有创作方案与本次请求不一致，未覆盖文件');
    }
    return;
  }
  try {
    await handle.writeFile(JSON.stringify(brief, null, 2) + '\n', 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function readBriefFile(path: string): Promise<CreationBrief | null> {
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  } catch (error) {
    if (isNodeError(error, 'ENOENT')) return null;
    throw error;
  }
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > MAX_BRIEF_FILE_BYTES) throw new Error('已有创作方案文件无效');
    return validateCreationBrief(JSON.parse(await handle.readFile('utf8')));
  } finally {
    await handle.close();
  }
}

function isNodeError(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === code);
}
