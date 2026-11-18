import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { createCreationBrief, formatCreationBrief } from '../shared/creationBrief.js';
import { CreationDraftService } from './creationDraftService.js';
import { ProjectStore } from './projectStore.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'gu-creation-draft-'));
  roots.push(root);
  const directory = join(root, '我的游戏');
  await mkdir(directory);
  const store = new ProjectStore(join(root, 'catalog.json'), join(root, 'default-games'));
  return { root, directory, store, service: new CreationDraftService(store) };
}

describe('CreationDraftService', () => {
  it('creates a real local Web draft and coalesces concurrent duplicate requests', async () => {
    const { directory, store, service } = await fixture();
    const brief = createCreationBrief('  像素军团\n保留原始口述文字。  ', 'legion');
    brief.reference = '参考自己的角色图。\n  ';
    const request = { brief, projectDirectory: directory, requestId: 'create-one' };
    const [first, duplicate] = await Promise.all([service.create(request), service.create(request)]);

    expect(duplicate.id).toBe(first.id);
    expect(first).toMatchObject({
      name: brief.name,
      idea: formatCreationBrief(brief),
      status: 'draft',
      stage: 'brief',
      engine: 'web',
      threadId: null,
      activeTurnId: null,
      icon: null,
    });
    expect(await store.list()).toHaveLength(1);
    expect(JSON.parse(await readFile(join(first.root, '.gu', 'creation-brief.json'), 'utf8'))).toEqual(brief);
    expect(await readFile(join(first.root, 'package.json'), 'utf8')).toContain('"vite"');

    // A fresh service represents an application restart; directory+content retry is still idempotent.
    const restarted = new CreationDraftService(store);
    const retried = await restarted.create({ ...request, requestId: 'new-session' });
    expect(retried.id).toBe(first.id);
    expect(await store.list()).toHaveLength(1);
  });

  it('rejects a changed request or conflicting brief without overwriting any existing file', async () => {
    const { directory, service, store } = await fixture();
    const brief = createCreationBrief('制作一个房间解谜游戏', 'puzzle');
    const request = { brief, projectDirectory: directory, requestId: 'fixed-id' };
    const project = await service.create(request);
    const file = join(project.root, '.gu', 'creation-brief.json');
    const original = await readFile(file, 'utf8');
    const different = { ...brief, scope: '改成三个房间' };
    await expect(service.create({ ...request, brief: different })).rejects.toThrow('同一创建请求');
    await expect(new CreationDraftService(store).create({ ...request, brief: different })).rejects.toThrow('另一份项目');
    expect(await readFile(file, 'utf8')).toBe(original);

    // Existing audit data is not trusted merely because the catalog matches.
    await writeFile(file, JSON.stringify(different));
    await expect(new CreationDraftService(store).create(request)).rejects.toThrow('不一致');
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual(different);
  });

  it('validates input before creating files and rejects non-empty user folders', async () => {
    const { directory, store, service } = await fixture();
    const brief = createCreationBrief('制作一个小游戏');
    await expect(service.create({ brief: { ...brief, idea: '' }, projectDirectory: directory })).rejects.toThrow('原始想法');
    await expect(service.create({ brief, projectDirectory: 'relative/path' })).rejects.toThrow('绝对路径');
    await expect(service.create({ brief, projectDirectory: directory, requestId: ' ' })).rejects.toThrow('请求标识');
    await expect(service.create({ brief, projectDirectory: directory, model: '' })).rejects.toThrow('模型标识');
    await writeFile(join(directory, 'notes.txt'), 'keep this');
    await expect(service.create({ brief, projectDirectory: directory })).rejects.toThrow('空文件夹');
    expect(await readFile(join(directory, 'notes.txt'), 'utf8')).toBe('keep this');
    expect(await store.list()).toHaveLength(0);
  });
});
