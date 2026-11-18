import type { GuPackId } from '../shared/contracts';
import { GU_SCENE_IMAGES } from './guSceneAssets';
import { cyberSpriteFrame } from './cyberArtAssets';
import type { ProductionAssistantPose } from './productionAssistantState';
import type {
  GuAnimation,
  GuAnimationFrame,
  GuSpriteManifest,
} from './guAnimation';

export interface GuProductionPack {
  id: GuPackId;
  sceneImage: string;
  spriteManifest: GuSpriteManifest;
}

function frames(
  packId: GuPackId,
  pose: ProductionAssistantPose,
  names: readonly string[],
  durations: readonly number[],
): GuAnimationFrame[] {
  return names.map((name, index) => ({
    src: cyberSpriteFrame(packId, pose, index),
    durationMs: durations[index] ?? durations.at(-1) ?? 160,
  }));
}

function clip(
  packId: GuPackId,
  id: ProductionAssistantPose,
  names: readonly string[],
  durations: readonly number[],
  restFrame = 0,
): GuAnimation {
  return {
    id: `${packId}-${id}`,
    frames: frames(packId, id, names, durations),
    loop: true,
    restFrame,
  };
}

function manifest(packId: GuPackId): GuSpriteManifest {
  return {
    schemaVersion: 1,
    id: `${packId}-gu-v2`,
    canvas: {
      width: 64,
      height: 64,
      pivot: { x: 32, y: 60 },
    },
    animations: {
      idle: clip(packId, 'idle',
        ['idle-a', 'idle-b', 'idle-a'],
        [620, 140, 760]),
      think: clip(packId, 'think',
        ['idle-a', 'idle-b', 'idle-a'],
        [420, 260, 520]),
      wait: clip(packId, 'wait',
        ['idle-a', 'idle-b', 'idle-a', 'idle-b'],
        [680, 220, 820, 220]),
      walk: clip(packId, 'walk',
        ['walk-a-a', 'walk-a-b', 'walk-b-a', 'walk-b-b'],
        [130, 130, 130, 130]),
      work: clip(packId, 'work',
        ['work-a', 'work-b', 'work-a', 'work-b'],
        [240, 180, 260, 180]),
      carry: clip(packId, 'carry',
        ['carry-a', 'carry-b', 'carry-a', 'carry-b'],
        [200, 170, 200, 170]),
      paint: clip(packId, 'paint',
        ['paint-a', 'paint-b', 'paint-a', 'paint-b', 'paint-a'],
        [180, 150, 180, 150, 300]),
      sleep: clip(packId, 'sleep',
        ['sleep-a', 'sleep-b', 'sleep-a'],
        [720, 420, 820]),
      play: clip(packId, 'play',
        ['play-a', 'play-b', 'play-a', 'play-b'],
        [190, 150, 210, 150]),
      repair: clip(packId, 'repair',
        ['repair-a', 'repair-b', 'repair-a', 'repair-b', 'repair-a'],
        [170, 120, 190, 120, 280]),
      coffee: clip(packId, 'coffee',
        ['coffee-a', 'coffee-b', 'coffee-a', 'coffee-b'],
        [460, 320, 560, 320]),
      stretch: clip(packId, 'stretch',
        ['stretch-a', 'stretch-b', 'stretch-a'],
        [300, 440, 520]),
      type: clip(packId, 'type',
        ['type-a', 'type-b', 'type-a', 'type-b'],
        [150, 150, 170, 220]),
      inspect: clip(packId, 'inspect',
        ['inspect-a', 'inspect-b', 'inspect-a'],
        [380, 280, 540]),
      sweep: clip(packId, 'sweep',
        ['sweep-a', 'sweep-b', 'sweep-a', 'sweep-b'],
        [240, 240, 280, 320]),
      celebrate: clip(packId, 'celebrate',
        ['celebrate-a', 'celebrate-b', 'celebrate-a', 'celebrate-b', 'celebrate-a', 'celebrate-b'],
        [140, 140, 140, 140, 160, 240]),
    },
  };
}

export const GU_PRODUCTION_PACKS: Readonly<Record<GuPackId, GuProductionPack>> = {
  classic: {
    id: 'classic',
    sceneImage: GU_SCENE_IMAGES.classic,
    spriteManifest: manifest('classic'),
  },
  mosslight: {
    id: 'mosslight',
    sceneImage: GU_SCENE_IMAGES.mosslight,
    spriteManifest: manifest('mosslight'),
  },
  starforge: {
    id: 'starforge',
    sceneImage: GU_SCENE_IMAGES.starforge,
    spriteManifest: manifest('starforge'),
  },
  twilight: {
    id: 'twilight',
    sceneImage: GU_SCENE_IMAGES.twilight,
    spriteManifest: manifest('twilight'),
  },
  hellokitty: {
    id: 'hellokitty',
    sceneImage: GU_SCENE_IMAGES.hellokitty,
    spriteManifest: manifest('hellokitty'),
  },
};

export function guProductionPack(packId: GuPackId): GuProductionPack {
  return GU_PRODUCTION_PACKS[packId];
}
