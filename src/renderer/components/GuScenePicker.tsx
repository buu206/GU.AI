import { Check, MonitorPlay } from 'lucide-react';
import React, { type KeyboardEvent } from 'react';

import type {
  GuPackId,
  GuSceneId,
} from '../../shared/contracts';
import { GU_SCENE_IMAGES } from '../guSceneAssets';
import { CYBER_SCENES } from '../cyberArtAssets';
import {
  GU_PACK_OPTIONS,
  guPackGridColumnCount,
} from './GuPackPicker';

export interface GuSceneOption<Id extends string = string> {
  id: Id;
  eyebrow: string;
  name: string;
  description: string;
  image: string;
  badges: readonly string[];
  animated: boolean;
}

export const GU_SOLO_SCENE_OPTIONS: readonly GuSceneOption<GuPackId>[] =
  GU_PACK_OPTIONS.map((option) => ({
    id: option.id,
    eyebrow: option.eyebrow,
    name: option.name,
    description: option.sceneDescription,
    image: option.sceneImage,
    badges: ['单人控制台', '装备独立选择'],
    animated: false,
  }));

export const GU_SCENE_OPTIONS: readonly GuSceneOption<GuSceneId>[] = [
  {
    id: 'collaboration',
    eyebrow: 'NEON COMMAND',
    name: '霓虹指挥站',
    description: '游侠编队在像素终端间协作。',
    image: GU_SCENE_IMAGES.collaboration,
    badges: ['多人场景', '按编队渲染'],
    animated: false,
  },
  {
    id: 'fishing',
    eyebrow: 'ROOFTOP BREAK',
    name: '天台休息站',
    description: '夜城天台，游侠编队的休息站。',
    image: CYBER_SCENES.fishing,
    badges: ['夜城天台', '按编队渲染'],
    animated: false,
  },
] as const satisfies readonly GuSceneOption<GuSceneId>[];

interface PickerShellProps<Id extends string> {
  value: Id | null;
  options: readonly GuSceneOption<Id>[];
  variant: 'solo' | 'multiplayer';
  disabled: boolean;
  busy: boolean;
  onChange: (sceneId: Id) => void;
}

interface GuSoloScenePickerProps {
  value: GuPackId;
  disabled?: boolean;
  busy?: boolean;
  onChange: (sceneId: GuPackId) => void;
}

export function GuSoloScenePicker({
  value,
  disabled = false,
  busy = false,
  onChange,
}: GuSoloScenePickerProps) {
  return (
    <GuScenePickerShell
      value={value}
      options={GU_SOLO_SCENE_OPTIONS}
      variant="solo"
      disabled={disabled}
      busy={busy}
      onChange={onChange}
    />
  );
}

interface GuScenePickerProps {
  value: GuSceneId | null;
  disabled?: boolean;
  busy?: boolean;
  onChange: (sceneId: GuSceneId) => void;
}

export function GuScenePicker({
  value,
  disabled = false,
  busy = false,
  onChange,
}: GuScenePickerProps) {
  return (
    <GuScenePickerShell
      value={value}
      options={GU_SCENE_OPTIONS}
      variant="multiplayer"
      disabled={disabled}
      busy={busy}
      onChange={onChange}
    />
  );
}

function GuScenePickerShell<Id extends string>({
  value,
  options,
  variant,
  disabled,
  busy,
  onChange,
}: PickerShellProps<Id>) {
  function selectAt(index: number) {
    const option = options[index];
    if (option) onChange(option.id);
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
    const nextButton = container?.querySelector<HTMLButtonElement>(
      `button[data-scene-index="${nextIndex}"]`,
    );
    nextButton?.focus();
    selectAt(nextIndex);
  }

  const solo = variant === 'solo';

  return (
    <section
      className={`gu-scene-picker variant-${variant}`}
      data-scene-kind={variant}
      aria-label={solo ? '游侠单人控制台' : '游侠多人运行背景'}
      aria-busy={busy}
    >
      <header className="gu-scene-heading">
        <span className="gu-scene-heading-icon" aria-hidden="true"><MonitorPlay size={18} /></span>
        <div>
          <small>{solo ? 'SOLO DESK' : 'CREW STATION'}</small>
          <strong>{solo ? '单人控制台' : '多人控制台'}</strong>
          <p>{solo
            ? '背景与装备可分开选择。'
            : '选择背景后启用多人模式。'}</p>
        </div>
      </header>

      <div
        className="gu-scene-grid"
        role="radiogroup"
        aria-label={solo ? '选择单人控制台' : '选择多人运行背景'}
      >
        {options.map((option, index) => {
          const selected = option.id === value;
          return (
            <button
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`${option.name}：${option.description}；${option.badges.join('，')}`}
              className={`gu-pack-card gu-scene-card${selected ? ' is-selected' : ''}`}
              data-scene-id={option.id}
              data-scene-index={index}
              data-scene-kind={variant}
              data-motion={option.animated ? 'animated' : 'static'}
              disabled={disabled || busy}
              tabIndex={selected || (value === null && index === 0) ? 0 : -1}
              key={option.id}
              onKeyDown={(event) => handleArrowKey(event, index)}
              onClick={() => onChange(option.id)}
            >
              <span className="gu-pack-preview gu-scene-preview" aria-hidden="true">
                <img
                  className="gu-pack-scene-image"
                  src={option.image}
                  alt=""
                  draggable={false}
                />
                <span className="gu-scene-live-badge">
                  <i /> {solo ? 'SOLO MAP' : option.animated ? 'LIVE LOOP' : 'CREW MAP'}
                </span>
              </span>
              <span className="gu-pack-card-copy gu-scene-card-copy">
                <small>{option.eyebrow}</small>
                <strong>{option.name}</strong>
                <span>{option.description}</span>
                <span className="gu-scene-card-meta" aria-hidden="true">
                  {option.badges.map((badge) => <em key={badge}>{badge}</em>)}
                </span>
              </span>
              <span className="gu-pack-check" aria-hidden="true"><Check size={13} /></span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
