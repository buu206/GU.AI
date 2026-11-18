import type { GuPackId } from '../shared/contracts';
import { paintPetSprite, type PetPixelContext, type PetSpriteOptions } from './desktop/desktopArt';
import type { ProductionAssistantPose } from './productionAssistantState';

interface CyberPalette { accent: string; light: string; shade: string; signal: string }
const PALETTES: Readonly<Record<GuPackId, CyberPalette>> = {
  classic: { accent: '#df5bac', light: '#ff93dc', shade: '#883b7c', signal: '#65eee3' },
  mosslight: { accent: '#42b99a', light: '#a1f3b9', shade: '#256e70', signal: '#79fff0' },
  starforge: { accent: '#578ddd', light: '#a1caff', shade: '#354e99', signal: '#67e9ff' },
  twilight: { accent: '#a77ce9', light: '#e1b3ff', shade: '#62479a', signal: '#ff89d5' },
  hellokitty: { accent: '#ea9b5e', light: '#ffdc93', shade: '#985d63', signal: '#b9f8dd' },
};
const svgUrl = (content: string) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(content);
const svg = (width: number, height: number, kind: string, content: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges" data-cyber-art="${kind}">${content}</svg>`;
const rect = (x: number, y: number, width: number, height: number, fill: string, opacity = 1) =>
  `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}"${opacity === 1 ? '' : ` opacity="${opacity}"`}/>`;

/** The approved desktop pet's pixel instructions, rendered without DOM or network. */
function rangerPixels(packId: GuPackId, options: PetSpriteOptions): string {
  const palette = PALETTES[packId];
  const paths: Array<{ color: string; data: string }> = [];
  type Transform = { x: number; y: number; sx: number; sy: number };
  let transform: Transform = { x: 0, y: 0, sx: 1, sy: 1 };
  const stack: Transform[] = [];
  const context: PetPixelContext = {
    fillStyle: '#111124', imageSmoothingEnabled: false,
    save() { stack.push({ ...transform }); },
    restore() { transform = stack.pop() ?? transform; },
    setTransform(a: number, _b: number, _c: number, d: number, e: number, f: number) { transform = { x: e, y: f, sx: a, sy: d }; },
    clearRect() { paths.length = 0; },
    translate(x: number, y: number) { transform.x += x * transform.sx; transform.y += y * transform.sy; },
    scale(x: number, y: number) { transform.sx *= x; transform.sy *= y; },
    fillRect(x: number, y: number, width: number, height: number) {
      const x1 = transform.x + x * transform.sx, y1 = transform.y + y * transform.sy;
      const x2 = x1 + width * transform.sx, y2 = y1 + height * transform.sy;
      const w = Math.abs(x2 - x1), h = Math.abs(y2 - y1);
      const data = `M${Math.min(x1, x2)} ${Math.min(y1, y2)}h${w}v${h}h-${w}z`;
      const last = paths.at(-1);
      if (last?.color === this.fillStyle) last.data += data;
      else paths.push({ color: String(this.fillStyle), data });
    },
  };
  paintPetSprite(context, options, { pink: palette.accent, blush: palette.light, plum: palette.shade, cyan: palette.signal });
  return paths.map(({ color, data }) => `<path fill="${color}" d="${data}"/>`).join('');
}

const spriteCache = new Map<string, string>();
export function cyberSpriteFrame(packId: GuPackId, pose: ProductionAssistantPose, frame: number): string {
  const index = Math.abs(Math.floor(frame)) % 4;
  const key = `${packId}:${pose}:${index}`;
  const cached = spriteCache.get(key);
  if (cached) return cached;
  const p = PALETTES[packId];
  let character = rangerPixels(packId, { pose: pose === 'walk' || pose === 'sweep' ? 'walk' : 'idle', frame: index });
  let accessory = '';
  if (['work', 'type', 'think', 'inspect', 'play'].includes(pose)) {
    accessory = rect(43, 27, 17, 13, '#111124') + rect(44, 28, 15, 10, '#204653')
      + rect(45, 29, 13, 1, p.signal) + rect(46, 32, 3 + index * 2, 1, p.light) + rect(46, 35, 9 - index, 1, '#65eee3');
  } else if (pose === 'carry') {
    accessory = rect(39, 36, 17, 17, '#111124') + rect(40, 37, 15, 14, '#493756')
      + rect(41, 38, 13, 2, p.signal) + rect(46, 41, 3, 7, p.accent) + rect(42, 47, 11, 2, p.shade);
  } else if (pose === 'paint' || pose === 'repair') {
    accessory = rect(46, 24, 13, 12, '#111124') + rect(47, 25, 11, 10, '#24203e')
      + rect(48 + index, 26, 3, 3, p.signal) + rect(53, 30, 3, 3, p.accent) + rect(56, 38 - index, 2, 2, p.light);
  } else if (pose === 'coffee') {
    accessory = rect(42, 32, 9, 10, '#111124') + rect(43, 33, 6, 7, p.light)
      + rect(49, 34, 4, 4, p.accent) + rect(45 + index % 2, 27, 1, 4, '#c9d8e6');
  } else if (pose === 'sleep' || pose === 'wait') {
    accessory = rect(43 + index, 15, 4, 2, p.signal) + rect(47, 11 - index, 5, 2, p.light);
  } else if (pose === 'celebrate' || pose === 'stretch') {
    character = `<g transform="translate(0 ${index % 2 ? -2 : 0})">${character}</g>`;
    if (pose === 'celebrate') accessory = rect(12, 16 + index, 2, 5, p.signal) + rect(10, 18 + index, 6, 1, p.signal)
      + rect(47, 7 + index, 2, 5, p.light) + rect(45, 9 + index, 6, 1, p.light);
  }
  const source = svgUrl(svg(64, 64, 'sprite', character + accessory));
  spriteCache.set(key, source);
  return source;
}

function monitor(x: number, y: number, width: number, height: number, p: CyberPalette, pattern: number): string {
  let content = rect(x + 4, y + height, width - 8, 7, '#111124') + rect(x + width / 2 - 4, y + height - 1, 8, 8, '#493756')
    + rect(x, y, width, height, '#111124') + rect(x + 2, y + 2, width - 4, height - 4, '#493756')
    + rect(x + 4, y + 4, width - 8, height - 8, '#101d31') + rect(x + 6, y + 6, width - 12, 2, p.signal);
  for (let row = 0; row < Math.floor((height - 16) / 5); row++) content += rect(x + 7, y + 12 + row * 5, 3, 2, p.accent)
    + rect(x + 13, y + 12 + row * 5, Math.min(width - 23, 8 + (row * 9 + pattern * 7) % Math.max(8, width - 25)), 2, row % 2 ? '#3e7485' : '#8be4de');
  return content;
}

function bench(x: number, y: number, width: number, p: CyberPalette): string {
  return rect(x + 3, y + 8, width, 14, '#080c1b') + rect(x, y, width, 15, '#4b375d')
    + rect(x + 2, y + 2, width - 4, 8, '#29243d') + rect(x + 3, y + 11, width - 6, 2, p.accent)
    + rect(x + 4, y + 15, 5, 8, '#17172a') + rect(x + width - 9, y + 15, 5, 8, '#17172a');
}

function city(p: CyberPalette, rooftop: boolean): string {
  let content = rect(0, 0, 640, 400, '#0c0a1d') + rect(0, 28, 640, 52, '#17102c') + rect(0, 80, 640, 40, '#251432');
  const bands = ['#f8ad84', '#e782a6', p.accent, p.shade, '#4b285d'];
  for (let y = -26; y <= 26; y += 2) {
    if (y > 4 && (y + 26) % 8 === 0) continue;
    const half = Math.floor(Math.sqrt(26 * 26 - y * y));
    content += rect(536 - half, 46 + y, half * 2 + 2, 2, bands[Math.min(4, Math.floor((y + 26) / 11))]!);
  }
  for (let index = 0; index < 42; index++) {
    const x = (index * 73 + 17) % 640, height = 12 + index * 17 % 42;
    content += rect(x, 108 - height, 11 + index % 4 * 6, height, index % 2 ? '#1c1b37' : '#28223f');
    if (index % 3 === 0) content += rect(x + 3, 113 - height, 2, 4, p.signal, 0.5);
    if (index < 14) content += rect((index * 91 + 22) % 640, 9 + index * 19 % 48, 2, 2, index % 2 ? '#766584' : '#8bb8c6');
  }
  content += rect(0, 108, 640, 4, '#4a355b') + rect(0, 112, 640, 3, p.shade);
  if (!rooftop) {
    content += rect(0, 0, 640, 8, '#342641') + rect(0, 6, 640, 2, p.accent);
    for (const x of [0, 158, 318, 478, 632]) content += rect(x, 8, 8, 106, '#30243f') + rect(x + 1, 9, 1, 98, '#5c3e68');
  }
  return content;
}

function workshop(packId: GuPackId, rooftop = false, team = false): string {
  const p = PALETTES[packId];
  let content = city(p, rooftop) + rect(0, 115, 640, 285, '#141327');
  for (let y = 116; y < 400; y += 16) content += rect(0, y, 640, 1, '#242039');
  for (let x = 0; x < 640; x += 32) content += rect(x, 116, 1, 284, '#242039');
  content += rect(8, 132, 624, 2, '#553356') + rect(8, 393, 624, 2, p.shade)
    + rect(8, 132, 2, 262, '#49315b') + rect(630, 132, 2, 262, '#49315b')
    + rect(18, 168, 372, 2, '#285064') + rect(389, 168, 2, 140, '#285064')
    + rect(260, 306, 130, 2, '#285064') + rect(260, 306, 2, 45, p.shade) + rect(402, 150, 2, 80, '#553255');
  // Workstations sit within the legacy obstacle footprints; routes remain open.
  content += bench(34, 119, 82, p) + monitor(43, 83, 60, 37, p, 0)
    + bench(138, 111, 108, p) + monitor(145, 67, 88, 43, p, 1)
    + bench(278, 109, 112, p) + monitor(286, 63, 94, 46, p, 2)
    + bench(438, 96, 59, p) + monitor(441, 50, 53, 47, p, 3);
  for (const x of [516, 566]) {
    content += rect(x, 46, 43, 91, '#080c1b') + rect(x + 2, 48, 39, 87, '#30243f');
    for (let row = 0; row < 5; row++) content += rect(x + 5, 53 + row * 15, 33, 11, '#111727')
      + rect(x + 8, 56 + row * 15, 14, 2, '#3e5270') + rect(x + 29, 56 + row * 15, 4, 3, row % 2 ? p.accent : p.signal);
  }
  content += bench(22, 221, 108, p) + monitor(26, 175, 96, 46, p, 4)
    + rect(36, 236, 75, 9, '#1d293c') + rect(40, 238, 60, 2, '#56717e')
    + bench(460, 225, 150, p) + rect(466, 169, 138, 56, '#101223') + rect(470, 173, 130, 48, '#243c50');
  for (let index = 0; index < 9; index++) {
    const x = 477 + index * 13, y = 185 + (index * 7 % 22);
    content += rect(x, y, 10, 3, index % 3 ? '#53a6b7' : p.accent) + rect(x + 4, y - 6, 2, 6, p.signal);
  }
  content += bench(26, 320, 120, p) + rect(31, 296, 109, 23, '#372941') + rect(34, 298, 103, 3, p.accent)
    + rect(154, 276, 80, 21, '#28253e') + rect(157, 277, 74, 2, p.signal)
    + rect(421, 276, 50, 93, '#0a0d20') + rect(424, 278, 44, 76, '#473454') + monitor(428, 283, 36, 38, p, 5)
    + rect(430, 333, 31, 9, '#21243b') + rect(434, 334, 5, 4, p.accent) + rect(452, 334, 4, 4, p.signal)
    + rect(484, 331, 96, 52, '#1f1b33') + rect(487, 333, 90, 3, p.shade)
    + rect(495, 346, 6, 18, '#3a385a') + rect(505, 346, 6, 18, '#4e4270');
  for (const x of [20, 603]) content += rect(x, 264, 13, 28, '#24203e') + rect(x + 3, 267, 7, 3, p.signal)
    + rect(x + 3, 273, 7, 3, p.accent) + rect(x + 3, 279, 7, 9, '#3b4464');
  if (team) content += rect(275, 213, 72, 4, p.accent) + rect(286, 220, 50, 2, '#366b7c') + rect(301, 225, 20, 2, p.signal);
  if (rooftop) content += rect(548, 265, 56, 37, '#24203e') + rect(553, 270, 46, 27, '#0b1427')
    + rect(559, 280, 34, 3, p.signal) + rect(573, 272, 6, 22, p.accent);
  return content;
}

export const CYBER_AVATARS: Readonly<Record<GuPackId, string>> = Object.fromEntries(
  (Object.keys(PALETTES) as GuPackId[]).map((id) => [id, svgUrl(svg(64, 64, 'avatar', rangerPixels(id, { pose: 'idle' })))]),
) as Record<GuPackId, string>;

export const CYBER_SCENES: Readonly<Record<GuPackId | 'collaboration' | 'fishing', string>> = {
  classic: svgUrl(svg(640, 400, 'scene', workshop('classic'))),
  mosslight: svgUrl(svg(640, 400, 'scene', workshop('mosslight'))),
  starforge: svgUrl(svg(640, 400, 'scene', workshop('starforge'))),
  twilight: svgUrl(svg(640, 400, 'scene', workshop('twilight'))),
  hellokitty: svgUrl(svg(640, 400, 'scene', workshop('hellokitty'))),
  collaboration: svgUrl(svg(640, 400, 'scene', workshop('classic', false, true))),
  fishing: svgUrl(svg(640, 400, 'scene', workshop('twilight', true, true))),
};

export const CYBER_TRANSITION_SCENES: readonly string[] = (['classic', 'starforge', 'twilight'] as const).map((id, index) => {
  const p = PALETTES[id];
  const content = city(p, true) + rect(0, 115, 640, 285, '#121024')
    + rect(0, 304, 640, 4, p.shade) + rect(0, 310, 640, 2, p.signal)
    + rect(60, 342, 120, 2, '#3c294d') + rect(450, 355, 140, 2, '#274055')
    + bench(55, 268, 120, p) + monitor(68, 207, 91, 60, p, index)
    + bench(442, 268, 135, p) + monitor(450, 199, 116, 68, p, index + 1)
    + `<g transform="translate(240 150) scale(2.5)">${rangerPixels(id, { pose: 'walk', frame: index })}</g>`
    + rect(20, 20, 16, 2, p.signal) + rect(20, 20, 2, 16, p.signal)
    + rect(604, 370, 16, 2, p.accent) + rect(618, 356, 2, 16, p.accent);
  return svgUrl(svg(640, 400, 'transition', content));
});
