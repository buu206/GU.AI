import { describe, expect, it } from 'vitest';

import type { GuCrewMember } from '../../shared/contracts';
import {
  assignGuCrewRole,
  toggleGuCrewMember,
} from './GuCrewPicker';

const baseCrew: readonly GuCrewMember[] = [
  { packId: 'classic', role: 'planner' },
  { packId: 'twilight', role: 'artist' },
  { packId: 'hellokitty', role: 'engineer' },
];

describe('GuCrewPicker helpers', () => {
  it('adds a unique pack in the first unfilled role', () => {
    expect(toggleGuCrewMember(baseCrew, 'mosslight')).toEqual([
      ...baseCrew,
      { packId: 'mosslight', role: 'tester' },
    ]);
  });

  it('enforces the two-to-four member limits', () => {
    const minimum = baseCrew.slice(0, 2);
    expect(toggleGuCrewMember(minimum, 'classic')).toEqual(minimum);

    const maximum = toggleGuCrewMember(baseCrew, 'mosslight');
    expect(toggleGuCrewMember(maximum, 'starforge')).toEqual(maximum);
  });

  it('removes a selected member when the crew remains valid', () => {
    expect(toggleGuCrewMember(baseCrew, 'twilight')).toEqual([
      { packId: 'classic', role: 'planner' },
      { packId: 'hellokitty', role: 'engineer' },
    ]);
  });

  it('swaps occupied roles instead of producing duplicate assignments', () => {
    expect(assignGuCrewRole(baseCrew, 'hellokitty', 'planner')).toEqual([
      { packId: 'classic', role: 'engineer' },
      { packId: 'twilight', role: 'artist' },
      { packId: 'hellokitty', role: 'planner' },
    ]);
  });
});
