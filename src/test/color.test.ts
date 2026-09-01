import { describe, expect, it } from 'vitest';
import { isHexColor, mixHex } from '../lib/color';

describe('brand colour helpers', () => {
  it('accepts only 6-digit hex', () => {
    expect(isHexColor('#2563EB')).toBe(true);
    expect(isHexColor('#fff')).toBe(false);
    expect(isHexColor('blue')).toBe(false);
  });

  it('mixes toward white for table-head fills', () => {
    const mixed = mixHex('#4f46e5', '#ffffff', 0.88);
    expect(mixed.startsWith('#')).toBe(true);
    expect(mixed).not.toBe('#4f46e5');
  });
});
