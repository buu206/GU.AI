import React from 'react';

import { cyberSpriteFrame } from '../cyberArtAssets';

const walkFrameA = cyberSpriteFrame('classic', 'walk', 0);
const walkFrameB = cyberSpriteFrame('classic', 'walk', 1);

export type LaunchTransitionPhase = 'running' | 'leaving';

interface LaunchTransitionProps {
  phase: LaunchTransitionPhase;
}

export function LaunchTransition({ phase }: LaunchTransitionProps) {
  return (
    <div
      className={`launch-transition is-${phase}`}
      role="status"
      aria-live="polite"
      aria-label="正在进入游戏制作工作台"
    >
      <div className="launch-transition-copy">
        <strong>正在进入制作台</strong>
        <span>GAME//OS · 像素游侠就位</span>
      </div>
      <div className="launch-transition-track" aria-hidden="true">
        <span className="launch-transition-runner">
          <img src={walkFrameA} alt="" />
          <img src={walkFrameB} alt="" />
        </span>
      </div>
    </div>
  );
}
