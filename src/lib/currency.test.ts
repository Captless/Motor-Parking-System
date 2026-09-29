import { describe, it, expect } from 'vitest'; import { formatPesoCompact } from './currency';
describe('formatPesoCompact', () => {
  it('shows exact below 1000', () => { expect(formatPesoCompact(0)).toBe('₱0'); expect(formatPesoCompact(140)).toBe('₱140'); expect(formatPesoCompact(999)).toBe('₱999'); });
  it('compacts thousands', () => { expect(formatPesoCompact(1000)).toBe('₱1k'); expect(formatPesoCompact(1200)).toBe('₱1.2k'); expect(formatPesoCompact(9900)).toBe('₱9.9k'); expect(formatPesoCompact(12000)).toBe('₱12k'); expect(formatPesoCompact(12500)).toBe('₱13k'); });
});
