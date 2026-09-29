import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { db } from '../../db/database';
import { ToastProvider } from '../../app/toast';
import History from './History';

const at = (dayOff: number, h: number) => { const d = new Date(Date.now() - dayOff * 86400000); d.setHours(h, 10, 0, 0); return d.getTime(); };

describe('History actions', () => {
  beforeEach(async () => {
    await db.delete(); await db.open();
    await db.settings.put({ id: 'main', parkingFee: 20 });
    await db.transactions.bulkAdd([
      { id: 'today-paid', plateNumber: 'AAA 1', checkInAt: at(0, 8), checkOutAt: at(0, 9), fee: 20, status: 'completed', paymentStatus: 'paid', paidAt: at(0, 9) },
      { id: 'old-paid', plateNumber: 'BBB 2', checkInAt: at(2, 8), checkOutAt: at(2, 9), fee: 20, status: 'completed', paymentStatus: 'paid', paidAt: at(2, 9) },
      { id: 'old-unpaid', plateNumber: 'CCC 3', checkInAt: at(2, 8), checkOutAt: at(2, 9), fee: 20, status: 'completed', paymentStatus: 'unpaid' },
    ]);
  });
  it('Undo only on today-paid, Settle on unpaid, dash on old-paid', async () => {
    render(<ToastProvider><History /></ToastProvider>);
    const undos = await screen.findAllByText('Undo');
    expect(undos.length).toBe(1);
    expect((await screen.findAllByText('Settle')).length).toBe(1);
    const row = undos[0].closest('tr')!;
    expect(row.textContent).toContain('AAA 1');
    const settleRow = (await screen.findAllByText('Settle'))[0].closest('tr')!;
    expect(settleRow.textContent).toContain('CCC 3');
  });
});
