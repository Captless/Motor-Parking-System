import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
  it('single tap settles immediately', async () => {
    render(<ToastProvider><History /></ToastProvider>);
    fireEvent.click((await screen.findAllByText('Settle'))[0]);
    await screen.findByText(/Settled ₱20 for CCC 3/);
    expect((await db.transactions.get('old-unpaid'))?.paymentStatus).toBe('paid');
  });
  it('separate fixed action column, date-only paid line', async () => {
    const { container } = render(<ToastProvider><History /></ToastProvider>);
    await screen.findByText('Settle');
    expect(container.querySelectorAll('table')[0].querySelectorAll('thead th').length).toBe(6);
    expect(screen.getAllByText('Action').length).toBeGreaterThan(0);
    const paidAt = container.querySelector('.hist-paid-at')?.textContent ?? '';
    expect(paidAt).toMatch(/[A-Z][a-z]{2} \d{1,2}/);
    expect(paidAt).not.toMatch(/\d{1,2}:\d{2}/);
    const actions = [...container.querySelectorAll('td.act-col')];
    expect(actions.length).toBe(3);
    expect(container.querySelectorAll('th.st-col').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('td.st-col').length).toBe(3);
    const unpaid = actions.find(c => c.closest('tr')?.textContent?.includes('CCC 3'));
    expect(unpaid?.querySelector('button')?.textContent).toBe('Settle');
  });
});
