import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { GU_PACK_IDS } from '../../shared/contracts';
import {
  GU_PACK_OPTIONS,
  GuPackPicker,
  guPackGridColumnCount,
} from './GuPackPicker';

describe('GuPackPicker', () => {
  it('offers exactly every supported GU production pack', () => {
    expect(GU_PACK_OPTIONS.map((option) => option.id)).toEqual([...GU_PACK_IDS]);
  });

  it('derives keyboard navigation columns from the rendered grid', () => {
    vi.stubGlobal('getComputedStyle', vi.fn(() => ({
      gridTemplateColumns: '280px 280px',
    } as CSSStyleDeclaration)));

    expect(guPackGridColumnCount({} as HTMLElement)).toBe(2);
    vi.unstubAllGlobals();
  });

  it('falls back to one navigation column before the grid is mounted', () => {
    expect(guPackGridColumnCount(null)).toBe(1);
  });

  it('renders exactly one selected character without binding it to a scene preview', () => {
    const markup = renderToStaticMarkup(createElement(GuPackPicker, {
      value: 'twilight',
      mode: 'global',
      presentation: 'character',
      onChange: vi.fn(),
    }));

    expect(markup).toContain('aria-label="选择默认游侠装备"');
    expect(markup.match(/data-pack-kind="character"/gu)).toHaveLength(GU_PACK_IDS.length);
    expect(markup.match(/aria-checked="true"/gu)).toHaveLength(1);
    expect(markup).toContain('紫电游侠');
    expect(markup).not.toContain('gu-pack-scene-image');
  });
});
