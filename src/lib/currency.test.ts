import { describe, it, expect } from 'vitest'; import { formatPeso, formatPesoCompact } from './currency';
describe('formatPeso', () => {
  it('formats whole pesos with the sign', () => { expect(formatPeso(0)).toBe('₱0'); expect(formatPeso(1250)).toBe('₱1,250'); });
  it('compacts thousands for tight cells', () => { expect(formatPesoCompact(999)).toBe('₱999'); expect(formatPesoCompact(1200)).toBe('₱1.2k'); expect(formatPesoCompact(12000)).toBe('₱12k'); });
});
