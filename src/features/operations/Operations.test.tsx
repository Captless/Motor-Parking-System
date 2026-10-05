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
  it('two-tap remove deletes unpaid parked entry', async () => {
    render(<ToastProvider><Operations /></ToastProvider>);
    await screen.findByText('PLATE 0');
    fireEvent.click(screen.getByLabelText('Remove PLATE 0'));
    expect(await screen.findByText('Delete')).toBeTruthy();
    expect(await db.transactions.get('p0')).toBeTruthy();
    fireEvent.click(screen.getByText('Delete'));
    await screen.findByText(/Removed PLATE 0/);
    expect(await db.transactions.get('p0')).toBeUndefined();
  });
  it('remove on paid entry deletes with same two-tap', async () => {
    await db.transactions.put({ id: 'p0', plateNumber: 'PLATE 0', checkInAt: Date.now(), fee: 20, status: 'parked', paymentStatus: 'paid', paidAt: Date.now(), firstPaidAt: Date.now() });
    render(<ToastProvider><Operations /></ToastProvider>);
    await screen.findByText('PLATE 0');
    fireEvent.click(screen.getByLabelText('Remove PLATE 0'));
    expect(await screen.findByText('Delete')).toBeTruthy();
    expect(await db.transactions.get('p0')).toBeTruthy();
    fireEvent.click(screen.getByText('Delete'));
    await screen.findByText(/Removed PLATE 0/);
    expect(await db.transactions.get('p0')).toBeUndefined();
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
  it('shows scroll-top on a short list with no count gate', async () => {
    await db.transactions.clear();
    await db.transactions.bulkAdd([
      { id: 's1', plateNumber: 'SOLO 1', checkInAt: Date.now(), fee: 20, status: 'parked' as const, paymentStatus: 'unpaid' as const },
    ]);
    render(<ToastProvider><Operations /></ToastProvider>);
    await screen.findByText('SOLO 1');
    Object.defineProperty(window, 'scrollY', { value: 800, writable: true, configurable: true });
    fireEvent.scroll(window);
    expect(await screen.findByLabelText('Scroll to top')).toBeTruthy();
  });
  it('header Unpaid is global outstanding, unaffected by search', async () => {
    const d = new Date(); d.setHours(8, 10, 0, 0);
    await db.transactions.add({ id: 'done-unpaid', plateNumber: 'DONE 1', checkInAt: d.getTime(), checkOutAt: d.getTime(), fee: 30, status: 'completed', paymentStatus: 'unpaid' });
    render(<ToastProvider><Operations /></ToastProvider>);
    // 25 parked × ₱20 plus the completed-unpaid ₱30.
    expect(await screen.findByText('₱530')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Search parked plates'), { target: { value: 'DONE' } });
    expect(await screen.findByText('₱530')).toBeTruthy();
  });
  it('Collected sub-line states today-only vs overnight holds', async () => {
    render(<ToastProvider><Operations /></ToastProvider>);
    await screen.findByText('PLATE 0');
    expect(await screen.findByText('today only')).toBeTruthy();
  });
  it('Collected sub-line names overnight holds', async () => {
    const y = new Date(); y.setDate(y.getDate() - 1); y.setHours(9, 10, 0, 0);
    await db.transactions.add({ id: 'held', plateNumber: 'HELD 1', checkInAt: y.getTime(), fee: 20, status: 'parked', paymentStatus: 'paid', paidAt: y.getTime(), firstPaidAt: y.getTime() });
    render(<ToastProvider><Operations /></ToastProvider>);
    expect(await screen.findByText('incl. ₱20 overnight')).toBeTruthy();
  });
});
