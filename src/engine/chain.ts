/**
 * Chain semantics (Phase 2).
 *
 * A `chain` node's children compose into a single Cypress expression via
 * subject-passing (`cy.get(x).find(y).click()`) instead of the ordinary
 * independent-statement composition every other structural node uses. This module
 * is the single place that knows the rule for what may start or continue a chain —
 * driven entirely by each node's `chainRole` registry metadata, never by
 * branching on a command's `type` name. Both the UI (drop validation) and the
 * engine (code generation) import from here so the rule is defined exactly once.
 *
 * `chainRole` is not exclusive to leaf commands: a Phase 2 block node (`within`,
 * `then`, `each`) can be a `'subject'` continuation too, its chain fragment
 * expanding into a multi-line `.method(() => { ... })` instead of a bare
 * `.method(...)` suffix — see engine/processFlow.ts's `renderBody`.
 */

import type { FlowNode } from '../domain/types';
import type { Registry } from '../registry';

export type ChainRole = 'root' | 'subject';

/**
 * Derive a `chainRole: 'subject'` command's standalone `codeTemplate` from its
 * `chainTemplate` (Phase 1, "template duplication"). Every existing subject
 * command's standalone form is exactly `cy.get('{{selector}}')` followed by its
 * chain suffix and a semicolon — the self-anchoring rule (Phase 1) applied
 * generically — so the two templates never need to be authored separately.
 * `registry/registry.ts` calls this once per definition at load time to fill in
 * an omitted `codeTemplate`; a command whose standalone form must differ still
 * provides its own explicit `codeTemplate` and this function is never called for it.
 */
export function deriveStandaloneTemplate(chainTemplate: string): string {
  return `cy.get('{{selector}}')${chainTemplate};`;
}

/**
 * A node's chain role, or null if it has none (cannot appear in a chain at
 * all). Checks command definitions (functions.json) first, then structural
 * ones (building-blocks.json) — a Phase 2 block node (`within`, `then`, `each`)
 * is structural (it owns `allowedChildren`/`childComposition`) but can still
 * carry a `chainRole`, so both sources must be consulted the same way
 * `engine/processFlow.ts`'s definition lookup already does.
 */
export function getChainRole(type: string, reg: Registry): ChainRole | null {
  return reg.getFunction(type)?.chainRole ?? reg.getBlock(type)?.chainRole ?? null;
}

/**
 * Whether `candidateType` may be appended after `existingChildren` in a chain.
 * A chain's first command must be a `root` (it creates the initial subject);
 * every command after that must be a `subject` continuation. A command with no
 * chain role (e.g. `visit`) is never allowed, at any position.
 */
export function canContinueChain(
  existingChildren: FlowNode[],
  candidateType: string,
  reg: Registry,
): boolean {
  const role = getChainRole(candidateType, reg);
  if (role === null) return false;
  return existingChildren.length === 0 ? role === 'root' : role === 'subject';
}

/**
 * Validate a chain's full child list. Returns a list of human-readable issues;
 * empty means the chain is valid. Used at generation time (so an invalid chain
 * never silently produces nonsense code — HLD-style "Unknown Node Type" handling,
 * §23) and is reusable by tests/UI for the same rule.
 */
export function validateChain(children: FlowNode[], reg: Registry): string[] {
  if (children.length === 0) {
    return ['chain must contain at least one command'];
  }

  const issues: string[] = [];
  const built: FlowNode[] = [];

  for (const child of children) {
    if (!canContinueChain(built, child.type, reg)) {
      const role = getChainRole(child.type, reg);
      if (role === null) {
        issues.push(`"${child.type}" cannot be used inside a chain`);
      } else if (built.length === 0) {
        issues.push('chain must begin with a root command (e.g. get, contains)');
      } else {
        issues.push(
          `"${child.type}" cannot appear here — only one root command is allowed, and only at the start of the chain`,
        );
      }
    }
    built.push(child);
  }

  return issues;
}
