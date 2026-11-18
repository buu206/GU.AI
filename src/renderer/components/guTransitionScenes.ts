import { CYBER_TRANSITION_SCENES } from '../cyberArtAssets';

export const GU_TRANSITION_SCENES = CYBER_TRANSITION_SCENES;

export const GU_TRANSITION_SCENE_COUNT = GU_TRANSITION_SCENES.length;

export function guTransitionSceneIndex(runId: number): number {
  if (!Number.isFinite(runId) || runId <= 1) return 0;
  return (Math.floor(runId) - 1) % GU_TRANSITION_SCENE_COUNT;
}

export function guTransitionSceneForRun(runId: number): string {
  return GU_TRANSITION_SCENES[guTransitionSceneIndex(runId)]!;
}
