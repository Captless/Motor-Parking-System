import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const getBusinessOverview = vi.fn();
vi.mock('../../db/parkingRepository', () => ({ getBusinessOverview: (...a: unknown[]) => getBusinessOverview(...a) }));

import Analytics from './Analytics';

const emptySnapshot = () => ({
  now: Date.now(),
  scope: 'today',
  summary: { id: 'today', label: 'today', revenue: 0, bikes: 0, avgTicket: 0 },
  unpaid: { amount: '₱0', count: 0, oldestDays: null, debtors: [] },
  parkedNow: 0,
  days: new Map(), unpaidByDay: new Map(),
  invalidRecords: 0, hasRecords: false,
});

const show = () => render(<MemoryRouter><Analytics /></MemoryRouter>).container;

describe('Analytics failure handling', () => {
  afterEach(() => { cleanup(); getBusinessOverview.mockReset(); });

  it('shows the reason, keeps the page usable, and recovers on retry', async () => {
    getBusinessOverview.mockRejectedValueOnce(new Error('Local database is unavailable.'));
    const c = show();

    expect(await within(c).findByText('Local database is unavailable.')).toBeTruthy();
    // The owner keeps context and a way out instead of a dead screen.
    expect(within(c).getByText('Overview')).toBeTruthy();
    const retry = within(c).getByRole('button', { name: 'Try again' });
    expect(retry).toBeTruthy();

    getBusinessOverview.mockResolvedValueOnce(emptySnapshot());
    fireEvent.click(retry);
    await waitFor(() => expect(within(c).queryByText('Local database is unavailable.')).toBeNull());
    expect(within(c).getByText('Collected today')).toBeTruthy();
  });

  it('falls back to plain wording for a non-Error rejection', async () => {
    getBusinessOverview.mockRejectedValueOnce('boom');
    const c = show();
    expect(await within(c).findByText('Could not load analytics.')).toBeTruthy();
  });
});
