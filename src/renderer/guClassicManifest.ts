import guCarrySprite from './assets/noobi-sprite-carry.png';
import guCelebrateSprite from './assets/noobi-sprite-celebrate.png';
import guIdleSprite from './assets/noobi-sprite-idle.png';
import guPaintSprite from './assets/noobi-sprite-paint.png';
import guPlaySprite from './assets/noobi-sprite-play.png';
import guRepairSprite from './assets/noobi-sprite-repair.png';
import guSleepSprite from './assets/noobi-sprite-sleep.png';
import guWalkASprite from './assets/noobi-sprite-walk-a.png';
import guWalkBSprite from './assets/noobi-sprite-walk-b.png';
import guWorkSprite from './assets/noobi-sprite-work.png';
import guCoffeeASprite from './assets/noobi-packs/classic/frames/sprite-coffee-a.png';
import guCoffeeBSprite from './assets/noobi-packs/classic/frames/sprite-coffee-b.png';
import guInspectASprite from './assets/noobi-packs/classic/frames/sprite-inspect-a.png';
import guInspectBSprite from './assets/noobi-packs/classic/frames/sprite-inspect-b.png';
import guStretchASprite from './assets/noobi-packs/classic/frames/sprite-stretch-a.png';
import guStretchBSprite from './assets/noobi-packs/classic/frames/sprite-stretch-b.png';
import guSweepASprite from './assets/noobi-packs/classic/frames/sprite-sweep-a.png';
import guSweepBSprite from './assets/noobi-packs/classic/frames/sprite-sweep-b.png';
import guTypeASprite from './assets/noobi-packs/classic/frames/sprite-type-a.png';
import guTypeBSprite from './assets/noobi-packs/classic/frames/sprite-type-b.png';
import type {
  GuAnimation,
  GuAnimationFrame,
  GuSpriteManifest,
} from './guAnimation';

const frame = (src: string, durationMs: number): GuAnimationFrame => ({ src, durationMs });

const singleFrame = (
  id: string,
  src: string,
  durationMs = 800,
): GuAnimation => ({
  id,
  frames: [frame(src, durationMs)],
  loop: true,
  restFrame: 0,
});

const alternatingFrames = (
  id: string,
  frameA: string,
  frameB: string,
  durationMs = 220,
): GuAnimation => ({
  id,
  frames: [
    frame(frameA, durationMs),
    frame(frameB, durationMs),
    frame(frameA, durationMs),
    frame(frameB, durationMs + 80),
  ],
  loop: true,
  restFrame: 0,
});

/**
 * Compatibility manifest for the original GU sprite set.
 *
 * New character packs can replace this object with any number of authored
 * frames per pose. Keeping animation data outside the component means a pack
 * never needs pose-specific rendering code.
 */
export const CLASSIC_GU_SPRITE_MANIFEST: GuSpriteManifest = {
  schemaVersion: 1,
  id: 'classic-gu-v1',
  canvas: {
    width: 252,
    height: 336,
    pivot: { x: 126, y: 320 },
  },
  animations: {
    idle: singleFrame('classic-idle', guIdleSprite),
    think: singleFrame('classic-think', guIdleSprite),
    wait: singleFrame('classic-wait', guIdleSprite),
    walk: {
      id: 'classic-walk',
      frames: [
        frame(guWalkASprite, 150),
        frame(guWalkBSprite, 150),
        frame(guWalkASprite, 150),
        frame(guWalkBSprite, 150),
      ],
      loop: true,
      restFrame: 0,
    },
    work: singleFrame('classic-work', guWorkSprite),
    carry: singleFrame('classic-carry', guCarrySprite),
    paint: singleFrame('classic-paint', guPaintSprite),
    sleep: singleFrame('classic-sleep', guSleepSprite, 1_200),
    play: singleFrame('classic-play', guPlaySprite),
    repair: singleFrame('classic-repair', guRepairSprite),
    coffee: alternatingFrames('classic-coffee', guCoffeeASprite, guCoffeeBSprite, 360),
    stretch: alternatingFrames('classic-stretch', guStretchASprite, guStretchBSprite, 340),
    type: alternatingFrames('classic-type', guTypeASprite, guTypeBSprite, 150),
    inspect: alternatingFrames('classic-inspect', guInspectASprite, guInspectBSprite, 320),
    sweep: alternatingFrames('classic-sweep', guSweepASprite, guSweepBSprite, 240),
    celebrate: singleFrame('classic-celebrate', guCelebrateSprite),
  },
};
