import { describe, it, expect } from 'vitest'; import { formatPeso } from './currency';
describe('formatPeso', () => {
  it('formats whole pesos with the sign', () => { expect(formatPeso(0)).toBe('₱0'); expect(formatPeso(1250)).toBe('₱1,250'); });
});
