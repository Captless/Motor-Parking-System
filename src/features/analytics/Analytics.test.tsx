import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { db } from '../../db/database';
import Analytics from './Analytics';

const at = (dayOff: number, h: number) => { const d = new Date(Date.now() - dayOff * 86400000); d.setHours(h, 10, 0, 0); return d.getTime(); };

describe('Analytics presets', () => {
  beforeEach(async () => {
    await db.delete(); await db.open();
    await db.settings.put({ id: 'main', parkingFee: 20 });
    await db.transactions.bulkAdd([
      { id: 'a1', plateNumber: 'AAA 1', checkInAt: at(0, 8), checkOutAt: at(0, 9), fee: 20, status: 'completed', paymentStatus: 'paid', paidAt: at(0, 9), firstPaidAt: at(0, 9) },
      { id: 'a2', plateNumber: 'BBB 2', checkInAt: at(2, 8), checkOutAt: at(2, 9), fee: 20, status: 'completed', paymentStatus: 'paid', paidAt: at(2, 9), firstPaidAt: at(2, 9) },
    ]);
  });
  it('defaults to All time covering every day', async () => {
    render(<Analytics />);
    const all = await screen.findByText('All time');
    expect(all.getAttribute('aria-pressed')).toBe('true');
    expect(await screen.findByText('₱40')).toBeTruthy();
    expect(screen.getByText(/entries · all time/)).toBeTruthy();
  });
});
