/**
 * Curated "what's a reasonable next step" suggestions (Phase 7, builder UX
 * roadmap — in-canvas quick-add). A small, hand-authored adjacency map, not a
 * registry concept: unlike `allowedChildren` (which is a hard structural
 * rule, engine/chain.ts/dropRules.ts), this is purely an ordering hint for
 * the quick-add popover's "Recommended" section — every suggestion is still
 * re-checked against the real structural rules (`dropRules.ts`'s
 * `canDropInto`) before it's ever shown, so a stale or wrong entry here can
 * make a suggestion silently disappear, never produce an invalid one.
 *
 * Pure: no React, no Redux, no side effects.
 */

/** Suggested next command type(s), keyed by the immediately preceding sibling's type. */
const SUGGESTED_AFTER: Record<string, string[]> = {
  visit: ['get', 'contains', 'should'],
  get: ['click', 'type', 'should', 'find'],
  contains: ['click', 'should'],
  find: ['click', 'should'],
  click: ['should', 'get'],
  dblclick: ['should'],
  type: ['should', 'click'],
  clear: ['type'],
  check: ['should'],
  uncheck: ['should'],
  select: ['should'],
  intercept: ['visit', 'waitAlias'],
  waitAlias: ['should', 'get'],
  should: ['get', 'click', 'type'],
  fixture: ['as'],
};

/** Suggested first command type(s) for an empty container, keyed by the container's own type. */
const SUGGESTED_FIRST: Record<string, string[]> = {
  it: ['visit', 'get', 'contains'],
  describe: ['beforeEach', 'it'],
  beforeEach: ['visit', 'get'],
  afterEach: ['log'],
  within: ['get', 'click'],
  then: ['should', 'log'],
  each: ['should', 'log'],
};

/**
 * Suggested next-step types for the quick-add popover, in priority order —
 * after `previousType` when inserting mid-list, or `SUGGESTED_FIRST`'s entry
 * for `parentType` when inserting as the first child (`previousType: null`).
 * Returns an empty array for an unmapped type — not every command needs a
 * curated suggestion; the popover's ordinary search still covers it.
 */
export function suggestedNextTypes(parentType: string, previousType: string | null): string[] {
  if (previousType === null) return SUGGESTED_FIRST[parentType] ?? [];
  return SUGGESTED_AFTER[previousType] ?? [];
}
