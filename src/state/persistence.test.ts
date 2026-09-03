/**
 * localStorage persistence tests (Phase 1, HLD §15 "Optional Persistence").
 *
 * The Vitest environment is `node` (vitest.config.ts), which has no real
 * `localStorage`, so each test stubs a small in-memory implementation via
 * `vi.stubGlobal` — this also lets tests exercise failure modes (malformed
 * entry, a `setItem` that throws for a full quota) a real browser API wouldn't
 * let us trigger on demand.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearPersistedFlow, loadPersistedFlow, persistFlow } from './persistence';
import type { FlowNode } from '../domain/types';

function fakeLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    _store: store,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('persistFlow / loadPersistedFlow', () => {
  it('returns null when nothing has been persisted', () => {
    vi.stubGlobal('localStorage', fakeLocalStorage());
    expect(loadPersistedFlow()).toBeNull();
  });

  it('round-trips a realistic flow', () => {
    vi.stubGlobal('localStorage', fakeLocalStorage());
    const flow: FlowNode = {
      id: 'root',
      type: 'describe',
      props: { label: 'Suite' },
      children: [{ id: 'visit-1', type: 'visit', props: { url: '/login' } }],
    };
    persistFlow(flow);
    expect(loadPersistedFlow()).toEqual(flow);
  });

  it('round-trips an empty (null) flow', () => {
    vi.stubGlobal('localStorage', fakeLocalStorage());
    persistFlow(null);
    expect(loadPersistedFlow()).toBeNull();
  });

  it('never persists generatedCode — only the Flow JSON is written', () => {
    const storage = fakeLocalStorage();
    vi.stubGlobal('localStorage', storage);
    persistFlow({ id: 'root', type: 'visit', props: { url: '/x' } });
    const raw = storage._store.get('vtb_flow')!;
    expect(raw).not.toMatch(/generatedCode/);
    expect(JSON.parse(raw)).toEqual({ id: 'root', type: 'visit', props: { url: '/x' } });
  });

  it('ignores a malformed stored entry rather than throwing', () => {
    const storage = fakeLocalStorage();
    storage.setItem('vtb_flow', '{ not valid json');
    vi.stubGlobal('localStorage', storage);
    expect(loadPersistedFlow()).toBeNull();
  });

  it('ignores a stored entry naming an unknown node type rather than throwing', () => {
    const storage = fakeLocalStorage();
    storage.setItem('vtb_flow', JSON.stringify({ id: 'root', type: 'not-a-real-command' }));
    vi.stubGlobal('localStorage', storage);
    expect(loadPersistedFlow()).toBeNull();
  });

  it('a setItem failure (e.g. quota exceeded) is swallowed, not thrown', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {},
    });
    expect(() => persistFlow({ id: 'root', type: 'visit', props: {} })).not.toThrow();
  });

  it('is a no-op, not a throw, when localStorage itself is unavailable', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(() => persistFlow({ id: 'root', type: 'visit', props: {} })).not.toThrow();
    expect(loadPersistedFlow()).toBeNull();
  });

  it('clearPersistedFlow removes the stored entry', () => {
    const storage = fakeLocalStorage();
    vi.stubGlobal('localStorage', storage);
    persistFlow({ id: 'root', type: 'visit', props: {} });
    expect(loadPersistedFlow()).not.toBeNull();
    clearPersistedFlow();
    expect(loadPersistedFlow()).toBeNull();
  });
});
