import { describe, expect, it } from 'vitest';

import {
  PIXEL_TRANSITION_COLUMNS,
  PIXEL_TRANSITION_MAX_CELL_DELAY_MS,
  PIXEL_TRANSITION_ROWS,
  pixelTransitionCellDelay,
} from './PixelPageTransition';
import {
  GU_TRANSITION_SCENE_COUNT,
  guTransitionSceneIndex,
} from './guTransitionScenes';

describe('pixel page transition wave', () => {
  it('moves forward from the top-left toward the bottom-right', () => {
    const last = PIXEL_TRANSITION_COLUMNS * PIXEL_TRANSITION_ROWS - 1;

    expect(pixelTransitionCellDelay(0, 'forward')).toBe(0);
    expect(pixelTransitionCellDelay(last, 'forward')).toBe(
      PIXEL_TRANSITION_MAX_CELL_DELAY_MS,
    );
  });

  it('mirrors its delay field for backward navigation', () => {
    const count = PIXEL_TRANSITION_COLUMNS * PIXEL_TRANSITION_ROWS;

    for (let index = 0; index < count; index += 1) {
      expect(pixelTransitionCellDelay(index, 'forward')).toBe(
        pixelTransitionCellDelay(count - index - 1, 'backward'),
      );
    }
  });
});

describe('GU transition scene rotation', () => {
  it('rotates through the available cyber scenes and wraps after the final scene', () => {
    expect(GU_TRANSITION_SCENE_COUNT).toBeGreaterThanOrEqual(3);
    expect(guTransitionSceneIndex(1)).toBe(0);
    expect(guTransitionSceneIndex(GU_TRANSITION_SCENE_COUNT)).toBe(GU_TRANSITION_SCENE_COUNT - 1);
    expect(guTransitionSceneIndex(GU_TRANSITION_SCENE_COUNT + 1)).toBe(0);
  });

  it('uses the first scene for an initial or invalid run id', () => {
    expect(guTransitionSceneIndex(0)).toBe(0);
    expect(guTransitionSceneIndex(Number.NaN)).toBe(0);
  });
});
