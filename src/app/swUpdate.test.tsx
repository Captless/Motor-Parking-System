import { describe, it, expect, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import SwUpdater, { shouldCheckUpdate, SW_CHECK_KEY, SW_CHECK_INTERVAL } from './swUpdate';

describe('shouldCheckUpdate throttle', () => {
  it('checks on first run, skips when fresh, rechecks when stale', () => {
    const now = Date.now();
    expect(shouldCheckUpdate(0, now)).toBe(true);
    expect(shouldCheckUpdate(now - 3600000, now)).toBe(false);
    expect(shouldCheckUpdate(now - SW_CHECK_INTERVAL - 1000, now)).toBe(true);
    expect(shouldCheckUpdate(now - SW_CHECK_INTERVAL, now)).toBe(true);
  });
});

describe('SwUpdater silence', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  it('renders nothing and never toasts', async () => {
    localStorage.setItem(SW_CHECK_KEY, String(Date.now()));
    const { container } = render(<SwUpdater />);
    await act(async () => {
      await new Promise(r => setTimeout(r, 50));
    });
    expect(container.innerHTML).toBe('');
    expect(document.querySelector('.toast')).toBeNull();
  });
});
