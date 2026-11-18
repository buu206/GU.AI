import type { GuPackId } from '../shared/contracts';
import { CYBER_SCENES } from './cyberArtAssets';

type WorkshopSceneId = GuPackId | 'collaboration';
export const GU_SCENE_IMAGES: Readonly<Record<WorkshopSceneId, string>> = CYBER_SCENES;

/** The legacy furniture masks do not match the new cyberpunk scenes. */
export function hasAuthoredWorkshopScene(_id: WorkshopSceneId): boolean {
  return false;
}
