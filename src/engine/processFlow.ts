/**
 * Processing Engine (HLD §6.6, §12).
 *
 * A pure, deterministic compiler: it takes the Flow JSON tree and returns a
 * Cypress code string. It performs a depth-first traversal, resolves each node's
 * code template from the registry, interpolates props, and nests children.
 *
 * No React. No Redux. No side effects. Stateless between calls (HLD §6.6).
 */

import type { FlowNode } from '../domain/types';
import { getRegistry } from '../registry';
import type { Registry } from '../registry';
import { validateChain } from './chain';

/** Indentation unit applied to each nesting level (HLD §12 example output). */
const INDENT = '  ';

/** Template token replaced by the concatenated output of a node's children. */
const CHILDREN_PLACEHOLDER = '{{children}}';

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
 */
const OPTIONAL_SEGMENT = /\[\[(\w+):([\s\S]*?)\]\]/g;

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
 * Interpolate a node's props into its code template.
 *
 * Optional segments are resolved first (kept only when their prop is present),
 * then each `{{key}}` placeholder is replaced with its escaped value. Missing or
 * empty required values leave the `{{key}}` placeholder verbatim, so the gap is
 * visible rather than producing broken code (HLD §16, "Missing Required Props").
 */
function resolveProps(
  template: string,
  props: Record<string, string>,
): string {
  let code = template.replace(OPTIONAL_SEGMENT, (_match, key: string, inner: string) => {
    const value = props[key];
    return value !== undefined && value.trim() !== '' ? inner : '';
  });

  for (const [key, value] of Object.entries(props)) {
    if (value.trim() === '') continue;
    code = code.replaceAll(`{{${key}}}`, escapeSingleQuoted(value));
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
 * Render one chain child as its contribution to the composed expression.
 * `validateChain` has already confirmed every child has a chain role, so the
 * lookups here cannot miss.
 */
function generateChainFragment(node: FlowNode, reg: Registry): string {
  const def = reg.getFunction(node.type)!;
  const template =
    def.chainRole === 'root' ? stripTrailingSemicolon(def.codeTemplate) : (def.chainTemplate ?? '');
  return resolveProps(template, node.props ?? {});
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
function generateChain(node: FlowNode, reg: Registry): string {
  const children = node.children ?? [];
  const issues = validateChain(children, reg);
  if (issues.length > 0) {
    return `// [Invalid chain] — ${issues[0]}`;
  }

  const fragments = children.map((child) => generateChainFragment(child, reg));
  return `${joinChainFragments(fragments)};`;
}

/** Recursively generate the code for a single node and its subtree. */
function generateNode(node: FlowNode, reg: Registry): string {
  const def = reg.getBlock(node.type) ?? reg.getFunction(node.type);

  // Unknown node type (e.g. a stale export). Skip it with a placeholder comment
  // (HLD §16, "Unknown Node Type").
  if (def === null) {
    return `// [Unknown node: ${node.type}] — not found in registry`;
  }

  // A chain composes its children into one subject expression instead of the
  // ordinary independent-statement join below (Phase 2, engine/chain.ts).
  if ('childComposition' in def && def.childComposition === 'chain') {
    return generateChain(node, reg);
  }

  const childrenCode = node.children?.length
    ? node.children.map((child) => generateNode(child, reg)).join('\n')
    : '';

  let code = resolveProps(def.codeTemplate, node.props ?? {});
  code = code.replaceAll(CHILDREN_PLACEHOLDER, indent(childrenCode));
  return code;
}

/**
 * Compile a Flow JSON tree into Cypress code (HLD §6.6).
 *
 * @param root The root of the flow tree, or null for an empty canvas.
 * @param reg  Registry to resolve node definitions. Defaults to the application
 *             singleton, so callers use `processFlow(flow)`; tests may inject one.
 */
export function processFlow(
  root: FlowNode | null,
  reg: Registry = getRegistry(),
): string {
  if (root === null) return '';
  return generateNode(root, reg);
}
