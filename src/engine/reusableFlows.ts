/**
 * Reusable, parameterized flow templates (Phase 5, "Reusable Flow Architecture").
 *
 * Kept as four distinct concepts, per the design brief, sharing no state:
 *  - **Definition** (`ReusableFlowDef`, domain/types.ts) — the stored template:
 *    an id/name, a `params` list, and a `body` of ordinary FlowNodes.
 *  - **Invocation** — an ordinary FlowNode of the single registered type
 *    `flowInvocation` (`childComposition: 'reuse'`, building-blocks.json), whose
 *    `props.flowId` names the definition and whose other props are the actual
 *    argument values.
 *  - **Parameter** — one entry of a definition's `params` (`FlowParamDef`).
 *  - **Argument** — the invocation's own prop value bound to a parameter's key.
 *  - **Expanded flow** — the definition's `body`, deep-copied with every
 *    `{{paramKey}}` occurrence in a prop value replaced by that invocation's
 *    argument (`expandInvocation`, below). This never mutates the definition,
 *    and the result is nothing but ordinary FlowNodes — no second AST — fed
 *    straight back into the existing generator (`engine/processFlow.ts`'s one
 *    `childComposition === 'reuse'` dispatch).
 *
 * Pure: no React, no Redux, no side effects.
 */

import type { FlowNode, FlowParamDef, PropDef, ReusableFlowDef } from '../domain/types';

/** The single, static registry entry every reusable-flow invocation uses. */
export const FLOW_INVOCATION_TYPE = 'flowInvocation';

/** The invocation's own prop key naming which definition it invokes. */
export const FLOW_ID_KEY = 'flowId';

/** A `{{paramKey}}` token inside a definition body node's prop value. */
const PARAM_TOKEN = /\{\{(\w+)\}\}/g;

/** The definition with `flowId`, or null if unknown/absent — one lookup, reused everywhere. */
export function findFlowDef(
  flowId: string | undefined,
  flows: ReusableFlowDef[],
): ReusableFlowDef | null {
  if (!flowId) return null;
  return flows.find((def) => def.id === flowId) ?? null;
}

/**
 * The invocation node's *dynamic* property schema: a fixed `flowId` picker
 * (options = every known definition id) followed by one field per parameter
 * of whichever definition is currently selected — reusing `PropDef`/`PropType`
 * exactly, so the existing generic `PropertyField` renders it with no new
 * per-flow component (PropertyEditor.tsx), and the existing generic
 * required-field detection (engine/unresolved.ts) catches a missing/invalid
 * argument with no new validator.
 */
export function resolveInvocationSchema(node: FlowNode, flows: ReusableFlowDef[]): PropDef[] {
  const flowIdField: PropDef = {
    key: FLOW_ID_KEY,
    label: 'Flow',
    type: 'dropdown',
    required: true,
    options: flows.map((def) => def.id),
  };
  const selected = findFlowDef(node.props?.[FLOW_ID_KEY], flows);
  const paramFields: PropDef[] = (selected?.params ?? []).map((param) => ({
    key: param.key,
    label: param.label,
    type: param.type,
    required: param.required,
    options: param.options,
  }));
  return [flowIdField, ...paramFields];
}

/**
 * Replace every `{{paramKey}}` in `value` that names a declared parameter with
 * that invocation's argument (empty string if the argument itself is absent —
 * the same "no usable value" fallback the rest of the generator uses for a gap
 * rather than leaving a hole). A token that names no declared parameter is left
 * verbatim — it is either literal text or a typo, and this is not the layer
 * that reports the difference (engine/unresolved.ts does, via the schema above).
 */
export function interpolate(
  value: string,
  args: Record<string, string>,
  params: FlowParamDef[],
): string {
  return value.replace(PARAM_TOKEN, (match, key: string) => {
    if (!params.some((param) => param.key === key)) return match;
    return args[key] ?? '';
  });
}

/** Deep-copy `node`, interpolating every prop value against `args`/`params`. */
function substituteParams(
  node: FlowNode,
  args: Record<string, string>,
  params: FlowParamDef[],
): FlowNode {
  const props = Object.fromEntries(
    Object.entries(node.props ?? {}).map(([key, value]) => [key, interpolate(value, args, params)]),
  );
  const expanded: FlowNode = { id: node.id, type: node.type, props };
  if (node.children) {
    expanded.children = node.children.map((child) => substituteParams(child, args, params));
  }
  return expanded;
}

/**
 * Expand an invocation node into its definition's body, arguments substituted —
 * the one place "Reusable Flow Definition + Invocation + Arguments -> Expanded
 * Flow" actually happens. Returns null when `flowId` names no known definition
 * (an unresolved/deleted reference); the caller renders that as a placeholder,
 * matching the existing "never emit broken code" strategy for any other unknown
 * reference (HLD §16).
 */
export function expandInvocation(node: FlowNode, flows: ReusableFlowDef[]): FlowNode[] | null {
  const def = findFlowDef(node.props?.[FLOW_ID_KEY], flows);
  if (!def) return null;
  const args = node.props ?? {};
  return def.body.map((bodyNode) => substituteParams(bodyNode, args, def.params));
}

/** Every flow id a definition's body invokes, in document order, one level deep. */
function invokedFlowIds(body: FlowNode[]): string[] {
  const ids: string[] = [];
  const walk = (node: FlowNode) => {
    if (node.type === FLOW_INVOCATION_TYPE) {
      const id = node.props?.[FLOW_ID_KEY];
      if (id) ids.push(id);
    }
    node.children?.forEach(walk);
  };
  body.forEach(walk);
  return ids;
}

/**
 * Whether invoking `flowId` would eventually invoke itself again, transitively,
 * through the reusable-flow library alone (independent of any particular
 * canvas usage) — a static property of the library data, checked the same way
 * whether a definition is invoked from the canvas, from another definition, or
 * not invoked anywhere yet. Returns the cyclic id chain (for a readable
 * message) or null. `visiting` is an internal accumulator; callers omit it.
 */
export function findFlowCycle(
  flowId: string,
  flows: ReusableFlowDef[],
  visiting: readonly string[] = [],
): string[] | null {
  if (visiting.includes(flowId)) return [...visiting, flowId];
  const def = findFlowDef(flowId, flows);
  if (!def) return null;
  const nextVisiting = [...visiting, flowId];
  for (const invokedId of invokedFlowIds(def.body)) {
    const found = findFlowCycle(invokedId, flows, nextVisiting);
    if (found) return found;
  }
  return null;
}
