import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { db } from '../../db/database';
import Analytics from './Analytics';

const at = (dayOff: number, h: number) => { const d = new Date(Date.now() - dayOff * 86400000); d.setHours(h, 10, 0, 0); return d.getTime(); };
const peso = (n: number) => `₱${n.toLocaleString('en-PH')}`;

const seed = async (rows: unknown[]) => {
  await db.delete(); await db.open();
  await db.settings.put({ id: 'main', parkingFee: 20 });
  if (rows.length > 0) await db.transactions.bulkAdd(rows as never[]);
};

const paid = (id: string, dayOff: number, fee = 20) => ({
  id, plateNumber: id, checkInAt: at(dayOff, 8), checkOutAt: at(dayOff, 9), fee,
  status: 'completed', paymentStatus: 'paid', paidAt: at(dayOff, 9), firstPaidAt: at(dayOff, 9),
});

const show = () => render(<MemoryRouter><Analytics /></MemoryRouter>).container;
const tab = async (c: HTMLElement, name: string) => {
  fireEvent.click(await within(c).findByRole('button', { name }));
};

describe('Overview scopes', () => {
  afterEach(() => cleanup());

  beforeEach(async () => {
    await seed([paid('AAA 1', 0, 60), paid('BBB 2', 1, 40)]);
  });

  it('defaults to Today with parked-now and no comparisons anywhere', async () => {
    const c = show();
    const today = await within(c).findByRole('button', { name: 'Today' });
    expect(today.getAttribute('aria-pressed')).toBe('true');
    expect(await within(c).findByText('Collected today')).toBeTruthy();
    expect(within(c).getByText(peso(60))).toBeTruthy();
    expect(within(c).getByText('Bikes served today')).toBeTruthy();
    expect(within(c).getByText('0 parked now')).toBeTruthy();
    expect(within(c).queryByText(/vs yesterday|vs last|prior period|activity yet/)).toBeNull();
  });

  it('counts currently parked motorcycles in the hero', async () => {
    await seed([paid('P1', 0, 60), {
      id: 'P2', plateNumber: 'P2', checkInAt: at(0, 7), fee: 20, status: 'parked', paymentStatus: 'unpaid',
    }]);
    const c = show();
    expect(await within(c).findByText('1 parked now')).toBeTruthy();
  });

  it('7D scopes to the trailing 7 days with per-bike average', async () => {
    await seed([paid('A', 0, 60), paid('B', 6, 40), paid('C', 7, 30)]);
    const c = show();
    await tab(c, '7D');
    await waitFor(() => expect(within(c).getByText('Collected last 7 days')).toBeTruthy());
    expect(within(c).getByText(peso(100))).toBeTruthy();
    expect(within(c).getByText('Bikes served last 7 days')).toBeTruthy();
    expect(within(c).getByText('avg ₱50/bike')).toBeTruthy();
    expect(within(c).queryByText(/parked now/)).toBeNull();
  });

  it('30D scopes to the trailing 30 days', async () => {
    await seed([paid('A', 0, 60), paid('B', 29, 25), paid('C', 30, 999)]);
    const c = show();
    await tab(c, '30D');
    await waitFor(() => expect(within(c).getByText('Collected last 30 days')).toBeTruthy());
    expect(within(c).getByText(peso(85))).toBeTruthy();
    expect(within(c).getByText('avg ₱43/bike')).toBeTruthy();
  });

  it('All covers everything with no scope-only sub-lines', async () => {
    await seed([paid('A', 0, 60), paid('B', 400, 10)]);
    const c = show();
    await tab(c, 'All');
    await waitFor(() => expect(within(c).getByText('Collected all time')).toBeTruthy());
    expect(within(c).getByText(peso(70))).toBeTruthy();
    expect(within(c).getByText('Bikes served all time')).toBeTruthy();
  });

  it('keeps unpaid global across tab switches', async () => {
    await seed([paid('P1', 0, 20), {
      id: 'U1', plateNumber: 'U1', checkInAt: at(12, 7), checkOutAt: at(12, 8), fee: 35,
      status: 'completed', paymentStatus: 'unpaid',
    }]);
    const c = show();
    for (const name of ['7D', '30D', 'All', 'Today']) {
      await tab(c, name);
      await waitFor(() => expect(within(c).getByText('Unpaid')).toBeTruthy());
      expect(within(c).getByText(peso(35))).toBeTruthy();
      expect(within(c).getByText('1 unsettled record · oldest 12 days')).toBeTruthy();
    }
  });

  it('lists oldest debtors as history links capped at three with a See all link', async () => {
    await seed([
      { id: 'D1', plateNumber: 'AAA 1', checkInAt: at(12, 7), checkOutAt: at(12, 8), fee: 20, status: 'completed', paymentStatus: 'unpaid' },
      { id: 'D2', plateNumber: 'BBB 2', checkInAt: at(3, 7), fee: 40, status: 'parked', paymentStatus: 'unpaid' },
      { id: 'D3', plateNumber: 'AAA 1', checkInAt: at(1, 7), fee: 20, status: 'parked', paymentStatus: 'unpaid' },
      { id: 'D4', plateNumber: 'CCC 3', checkInAt: at(5, 7), checkOutAt: at(5, 8), fee: 25, status: 'completed', paymentStatus: 'unpaid' },
    ]);
    const c = show();
    await waitFor(() => expect(c.querySelectorAll('.ov-debtor').length).toBe(3));
    const rows = [...c.querySelectorAll('.ov-debtor')] as HTMLAnchorElement[];
    expect(rows[0].textContent).toContain('AAA 1');
    expect(rows[0].textContent).toContain('⚠ repeat');
    expect(rows[0].getAttribute('href')).toBe('/history?payment=unpaid&q=AAA%201');
    const seeAll = within(c).getByText('See all ›') as HTMLAnchorElement;
    expect(seeAll.getAttribute('href')).toBe('/history?payment=unpaid');
  });

  it('explains empty state without inventing numbers', async () => {
    await seed([]);
    const c = show();
    expect(await within(c).findByText('No records yet. Completed and settled records will appear here.')).toBeTruthy();
    expect(within(c).queryByText('See all ›')).toBeNull();
  });
});
