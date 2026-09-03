/**
 * Shared prop-value resolution rules (Phase 1, "generator safety" + "number
 * property type"; Phase 2, "binding"/"expression" types and callback-parameter
 * resolution). A single place decides what counts as a *present, usable* value
 * for a property, so the code generator (engine/processFlow.ts), the
 * unresolved-property detector (engine/unresolved.ts), and NodeContext's
 * binding-scope derivation (engine/nodeContext.ts) can never disagree about
 * whether a field still needs attention or what name it resolves to — the
 * Global Code Quality Rule against duplicating validation rules, applied to
 * prop values specifically.
 *
 * Pure: no React, no Redux, no side effects.
 */

import type { PropDef } from '../domain/types';

/** Whether `raw` parses as a finite JS number once trimmed (`''` does not). */
export function isValidNumber(raw: string): boolean {
  const trimmed = raw.trim();
  if (trimmed === '') return false;
  return Number.isFinite(Number(trimmed));
}

/**
 * The exact numeric token to emit in generated code (e.g. `"0"`, `"5"`), or
 * `null` when `raw` is empty or not a valid number. `Number(...)` round-trips
 * through `String` so `"007"` emits `7` and `"1e2"` emits `100` — always a
 * literal JavaScript can parse, never the raw user text.
 */
export function numberToken(raw: string): string | null {
  return isValidNumber(raw) ? String(Number(raw.trim())) : null;
}

/** A bare JS identifier — no dots, brackets, quotes, or whitespace. */
const BINDING_NAME_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** Whether `raw` is safe to emit unquoted as a callback parameter name. */
export function isValidBindingName(raw: string): boolean {
  return BINDING_NAME_PATTERN.test(raw.trim());
}

/**
 * The exact identifier to emit (e.g. `"user"`), or `null` when `raw` is empty
 * or not identifier-shaped. Mirrors `numberToken`: emitted unquoted, never
 * escaped as a string — Phase 2 "generator safety" applied to callback
 * bindings (e.g. `then`'s `.then((user) => ...)`, never `.then((2cool) => ...)`).
 */
export function bindingToken(raw: string): string | null {
  return isValidBindingName(raw) ? raw.trim() : null;
}

/**
 * A reference-producing name is validated with the same shape rule as a
 * binding (`isValidBindingName`) — reused deliberately, not duplicated — but
 * kept a distinct function/type tag because the two concepts have different
 * lifetimes (Phase 3, engine/references.ts vs Phase 2, engine/nodeContext.ts):
 * a binding is closure-scoped, a reference is a flow-wide, ordered name.
 */
export function isValidReferenceName(raw: string): boolean {
  return isValidBindingName(raw);
}

/**
 * Whether `raw` is a usable value for `def` — the single rule both the
 * generator and the unresolved-property detector apply. A `number` field needs
 * a parseable number, a `binding`/`reference-name` field needs a valid
 * identifier; every other field (including `expression`, Phase 2's
 * raw/trusted type) just needs non-whitespace content.
 */
export function isValuePresent(def: PropDef, raw: string | undefined): boolean {
  if (raw === undefined) return false;
  if (def.type === 'number') return isValidNumber(raw);
  if (def.type === 'binding' || def.type === 'reference-name') return isValidBindingName(raw);
  return raw.trim() !== '';
}

/**
 * Resolve one `bindsParameters` entry (Phase 2, StructuralNodeDef) against a
 * node's own props/schema: a literal token (no `{{key}}`, e.g. `"$el"`) passes
 * through unchanged; a `"{{key}}"` reference resolves to that prop's value —
 * in its safe emitted form (`numberToken`/`bindingToken`) for a typed field —
 * or `null` if the field has no usable value, so the caller can drop it from
 * the callback signature entirely rather than leave a hole. Shared by the
 * generator (engine/processFlow.ts, building the actual `{{params}}` text) and
 * `engine/nodeContext.ts` (deriving `bindingsInScope` for descendants) so the
 * two can never disagree about what a block actually binds.
 */
export function resolveBindingToken(
  token: string,
  props: Record<string, string>,
  schema: PropDef[],
): string | null {
  const match = /^\{\{(\w+)\}\}$/.exec(token.trim());
  if (!match) return token;

  const key = match[1];
  const def = schema.find((d) => d.key === key);
  const raw = props[key];
  if (!def || !isValuePresent(def, raw)) return null;
  if (def.type === 'number') return numberToken(raw);
  if (def.type === 'binding') return bindingToken(raw);
  return raw!.trim();
}

/** Resolve a whole `bindsParameters` list, dropping any entry with no usable value. */
export function resolveBindingNames(
  bindsParameters: string[] | undefined,
  props: Record<string, string>,
  schema: PropDef[],
): string[] {
  return (bindsParameters ?? [])
    .map((token) => resolveBindingToken(token, props, schema))
    .filter((name): name is string => name !== null);
}
