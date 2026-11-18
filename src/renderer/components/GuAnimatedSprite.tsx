import React, { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';

import type { ProductionAssistantPose } from '../productionAssistantState';
import {
  advanceGuFrame,
  guManifestSources,
  guRestFrameIndex,
  normalizedGuFrameDuration,
  type GuSpriteManifest,
} from '../guAnimation';

interface GuAnimatedSpriteProps {
  pose: ProductionAssistantPose;
  manifest: GuSpriteManifest;
  playbackKey?: string;
  mini?: boolean;
  paused?: boolean;
  reducedMotion?: boolean;
}

const preloadedSources = new Set<string>();

export function GuAnimatedSprite({
  pose,
  manifest,
  playbackKey = pose,
  mini = false,
  paused = false,
  reducedMotion = false,
}: GuAnimatedSpriteProps) {
  const animation = manifest.animations[pose];
  const [frameIndex, setFrameIndex] = useState(() => (
    reducedMotion ? guRestFrameIndex(animation) : 0
  ));
  const [finished, setFinished] = useState(false);
  const safeFrameIndex = Math.min(Math.max(0, frameIndex), Math.max(0, animation.frames.length - 1));
  const pivotStyle = useMemo(() => ({
    '--gu-pivot-x': `${(manifest.canvas.pivot.x / manifest.canvas.width) * 100}%`,
    '--gu-pivot-y': `${(manifest.canvas.pivot.y / manifest.canvas.height) * 100}%`,
  } as CSSProperties), [manifest.canvas]);

  useEffect(() => {
    if (typeof Image === 'undefined') return;
    for (const src of guManifestSources(manifest)) {
      if (preloadedSources.has(src)) continue;
      const image = new Image();
      image.decoding = 'async';
      image.src = src;
      preloadedSources.add(src);
    }
  }, [manifest]);

  useEffect(() => {
    setFrameIndex(reducedMotion ? guRestFrameIndex(animation) : 0);
    setFinished(false);
  }, [animation, manifest.id, playbackKey, reducedMotion]);

  useEffect(() => {
    if (paused || reducedMotion || finished || animation.frames.length <= 1) return undefined;
    const activeFrame = animation.frames[safeFrameIndex];
    if (!activeFrame) return undefined;

    const timer = window.setTimeout(() => {
      const next = advanceGuFrame(animation, safeFrameIndex);
      setFrameIndex(next.frameIndex);
      setFinished(next.finished);
    }, normalizedGuFrameDuration(activeFrame));
    return () => window.clearTimeout(timer);
  }, [animation, finished, paused, reducedMotion, safeFrameIndex]);

  return (
    <span
      className={`gu-pixel-sprite${mini ? ' is-mini' : ''}`}
      data-manifest={manifest.id}
      data-pose={pose}
      data-frame-index={safeFrameIndex}
      data-frame-count={animation.frames.length}
      style={pivotStyle}
      role="presentation"
    >
      {animation.frames.map((frameItem, index) => (
        <img
          key={`${animation.id}:${index}:${frameItem.src}`}
          className="gu-sprite-frame"
          data-active={index === safeFrameIndex ? 'true' : 'false'}
          src={frameItem.src}
          alt=""
          draggable={false}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}
