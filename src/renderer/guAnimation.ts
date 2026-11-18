import type { ProductionAssistantPose } from './productionAssistantState';

export interface GuAnimationFrame {
  src: string;
  durationMs: number;
}

export interface GuAnimation {
  id: string;
  frames: readonly GuAnimationFrame[];
  loop: boolean;
  /** Frame displayed while reduced motion is enabled or after a non-looping clip ends. */
  restFrame: number;
}

export interface GuSpriteCanvas {
  width: number;
  height: number;
  pivot: {
    x: number;
    y: number;
  };
}

export interface GuSpriteManifest {
  schemaVersion: 1;
  id: string;
  canvas: GuSpriteCanvas;
  animations: Readonly<Record<ProductionAssistantPose, GuAnimation>>;
}

export interface GuFrameAdvance {
  frameIndex: number;
  finished: boolean;
}

const MINIMUM_FRAME_DURATION_MS = 40;

export function normalizedGuFrameDuration(frame: GuAnimationFrame): number {
  if (!Number.isFinite(frame.durationMs)) return MINIMUM_FRAME_DURATION_MS;
  return Math.max(MINIMUM_FRAME_DURATION_MS, Math.round(frame.durationMs));
}

export function guRestFrameIndex(animation: GuAnimation): number {
  if (animation.frames.length === 0) return 0;
  if (!Number.isFinite(animation.restFrame)) return 0;
  return Math.min(animation.frames.length - 1, Math.max(0, Math.round(animation.restFrame)));
}

export function advanceGuFrame(
  animation: GuAnimation,
  currentFrameIndex: number,
): GuFrameAdvance {
  if (animation.frames.length <= 1) {
    return { frameIndex: guRestFrameIndex(animation), finished: true };
  }

  const safeIndex = Math.min(
    animation.frames.length - 1,
    Math.max(0, Math.round(currentFrameIndex)),
  );
  const nextIndex = safeIndex + 1;
  if (nextIndex < animation.frames.length) {
    return { frameIndex: nextIndex, finished: false };
  }
  if (animation.loop) {
    return { frameIndex: 0, finished: false };
  }
  return { frameIndex: guRestFrameIndex(animation), finished: true };
}

export function guFrameAtElapsed(
  animation: GuAnimation,
  elapsedMs: number,
): number {
  if (animation.frames.length <= 1 || elapsedMs <= 0 || !Number.isFinite(elapsedMs)) {
    return animation.frames.length === 0 ? 0 : 0;
  }

  const durations = animation.frames.map(normalizedGuFrameDuration);
  const totalDuration = durations.reduce((total, duration) => total + duration, 0);
  if (!animation.loop && elapsedMs >= totalDuration) return guRestFrameIndex(animation);

  let remaining = animation.loop ? elapsedMs % totalDuration : elapsedMs;
  for (let index = 0; index < durations.length; index += 1) {
    if (remaining < durations[index]!) return index;
    remaining -= durations[index]!;
  }
  return guRestFrameIndex(animation);
}

export function guManifestSources(manifest: GuSpriteManifest): string[] {
  return Array.from(new Set(
    Object.values(manifest.animations)
      .flatMap((animation) => animation.frames)
      .map((frame) => frame.src)
      .filter(Boolean),
  ));
}
