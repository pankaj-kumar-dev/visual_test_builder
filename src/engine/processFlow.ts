/**
 * Processing Engine (HLD §6.6, §12).
 *
 * A pure, deterministic compiler: it takes the Flow JSON tree and returns a
 * Cypress code string. It performs a depth-first traversal, resolves each node's
 * code template from the registry, interpolates props, and nests children.
 *
 * No React. No Redux. No side effects. Stateless between calls (HLD §6.6).
 */

import type { CommandNodeDef, FlowNode, PropDef, ReusableFlowDef, StructuralNodeDef } from '../domain/types';
import { getDefaultReusableFlows } from '../config/reusableFlowsConfig';
import { getRegistry } from '../registry';
import type { Registry } from '../registry';
import { validateChain } from './chain';
import { getSchema } from './nodeContext';
import {
  bindingToken,
  isValidReferenceName,
  isValuePresent,
  numberToken,
  resolveBindingNames,
} from './propValue';
import { expandInvocation, findFlowDef } from './reusableFlows';
import { findSlotChild, slotHasContent } from './slots';

/** Either kind of node definition — wherever a chain fragment's def comes from. */
type NodeDef = StructuralNodeDef | CommandNodeDef;

/** Indentation unit applied to each nesting level (HLD §12 example output). */
const INDENT = '  ';

/** Template token replaced by the concatenated output of a node's children. */
const CHILDREN_PLACEHOLDER = '{{children}}';

/**
 * Template token replaced by a block node's resolved callback parameter list
 * (Phase 2, e.g. `then`'s `user` in `.then((user) => ...)`). Harmless no-op on
 * a template that doesn't contain it — see `renderBody`.
 */
const PARAMS_PLACEHOLDER = '{{params}}';

/** Prefix every non-empty line of a block by one indentation level. */
function indent(block: string): string {
  if (block === '') return '';
  return block
    .split('\n')
    .map((line) => (line === '' ? '' : INDENT + line))
    .join('\n');
}

/**
 * Optional template segment: `[[key: ... {{key}} ...]]`. The inner text is kept
 * only when `props[key]` is non-empty, otherwise the whole segment is dropped.
 * This lets a template express an optional argument (e.g. should()'s value)
 * without leaving an unresolved placeholder or a dangling separator.
 *
 * Phase 5: `key` may also be `slot:name` — the same mechanism generalized to
 * "this named slot has content" (`resolveProps`'s slot branch, below) rather
 * than "this prop has a value" — so a multi-slot template can express an
 * optional slot (`if`'s `else`) with no new syntax.
 */
const OPTIONAL_SEGMENT = /\[\[([\w:]+):([\s\S]*?)\]\]/g;

/** Template token replaced by a named slot's own rendered, indented children (Phase 5). */
const SLOT_PLACEHOLDER = /\{\{slot:(\w+)\}\}/g;

/**
 * Escape a prop value for insertion inside a single-quoted JavaScript string,
 * which is the context every `{{key}}` placeholder sits in. Without this, values
 * containing a quote, backslash, or newline would produce syntactically invalid
 * Cypress code (e.g. type('O'Brien')).
 */
function escapeSingleQuoted(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');
}

/**
 * Interpolate a node's props into its code template, using `schema` (the
 * node's resolved PropDef list — engine/nodeContext.ts's `getSchema`) to know
 * each key's type and required-ness.
 *
 * Optional segments are resolved first (kept only when their prop `isValuePresent`
 * — engine/propValue.ts — so an invalid numeric/binding value is treated the same
 * as an absent one, never smuggled through as literal text), then each remaining
 * `{{key}}` placeholder is replaced: a `number` field emits its normalized numeric
 * token, a `binding` field its validated identifier (both unquoted — "generator
 * safety", Phase 1/2), an `expression` field the raw trimmed text (unquoted and
 * unescaped — Phase 2's one deliberate trust boundary), a `reference-name` field
 * its validated identifier *quoted* like text (Phase 3 — `.as('name')` takes a
 * string, unlike a binding's bare parameter), everything else its escaped
 * string value.
 *
 * A *required* field with no usable value leaves its `{{key}}` placeholder
 * verbatim, so the gap is visible rather than producing broken code (HLD §16,
 * "Missing Required Props"). A field the schema marks *optional* never leaks its
 * placeholder either way — the final pass below strips any that are still bare
 * (e.g. a key altogether absent from `props`, or a non-numeric optional field) —
 * so an optional gap silently disappears instead of leaking `{{key}}` into output.
 */
function resolveProps(
  template: string,
  node: FlowNode,
  schema: PropDef[],
): string {
  const props = node.props ?? {};
  const schemaByKey = new Map(schema.map((def) => [def.key, def]));

  let code = template.replace(OPTIONAL_SEGMENT, (_match, key: string, inner: string) => {
    if (key.startsWith('slot:')) {
      return slotHasContent(node, key.slice('slot:'.length)) ? inner : '';
    }
    const def = schemaByKey.get(key);
    return def && isValuePresent(def, props[key]) ? inner : '';
  });

  for (const [key, value] of Object.entries(props)) {
    const def = schemaByKey.get(key);
    if (def?.type === 'number') {
      const token = numberToken(value);
      if (token !== null) code = code.replaceAll(`{{${key}}}`, token);
      continue;
    }
    if (def?.type === 'binding') {
      const token = bindingToken(value);
      if (token !== null) code = code.replaceAll(`{{${key}}}`, token);
      continue;
    }
    if (def?.type === 'expression') {
      if (value.trim() !== '') code = code.replaceAll(`{{${key}}}`, value.trim());
      continue;
    }
    if (def?.type === 'reference-name') {
      // Emitted quoted, like ordinary text (`.as('name')` takes a string) — but
      // gated on identifier shape, like `binding`, so an invalid name is treated
      // as absent rather than smuggled into a broken alias.
      if (isValidReferenceName(value)) code = code.replaceAll(`{{${key}}}`, escapeSingleQuoted(value));
      continue;
    }
    if (value.trim() === '') continue;
    code = code.replaceAll(`{{${key}}}`, escapeSingleQuoted(value));
  }

  for (const def of schema) {
    if (!def.required) code = code.split(`{{${def.key}}}`).join('');
  }

  return code;
}

/**
 * Strip a template's trailing statement semicolon so it can open a chain
 * expression instead of standing alone. Generic string surgery — works for any
 * `chainRole: 'root'` command's existing standalone `codeTemplate` (including
 * one built from optional segments, e.g. `contains`), so no second "chain root"
 * template needs to be authored per command.
 */
function stripTrailingSemicolon(template: string): string {
  return template.replace(/;\s*$/, '');
}

/**
 * Fill a template's `{{key}}` props, then its `{{children}}` and `{{params}}`
 * slots (Phase 2) — the one place any node's nested body is composed, whether
 * the template is a structural `codeTemplate` (generateNode) or a chain
 * fragment's `chainTemplate` (generateChainFragment). Both slots are filled
 * unconditionally: a template that doesn't contain one (the overwhelming
 * majority — an ordinary leaf command has no children and no bindings) simply
 * sees a no-op replace, so this needs no branch on whether `node`/`def` is
 * "block-shaped" — that distinction exists for validation and the tree UI
 * (`childComposition: 'block'`), not for generation, which stays uniform.
 */
function renderBody(
  template: string,
  node: FlowNode,
  def: NodeDef,
  reg: Registry,
  flows: ReusableFlowDef[],
  visiting: readonly string[],
): string {
  const schema = getSchema(node.type, reg);
  const childrenCode = node.children?.length
    ? node.children.map((child) => generateNode(child, reg, flows, visiting)).join('\n')
    : '';
  const params = resolveBindingNames(
    'bindsParameters' in def ? def.bindsParameters : undefined,
    node.props ?? {},
    schema,
  ).join(', ');

  let code = resolveProps(template, node, schema);
  code = code.replaceAll(CHILDREN_PLACEHOLDER, indent(childrenCode));
  code = code.replaceAll(PARAMS_PLACEHOLDER, params);
  // Phase 5: multi-slot composition — each `{{slot:name}}` becomes that named
  // slot's own children, generated and indented exactly like `{{children}}`
  // above. A slot with no matching wrapper (or an empty one) resolves to an
  // empty string, the same "gap disappears" rule optional segments already use.
  code = code.replace(SLOT_PLACEHOLDER, (_match, slotName: string) => {
    const slotChild = findSlotChild(node, slotName);
    const innerChildren = slotChild?.children ?? [];
    const inner = innerChildren.length
      ? innerChildren.map((child) => generateNode(child, reg, flows, visiting)).join('\n')
      : '';
    return indent(inner);
  });
  return code;
}

/**
 * Render one chain child as its contribution to the composed expression.
 * `validateChain` has already confirmed every child has a chain role, so the
 * lookups here cannot miss. A chain child resolves via `getFunction` (an
 * ordinary command) or `getBlock` (a Phase 2 block node — `within`, `then`,
 * `each` — which is structural but can still carry a `chainRole`; see
 * `engine/chain.ts`'s `getChainRole`).
 */
function generateChainFragment(
  node: FlowNode,
  reg: Registry,
  flows: ReusableFlowDef[],
  visiting: readonly string[],
): string {
  const def = (reg.getFunction(node.type) ?? reg.getBlock(node.type))!;
  const template =
    def.chainRole === 'root' ? stripTrailingSemicolon(def.codeTemplate!) : (def.chainTemplate ?? '');
  return renderBody(template, node, def, reg, flows, visiting);
}

/**
 * Join chain fragments into one expression (Phase 2, HLD-successor §13-style
 * formatting choice): a two-fragment chain (root + one continuation) reads fine
 * on one line; three or more break onto their own indented continuation lines,
 * each two spaces deeper than the opening `cy...` line — matching how a single
 * standalone statement is already indented one level per nesting depth.
 */
function joinChainFragments(fragments: string[]): string {
  if (fragments.length <= 2) return fragments.join('');
  const [head, ...rest] = fragments;
  return head + rest.map((fragment) => `\n${INDENT}${fragment}`).join('');
}

/**
 * Generate a `chain` node's composed subject expression (Phase 2, engine/chain.ts).
 * An invalid chain (empty, missing root, a non-chainable command, a second root)
 * never reaches template substitution — it renders as a comment placeholder,
 * mirroring the existing "Unknown Node Type" strategy (HLD §16) rather than
 * emitting broken Cypress.
 */
function generateChain(
  node: FlowNode,
  reg: Registry,
  flows: ReusableFlowDef[],
  visiting: readonly string[],
): string {
  const children = node.children ?? [];
  const issues = validateChain(children, reg);
  if (issues.length > 0) {
    return `// [Invalid chain] — ${issues[0]}`;
  }

  const fragments = children.map((child) => generateChainFragment(child, reg, flows, visiting));
  return `${joinChainFragments(fragments)};`;
}

/**
 * Generate a reusable-flow invocation (Phase 5, engine/reusableFlows.ts): expand
 * its definition's body (arguments substituted) and generate each resulting node
 * exactly as if it had been authored inline — the "expand into the existing
 * FlowNode/generation model" rule. `visiting` guards against a cyclic reference
 * actually recursing forever at generation time even if validation somehow
 * didn't catch it (engine/references.ts is the primary, static check).
 */
function generateReuseInvocation(
  node: FlowNode,
  reg: Registry,
  flows: ReusableFlowDef[],
  visiting: readonly string[],
): string {
  const flowId = node.props?.flowId;
  const def = findFlowDef(flowId, flows);
  if (!def) {
    return `// [Unknown reusable flow: ${flowId || '(none selected)'}]`;
  }
  if (visiting.includes(def.id)) {
    return `// [Cyclic reusable-flow reference] — "${def.name}" is already being expanded`;
  }

  const expanded = expandInvocation(node, flows) ?? [];
  const nextVisiting = [...visiting, def.id];
  return expanded.map((child) => generateNode(child, reg, flows, nextVisiting)).join('\n');
}

/** Recursively generate the code for a single node and its subtree. */
function generateNode(
  node: FlowNode,
  reg: Registry,
  flows: ReusableFlowDef[],
  visiting: readonly string[],
): string {
  const def = reg.getBlock(node.type) ?? reg.getFunction(node.type);

  // Unknown node type (e.g. a stale export). Skip it with a placeholder comment
  // (HLD §16, "Unknown Node Type").
  if (def === null) {
    return `// [Unknown node: ${node.type}] — not found in registry`;
  }

  // A chain composes its children into one subject expression instead of the
  // ordinary independent-statement join below (Phase 2, engine/chain.ts). A
  // reuse-composition node (Phase 5) expands a stored definition instead of
  // substituting its own (empty) codeTemplate. Both are single, generic
  // composition-mode dispatches — driven by registry metadata, never by
  // `node.type` — the same shape, not a per-command branch.
  if ('childComposition' in def && def.childComposition === 'chain') {
    return generateChain(node, reg, flows, visiting);
  }
  if ('childComposition' in def && def.childComposition === 'reuse') {
    return generateReuseInvocation(node, reg, flows, visiting);
  }

  return renderBody(def.codeTemplate!, node, def, reg, flows, visiting);
}

/**
 * Compile a Flow JSON tree into Cypress code (HLD §6.6).
 *
 * @param root  The root of the flow tree, or null for an empty canvas.
 * @param reg   Registry to resolve node definitions. Defaults to the application
 *              singleton, so callers use `processFlow(flow)`; tests may inject one.
 * @param flows Reusable-flow library (Phase 5) used to expand any `flowInvocation`
 *              node encountered. Defaults to the bundled starter library, the same
 *              way `reg` defaults to the bundled registry.
 */
export function processFlow(
  root: FlowNode | null,
  reg: Registry = getRegistry(),
  flows: ReusableFlowDef[] = getDefaultReusableFlows(),
): string {
  if (root === null) return '';
  return generateNode(root, reg, flows, []);
}
