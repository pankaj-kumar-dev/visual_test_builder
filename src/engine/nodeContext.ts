/**
 * Node context and context-aware property resolution (Scalable Builder UI, §16–§20).
 *
 * The property system used to answer "what properties exist for this node type?".
 * This module lets it answer the better question: "what properties are *valid for
 * this node in this context*?".
 *
 * Context is always **derived**, never stored: it is a pure function of the Flow
 * JSON (which node sits where) plus the registry metadata the chain engine already
 * uses (`childComposition`, and by extension a chain's positional subject rule).
 * There is no second context tree to keep in sync, and nothing here is serialized
 * into the Flow JSON.
 *
 * Visibility itself is metadata-driven: a PropDef declares `visibleWhen` /
 * `disabledWhen` conditions over the context flags, so a command becomes
 * context-aware by configuration — never by `if (node.type === 'first')`.
 *
 * Pure: no React, no Redux, no side effects. Both the property editor and
 * `engine/unresolved.ts` resolve schemas through here, so a field that is hidden
 * in a context can never be reported as an unresolvable missing value.
 */

import type {
  FlowNode,
  NodeContext,
  PropCondition,
  PropDef,
} from '../domain/types';
import { getRegistry } from '../registry';
import type { Registry } from '../registry';

/** Context of the flow's root node: no parent, no composition, no subject. */
export const ROOT_CONTEXT: NodeContext = {
  parentType: null,
  isInsideChain: false,
  hasSubject: false,
};

/**
 * Context of the child at `index` of `parent`.
 *
 * `isInsideChain` comes straight from the parent's registry metadata
 * (`childComposition === 'chain'`), the same flag the code generator branches on.
 * `hasSubject` is that chain's positional rule expressed once: inside a chain the
 * first child is the root command that *creates* the subject, and every later
 * child *receives* it. Outside a chain each command re-anchors itself, so no node
 * ever has an inherited subject.
 */
export function childContext(
  parent: FlowNode,
  index: number,
  reg: Registry = getRegistry(),
): NodeContext {
  const isInsideChain = reg.getBlock(parent.type)?.childComposition === 'chain';
  return {
    parentType: parent.type,
    isInsideChain,
    hasSubject: isInsideChain && index > 0,
  };
}

/**
 * Derive the context of the node with `nodeId` by locating it in the tree.
 *
 * Returns `ROOT_CONTEXT` for the root and for an id that is not in the tree (an
 * absent node has no containing composition, so the context-free schema applies —
 * exactly the pre-existing behavior).
 */
export function deriveNodeContext(
  root: FlowNode | null,
  nodeId: string,
  reg: Registry = getRegistry(),
): NodeContext {
  if (root === null) return ROOT_CONTEXT;

  const walk = (parent: FlowNode): NodeContext | null => {
    const children = parent.children ?? [];
    for (let index = 0; index < children.length; index += 1) {
      const child = children[index];
      if (child.id === nodeId) return childContext(parent, index, reg);
      const found = walk(child);
      if (found) return found;
    }
    return null;
  };

  return walk(root) ?? ROOT_CONTEXT;
}

/**
 * Evaluate one contextual condition. Every key present in the condition must equal
 * the corresponding context flag (AND). An absent or empty condition always holds,
 * so a PropDef with no conditions keeps its previous, always-visible behavior.
 */
export function matchesCondition(
  condition: PropCondition | undefined,
  context: NodeContext,
): boolean {
  if (!condition) return true;
  return (Object.keys(condition) as (keyof PropCondition)[]).every(
    (key) => condition[key] === context[key],
  );
}

/** A property field resolved against a node's context. */
export interface ResolvedProp {
  def: PropDef;
  /**
   * Applies conceptually but cannot be edited here (§21). A disabled field stays
   * visible, so it still participates in unresolved-property detection.
   */
  disabled: boolean;
}

/** The raw, context-free schema for a node type (structural props, else command props). */
export function getSchema(type: string, reg: Registry = getRegistry()): PropDef[] {
  return reg.getBlock(type)?.props ?? reg.getProps(type);
}

/**
 * Resolve a node type's schema in a context: drop the fields whose `visibleWhen`
 * does not hold, and flag the ones whose `disabledWhen` does.
 */
export function resolveSchema(
  type: string,
  context: NodeContext,
  reg: Registry = getRegistry(),
): ResolvedProp[] {
  return getSchema(type, reg)
    .filter((def) => matchesCondition(def.visibleWhen, context))
    .map((def) => ({ def, disabled: matchesCondition(def.disabledWhen, context) && !!def.disabledWhen }));
}

/**
 * The fields this node type declares but that are not applicable in this context.
 * Used to tell the user *why* a field is absent instead of silently dropping it.
 */
export function hiddenProps(
  type: string,
  context: NodeContext,
  reg: Registry = getRegistry(),
): PropDef[] {
  return getSchema(type, reg).filter((def) => !matchesCondition(def.visibleWhen, context));
}
