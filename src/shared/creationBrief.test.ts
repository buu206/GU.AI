import { describe, expect, it } from 'vitest';
import {
  MAX_CREATION_IDEA_LENGTH,
  createCreationBrief,
  formatCreationBrief,
  validateCreationBrief,
  validateCreationPlanInput,
} from './creationBrief.js';

describe('CreationBrief', () => {
  it('preserves the exact original idea and uses custom unless a starting point is chosen', () => {
    const idea = '  想做军团和解谜混合的游戏。\n保留这一行，以及末尾空格。  ';
    const brief = createCreationBrief(idea);
    expect(brief.genre).toBe('custom');
    expect(brief.idea).toBe(idea);
    expect(formatCreationBrief(brief)).toContain('\n' + idea + '\n');
    expect(createCreationBrief(idea, 'puzzle').genre).toBe('puzzle');
  });

  it('keeps editable choices intact and returns an independent validated value', () => {
    const brief = createCreationBrief('制作一个横版游戏', 'platform');
    brief.name = '  云间邮差  ';
    brief.controls = '手柄控制，A 跳跃';
    brief.reference = '参考我提供的图片。\n  ';
    const checked = validateCreationBrief(brief);
    expect(checked).not.toBe(brief);
    expect(checked.name).toBe('云间邮差');
    expect(checked.controls).toBe(brief.controls);
    expect(formatCreationBrief(checked)).toContain(brief.reference);
  });

  it('rejects invalid or oversized content instead of silently truncating it', () => {
    expect(() => createCreationBrief(' ')).toThrow('原始想法不能为空');
    expect(() => createCreationBrief('字'.repeat(MAX_CREATION_IDEA_LENGTH + 1))).toThrow('1600');
    const brief = createCreationBrief('做一个小游戏');
    expect(() => validateCreationBrief({ ...brief, version: 2 })).toThrow('版本');
    expect(() => validateCreationBrief({ ...brief, genre: 'unknown' })).toThrow('玩法');
    expect(() => validateCreationBrief({ ...brief, controls: '' })).toThrow('操作方式');
    expect(() => validateCreationBrief({ ...brief, name: '第一行\n第二行' })).toThrow('一行');
    expect(() => validateCreationBrief({ ...brief, unexpected: true })).toThrow('不支持的字段');
    expect(() => validateCreationBrief({ ...brief, scope: '\0' })).toThrow('无效字符');
  });
});


describe('CreationPlanInput', () => {
  it('preserves supplied text and rejects malformed requests before inference', () => {
    const input = { requestId: 'request-1', idea: '  游戏想法\n第二行 ', reference: '  参考说明 ', genre: 'custom' };
    expect(validateCreationPlanInput(input)).toEqual(input);
    for (const invalid of [
      { ...input, requestId: '../bad' },
      { ...input, idea: ' ' },
      { ...input, idea: '字'.repeat(1601) },
      { ...input, reference: '字'.repeat(1001) },
      { ...input, genre: 'wrong' },
      { ...input, cwd: '/private/path' },
    ]) expect(() => validateCreationPlanInput(invalid)).toThrow();
  });
});
