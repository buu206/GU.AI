import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { LaunchTransition } from './LaunchTransition';

describe('LaunchTransition', () => {
  it('renders the GAME//OS handoff with two ranger walking frames', () => {
    const markup = renderToStaticMarkup(createElement(LaunchTransition, { phase: 'running' }));

    expect(markup).toContain('正在进入制作台');
    expect(markup).toContain('GAME//OS · 像素游侠就位');
    expect(markup).toContain('launch-transition-runner');
    expect(markup.match(/<img/gu)).toHaveLength(2);
  });
});
