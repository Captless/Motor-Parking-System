import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useToday } from './useToday';
import { startOfDay } from './dates';

describe('useToday', () => {
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
  it('returns today start and updates on day change', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useToday(1000));
    expect(result.current).toBe(startOfDay(Date.now()));
    const tomorrow = new Date(Date.now() + 86400000);
    vi.setSystemTime(tomorrow);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(result.current).toBe(startOfDay(tomorrow.getTime()));
  });
});
