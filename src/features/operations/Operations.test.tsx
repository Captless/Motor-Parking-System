import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { db } from '../../db/database';
import { ToastProvider } from '../../app/toast';
import Operations from './Operations';

describe('Operations scroll shortcuts', () => {
  beforeEach(async () => {
    await db.delete(); await db.open();
    await db.settings.put({ id: 'main', parkingFee: 20 });
    await db.transactions.bulkAdd(Array.from({ length: 25 }, (_, i) => ({
      id: `p${i}`, plateNumber: `PLATE ${i}`, checkInAt: Date.now() - i * 60000,
      fee: 20, status: 'parked' as const, paymentStatus: 'unpaid' as const,
    })));
    Object.defineProperty(window, 'scrollY', { value: 0, writable: true, configurable: true });
    window.scrollTo = vi.fn() as any;
  });
  it('shows faint scroll-top after deep scroll, jumps to top on tap', async () => {
    render(<ToastProvider><Operations /></ToastProvider>);
    await screen.findByText('PLATE 0');
    expect(screen.queryByLabelText('Scroll to top')).toBeNull();
    Object.defineProperty(window, 'scrollY', { value: 800, writable: true, configurable: true });
    fireEvent.scroll(window);
    expect(await screen.findByLabelText('Scroll to top')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Scroll to top'));
    expect(window.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
  });
});
