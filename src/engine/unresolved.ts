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

import type { FlowNode, NodeContext, ReusableFlowDef } from '../domain/types';
import { getDefaultReusableFlows } from '../config/reusableFlowsConfig';
import { getRegistry } from '../registry';
import type { Registry } from '../registry';
import { childContext, resolveSchema, ROOT_CONTEXT } from './nodeContext';
import { isValuePresent } from './propValue';
import { resolveInvocationSchema } from './reusableFlows';
import { hasInvalidSlotPlacement } from './slots';

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

      if (missingProps.length > 0 || isEmptyBlock || invalidSlot) {
        result.push({
          id: node.id,
          type: node.type,
          label: def.label,
          missing: [
            ...missingProps.map((prop) => prop.label),
            ...(isEmptyBlock ? ['Block body is empty'] : []),
            ...(invalidSlot ? ['Invalid slot placement'] : []),
          ],
          missingKeys: [
            ...missingProps.map((prop) => prop.key),
            ...(isEmptyBlock ? ['__body'] : []),
            ...(invalidSlot ? ['__slot'] : []),
          ],
        });
      }
    }
    node.children?.forEach((child, index) => walk(child, childContext(node, index, reg)));
  };

  walk(root, ROOT_CONTEXT);
  return result;
}
