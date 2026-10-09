/**
 * Loads the bundled starter test templates (config/testTemplates.json) as
 * typed `TestTemplateDef[]` (Phase 8, builder UX roadmap) — same single
 * "raw config becomes typed" boundary as `reusableFlowsConfig.ts`.
 *
 * Static config, like the registry and the reusable-flow starter library:
 * never mutated at runtime (authoring a new template from the UI is out of
 * scope, same as the registry itself).
 */

import raw from './testTemplates.json';
import type { TestTemplateDef } from '../domain/types';

/** The bundled starter test templates (Login, CRUD, Form Validation, Search, API). */
export function getTestTemplates(): TestTemplateDef[] {
  return raw as unknown as TestTemplateDef[];
}
