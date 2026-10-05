import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { db } from '../../db/database';
import { ToastProvider } from '../../app/toast';
import Settings from './Settings';

describe('Settings view/edit', () => {
  beforeEach(async () => {
    await db.delete(); await db.open();
    await db.settings.put({ id: 'main', parkingFee: 20 });
  });
  it('shows fee input with save button, no tap-to-edit', async () => {
    render(<ToastProvider><Settings /></ToastProvider>);
    const input = await screen.findByDisplayValue('20') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(screen.getByText('Save')).toBeTruthy();
    expect(screen.queryByLabelText('Edit parking fee')).toBeNull();
    expect(screen.queryByText('Cancel')).toBeNull();
  });
  it('saves fee and persists', async () => {
    render(<ToastProvider><Settings /></ToastProvider>);
    const input = await screen.findByDisplayValue('20') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '25' } });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(async () => expect((await db.settings.get('main'))?.parkingFee).toBe(25));
  });
  it('rejects invalid fee', async () => {
    render(<ToastProvider><Settings /></ToastProvider>);
    const input = await screen.findByDisplayValue('20') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.click(screen.getByText('Save'));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect((await db.settings.get('main'))?.parkingFee).toBe(20);
  });
  it('stamps last backup on export and shows today', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:x') as any;
    URL.revokeObjectURL = vi.fn() as any;
    render(<ToastProvider><Settings /></ToastProvider>);
    await screen.findByDisplayValue('20');
    fireEvent.click(screen.getByText('Export Backup'));
    expect(await screen.findByText(/Last backup: today/)).toBeTruthy();
    expect((await db.settings.get('main'))?.lastBackupAt).toBeDefined();
  });
  it('warns when backup stale or never', async () => {
    await db.settings.put({ id: 'main', parkingFee: 20, lastBackupAt: Date.now() - 10 * 86400000 });
    await db.transactions.add({ id: 'b1', plateNumber: 'P1', checkInAt: Date.now(), fee: 20, status: 'parked', paymentStatus: 'unpaid' });
    render(<ToastProvider><Settings /></ToastProvider>);
    const el = await screen.findByText(/Last backup: 10 days ago/);
    expect(el.className).toContain('text-amber-800');
  });
  it('shows one-line storage summary without protection trivia', async () => {
    render(<ToastProvider><Settings /></ToastProvider>);
    expect(await screen.findByText(/^\d+ records · backup ~.+$/)).toBeTruthy();
    expect(screen.queryByText(/protection:/)).toBeNull();
  });
  it('shows daily reports without lot-hours gate', async () => {
    render(<ToastProvider><Settings /></ToastProvider>);
    expect(await screen.findByText('Daily reports')).toBeTruthy();
    expect(screen.queryByLabelText('Edit lot hours')).toBeNull();
  });
  it('shows version with update date on one line', async () => {
    render(<ToastProvider><Settings /></ToastProvider>);
    expect(await screen.findByText(/^Local device only · v.+ \(updated \d{2}-\d{2}-\d{2}\)$/)).toBeTruthy();
  });
  it('collapses report list to 3 with show-all toggle', async () => {
    const day = (off: number) => { const d = new Date(); d.setHours(12, 0, 0, 0); return d.getTime() - off * 86400000; };
    await db.transactions.bulkAdd([0, 1, 2, 3].map(i => ({
      id: `r${i}`, plateNumber: `P${i}`, checkInAt: day(i), checkOutAt: day(i) + 3600000,
      fee: 20, status: 'completed' as const, paymentStatus: 'paid' as const, paidAt: day(i) + 3600000,
    })));
    render(<ToastProvider><Settings /></ToastProvider>);
    const toggle = await screen.findByText('Show all 4 days');
    expect(screen.getAllByText('Download').length).toBe(3);
    fireEvent.click(toggle);
    await waitFor(() => expect(screen.getAllByText('Download').length).toBe(4));
    fireEvent.click(screen.getByText('Show less'));
    await waitFor(() => expect(screen.getAllByText('Download').length).toBe(3));
  });
});
