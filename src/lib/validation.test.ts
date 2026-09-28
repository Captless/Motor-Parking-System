import { describe, it, expect } from 'vitest'; import { normalizePlate } from './validation';
describe('plate', () => { it('normalizes', () => { expect(normalizePlate(' abc  1234 ')).toBe('ABC 1234'); }); });
