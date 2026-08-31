/**
 * Chain semantics (Phase 2).
 *
 * A `chain` node's children compose into a single Cypress expression via
 * subject-passing (`cy.get(x).find(y).click()`) instead of the ordinary
 * independent-statement composition every other structural node uses. This module
 * is the single place that knows the rule for what may start or continue a chain —
 * driven entirely by each command's `chainRole` registry metadata, never by
 * branching on a command's `type` name. Both the UI (drop validation) and the
 * engine (code generation) import from here so the rule is defined exactly once.
 */

import type { FlowNode } from '../domain/types';
import type { Registry } from '../registry';

export type ChainRole = 'root' | 'subject';

/** A command's chain role, or null if it has none (cannot appear in a chain at all). */
export function getChainRole(type: string, reg: Registry): ChainRole | null {
  return reg.getFunction(type)?.chainRole ?? null;
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
