import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { db } from '../db/database';
import { ToastProvider } from './toast';
import { ACCESS_REVOKED } from '../lib/access';
import App from './App';
import Lockout from './Lockout';

describe('lock wall', () => {
  it('kill switch is on', () => {
    expect(ACCESS_REVOKED).toBe(true);
  });
  it('App renders only the wall, no nav or operations', () => {
    const router = createMemoryRouter([{ path: '/', element: <App /> }]);
    render(<RouterProvider router={router} />);
    expect(screen.getByText('Service ended')).toBeTruthy();
    expect(screen.getByText('Export Backup')).toBeTruthy();
    expect(screen.queryByText('Operations')).toBeNull();
    expect(screen.queryByText('History')).toBeNull();
    expect(screen.queryByText('Settings')).toBeNull();
  });
  it('Export Backup downloads the on-device records', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:x') as any;
    URL.revokeObjectURL = vi.fn() as any;
    await db.transactions.add({ id: 'w1', plateNumber: 'ABC 1234', checkInAt: Date.now(), fee: 30, status: 'parked', paymentStatus: 'unpaid' });
    render(<ToastProvider><Lockout /></ToastProvider>);
    fireEvent.click(screen.getByText('Export Backup'));
    expect(await screen.findByText('Backup downloaded.')).toBeTruthy();
    await db.transactions.delete('w1');
  });
});
