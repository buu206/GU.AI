// Older workspaces keep their original files. Publish the new host metadata
// together, only after confirming it belongs to the requested catalog entry.
import { constants } from 'node:fs';
import { lstat, mkdtemp, open, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

async function statIfPresent(path: string) {
  try { return await lstat(path); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}

async function readRegularFile(path: string, limit: number) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > limit) throw new Error('旧项目配置不是有效的常规文件');
    const buffer = Buffer.alloc(info.size + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, null);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length !== info.size) throw new Error('旧项目配置已变更，请重试');
    return buffer.subarray(0, length);
  } finally { await handle.close(); }
}

export async function importLegacyProjectMetadata(root: string, projectId: string): Promise<void> {
  const current = join(root, '.gu');
  if (await statIfPresent(current)) return;
  const legacy = join(root, '.noobi');
  const previous = await statIfPresent(legacy);
  if (!previous) return;
  if (!previous.isDirectory() || await realpath(root) !== root) throw new Error('旧项目配置目录无效');
  const marker = await readRegularFile(join(legacy, 'project.json'), 1024 * 1024);
  if (JSON.parse(marker.toString('utf8'))?.id !== projectId) throw new Error('旧项目配置与当前游戏不匹配');
  const staging = await mkdtemp(join(root, '.gu-import-'));
  try {
    await writeFile(join(staging, 'project.json'), marker, { mode: 0o600 });
    for (const name of ['icon.png', 'playtest.json', 'creation-brief.json']) {
      const source = join(legacy, name);
      if (await statIfPresent(source)) {
        await writeFile(join(staging, name), await readRegularFile(source, 8 * 1024 * 1024), { mode: 0o600 });
      }
    }
    try { await rename(staging, current); }
    catch (error) {
      // A concurrent import may have published the same validated marker.
      if (!['EEXIST', 'ENOTEMPTY'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
      if (!marker.equals(await readRegularFile(join(current, 'project.json'), 1024 * 1024))) throw error;
    }
  } finally { await rm(staging, { recursive: true, force: true }); }
}
