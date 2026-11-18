import { Check, ChevronDown, Sparkles } from 'lucide-react';
import React, { type KeyboardEvent } from 'react';

import type { GuPackId } from '../../shared/contracts';
import { CYBER_AVATARS } from '../cyberArtAssets';
import { GU_SCENE_IMAGES } from '../guSceneAssets';

export interface GuPackOption {
  id: GuPackId;
  name: string;
  eyebrow: string;
  description: string;
  avatarLabel: string;
  avatarDescription: string;
  sceneDescription: string;
  sceneImage: string;
  avatarImage: string;
}

export const GU_PACK_OPTIONS: readonly GuPackOption[] = [
  {
    id: 'classic',
    name: '霓虹终端',
    eyebrow: 'NEON TERMINAL',
    description: '霓虹城市中的像素创作台。',
    avatarLabel: '银发游侠',
    avatarDescription: '银发、青色护目镜与洋红夹克。',
    sceneDescription: '深紫城市、青色屏幕与洋红灯带。',
    sceneImage: GU_SCENE_IMAGES.classic,
    avatarImage: CYBER_AVATARS.classic,
  },
  {
    id: 'mosslight',
    name: '绿脉节点',
    eyebrow: 'GREEN NODE',
    description: '绿色信号照亮的夜城节点。',
    avatarLabel: '绿脉游侠',
    avatarDescription: '银发游侠的青绿装备。',
    sceneDescription: '青绿信号与像素控制台。',
    sceneImage: GU_SCENE_IMAGES.mosslight,
    avatarImage: CYBER_AVATARS.mosslight,
  },
  {
    id: 'starforge',
    name: '蓝域机房',
    eyebrow: 'BLUE ARRAY',
    description: '蓝色终端组成的像素机房。',
    avatarLabel: '蓝域游侠',
    avatarDescription: '银发游侠的冰蓝装备。',
    sceneDescription: '蓝色机柜与青色显示屏。',
    sceneImage: GU_SCENE_IMAGES.starforge,
    avatarImage: CYBER_AVATARS.starforge,
  },
  {
    id: 'twilight',
    name: '紫电中枢',
    eyebrow: 'VIOLET CORE',
    description: '紫色夜幕下的创作中枢。',
    avatarLabel: '紫电游侠',
    avatarDescription: '银发游侠的紫色装备。',
    sceneDescription: '紫色控制室与洋红信号灯。',
    sceneImage: GU_SCENE_IMAGES.twilight,
    avatarImage: CYBER_AVATARS.twilight,
  },
  {
    id: 'hellokitty',
    name: '橙光站台',
    eyebrow: 'AMBER STATION',
    description: '橙色灯带连接的夜城站台。',
    avatarLabel: '橙光游侠',
    avatarDescription: '银发游侠的橙色装备。',
    sceneDescription: '橙色灯带与暗紫操作台。',
    sceneImage: GU_SCENE_IMAGES.hellokitty,
    avatarImage: CYBER_AVATARS.hellokitty,
  },
] as const;

export function guPackGridColumnCount(container: HTMLElement | null): number {
  if (!container) return 1;
  const tracks = getComputedStyle(container).gridTemplateColumns
    .split(/\s+/)
    .filter((track) => track && track !== 'none');
  return Math.max(1, tracks.length);
}

export function guPackLabel(id: GuPackId): string {
  return GU_PACK_OPTIONS.find((option) => option.id === id)?.name ?? '霓虹终端';
}

interface GuPackPickerProps {
  value: GuPackId | null;
  globalValue?: GuPackId;
  mode: 'global' | 'project';
  variant?: 'cards' | 'compact';
  presentation?: 'bundle' | 'character';
  disabled?: boolean;
  busy?: boolean;
  onChange: (value: GuPackId | null) => void;
}

export function GuPackPicker({
  value,
  globalValue = 'classic',
  mode,
  variant = 'cards',
  presentation = 'bundle',
  disabled = false,
  busy = false,
  onChange,
}: GuPackPickerProps) {
  const resolvedValue = value ?? globalValue;
  const resolvedOption = GU_PACK_OPTIONS.find((option) => option.id === resolvedValue)
    ?? GU_PACK_OPTIONS[0];

  if (variant === 'compact') {
    return (
      <label
        className={`gu-pack-compact is-${resolvedValue}${value === null ? ' is-inherited' : ''}`}
        title={disabled ? '制作期间不能切换场景' : '选择游侠装备与制作场景'}
      >
        <span
          className="gu-pack-compact-swatch"
          aria-hidden="true"
          style={{ backgroundImage: `url("${resolvedOption.sceneImage}")` }}
        >
          <img src={resolvedOption.avatarImage} alt="" draggable={false} />
        </span>
        <span className="gu-pack-compact-copy" aria-hidden="true">
          <small>{mode === 'global' ? '默认场景' : value === null ? '跟随全局' : '项目场景'}</small>
          <strong>{busy ? '保存中…' : guPackLabel(resolvedValue)}</strong>
        </span>
        <select
          aria-label="项目游侠装备与制作场景"
          value={value ?? 'inherit'}
          disabled={disabled || busy}
          onChange={(event) => {
            const nextValue = event.target.value;
            onChange(nextValue === 'inherit' ? null : nextValue as GuPackId);
          }}
        >
          {mode === 'project' ? (
            <option value="inherit">跟随全局（当前：{guPackLabel(globalValue)}）</option>
          ) : null}
          {GU_PACK_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>{option.name} · {option.avatarLabel}</option>
          ))}
        </select>
        <ChevronDown size={12} aria-hidden="true" />
      </label>
    );
  }

  const options: Array<GuPackOption & { inherited?: boolean }> = mode === 'project'
    ? [{
        ...GU_PACK_OPTIONS.find((option) => option.id === globalValue)!,
        id: globalValue,
        name: `跟随全局 · ${guPackLabel(globalValue)}`,
        eyebrow: 'FOLLOW GLOBAL',
        description: '使用设置中的默认主题。',
        inherited: true,
      }, ...GU_PACK_OPTIONS]
    : [...GU_PACK_OPTIONS];

  function selectAt(index: number) {
    const option = options[index];
    if (!option) return;
    onChange(option.inherited ? null : option.id);
  }

  function handleArrowKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const container = event.currentTarget.parentElement;
    const columnCount = guPackGridColumnCount(container);
    let nextIndex = index;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = options.length - 1;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + options.length) % options.length;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % options.length;
    if (event.key === 'ArrowUp') nextIndex = Math.max(0, index - columnCount);
    if (event.key === 'ArrowDown') nextIndex = Math.min(options.length - 1, index + columnCount);
    const nextButton = container?.querySelector<HTMLButtonElement>(`button[data-pack-index="${nextIndex}"]`);
    nextButton?.focus();
    selectAt(nextIndex);
  }

  return (
    <div
      className={`gu-pack-picker mode-${mode} presentation-${presentation}`}
      role="radiogroup"
      aria-label={presentation === 'character'
        ? '选择默认游侠装备'
        : mode === 'global' ? '默认游侠装备与制作场景' : '项目游侠装备与制作场景'}
      aria-busy={busy}
    >
      {options.map((option, index) => {
        const selected = option.inherited ? value === null : value === option.id;
        return (
          <button
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={presentation === 'character'
              ? `${option.avatarLabel}：${option.avatarDescription}`
              : `${option.name}：${option.description}`}
            data-pack-kind={presentation}
            data-pack-index={index}
            className={`gu-pack-card pack-${option.id}${selected ? ' is-selected' : ''}${option.inherited ? ' is-inherited' : ''}`}
            key={option.inherited ? 'inherit' : option.id}
            disabled={disabled || busy}
            tabIndex={selected || (!options.some((item) => item.inherited ? value === null : value === item.id) && index === 0) ? 0 : -1}
            onKeyDown={(event) => handleArrowKey(event, index)}
            onClick={() => selectAt(index)}
          >
            <span
              className={`gu-pack-preview${presentation === 'character' ? ' gu-character-preview' : ''}`}
              aria-hidden="true"
            >
              {presentation === 'bundle' ? (
                <img
                  className="gu-pack-scene-image"
                  src={option.sceneImage}
                  alt=""
                  draggable={false}
                />
              ) : <span className="gu-character-pixel-grid" />}
              <img
                className={`gu-pack-avatar-image${presentation === 'character' ? ' gu-character-avatar-image' : ''}`}
                src={option.avatarImage}
                alt=""
                draggable={false}
              />
              {option.inherited ? <Sparkles className="gu-pack-follow-icon" size={17} /> : null}
            </span>
            <span className="gu-pack-card-copy">
              <small>{presentation === 'character' ? 'RANGER GEAR' : option.eyebrow}</small>
              <strong>{presentation === 'character' ? option.avatarLabel : option.name}</strong>
              <span>{presentation === 'character' ? option.avatarDescription : option.description}</span>
            </span>
            <span className="gu-pack-check" aria-hidden="true"><Check size={13} /></span>
          </button>
        );
      })}
    </div>
  );
}
