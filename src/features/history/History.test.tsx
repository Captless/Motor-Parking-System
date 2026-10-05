import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { db } from '../../db/database';
import { ToastProvider } from '../../app/toast';
import History from './History';

const show = (entry = '/history') => render(
  <MemoryRouter initialEntries={[entry]}><ToastProvider><History /></ToastProvider></MemoryRouter>,
);

const at = (dayOff: number, h: number) => { const d = new Date(Date.now() - dayOff * 86400000); d.setHours(h, 10, 0, 0); return d.getTime(); };

describe('History actions', () => {
  beforeEach(async () => {
    await db.delete(); await db.open();
    await db.settings.put({ id: 'main', parkingFee: 20 });
    await db.transactions.bulkAdd([
      { id: 'today-paid', plateNumber: 'AAA 1', checkInAt: at(0, 8), checkOutAt: at(0, 9), fee: 20, status: 'completed', paymentStatus: 'paid', paidAt: at(0, 9), firstPaidAt: at(0, 9) },
      { id: 'old-paid', plateNumber: 'BBB 2', checkInAt: at(2, 8), checkOutAt: at(2, 9), fee: 20, status: 'completed', paymentStatus: 'paid', paidAt: at(2, 9), firstPaidAt: at(2, 9) },
      { id: 'old-unpaid', plateNumber: 'CCC 3', checkInAt: at(2, 8), checkOutAt: at(2, 9), fee: 20, status: 'completed', paymentStatus: 'unpaid' },
      { id: 'cross-day-paid', plateNumber: 'DDD 4', checkInAt: at(2, 8), checkOutAt: at(2, 9), fee: 20, status: 'completed', paymentStatus: 'paid', paidAt: at(1, 9), firstPaidAt: at(1, 9) },
    ]);
  });
  it('Undo only on today-paid, Settle on unpaid, dash on old-paid', async () => {
    show();
    const undos = await screen.findAllByText('Undo');
    expect(undos.length).toBe(1);
    expect((await screen.findAllByText('Settle')).length).toBe(1);
    const row = undos[0].closest('tr')!;
    expect(row.textContent).toContain('AAA 1');
    const settleRow = (await screen.findAllByText('Settle'))[0].closest('tr')!;
    expect(settleRow.textContent).toContain('CCC 3');
  });
  it('single tap settles immediately', async () => {
    show();
    fireEvent.click((await screen.findAllByText('Settle'))[0]);
    await screen.findByText(/Settled ₱20 for CCC 3/);
    expect((await db.transactions.get('old-unpaid'))?.paymentStatus).toBe('paid');
  });
  it('separate fixed action column, date-only paid line', async () => {
    const { container } = show();
    await screen.findByText('Settle');
    expect(container.querySelectorAll('table')[0].querySelectorAll('thead th').length).toBe(6);
    expect(screen.getAllByText('Action').length).toBeGreaterThan(0);
    const paidAt = container.querySelector('.hist-paid-at')?.textContent ?? '';
    expect(paidAt).toMatch(/[A-Z][a-z]{2} \d{1,2}/);
    expect(paidAt).not.toMatch(/\d{1,2}:\d{2}/);
    const actions = [...container.querySelectorAll('td.act-col')];
    expect(actions.length).toBe(4);
    expect(container.querySelectorAll('th.st-col').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('td.st-col').length).toBe(4);
    const unpaid = actions.find(c => c.closest('tr')?.textContent?.includes('CCC 3'));
    expect(unpaid?.querySelector('button')?.textContent).toBe('Settle');
  });
  it('paid date shows only when the payment day differs from the batch day', async () => {
    const { container } = show();
    await screen.findByText('Settle');
    const rowFor = (plate: string) => [...container.querySelectorAll('tbody tr')].find(r => r.textContent?.includes(plate));
    expect(rowFor('AAA 1')?.querySelector('.hist-paid-at')).toBeNull();
    expect(rowFor('BBB 2')?.querySelector('.hist-paid-at')).toBeNull();
    expect(rowFor('CCC 3')?.querySelector('.hist-paid-at')).toBeNull();
    const cross = rowFor('DDD 4');
    const paidAt = cross?.querySelector('.hist-paid-at')?.textContent ?? '';
    expect(paidAt).toMatch(/[A-Z][a-z]{2} \d{1,2}/);
    expect(paidAt).not.toMatch(/\d{1,2}:\d{2}/);
    expect(container.querySelectorAll('.hist-paid-at').length).toBe(1);
    expect(paidAt).toBe(new Date(at(1, 9)).toLocaleDateString([], { month: 'short', day: 'numeric' }));
  });
  it('caps the day list at 90 with a show-older reveal', async () => {
    await db.transactions.clear();
    const base = new Date(); base.setHours(8, 10, 0, 0);
    await db.transactions.bulkAdd(Array.from({ length: 100 }, (_, i) => {
      const d = new Date(base.getTime() - i * 86400000);
      return { id: `old-${i}`, plateNumber: `OLD ${i}`, checkInAt: d.getTime(), checkOutAt: d.getTime(), fee: 20, status: 'completed', paymentStatus: 'paid', paidAt: d.getTime(), firstPaidAt: d.getTime() };
    }));
    const { container } = show();
    await screen.findByText('OLD 0');
    expect(container.querySelectorAll('.hist-batch').length).toBe(90);
    fireEvent.click(screen.getByRole('button', { name: /Show all 100 days/ }));
    await waitFor(() => expect(container.querySelectorAll('.hist-batch').length).toBe(100));
  });
  it('settles a still-parked record from the Unpaid view', async () => {
    await db.transactions.add({ id: 'pk9', plateNumber: 'PK 9', checkInAt: at(0, 7), fee: 20, status: 'parked', paymentStatus: 'unpaid' });
    show('/history?payment=unpaid');
    fireEvent.click(await screen.findByLabelText('Settle PK 9'));
    await screen.findByText(/Settled ₱20 for PK 9/);
    expect((await db.transactions.get('pk9'))?.paymentStatus).toBe('paid');
  });
  it('presets the unpaid filter from ?payment=unpaid', async () => {
    const { container } = show('/history?payment=unpaid');
    const group = await screen.findByRole('group', { name: 'Payment filter' });
    expect(within(group).getByRole('button', { name: 'Unpaid' }).getAttribute('aria-pressed')).toBe('true');
    await screen.findByText('Settle');
    expect(container.textContent).toContain('CCC 3');
    expect(container.textContent).not.toContain('AAA 1');
  });
  it('presets the search box from ?q=', async () => {
    const { container } = show('/history?payment=unpaid&q=CCC');
    await screen.findByText('Settle');
    expect((screen.getByPlaceholderText('Search plate…') as HTMLInputElement).value).toBe('CCC');
    expect(container.textContent).toContain('CCC 3');
    expect(container.textContent).not.toContain('AAA 1');
  });
  it('shows parked debtors under Unpaid with a Parked marker and working Settle', async () => {
    await db.transactions.add({ id: 'pk1', plateNumber: 'PK 1', checkInAt: at(0, 7), fee: 20, status: 'parked', paymentStatus: 'unpaid' });
    const { container } = show('/history?payment=unpaid');
    const row = await screen.findByText('PK 1');
    const tr = row.closest('tr')!;
    expect(tr.textContent).toContain('Parked');
    expect(tr.querySelector('.hist-parked')).toBeTruthy();
    expect(tr.querySelector('button')?.textContent).toBe('Settle');
    expect(container.textContent).toContain('Due ₱40');
    expect(container.textContent).toContain('Total (2) · Due ₱40');
  });
  it('shows Due instead of ₱0 collected under the unpaid filter', async () => {
    const { container } = show();
    await screen.findByText('Settle');
    const group = within(container).getByRole('group', { name: 'Payment filter' });
    fireEvent.click(within(group).getByRole('button', { name: 'Unpaid' }));
    await waitFor(() => expect(container.textContent).toContain('1 records · Due ₱20'));
    expect(container.querySelector('.hist-due')).toBeTruthy();
    fireEvent.click(within(group).getByRole('button', { name: 'Paid' }));
    await waitFor(() => expect(container.textContent).toContain('3 records · ₱60 collected'));
  });
});
