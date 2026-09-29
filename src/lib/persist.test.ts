import { describe, it, expect, vi } from 'vitest';

describe('storage persistence guards', () => {
  it('tolerates missing storage API (jsdom has none)', () => {
    expect((navigator as any).storage).toBeUndefined();
  });
  it('request + read round-trip when API exists', async () => {
    const persist = vi.fn().mockResolvedValue(true);
    const persisted = vi.fn().mockResolvedValue(true);
    Object.defineProperty(navigator, 'storage', { value: { persist, persisted }, writable: true, configurable: true });
    await navigator.storage.persist();
    expect(persist).toHaveBeenCalled();
    expect(await navigator.storage.persisted()).toBe(true);
    // @ts-expect-error cleanup for other suites
    delete navigator.storage;
  });
});
