import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { GU_PACK_IDS, GU_SCENE_IDS } from '../../shared/contracts';
import {
  GU_SCENE_OPTIONS,
  GU_SOLO_SCENE_OPTIONS,
  GuScenePicker,
  GuSoloScenePicker,
} from './GuScenePicker';

describe('GuScenePicker', () => {
  it('offers exactly every supported running background', () => {
    expect(GU_SCENE_OPTIONS.map((option) => option.id)).toEqual([...GU_SCENE_IDS]);
  });

  it('offers every pack scene as a character-independent solo workspace', () => {
    expect(GU_SOLO_SCENE_OPTIONS.map((option) => option.id)).toEqual([...GU_PACK_IDS]);
    expect(GU_SOLO_SCENE_OPTIONS.every((option) => (
      option.badges.includes('单人控制台') && option.badges.includes('装备独立选择')
    ))).toBe(true);

    const markup = renderToStaticMarkup(createElement(GuSoloScenePicker, {
      value: 'starforge',
      onChange: vi.fn(),
    }));

    expect(markup).toContain('aria-label="选择单人控制台"');
    expect(markup).toContain('data-scene-kind="solo"');
    expect(markup).toMatch(
      /<button[^>]*aria-checked="true"[^>]*data-scene-id="starforge"[^>]*data-scene-kind="solo"/u,
    );
    expect(markup).not.toContain('data-scene-id="fishing"');
  });

  it('keeps the saved fishing selection as the crew-aware cyber rooftop scene', () => {
    const markup = renderToStaticMarkup(createElement(GuScenePicker, {
      value: 'fishing',
      onChange: vi.fn(),
    }));

    expect(markup).toContain('aria-label="选择多人运行背景"');
    expect(markup).toContain('data-scene-id="fishing"');
    expect(markup).toContain('data-motion="static"');
    expect(markup).toMatch(
      /<button[^>]*aria-checked="true"[^>]*data-scene-id="fishing"[^>]*data-motion="static"/u,
    );
    expect(markup).toContain('ROOFTOP BREAK');
    expect(markup).toContain('天台休息站');
    expect(markup).toContain('按编队渲染');
    expect(markup).not.toContain('four-ip-fishing.gif');
  });

  it('keeps the collaboration scene available as the static crew-aware option', () => {
    const markup = renderToStaticMarkup(createElement(GuScenePicker, {
      value: 'collaboration',
      busy: true,
      onChange: vi.fn(),
    }));

    expect(markup).toContain('data-scene-id="collaboration"');
    expect(markup).toContain('data-motion="static"');
    expect(markup).toContain('按编队渲染');
    expect(markup).toContain('aria-busy="true"');
    expect(markup.match(/disabled=""/gu)).toHaveLength(GU_SCENE_OPTIONS.length);
  });

  it('keeps multiplayer scenes unselected but keyboard reachable while solo is active', () => {
    const markup = renderToStaticMarkup(createElement(GuScenePicker, {
      value: null,
      onChange: vi.fn(),
    }));

    expect(markup).toContain('aria-label="选择多人运行背景"');
    expect(markup).not.toContain('aria-checked="true"');
    expect(markup.match(/tabindex="0"/gu)).toHaveLength(1);
  });
});
