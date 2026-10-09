/**
 * Human-readable tree-row summaries (Phase 6, builder UX roadmap).
 *
 * Deliberately separate from `processFlow.ts`'s `resolveProps`: that function
 * fills a *code* template — it escapes values for a single-quoted JS string,
 * strips optional segments, and leaves a required-but-missing placeholder
 * verbatim so the gap is visible in generated code. None of that applies to a
 * plain display string in the tree UI, so this is its own small, pure
 * function rather than a reuse of the code-generation path.
 *
 * Pure: no React, no Redux, no side effects.
 */

/** Every `{{key}}` token in `template`. */
const PLACEHOLDER = /\{\{(\w+)\}\}/g;

/**
 * Fill `template`'s `{{key}}` placeholders with `props`' raw (trimmed, never
 * escaped) values. Returns `null` — rather than a partially-filled string —
 * if any placeholder has no usable (non-empty) value, so a caller can fall
 * back to a different summary instead of showing something like
 * `#email → ""`.
 */
export function renderSummaryTemplate(
  template: string,
  props: Record<string, string> | undefined,
): string | null {
  let resolved = true;
  const text = template.replace(PLACEHOLDER, (_match, key: string) => {
    const value = props?.[key]?.trim();
    if (!value) {
      resolved = false;
      return '';
    }
    return value;
  });
  return resolved ? text : null;
}
