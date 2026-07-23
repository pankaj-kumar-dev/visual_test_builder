/**
 * Detect nodes with unresolved required properties (HLD §16).
 *
 * A pure traversal (no React) that mirrors the code generator: for each node it
 * resolves the property schema from the registry and reports required props whose
 * value is empty. The output panel renders this as an inline warning.
 */

import type { FlowNode } from '../domain/types';
import { getRegistry } from '../registry';
import type { Registry } from '../registry';

export interface UnresolvedNode {
  type: string;
  label: string;
  missing: string[];
}

export function findUnresolvedNodes(
  root: FlowNode | null,
  reg: Registry = getRegistry(),
): UnresolvedNode[] {
  if (root === null) return [];

  const result: UnresolvedNode[] = [];

  const walk = (node: FlowNode): void => {
    const def = reg.getBlock(node.type) ?? reg.getFunction(node.type);
    if (def) {
      // Structural props live on the block; command props in the registry.
      const schema = reg.getBlock(node.type)?.props ?? reg.getProps(node.type);
      const missing = schema
        .filter((prop) => prop.required && (node.props?.[prop.key] ?? '').trim() === '')
        .map((prop) => prop.label);
      if (missing.length > 0) {
        result.push({ type: node.type, label: def.label, missing });
      }
    }
    node.children?.forEach(walk);
  };

  walk(root);
  return result;
}
