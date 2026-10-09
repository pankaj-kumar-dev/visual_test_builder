/**
 * "Build Test" compile-ready export (Phase 9, builder UX roadmap).
 *
 * Assembles the two files a real Cypress project needs from a flow that
 * invokes reusable flows: a main spec (`processFlowAsSpec`, calling
 * `cy.<flowId>(...)` at each invocation site) and a `commands.ts` defining
 * exactly the custom commands that spec actually calls
 * (`generateReusableFlowCommand`, once per distinct flow id
 * `collectInvokedFlowIds` finds in the tree) — never more, never fewer, so
 * the exported pair is always self-contained and never references an
 * undefined command.
 *
 * Also surfaces the flow's dependencies (reusable flows used, fixture files
 * referenced) as plain data, for the "Dependencies" list the Build panel
 * shows — a user deciding whether a generated test is ready to run needs to
 * know what else it needs (a `cypress/fixtures/*.json` file, a custom
 * command this project doesn't define yet), not just whether it parses.
 *
 * Pure: no React, no Redux, no side effects.
 */

import type { FlowNode, ReusableFlowDef } from '../domain/types';
import { getDefaultReusableFlows } from '../config/reusableFlowsConfig';
import { getRegistry } from '../registry';
import type { Registry } from '../registry';
import { collectInvokedFlowIds, findFlowDef } from './reusableFlows';
import { generateReusableFlowCommand, processFlowAsSpec } from './processFlow';

export interface BuiltSpec {
  /** Derived from the root `describe`'s label, e.g. "login.cy.ts". Falls back to "test.cy.ts". */
  fileName: string;
  /** The main spec file's content — `describe`/`it`, calling `cy.<flowId>(...)` for any reusable flow used. */
  specCode: string;
  /**
   * `support/commands.ts`'s content — one `Cypress.Commands.add(...)` per
   * distinct flow actually invoked, in first-use order. Empty string (not
   * omitted) when the flow uses none, so a caller never has to branch on
   * presence before deciding whether to show/download it.
   */
  commandsCode: string;
  /** Flow ids invoked, in first-use document order — exactly what `commandsCode` defines. */
  usedFlowIds: string[];
  /** Fixture file paths referenced anywhere in the tree (the `fixture` command's `path` prop), de-duplicated, first-seen order. */
  fixturePaths: string[];
}

/** Slugify a describe label into a filename stem — same shape as `engine/reusableFlows.ts`'s `slugifyFlowName`, but local: a spec filename has no uniqueness-against-a-library concern. */
function slugify(label: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'test';
}

/** Every `fixture` command's `path` prop value anywhere in the tree, de-duplicated, first-seen order. */
function collectFixturePaths(root: FlowNode): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  const walk = (node: FlowNode) => {
    if (node.type === 'fixture') {
      const path = node.props?.path?.trim();
      if (path && !seen.has(path)) {
        seen.add(path);
        ordered.push(path);
      }
    }
    node.children?.forEach(walk);
  };
  walk(root);
  return ordered;
}

/**
 * Build the compile-ready export for `root`, or `null` for an empty canvas
 * (nothing to export yet — the caller should simply not offer the action).
 */
export function buildSpec(
  root: FlowNode | null,
  reg: Registry = getRegistry(),
  flows: ReusableFlowDef[] = getDefaultReusableFlows(),
): BuiltSpec | null {
  if (root === null) return null;

  const fileName = `${slugify(root.props?.label ?? '')}.cy.ts`;
  const specCode = processFlowAsSpec(root, reg, flows);
  const usedFlowIds = collectInvokedFlowIds(root).filter((id) => findFlowDef(id, flows) !== null);
  const commandsCode = usedFlowIds
    .map((id) => generateReusableFlowCommand(findFlowDef(id, flows)!, reg, flows))
    .join('\n\n');
  const fixturePaths = collectFixturePaths(root);

  return { fileName, specCode, commandsCode, usedFlowIds, fixturePaths };
}
