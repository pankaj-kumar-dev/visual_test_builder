/**
 * Optional localStorage persistence (Phase 1, HLD §15 "Optional Persistence").
 *
 * Persists only the authoritative Flow JSON — never `generatedCode`, which stays
 * a derived value (HLD §14) recomputed by `processFlow` on load, not stored.
 * Both directions go through `state/flowIO.ts`'s shared parse/serialize so a
 * corrupted or hand-edited localStorage entry is rejected exactly like a bad
 * import, not trusted as-is. Every operation is wrapped so a full quota, a
 * disabled storage API (e.g. a privacy setting), or a malformed entry can never
 * crash the app — persistence is a convenience, not a requirement (HLD §15).
 */

import type { FlowNode } from '../domain/types';
import { parseFlowJson, serializeFlow } from './flowIO';

const STORAGE_KEY = 'vtb_flow';

function storageAvailable(): boolean {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    // Some environments throw merely on referencing `localStorage` (e.g. a
    // browser with storage access blocked entirely).
    return false;
  }
}

/** The persisted flow, or `null` if there is none or it could not be restored. */
export function loadPersistedFlow(): FlowNode | null {
  if (!storageAvailable()) return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    return parseFlowJson(raw);
  } catch {
    // Either a storage-access failure or a rejected (malformed/stale) entry —
    // fail safe either way: start from an empty canvas rather than crash.
    return null;
  }
}

/** Persist the current flow. A quota or access failure is silently ignored. */
export function persistFlow(flow: FlowNode | null): void {
  if (!storageAvailable()) return;
  try {
    localStorage.setItem(STORAGE_KEY, serializeFlow(flow));
  } catch {
    // Quota exceeded or storage unavailable — persistence is optional.
  }
}

/** Remove the persisted flow entirely (used when the user starts a fresh canvas). */
export function clearPersistedFlow(): void {
  if (!storageAvailable()) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Persistence is optional.
  }
}
