/**
 * Loads the bundled reusable-flow starter library (config/reusableFlows.json —
 * Login, Search) as typed `ReusableFlowDef[]` (HLD-successor pattern: the single
 * boundary where raw config becomes typed, mirroring `registry/index.ts`).
 *
 * This is deliberately not part of the Registry: a `ReusableFlowDef` is Redux
 * state (state/builderSlice.ts seeds its initial `reusableFlows` from here),
 * not static node configuration, because a future authoring UI will need to
 * change it at runtime. `engine/processFlow.ts` also defaults its `flows`
 * parameter from here, the same way it already defaults `reg` from
 * `registry/index.ts`'s `getRegistry()`.
 */

import raw from './reusableFlows.json';
import type { ReusableFlowDef } from '../domain/types';

/** The bundled starter reusable-flow library (Login, Search). */
export function getDefaultReusableFlows(): ReusableFlowDef[] {
  return raw as unknown as ReusableFlowDef[];
}
