import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ErrorBoundary from './ErrorBoundary';

function Boom(): never { throw new Error('bang'); }

describe('ErrorBoundary', () => {
  it('renders fallback with reload', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('Reload app')).toBeTruthy();
    (console.error as any).mockRestore();
  });
  it('reloads on button tap', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const reload = vi.fn();
    Object.defineProperty(window, 'location', { value: { reload }, writable: true });
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    fireEvent.click(screen.getByText('Reload app'));
    expect(reload).toHaveBeenCalled();
    (console.error as any).mockRestore();
  });
});
