/**
 * Detect nodes with unresolved required properties (HLD §16).
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
 */

import type { FlowNode, NodeContext } from '../domain/types';
import { getRegistry } from '../registry';
import type { Registry } from '../registry';
import { childContext, resolveSchema, ROOT_CONTEXT } from './nodeContext';

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
): UnresolvedNode[] {
  if (root === null) return [];

  const result: UnresolvedNode[] = [];

  const walk = (node: FlowNode, context: NodeContext): void => {
    const def = reg.getBlock(node.type) ?? reg.getFunction(node.type);
    if (def) {
      // Context-aware schema: structural props from the block, command props from
      // the registry, minus whatever this context hides (engine/nodeContext.ts).
      const missingProps = resolveSchema(node.type, context, reg)
        .map(({ def: propDef }) => propDef)
        .filter((prop) => prop.required && (node.props?.[prop.key] ?? '').trim() === '');
      if (missingProps.length > 0) {
        result.push({
          id: node.id,
          type: node.type,
          label: def.label,
          missing: missingProps.map((prop) => prop.label),
          missingKeys: missingProps.map((prop) => prop.key),
        });
      }
    }
    node.children?.forEach((child, index) => walk(child, childContext(node, index, reg)));
  };

  walk(root, ROOT_CONTEXT);
  return result;
}
