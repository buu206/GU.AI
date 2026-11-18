/** Shared editable brief, with separate offline starting points. */
export type GameGenre = 'legion' | 'platform' | 'puzzle' | 'custom';

export interface CreationPlanInput {
  requestId: string;
  idea: string;
  reference: string;
  genre: GameGenre;
}

export interface CreationBrief {
  version: 1;
  idea: string;
  name: string;
  genre: GameGenre;
  visualStyle: string;
  coreLoop: string;
  winCondition: string;
  controls: string;
  scope: string;
  reference: string;
}

export const MAX_CREATION_IDEA_LENGTH = 1600;
export const CREATION_BRIEF_LIMITS = {
  idea: MAX_CREATION_IDEA_LENGTH,
  name: 100,
  visualStyle: 200,
  coreLoop: 1200,
  winCondition: 800,
  controls: 500,
  scope: 1600,
  reference: 1000,
} as const;

const GENRES: readonly GameGenre[] = ['legion', 'platform', 'puzzle', 'custom'];

export function validateCreationPlanRequestId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/u.test(value)) {
    throw new Error('方案请求标识无效');
  }
  return value;
}

export function validateCreationPlanInput(value: unknown): CreationPlanInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('方案请求无效');
  const input = value as Record<string, unknown>;
  const expected = ['requestId', 'idea', 'reference', 'genre'];
  if (Object.keys(input).some((field) => !expected.includes(field))) throw new Error('方案请求包含不支持的字段');
  const requestId = validateCreationPlanRequestId(input.requestId);
  if (typeof input.idea !== 'string' || input.idea.trim().length < 4) throw new Error('请先写一句完整的游戏想法');
  if (input.idea.length > MAX_CREATION_IDEA_LENGTH || input.idea.includes('\0')) throw new Error('游戏想法超出长度限制或包含无效字符');
  if (typeof input.reference !== 'string' || input.reference.length > CREATION_BRIEF_LIMITS.reference || input.reference.includes('\0')) {
    throw new Error('参考说明超出长度限制或包含无效字符');
  }
  if (!GENRES.includes(input.genre as GameGenre)) throw new Error('请选择有效的玩法类型');
  return { requestId, idea: input.idea, reference: input.reference, genre: input.genre as GameGenre };
}
const GENRE_LABELS: Record<GameGenre, string> = {
  legion: '像素军团',
  platform: '横版闯关',
  puzzle: '房间解谜',
  custom: '自定义',
};
const FIELD_LABELS: Record<keyof typeof CREATION_BRIEF_LIMITS, string> = {
  idea: '原始想法',
  name: '游戏名称',
  visualStyle: '画面风格',
  coreLoop: '核心玩法',
  winCondition: '胜负条件',
  controls: '操作方式',
  scope: '第一版范围',
  reference: '参考说明',
};

const STARTING_POINTS: Record<GameGenre, Omit<CreationBrief, 'version' | 'idea' | 'genre' | 'reference'>> = {
  legion: {
    name: '我的像素小队',
    visualStyle: '2D 像素风',
    coreLoop: '随机招募伙伴 → 组合阵容 → 自动迎战 → 获得奖励并成长',
    winCondition: '守住基地并击退最后一波敌人获胜；基地生命耗尽失败。',
    controls: '鼠标选择招募与阵容，点击按钮开始战斗。',
    scope: '先完成一个关卡、三种伙伴和清楚的战斗结算。',
  },
  platform: {
    name: '我的像素冒险',
    visualStyle: '2D 像素风，横向卷轴',
    coreLoop: '探索关卡 → 跳过障碍 → 收集道具 → 抵达终点',
    winCondition: '抵达终点获胜；生命耗尽后可重新开始。',
    controls: '方向键或 A/D 移动，空格跳跃。',
    scope: '先完成一个角色、一个关卡、一种障碍和重新开始流程。',
  },
  puzzle: {
    name: '我的解谜小屋',
    visualStyle: '2D 像素风，俯视房间',
    coreLoop: '观察线索 → 尝试机关 → 验证结果 → 打开出口',
    winCondition: '解开房间机关并走出出口获胜；卡住时允许重置。',
    controls: '方向键或 WASD 移动，E 互动。',
    scope: '先完成一个房间、两处关联机关和一次完整解谜流程。',
  },
  custom: {
    name: '我的游戏',
    visualStyle: '2D 像素风（可修改）',
    coreLoop: '开始一局 → 完成主要挑战 → 显示结果（按你的想法修改）',
    winCondition: '补充这一局如何获胜、何时失败，以及重新开始的方式。',
    controls: '键盘和鼠标（按玩法修改）',
    scope: '先完成一个可以从开始玩到结算的场景，明确主要角色与核心操作。',
  },
};

/** Explicit offline template: this function never invokes or simulates AI. */
export function createCreationBrief(idea: string, genre: GameGenre = 'custom'): CreationBrief {
  if (!GENRES.includes(genre)) throw new Error('请选择有效的玩法类型');
  return validateCreationBrief({
    version: 1,
    idea,
    genre,
    ...STARTING_POINTS[genre],
    reference: '',
  });
}

export function validateCreationBrief(value: unknown): CreationBrief {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('创作方案必须是一个对象');
  }
  const input = value as Record<string, unknown>;
  const allowed = new Set(['version', 'genre', ...Object.keys(CREATION_BRIEF_LIMITS)]);
  if (Object.keys(input).some((field) => !allowed.has(field))) {
    throw new Error('创作方案包含不支持的字段');
  }
  if (input.version !== 1) throw new Error('不支持的创作方案版本');
  if (!GENRES.includes(input.genre as GameGenre)) throw new Error('请选择有效的玩法类型');

  const fields = {} as Record<keyof typeof CREATION_BRIEF_LIMITS, string>;
  for (const field of Object.keys(CREATION_BRIEF_LIMITS) as Array<keyof typeof CREATION_BRIEF_LIMITS>) {
    const text = input[field];
    const limit = CREATION_BRIEF_LIMITS[field];
    if (typeof text !== 'string' || (field !== 'reference' && !text.trim())) {
      throw new Error(FIELD_LABELS[field] + '不能为空');
    }
    if (text.length > limit) throw new Error(FIELD_LABELS[field] + '不能超过 ' + limit + ' 个字符');
    if (text.includes('\0')) throw new Error(FIELD_LABELS[field] + '包含无效字符');
    // Preserve original wording and line breaks, especially for speech-to-text drafts.
    fields[field] = field === 'name' ? text.trim() : text;
  }
  if (/[\r\n\t]/u.test(fields.name)) throw new Error('游戏名称请使用一行文字');
  return { version: 1, genre: input.genre as GameGenre, ...fields };
}

export function formatCreationBrief(value: CreationBrief): string {
  const brief = validateCreationBrief(value);
  return [
    '# 已确认的创作方案',
    '',
    '游戏名称：' + brief.name,
    '玩法类型：' + GENRE_LABELS[brief.genre],
    '',
    '## 原始想法',
    brief.idea,
    '',
    '## 画面风格',
    brief.visualStyle,
    '',
    '## 核心玩法',
    brief.coreLoop,
    '',
    '## 胜负条件',
    brief.winCondition,
    '',
    '## 操作方式',
    brief.controls,
    '',
    '## 第一版范围',
    brief.scope,
    '',
    '## 参考说明',
    brief.reference || '未提供参考。',
    '',
    '---',
    '创作方案 v1',
  ].join('\n');
}
