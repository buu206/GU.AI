import { describe, expect, it } from 'vitest';

import { GU_PACK_IDS } from '../shared/contracts';
import { guManifestSources } from './guAnimation';
import { guProductionPack } from './guProductionPacks';

describe('GU production packs', () => {
  it('ships a matching scene and complete animation manifest for every selectable pack', () => {
    for (const packId of GU_PACK_IDS) {
      const pack = guProductionPack(packId);
      expect(pack.id).toBe(packId);
      expect(pack.sceneImage).toMatch(/^data:image\/svg\+xml/u);
      expect(decodeURIComponent(pack.sceneImage)).toContain('data-cyber-art');
      expect(Object.keys(pack.spriteManifest.animations)).toHaveLength(16);
      for (const source of guManifestSources(pack.spriteManifest)) {
        expect(source).toMatch(/^data:image\/svg\+xml/u);
        expect(decodeURIComponent(source)).toContain('data-cyber-art');
      }
      expect(pack.spriteManifest.canvas).toEqual({
        width: 64,
        height: 64,
        pivot: { x: 32, y: 60 },
      });
    }
  });

  it('uses authored multi-keyframe clips for movement and every production action', () => {
    const manifest = guProductionPack('classic').spriteManifest;
    expect(manifest.animations.walk.frames).toHaveLength(4);
    expect(manifest.animations.work.frames).toHaveLength(4);
    expect(manifest.animations.paint.frames).toHaveLength(5);
    expect(manifest.animations.repair.frames).toHaveLength(5);
    expect(manifest.animations.coffee.frames).toHaveLength(4);
    expect(manifest.animations.stretch.frames).toHaveLength(3);
    expect(manifest.animations.type.frames).toHaveLength(4);
    expect(manifest.animations.inspect.frames).toHaveLength(3);
    expect(manifest.animations.sweep.frames).toHaveLength(4);
    expect(manifest.animations.celebrate.frames).toHaveLength(6);
    expect(manifest.animations.think.id).not.toBe(manifest.animations.idle.id);
    expect(manifest.animations.wait.id).not.toBe(manifest.animations.idle.id);
  });
});
