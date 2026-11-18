import { describe, expect, it } from 'vitest';

import type { GuAnimation, GuSpriteManifest } from './guAnimation';
import {
  advanceGuFrame,
  guFrameAtElapsed,
  guManifestSources,
  guRestFrameIndex,
  normalizedGuFrameDuration,
} from './guAnimation';

const animation = (overrides: Partial<GuAnimation> = {}): GuAnimation => ({
  id: 'test',
  loop: true,
  restFrame: 0,
  frames: [
    { src: 'a.png', durationMs: 100 },
    { src: 'b.png', durationMs: 220 },
    { src: 'c.png', durationMs: 80 },
  ],
  ...overrides,
});

describe('GU sprite animation timeline', () => {
  it('honors the duration of every keyframe instead of assuming a uniform interval', () => {
    const clip = animation();
    expect(guFrameAtElapsed(clip, 0)).toBe(0);
    expect(guFrameAtElapsed(clip, 99)).toBe(0);
    expect(guFrameAtElapsed(clip, 100)).toBe(1);
    expect(guFrameAtElapsed(clip, 319)).toBe(1);
    expect(guFrameAtElapsed(clip, 320)).toBe(2);
    expect(guFrameAtElapsed(clip, 400)).toBe(0);
  });

  it('advances looping clips and settles non-looping clips on their authored rest frame', () => {
    expect(advanceGuFrame(animation(), 2)).toEqual({ frameIndex: 0, finished: false });
    expect(advanceGuFrame(animation({ loop: false, restFrame: 1 }), 2))
      .toEqual({ frameIndex: 1, finished: true });
    expect(guFrameAtElapsed(animation({ loop: false, restFrame: 1 }), 800)).toBe(1);
  });

  it('clamps malformed durations and rest frame indexes to safe values', () => {
    expect(normalizedGuFrameDuration({ src: 'bad.png', durationMs: Number.NaN })).toBe(40);
    expect(normalizedGuFrameDuration({ src: 'fast.png', durationMs: 2 })).toBe(40);
    expect(guRestFrameIndex(animation({ restFrame: 99 }))).toBe(2);
    expect(guRestFrameIndex(animation({ restFrame: -4 }))).toBe(0);
  });

  it('returns each manifest image once so the renderer can preload complete packs', () => {
    const clip = animation();
    const manifest = {
      schemaVersion: 1,
      id: 'test-pack',
      canvas: { width: 252, height: 336, pivot: { x: 126, y: 320 } },
      animations: {
        idle: clip,
        work: clip,
        think: clip,
        carry: clip,
        paint: clip,
        sleep: clip,
        play: clip,
        repair: clip,
        coffee: clip,
        stretch: clip,
        type: clip,
        inspect: clip,
        sweep: clip,
        celebrate: clip,
        wait: clip,
        walk: clip,
      },
    } satisfies GuSpriteManifest;

    expect(guManifestSources(manifest)).toEqual(['a.png', 'b.png', 'c.png']);
  });
});
