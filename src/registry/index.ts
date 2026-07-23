/**
 * Builds the single application-wide Registry from the bundled configuration
 * files (HLD §6.2: "loaded once at startup"). Configuration is bundled at build
 * time (HLD §18.2), so these imports are static.
 *
 * Consumers import `registry` (or the `Registry` type) from this module — never
 * the JSON files directly (HLD §9).
 */

import blocks from '../config/building-blocks.json';
import functions from '../config/functions.json';
import commandProps from '../config/function-props.json';
import type {
  CommandNodeDef,
  PropDef,
  StructuralNodeDef,
} from '../domain/types';
import { createRegistry, type Registry } from './registry';

let cached: Registry | null = null;

/**
 * Return the application-wide Registry, building it once on first call (HLD §6.2).
 *
 * The build is lazy so that a RegistryLoadError (HLD §16) surfaces when the caller
 * chooses to load it — at startup, inside a try/catch — rather than as an
 * uncatchable error during module import. Subsequent calls return the cached one.
 *
 * The JSON is trusted, bundled configuration; it is asserted to the domain types
 * here (the single boundary where raw config becomes typed) and structurally
 * validated inside createRegistry (HLD §16).
 */
export function getRegistry(): Registry {
  if (cached === null) {
    cached = createRegistry({
      blocks: blocks as StructuralNodeDef[],
      functions: functions as CommandNodeDef[],
      commandProps: commandProps as Record<string, PropDef[]>,
    });
  }
  return cached;
}

export { createRegistry, RegistryLoadError } from './registry';
export type { Registry, RegistrySources } from './registry';


