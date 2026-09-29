import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ToastProvider, useToast } from './toast';

function Probe() {
  const toast = useToast();
  return (<div>
    <button onClick={() => toast.ok('Saved.')} >ok-btn</button>
    <button onClick={() => toast.err('Failed.')} >err-btn</button>
  </div>);
}

describe('toast', () => {
  afterEach(() => { vi.useRealTimers(); });
  it('renders nothing initially, shows ok toast', () => {
    render(<ToastProvider><Probe /></ToastProvider>);
    expect(screen.queryByRole('status')).toBeNull();
    fireEvent.click(screen.getByText('ok-btn'));
    expect(screen.getByRole('status').textContent).toBe('Saved.');
  });
  it('ok never overwrites a displayed err, err always wins', () => {
    vi.useFakeTimers();
    render(<ToastProvider><Probe /></ToastProvider>);
    fireEvent.click(screen.getByText('err-btn'));
    fireEvent.click(screen.getByText('ok-btn'));
    expect(screen.getByRole('alert').textContent).toBe('Failed.');
    fireEvent.click(screen.getByText('ok-btn'));
    fireEvent.click(screen.getByText('err-btn'));
    expect(screen.getByRole('alert').textContent).toBe('Failed.');
  });
  it('auto-dismisses ok after 3s, err after 6s, tap dismisses early', () => {
    vi.useFakeTimers();
    render(<ToastProvider><Probe /></ToastProvider>);
    fireEvent.click(screen.getByText('ok-btn'));
    expect(screen.queryByRole('status')).not.toBeNull();
    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.queryByRole('status')).toBeNull();
    fireEvent.click(screen.getByText('err-btn'));
    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.queryByRole('alert')).not.toBeNull();
    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(screen.getByText('err-btn'));
    const alert = screen.getByRole('alert');
    fireEvent.click(alert);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
