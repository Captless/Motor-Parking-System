import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, render, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { weekStart, addDays } from '../../lib/dates';
import { db } from '../../db/database';
import Analytics from './Analytics';

const H = 3600000;
const mk = (dayStart: number, id: string, fee: number) => ({
  id, plateNumber: id, checkInAt: dayStart + 8 * H, checkOutAt: dayStart + 9 * H, fee,
  status: 'completed', paymentStatus: 'paid', paidAt: dayStart + 9 * H, firstPaidAt: dayStart + 9 * H,
});

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

describe('Analytics overview', () => {
  afterEach(() => cleanup());

  beforeEach(async () => {
    await seed([paid('AAA 1', 0, 60), paid('BBB 2', 1, 40)]);
  });

  it('shows the today hero against yesterday with parked-now count', async () => {
    const c = show();
    await within(c).findByText('Collected today');
    const hero = within(c).getByText('Collected today').parentElement as HTMLElement;
    expect(within(hero).getByText(peso(60))).toBeTruthy();
    expect(within(hero).getByText('+₱20 vs yesterday')).toBeTruthy();
    expect(within(c).getByText('Bikes today')).toBeTruthy();
    expect(within(c).getByText('0 parked now')).toBeTruthy();
  });

  it('counts currently parked motorcycles in the hero', async () => {
    await seed([paid('P1', 0, 60), {
      id: 'P2', plateNumber: 'P2', checkInAt: at(0, 7), fee: 20, status: 'parked', paymentStatus: 'unpaid',
    }]);
    const c = show();
    expect(await within(c).findByText('1 parked now')).toBeTruthy();
  });

  it('shows week to date against the equivalent prior stretch', async () => {
    const ws = weekStart(Date.now());
    await seed([mk(ws, 'W1', 60), mk(ws, 'W2', 40), mk(addDays(ws, -3), 'W3', 30)]);
    const c = show();
    await within(c).findByText('This week');
    const week = within(c).getByText('This week').closest('section') as HTMLElement;
    expect(within(week).getByText(peso(100))).toBeTruthy();
    expect(within(week).getByText('+₱70 · +233.3% vs last week')).toBeTruthy();
    expect(within(week).getByText('2 · avg ₱50/bike')).toBeTruthy();
  });

  it('keeps unpaid beside revenue with the oldest age and a history link', async () => {
    await seed([paid('P1', 0, 20), {
      id: 'U1', plateNumber: 'U1', checkInAt: at(12, 7), checkOutAt: at(12, 8), fee: 35,
      status: 'completed', paymentStatus: 'unpaid',
    }]);
    const c = show();
    const card = await within(c).findByText('Unpaid');
    const box = card.closest('.kpi') as HTMLElement;
    expect(within(box).getByText(peso(35))).toBeTruthy();
    expect(within(box).getByText('1 unsettled record · oldest 12 days')).toBeTruthy();
    const link = within(box).getByText('See all ›') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/history?payment=unpaid');
    const revenueKpi = within(c).getByText('Collected today').parentElement as HTMLElement;
    expect(within(revenueKpi).getByText(peso(20))).toBeTruthy();
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
    expect(rows[1].textContent).toContain('CCC 3');
    expect(rows[1].textContent).not.toContain('repeat');
    expect(rows[2].textContent).toContain('BBB 2');
    const more = within(c).getByText('See all ›') as HTMLAnchorElement;
    expect(more.getAttribute('href')).toBe('/history?payment=unpaid');
  });

  it('falls back to See all when debtors lack usable dates', async () => {
    await seed([paid('P1', 0, 20), {
      id: 'U1', plateNumber: 'U1', checkInAt: Number.NaN, fee: 20, status: 'completed', paymentStatus: 'unpaid',
    }]);
    const c = show();
    await within(c).findByText('Unpaid');
    expect(c.querySelector('.ov-debtor')).toBeNull();
    expect(within(c).getByText('See all ›')).toBeTruthy();
  });

  it('explains empty state without inventing numbers', async () => {
    await seed([]);
    const c = show();
    expect(await within(c).findByText('No records yet. Completed and settled records will appear here.')).toBeTruthy();
    expect(within(c).getByText('no activity yet')).toBeTruthy();
    expect(within(c).queryByText('See all ›')).toBeNull();
  });
});
