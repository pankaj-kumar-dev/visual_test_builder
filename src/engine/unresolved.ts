/**
 * Detect nodes with unresolved required properties, and (Phase 2) empty block
 * bodies (HLD §16).
 *
 * A pure traversal (no React) that mirrors the code generator: for each node it
 * resolves the property schema from the registry and reports required props whose
 * value is empty.
 *
 * This is the single source of truth for "unresolved" state — the code drawer's
 * warning list, the canvas's per-node highlighting, and the property editor's
 * per-field highlighting all derive from this same result (via
 * `app/hooks.ts`'s `useUnresolvedNodes`) rather than each re-implementing the rule.
 *
 * The traversal carries each node's derived `NodeContext` and resolves its schema
 * through `engine/nodeContext.ts` — the same resolution the property editor uses.
 * A field that context hides is therefore never reported here, so the drawer can
 * never raise a warning about a field the user has no way to fill in.
 *
 * Phase 2: a block node (`childComposition: 'block'` — `within`, `then`, `each`,
 * `session`) with zero children still generates valid, harmless code (an empty
 * callback shell, same as an empty `beforeEach`), but is pointless — the reason
 * anyone drops one is to hold a body. Rather than a hard generation error (HLD's
 * "never emit broken code" is about syntax, not about being meaningful), an empty
 * block is reported through this exact same mechanism: a visible warning, using a
 * synthetic `__body` key that maps to no real PropDef (so it never spuriously
 * highlights a property field — only the canvas row and the drawer's list).
 */

import type { FlowNode, NodeContext, ReusableFlowDef, StructuralNodeDef } from '../domain/types';
import { getDefaultReusableFlows } from '../config/reusableFlowsConfig';
import { getRegistry } from '../registry';
import type { Registry } from '../registry';
import { childContext, resolveSchema, ROOT_CONTEXT } from './nodeContext';
import { isValuePresent } from './propValue';
import { resolveInvocationSchema } from './reusableFlows';
import { hasInvalidSlotPlacement, slotHasContent } from './slots';

/**
 * Phase 5 completion: human-readable messages for a `requiredSlots` slot with
 * no content (`try`'s `try`/`catch`) — the multi-slot equivalent of the
 * existing `childComposition: 'block'` empty-body check just below, generic
 * over any declaring host via `StructuralNodeDef.requiredSlots`.
 */
function emptyRequiredSlotIssues(
  node: FlowNode,
  requiredSlots: string[] | undefined,
): { missing: string[]; missingKeys: string[] } {
  const missing: string[] = [];
  const missingKeys: string[] = [];
  for (const name of requiredSlots ?? []) {
    if (!slotHasContent(node, name)) {
      missing.push(`"${name}" is empty`);
      missingKeys.push(`__slot:${name}`);
    }
  }
  return { missing, missingKeys };
}

/**
 * Phase 5 completion: bounds-checking for `StructuralNodeDef.childCardinality`
 * (e.g. `switch` needing at least one `case` and at most one `default`) —
 * counts `node`'s own ordinary children by type and compares against each
 * declared rule. Generic: driven entirely by the registry metadata, never by
 * `node.type`, so it applies to any future construct with the same shape.
 */
function cardinalityIssues(
  node: FlowNode,
  childCardinality: StructuralNodeDef['childCardinality'],
): { missing: string[]; missingKeys: string[] } {
  const missing: string[] = [];
  const missingKeys: string[] = [];
  if (!childCardinality) return { missing, missingKeys };

  const counts = new Map<string, number>();
  for (const child of node.children ?? []) {
    counts.set(child.type, (counts.get(child.type) ?? 0) + 1);
  }

  for (const [type, rule] of Object.entries(childCardinality)) {
    const count = counts.get(type) ?? 0;
    const label = rule.label ?? type;
    if (rule.min !== undefined && count < rule.min) {
      missing.push(`At least ${rule.min} ${label} is required`);
      missingKeys.push(`__cardinality:${type}`);
    }
    if (rule.max !== undefined && count > rule.max) {
      missing.push(`At most ${rule.max} ${label} is allowed`);
      missingKeys.push(`__cardinality:${type}`);
    }
  }
  return { missing, missingKeys };
}

/**
 * Phase 6: how seriously the validation panel should treat this node's
 * structural issue(s) — mirrors `engine/references.ts`'s
 * `SemanticIssueSeverity`/`SEVERITY_BY_KIND` pattern, now applied to
 * structural checks too (they previously had no severity concept at all and
 * were always treated as errors downstream). `'error'` means a required
 * field is genuinely missing or the structure is invalid (bad slot
 * placement, a cardinality rule violated); `'warning'` means the generated
 * code is still valid, just pointless — an empty block body or empty
 * required slot, per this file's own long-standing "visible warning, not a
 * hard generation error" rule for those two checks (see `childComposition:
 * 'block'` and `requiredSlots` above). A node with both kinds of issue at
 * once reports `'error'`, since at least one of its problems does need
 * fixing regardless of the other.
 */
export type UnresolvedSeverity = 'error' | 'warning';

export interface UnresolvedNode {
  /** The node's own id — lets consumers match this entry back to a specific
   * FlowNode instance (for canvas/property highlighting), not just its type. */
  id: string;
  type: string;
  label: string;
  /** Human-readable labels of the missing required props, for display. */
  missing: string[];
  /** PropDef keys of the missing required props, for field-level highlighting. */
  missingKeys: string[];
  severity: UnresolvedSeverity;
}

export function findUnresolvedNodes(
  root: FlowNode | null,
  reg: Registry = getRegistry(),
  flows: ReusableFlowDef[] = getDefaultReusableFlows(),
): UnresolvedNode[] {
  if (root === null) return [];

  const result: UnresolvedNode[] = [];

  const walk = (node: FlowNode, context: NodeContext): void => {
    const def = reg.getBlock(node.type) ?? reg.getFunction(node.type);
    if (def) {
      const isReuseInvocation = 'childComposition' in def && def.childComposition === 'reuse';

      // Context-aware schema: structural props from the block, command props from
      // the registry, minus whatever this context hides (engine/nodeContext.ts).
      // Phase 5: a reusable-flow invocation's schema is dynamic (its flowId plus
      // one field per parameter of whichever definition is selected) — the exact
      // same generic "required field missing" rule, applied to that schema
      // instead, catches a missing/invalid argument with no separate check.
      const missingProps = (
        isReuseInvocation
          ? resolveInvocationSchema(node, flows)
          : resolveSchema(node.type, context, reg).map(({ def: propDef }) => propDef)
      ).filter((prop) => prop.required && !isValuePresent(prop, node.props?.[prop.key]));

      const isEmptyBlock =
        'childComposition' in def &&
        def.childComposition === 'block' &&
        (node.children?.length ?? 0) === 0;

      // Phase 5: multi-slot structural validity (engine/slots.ts) — driven
      // entirely by `StructuralNodeDef.slots`, never by `node.type`, so any
      // future multi-slot construct is checked the same way with no new code.
      const invalidSlot = hasInvalidSlotPlacement(node, 'slots' in def ? def.slots : undefined);

      // Phase 5 completion: a required-but-empty named slot (`try`'s
      // `try`/`catch`) and child-type cardinality bounds (`switch`'s
      // "at least one case, at most one default") — both generic, metadata-driven,
      // and additive to the checks above rather than replacing any of them.
      const requiredSlotIssues = emptyRequiredSlotIssues(
        node,
        'requiredSlots' in def ? def.requiredSlots : undefined,
      );
      const cardinality = cardinalityIssues(
        node,
        'childCardinality' in def ? def.childCardinality : undefined,
      );

      // Error-level: a genuinely missing/invalid value or a broken structure.
      // Warning-level (by this file's own long-standing rule above): a body
      // or slot that's merely empty, not wrong. Any error-level issue wins.
      const hasErrorIssue =
        missingProps.length > 0 || invalidSlot || cardinality.missing.length > 0;
      const hasWarningIssue = isEmptyBlock || requiredSlotIssues.missing.length > 0;

      if (hasErrorIssue || hasWarningIssue) {
        result.push({
          id: node.id,
          type: node.type,
          label: def.label,
          missing: [
            ...missingProps.map((prop) => prop.label),
            ...(isEmptyBlock ? ['Block body is empty'] : []),
            ...(invalidSlot ? ['Invalid slot placement'] : []),
            ...requiredSlotIssues.missing,
            ...cardinality.missing,
          ],
          missingKeys: [
            ...missingProps.map((prop) => prop.key),
            ...(isEmptyBlock ? ['__body'] : []),
            ...(invalidSlot ? ['__slot'] : []),
            ...requiredSlotIssues.missingKeys,
            ...cardinality.missingKeys,
          ],
          severity: hasErrorIssue ? 'error' : 'warning',
        });
      }
    }
    node.children?.forEach((child, index) => walk(child, childContext(node, index, reg)));
  };

  walk(root, ROOT_CONTEXT);
  return result;
}
