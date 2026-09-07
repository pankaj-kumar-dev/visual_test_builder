/**
 * Reference (Cypress alias) semantics (Phase 3; Phase 4 adds one ordering check
 * on top — see `requiresTriggerBeforeUse` below).
 *
 * A *reference* is a Cypress alias — created by `.as('name')` (real Cypress:
 * `cy.get('.row').as('row')`, `cy.fixture('user').as('userData')`,
 * `cy.intercept(...).as('getBrands')` — a network interception is produced by
 * the exact same `as` command, not a second alias mechanism) and consumed
 * anywhere a later command uses `'@name'` as its value (real Cypress:
 * `cy.get('@row')`, `cy.wait('@getBrands')`). This module is the single place
 * that knows the producer/consumer/scope rule, mirroring `engine/chain.ts`'s
 * role for chain semantics and `engine/nodeContext.ts`'s for callback bindings.
 *
 * A reference is deliberately **not** the same mechanism as a Phase 2 callback
 * binding, even though both eventually become a name available to later code:
 *   - a **binding** (engine/nodeContext.ts) is closure-scoped — visible only to
 *     the descendants of the block that introduced it, never resolved by
 *     cross-flow name lookup, never persisted anywhere but the callback
 *     signature itself.
 *   - a **reference** (this module) is flow-wide by name within a *test scope*
 *     (a `describe`'s hooks are visible to every `it` inside it; one `it`'s own
 *     aliases are invisible to its sibling `it`s) and ordered (a reference is
 *     only in scope for code that runs after its producer).
 * Collapsing these into one "names in scope" concept would lose exactly the
 * distinction Cypress itself relies on (a `then` callback parameter and a
 * `.as()` alias behave completely differently), so they stay two mechanisms
 * sharing no state.
 *
 * Consumption is recognized by convention, not a dedicated PropDef type: any
 * prop value starting with `@` is treated as a reference use — the same
 * convention Cypress itself uses at runtime. `PropDef.acceptsReference` is a
 * UI-only hint (show the picker); this module checks *every* prop value
 * regardless of that flag, so a reference typed into an unmarked field is
 * still validated correctly.
 *
 * Pure: no React, no Redux, no side effects.
 */

import type { FlowNode, ReusableFlowDef } from '../domain/types';
import { getDefaultReusableFlows } from '../config/reusableFlowsConfig';
import { getRegistry } from '../registry';
import type { Registry } from '../registry';
import { getSchema } from './nodeContext';
import { isValidReferenceName } from './propValue';
import { expandInvocation, findFlowCycle, findFlowDef } from './reusableFlows';

/** Whether `node` defines a reference test-scope boundary (registry-driven — see `StructuralNodeDef.referenceScopeBoundary`; never a `node.type` check). */
function isScopeBoundary(node: FlowNode, reg: Registry): boolean {
  return reg.getBlock(node.type)?.referenceScopeBoundary === true;
}

/** Whether `node`'s produced references become visible to every sibling in its scope boundary (registry-driven — see `StructuralNodeDef.producesReferencesForSiblings`). */
function isSiblingVisibleProducer(node: FlowNode, reg: Registry): boolean {
  return reg.getBlock(node.type)?.producesReferencesForSiblings === true;
}

/** The reference name `node` produces (its `reference-name` prop's value), or null. */
export function referenceProducedBy(node: FlowNode, reg: Registry = getRegistry()): string | null {
  const nameDef = getSchema(node.type, reg).find((d) => d.type === 'reference-name');
  if (!nameDef) return null;
  const raw = node.props?.[nameDef.key];
  return raw && isValidReferenceName(raw) ? raw.trim() : null;
}

/** Every reference name `node` itself consumes (any prop value starting with `@`). */
export function referencesConsumedBy(node: FlowNode): string[] {
  const names: string[] = [];
  for (const value of Object.values(node.props ?? {})) {
    if (value && value.startsWith('@') && value.length > 1) names.push(value.slice(1));
  }
  return names;
}

/** Every reference name produced anywhere in `node`'s subtree (including itself), deep. */
function collectAllProduced(node: FlowNode, reg: Registry): Set<string> {
  const collected = new Set<string>();
  const walk = (n: FlowNode) => {
    const produced = referenceProducedBy(n, reg);
    if (produced) collected.add(produced);
    n.children?.forEach(walk);
  };
  walk(node);
  return collected;
}

function union(a: Set<string>, b: Set<string>): Set<string> {
  const result = new Set(a);
  b.forEach((v) => result.add(v));
  return result;
}

/**
 * The reference names visible at every node in the tree, computed in one pass
 * (keyed by node id — same "compute once, look up many" shape as
 * `engine/unresolved.ts`'s traversal).
 *
 * Rule, applied uniformly except at a `referenceScopeBoundary` node (`describe`
 * — registry metadata, never a `node.type` check, so a future structural
 * container with the same scoping behavior needs no code change here):
 *   - **Default** (not a scope boundary): children are walked left-to-right;
 *     each child's own scope is exactly what has accumulated so far, and
 *     *everything* that child's subtree produces (deep — a reference produced
 *     inside a nested `then`/`each`/`within` is still visible afterward, since
 *     Cypress aliases are test-global, not closure-scoped) is folded in before
 *     moving to the next sibling. This single rule is what makes a
 *     document-order producer visible to a later, unrelated sibling —
 *     including across nested blocks (Phase 2).
 *   - **Scope boundary**: first collects everything produced anywhere inside
 *     each direct `producesReferencesForSiblings` child (`beforeAll`/
 *     `beforeEach` — a hook always logically runs before every test in its
 *     suite, regardless of where it's declared). A non-hook child (`it`,
 *     `afterEach`/`afterAll`, a nested boundary) starts from the union of
 *     *all* hooks' output; a hook child itself starts from every *other*
 *     hook's output only — never its own, or it would flag its own producer
 *     as shadowing itself. Either way, one `it`'s locally-produced references
 *     never leak to a sibling `it` or to `afterEach`/`afterAll`. A nested
 *     scope boundary still inherits its ancestors' hook references, because
 *     the base it receives already includes them.
 *
 * Known simplification (documented, not silently assumed): a reference
 * produced during one `it` and consumed from that same test's `afterEach` is
 * not modeled as visible, even though real Cypress sometimes allows it — the
 * required, tested scenarios (hook→test, test-local, sibling isolation,
 * nested-block production) don't depend on that edge case.
 */
export function computeReferenceScopes(
  root: FlowNode | null,
  reg: Registry = getRegistry(),
): Map<string, Set<string>> {
  const scopes = new Map<string, Set<string>>();
  if (root === null) return scopes;

  function walk(node: FlowNode, inherited: Set<string>): void {
    scopes.set(node.id, inherited);

    if (isScopeBoundary(node, reg)) {
      const hookChildren = (node.children ?? []).filter((c) => isSiblingVisibleProducer(c, reg));
      const producedByHook = new Map(hookChildren.map((c) => [c.id, collectAllProduced(c, reg)]));
      let allHookRefs = new Set<string>();
      producedByHook.forEach((set) => {
        allHookRefs = union(allHookRefs, set);
      });
      const base = union(inherited, allHookRefs);

      for (const child of node.children ?? []) {
        if (isSiblingVisibleProducer(child, reg)) {
          // A hook must not see its own not-yet-complete production fed back to
          // itself (it would flag its own producer as shadowing itself) — only
          // *other* hooks' full output, plus whatever the boundary inherited.
          let visibleToThisHook = inherited;
          producedByHook.forEach((set, id) => {
            if (id !== child.id) visibleToThisHook = union(visibleToThisHook, set);
          });
          walk(child, visibleToThisHook);
        } else {
          walk(child, base);
        }
      }
      return;
    }

    let running = inherited;
    for (const child of node.children ?? []) {
      walk(child, running);
      running = union(running, collectAllProduced(child, reg));
    }
  }

  walk(root, new Set());
  return scopes;
}

/** Reference names visible at the node with `nodeId` (empty set if not found). */
export function referencesInScope(
  root: FlowNode | null,
  nodeId: string,
  reg: Registry = getRegistry(),
): Set<string> {
  return computeReferenceScopes(root, reg).get(nodeId) ?? new Set();
}

/**
 * Reference names produced anywhere in the tree strictly before each node, in
 * plain document (pre-order) order — deliberately ignoring the `describe`
 * sibling-isolation rule `computeReferenceScopes` applies. Used only to tell
 * "used before its producer" apart from "produced in an unreachable scope"
 * when reporting a semantic issue; not a scope computation on its own.
 */
function computeGlobalOrderProduced(
  root: FlowNode,
  reg: Registry,
): Map<string, Set<string>> {
  const before = new Map<string, Set<string>>();

  function walk(node: FlowNode, accumulated: Set<string>): Set<string> {
    before.set(node.id, accumulated);
    let running = accumulated;
    const produced = referenceProducedBy(node, reg);
    if (produced) running = union(running, new Set([produced]));
    for (const child of node.children ?? []) {
      running = walk(child, running);
    }
    return running;
  }

  walk(root, new Set());
  return before;
}

/**
 * Whether `node` counts as a "request-triggering" action for the
 * `requiresTriggerBeforeUse` check (Phase 4) — any command already classified
 * under the existing `action` or `browser` palette taxonomy group (Phase 1),
 * reused as-is rather than adding a new metadata dimension for the same idea.
 */
function isTrigger(node: FlowNode, reg: Registry): boolean {
  const group = reg.getFunction(node.type)?.group ?? reg.getBlock(node.type)?.group;
  return group === 'action' || group === 'browser';
}

/**
 * Phase 5 completion: whether a reuse-composition node's *expanded* body
 * contains a trigger anywhere within it. Needed because
 * `computeTriggeredSinceProduction`'s walk only visits the real Flow JSON
 * tree, and a `flowInvocation` node has no real `children` there — so a
 * trigger action authored *inside* a reusable flow (e.g. the click at the
 * heart of the bundled `search`/`login` starters) would otherwise be
 * invisible from the outer scope, and a `waitAlias` right after invoking
 * such a flow would be wrongly flagged as untriggered. `visiting` guards
 * against a cyclic reusable-flow reference recursing forever, the same
 * defensive shape `engine/processFlow.ts`'s own expansion already uses.
 */
function reuseSubtreeContainsTrigger(
  node: FlowNode,
  reg: Registry,
  flows: ReusableFlowDef[],
  visiting: readonly string[],
): boolean {
  const def = reg.getBlock(node.type) ?? reg.getFunction(node.type);
  if (!def || !('childComposition' in def) || def.childComposition !== 'reuse') return false;
  const flowId = node.props?.flowId;
  if (!flowId || visiting.includes(flowId)) return false;

  const expanded = expandInvocation(node, flows) ?? [];
  const nextVisiting = [...visiting, flowId];
  const scan = (n: FlowNode): boolean =>
    isTrigger(n, reg) ||
    reuseSubtreeContainsTrigger(n, reg, flows, nextVisiting) ||
    (n.children ?? []).some(scan);
  return expanded.some(scan);
}

/**
 * For each node, which reference names have had a trigger (`isTrigger`, or —
 * Phase 5 completion — a reuse invocation whose expanded body contains one)
 * occur since their most recent production, in plain document (pre-order)
 * order — the same traversal shape as `computeGlobalOrderProduced`, tracking
 * one more fact per name. Used only by the `requiresTriggerBeforeUse` check
 * below.
 */
function computeTriggeredSinceProduction(
  root: FlowNode,
  reg: Registry,
  flows: ReusableFlowDef[],
): Map<string, Set<string>> {
  const triggeredAt = new Map<string, Set<string>>();

  function walk(node: FlowNode, produced: Set<string>, triggered: Set<string>): { produced: Set<string>; triggered: Set<string> } {
    triggeredAt.set(node.id, triggered);

    let nextProduced = produced;
    let nextTriggered = triggered;

    const producedName = referenceProducedBy(node, reg);
    if (producedName) {
      nextProduced = union(nextProduced, new Set([producedName]));
      // A fresh production hasn't seen a trigger yet.
      const withoutIt = new Set(nextTriggered);
      withoutIt.delete(producedName);
      nextTriggered = withoutIt;
    }
    if (isTrigger(node, reg) || reuseSubtreeContainsTrigger(node, reg, flows, [])) {
      nextTriggered = union(nextTriggered, nextProduced);
    }

    for (const child of node.children ?? []) {
      const result = walk(child, nextProduced, nextTriggered);
      nextProduced = result.produced;
      nextTriggered = result.triggered;
    }
    return { produced: nextProduced, triggered: nextTriggered };
  }

  walk(root, new Set(), new Set());
  return triggeredAt;
}

export type SemanticIssueKind =
  | 'unknown-reference'
  | 'reference-before-producer'
  | 'reference-out-of-scope'
  | 'duplicate-reference'
  | 'reference-used-without-trigger'
  | 'unknown-reusable-flow'
  | 'cyclic-reusable-flow';

/**
 * Phase 5F: how seriously the validation panel should treat an issue kind —
 * a fixed, one-line lookup (below), not a per-issue judgment call, so the
 * same kind is always the same severity everywhere it's reported. `'error'`
 * means the generated code is broken or definitely not what was intended
 * (an alias that resolves to nothing, a cycle, an unknown flow); `'warning'`
 * means the code is syntactically fine but a real Cypress footgun is likely
 * (`reference-used-without-trigger` — the classic "the intercept never saw a
 * matching request" flake). The UI only reads this field; it never
 * re-derives severity from `kind` itself (Phase 5G's "one validation source
 * of truth").
 */
export type SemanticIssueSeverity = 'error' | 'warning';

const SEVERITY_BY_KIND: Record<SemanticIssueKind, SemanticIssueSeverity> = {
  'unknown-reference': 'error',
  'reference-before-producer': 'error',
  'reference-out-of-scope': 'error',
  'duplicate-reference': 'error',
  'reference-used-without-trigger': 'warning',
  'unknown-reusable-flow': 'error',
  'cyclic-reusable-flow': 'error',
};

export interface SemanticIssue {
  id: string;
  type: string;
  label: string;
  kind: SemanticIssueKind;
  message: string;
  severity: SemanticIssueSeverity;
}

/**
 * Static *semantic* validation (as opposed to `engine/unresolved.ts`'s static
 * *structural* validation — a required field being empty is a shape problem;
 * a reference resolving to nothing is a meaning problem). Detects, for every
 * node in the tree:
 *   - a consumed reference with no producer anywhere in the flow
 *     ("unknown-reference");
 *   - a consumed reference whose only producer(s) come later in document order
 *     ("reference-before-producer");
 *   - a consumed reference produced only in an unreachable scope — a sibling
 *     `it`, for instance ("reference-out-of-scope");
 *   - a produced reference whose name is already in scope at the point it's
 *     produced — i.e. it shadows an earlier producer of the same name, whether
 *     that producer was a hook or an earlier statement in the same test
 *     ("duplicate-reference");
 *   - (Phase 4) a reference consumed by a `requiresTriggerBeforeUse` command
 *     (`waitAlias` — real Cypress: `cy.wait('@alias')`) with no
 *     request-triggering action (`group: 'action'` or `'browser'`) between its
 *     producer and this use — the static shape of "intercept must occur
 *     before the request/action it's intended to observe" ("reference-used-
 *     without-trigger"). Gated entirely on the *consumer's* registry metadata,
 *     not on what kind of thing produced the alias — `as` stays one generic
 *     producer regardless of whether `intercept`, `fixture`, or `get` preceded it.
 */
export function findSemanticIssues(
  root: FlowNode | null,
  reg: Registry = getRegistry(),
  flows: ReusableFlowDef[] = getDefaultReusableFlows(),
): SemanticIssue[] {
  if (root === null) return [];

  const scopes = computeReferenceScopes(root, reg);
  const everProduced = collectAllProduced(root, reg);
  const before = computeGlobalOrderProduced(root, reg);
  const triggeredSince = computeTriggeredSinceProduction(root, reg, flows);

  const issues: SemanticIssue[] = [];
  // Every push goes through here so `severity` can never be hand-typed
  // (and therefore never drift) out of step with `SEVERITY_BY_KIND`.
  const push = (issue: Omit<SemanticIssue, 'severity'>) => {
    issues.push({ ...issue, severity: SEVERITY_BY_KIND[issue.kind] });
  };

  const walk = (node: FlowNode) => {
    const def = reg.getBlock(node.type) ?? reg.getFunction(node.type);
    if (def) {
      const inScope = scopes.get(node.id) ?? new Set<string>();

      // Phase 5: a reusable-flow invocation is checked for two distinct
      // meaning-problems — never a shape problem, so this lives beside the
      // reference checks below rather than in engine/unresolved.ts:
      //  - the selected flow id names no known definition;
      //  - invoking it would recurse back into itself, transitively, through
      //    the library alone (engine/reusableFlows.ts's `findFlowCycle`) —
      //    detected statically here so the generator never has to recurse to
      //    find out (it still guards defensively regardless, in case this
      //    check is bypassed — engine/processFlow.ts's `visiting`).
      if ('childComposition' in def && def.childComposition === 'reuse') {
        const flowId = node.props?.flowId;
        const flowDef = findFlowDef(flowId, flows);
        if (!flowDef) {
          if (flowId) {
            push({
              id: node.id,
              type: node.type,
              label: def.label,
              kind: 'unknown-reusable-flow',
              message: `"${flowId}" has no matching reusable-flow definition.`,
            });
          }
        } else {
          const cycle = findFlowCycle(flowDef.id, flows);
          if (cycle) {
            push({
              id: node.id,
              type: node.type,
              label: def.label,
              kind: 'cyclic-reusable-flow',
              message: `Reusable flow "${flowDef.name}" is cyclic: ${cycle.join(' -> ')}.`,
            });
          }
        }
      }

      const requiresTrigger = 'requiresTriggerBeforeUse' in def && def.requiresTriggerBeforeUse === true;

      for (const name of referencesConsumedBy(node)) {
        if (inScope.has(name)) {
          if (requiresTrigger && !(triggeredSince.get(node.id)?.has(name) ?? false)) {
            push({
              id: node.id,
              type: node.type,
              label: def.label,
              kind: 'reference-used-without-trigger',
              message: `"@${name}" is awaited here, but no action (e.g. visit/click) appears between its producer and this wait — the request may never be triggered.`,
            });
          }
          continue;
        }
        const beforeGlobally = before.get(node.id)?.has(name) ?? false;
        if (!everProduced.has(name)) {
          push({
            id: node.id,
            type: node.type,
            label: def.label,
            kind: 'unknown-reference',
            message: `"@${name}" has no producer anywhere in this flow.`,
          });
        } else if (!beforeGlobally) {
          push({
            id: node.id,
            type: node.type,
            label: def.label,
            kind: 'reference-before-producer',
            message: `"@${name}" is used before it is produced.`,
          });
        } else {
          push({
            id: node.id,
            type: node.type,
            label: def.label,
            kind: 'reference-out-of-scope',
            message: `"@${name}" is produced in a different test scope (e.g. a sibling test) and is not visible here.`,
          });
        }
      }

      const produced = referenceProducedBy(node, reg);
      if (produced && (scopes.get(node.id) ?? new Set()).has(produced)) {
        push({
          id: node.id,
          type: node.type,
          label: def.label,
          kind: 'duplicate-reference',
          message: `"@${produced}" is already produced earlier in scope — this shadows it.`,
        });
      }
    }
    node.children?.forEach(walk);
  };
  walk(root);

  return issues;
}
