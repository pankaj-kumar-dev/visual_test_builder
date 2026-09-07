/**
 * Reference (Cypress alias) semantics unit tests (Phase 3).
 *
 * Covers the required scenarios explicitly: producer → consumer, undefined
 * reference, sibling test-scope isolation, nested-block production, and
 * duplicate/shadowed names — plus hook → test visibility and the
 * before/unknown/out-of-scope message distinctions.
 */

import { describe, expect, it } from 'vitest';
import {
  computeReferenceScopes,
  findSemanticIssues,
  referenceProducedBy,
  referencesConsumedBy,
  referencesInScope,
} from './references';
import { createRegistry } from '../registry/registry';
import type { CommandNodeDef, FlowNode, ReusableFlowDef, StructuralNodeDef } from '../domain/types';

function leaf(type: string, props: Record<string, string> = {}): FlowNode {
  return { id: `${type}-${Math.random().toString(36).slice(2, 8)}`, type, props };
}

function node(id: string, type: string, props: Record<string, string> = {}, children: FlowNode[] = []): FlowNode {
  return { id, type, props, children };
}

function chain(id: string, ...children: FlowNode[]): FlowNode {
  return { id, type: 'chain', props: {}, children };
}

describe('referenceProducedBy / referencesConsumedBy', () => {
  it('an "as" node produces its "name" prop', () => {
    expect(referenceProducedBy(node('as-1', 'as', { name: 'row' }))).toBe('row');
  });

  it('an invalid alias name produces nothing', () => {
    expect(referenceProducedBy(node('as-1', 'as', { name: '2cool' }))).toBeNull();
  });

  it('a node with no reference-name prop produces nothing', () => {
    expect(referenceProducedBy(node('get-1', 'get', { selector: '.x' }))).toBeNull();
  });

  it('recognizes any prop value starting with "@" as a consumption', () => {
    expect(referencesConsumedBy(node('get-1', 'get', { selector: '@row' }))).toEqual(['row']);
  });

  it('a bare "@" with nothing after it is not a consumption', () => {
    expect(referencesConsumedBy(node('get-1', 'get', { selector: '@' }))).toEqual([]);
  });

  it('an ordinary CSS selector is never mistaken for a consumption', () => {
    expect(referencesConsumedBy(node('get-1', 'get', { selector: '.row' }))).toEqual([]);
  });
});

describe('computeReferenceScopes — producer → consumer (basic)', () => {
  it('a reference is visible to a later sibling statement', () => {
    const producer = node('as-1', 'as', { name: 'row' });
    const consumer = node('get-2', 'get', { selector: '@row' });
    const flow = node('it-1', 'it', { label: 'x' }, [chain('chain-1', node('get-1', 'get', { selector: '.row' }), producer), consumer]);
    expect(referencesInScope(flow, 'get-2')).toEqual(new Set(['row']));
  });

  it('a reference is NOT visible to an earlier statement (document order matters)', () => {
    const producer = node('as-1', 'as', { name: 'row' });
    const earlierConsumer = node('get-0', 'get', { selector: '@row' });
    const flow = node('it-1', 'it', { label: 'x' }, [earlierConsumer, chain('chain-1', node('get-1', 'get', { selector: '.row' }), producer)]);
    expect(referencesInScope(flow, 'get-0')).toEqual(new Set());
  });
});

describe('computeReferenceScopes — sibling test-scope isolation', () => {
  it("one it's local reference is invisible to a sibling it", () => {
    const itA = node('it-a', 'it', { label: 'A' }, [
      chain('chain-1', node('get-1', 'get', { selector: '.row' }), node('as-1', 'as', { name: 'row' })),
    ]);
    const itB = node('it-b', 'it', { label: 'B' }, [node('get-2', 'get', { selector: '@row' })]);
    const describeNode = node('describe-1', 'describe', { label: 'Suite' }, [itA, itB]);

    expect(referencesInScope(describeNode, 'get-2')).toEqual(new Set());
  });

  it("a hook-produced reference IS visible in every sibling it (hook → test)", () => {
    const hook = node('before-1', 'beforeEach', {}, [
      chain('chain-1', node('fixture-1', 'fixture', { path: 'user' }), node('as-1', 'as', { name: 'userData' })),
    ]);
    const itA = node('it-a', 'it', { label: 'A' }, [node('get-a', 'get', { selector: '@userData' })]);
    const itB = node('it-b', 'it', { label: 'B' }, [node('get-b', 'get', { selector: '@userData' })]);
    const describeNode = node('describe-1', 'describe', { label: 'Suite' }, [hook, itA, itB]);

    expect(referencesInScope(describeNode, 'get-a')).toEqual(new Set(['userData']));
    expect(referencesInScope(describeNode, 'get-b')).toEqual(new Set(['userData']));
  });

  it("a hook declared AFTER an it in the JSON is still visible inside that it (hooks always logically run first)", () => {
    const itA = node('it-a', 'it', { label: 'A' }, [node('get-a', 'get', { selector: '@userData' })]);
    const hook = node('before-1', 'beforeEach', {}, [node('as-1', 'as', { name: 'userData' })]);
    const describeNode = node('describe-1', 'describe', { label: 'Suite' }, [itA, hook]);

    expect(referencesInScope(describeNode, 'get-a')).toEqual(new Set(['userData']));
  });
});

describe('computeReferenceScopes — nested callback binding + reference (Phase 2 block interaction)', () => {
  it('a reference produced inside a within/each block is visible to a later top-level statement in the same test', () => {
    const withinNode = node('within-1', 'within', { selector: '.panel' }, [
      node('each-1', 'each', { selector: '.items' }, [
        chain('chain-1', leaf('wrap', { expression: '$el' }), node('as-1', 'as', { name: 'item' })),
      ]),
    ]);
    const laterUse = node('get-2', 'get', { selector: '@item' });
    const flow = node('it-1', 'it', { label: 'x' }, [withinNode, laterUse]);

    expect(referencesInScope(flow, 'get-2')).toEqual(new Set(['item']));
  });

  it('the reference is NOT visible to a sibling statement that comes before the block', () => {
    const earlierUse = node('get-0', 'get', { selector: '@item' });
    const withinNode = node('within-1', 'within', { selector: '.panel' }, [
      chain('chain-1', leaf('wrap', { expression: '$el' }), node('as-1', 'as', { name: 'item' })),
    ]);
    const flow = node('it-1', 'it', { label: 'x' }, [earlierUse, withinNode]);

    expect(referencesInScope(flow, 'get-0')).toEqual(new Set());
  });
});

describe('findSemanticIssues — unknown / before-producer / out-of-scope', () => {
  it('flags a reference with no producer anywhere as unknown-reference', () => {
    const flow = node('it-1', 'it', { label: 'x' }, [node('get-1', 'get', { selector: '@ghost' })]);
    const issues = findSemanticIssues(flow);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ id: 'get-1', kind: 'unknown-reference' });
    expect(issues[0].message).toContain('@ghost');
  });

  it('flags a reference consumed before its producer as reference-before-producer', () => {
    const flow = node('it-1', 'it', { label: 'x' }, [
      node('get-0', 'get', { selector: '@row' }),
      chain('chain-1', node('get-1', 'get', { selector: '.row' }), node('as-1', 'as', { name: 'row' })),
    ]);
    const issues = findSemanticIssues(flow);
    expect(issues).toEqual([
      expect.objectContaining({ id: 'get-0', kind: 'reference-before-producer' }),
    ]);
  });

  it('flags a reference from a sibling test as reference-out-of-scope (distinct from unknown)', () => {
    const itA = node('it-a', 'it', { label: 'A' }, [
      chain('chain-1', node('get-1', 'get', { selector: '.row' }), node('as-1', 'as', { name: 'row' })),
    ]);
    const itB = node('it-b', 'it', { label: 'B' }, [node('get-2', 'get', { selector: '@row' })]);
    const describeNode = node('describe-1', 'describe', { label: 'Suite' }, [itA, itB]);

    const issues = findSemanticIssues(describeNode);
    expect(issues).toEqual([
      expect.objectContaining({ id: 'get-2', kind: 'reference-out-of-scope' }),
    ]);
  });

  it('a valid producer -> consumer pair raises no issue', () => {
    const flow = node('it-1', 'it', { label: 'x' }, [
      chain('chain-1', node('get-1', 'get', { selector: '.row' }), node('as-1', 'as', { name: 'row' })),
      node('get-2', 'get', { selector: '@row' }),
    ]);
    expect(findSemanticIssues(flow)).toEqual([]);
  });

  it('null flow raises no issues', () => {
    expect(findSemanticIssues(null)).toEqual([]);
  });
});

describe('findSemanticIssues — duplicate / shadowed names', () => {
  it('a second producer of the same name in the same test shadows the first', () => {
    const flow = node('it-1', 'it', { label: 'x' }, [
      chain('chain-1', node('get-1', 'get', { selector: '.a' }), node('as-1', 'as', { name: 'row' })),
      chain('chain-2', node('get-2', 'get', { selector: '.b' }), node('as-2', 'as', { name: 'row' })),
    ]);
    const issues = findSemanticIssues(flow);
    expect(issues).toEqual([expect.objectContaining({ id: 'as-2', kind: 'duplicate-reference' })]);
  });

  it('a local "as" that reuses a hook-provided name shadows it too', () => {
    const hook = node('before-1', 'beforeEach', {}, [node('as-1', 'as', { name: 'userData' })]);
    const itA = node('it-a', 'it', { label: 'A' }, [node('as-2', 'as', { name: 'userData' })]);
    const describeNode = node('describe-1', 'describe', { label: 'Suite' }, [hook, itA]);

    const issues = findSemanticIssues(describeNode);
    expect(issues).toEqual([expect.objectContaining({ id: 'as-2', kind: 'duplicate-reference' })]);
  });

  it('the SAME name reused in two different (isolated) it blocks is not a duplicate — no shared scope', () => {
    const itA = node('it-a', 'it', { label: 'A' }, [node('as-1', 'as', { name: 'row' })]);
    const itB = node('it-b', 'it', { label: 'B' }, [node('as-2', 'as', { name: 'row' })]);
    const describeNode = node('describe-1', 'describe', { label: 'Suite' }, [itA, itB]);

    expect(findSemanticIssues(describeNode)).toEqual([]);
  });
});

describe('computeReferenceScopes — empty/edge cases', () => {
  it('null root returns an empty map', () => {
    expect(computeReferenceScopes(null).size).toBe(0);
  });

  it('a node not present in the tree resolves to an empty scope', () => {
    const flow = node('it-1', 'it', { label: 'x' }, []);
    expect(referencesInScope(flow, 'nope')).toEqual(new Set());
  });
});

describe('scope boundaries are registry-driven, not hardcoded to "describe"/"beforeAll"/"beforeEach"', () => {
  it('a synthetic registry with differently-named suite/hook/test/save nodes gets the identical scoping behavior', () => {
    const suite: StructuralNodeDef = {
      type: 'suite', label: 'Suite', category: 'structural',
      allowedChildren: ['setup', 'spec'], props: [],
      codeTemplate: "suite('{{label}}', () => {\n{{children}}\n});",
      referenceScopeBoundary: true,
    };
    const setup: StructuralNodeDef = {
      type: 'setup', label: 'Setup', category: 'structural',
      allowedChildren: ['save'], props: [],
      codeTemplate: 'setup(() => {\n{{children}}\n});',
      producesReferencesForSiblings: true,
    };
    const spec: StructuralNodeDef = {
      type: 'spec', label: 'Spec', category: 'structural',
      allowedChildren: ['save', 'use'], props: [],
      codeTemplate: "spec('{{label}}', () => {\n{{children}}\n});",
    };
    const save: CommandNodeDef = {
      type: 'save', label: 'Save', category: 'command',
      codeTemplate: "save('{{as}}');",
    };
    const use: CommandNodeDef = {
      type: 'use', label: 'Use', category: 'command',
      codeTemplate: "use('{{ref}}');",
    };
    const reg = createRegistry({
      blocks: [suite, setup, spec],
      functions: [save, use],
      commandProps: {
        save: [{ key: 'as', label: 'As', type: 'reference-name', required: true }],
        use: [{ key: 'ref', label: 'Ref', type: 'text', required: true }],
      },
    });

    const suiteNode = node('suite-1', 'suite', { label: 'x' }, [
      node('setup-1', 'setup', {}, [node('save-1', 'save', { as: 'shared' })]),
      node('spec-a', 'spec', { label: 'A' }, [node('use-a', 'use', { ref: '@shared' })]),
      node('spec-b', 'spec', { label: 'B' }, [
        node('save-2', 'save', { as: 'local' }),
        node('use-b', 'use', { ref: '@local' }),
      ]),
    ]);

    // Hook -> every sibling test (works with zero references.ts code change).
    expect(referencesInScope(suiteNode, 'use-a', reg)).toEqual(new Set(['shared']));
    // A local producer in spec B is invisible from spec A (sibling isolation) —
    // and spec A never had "local" in scope regardless.
    expect(findSemanticIssues(suiteNode, reg)).toEqual([]);

    // Spec A must not see "local" — prove it by consuming it there and
    // expecting an out-of-scope issue.
    const withCrossUse = node('suite-1', 'suite', { label: 'x' }, [
      node('setup-1', 'setup', {}, [node('save-1', 'save', { as: 'shared' })]),
      node('spec-b', 'spec', { label: 'B' }, [node('save-2', 'save', { as: 'local' })]),
      node('spec-a', 'spec', { label: 'A' }, [node('use-a', 'use', { ref: '@local' })]),
    ]);
    const issues = findSemanticIssues(withCrossUse, reg);
    expect(issues).toEqual([expect.objectContaining({ id: 'use-a', kind: 'reference-out-of-scope' })]);
  });
});

describe('findSemanticIssues — Phase 4: requiresTriggerBeforeUse (intercept -> action -> wait)', () => {
  it('intercept.as -> visit -> waitAlias raises no issue (a browser-group trigger is in between)', () => {
    const flow = node('it-1', 'it', { label: 'x' }, [
      chain('chain-1', node('intercept-1', 'intercept', { method: 'GET', url: '/api/brands' }), node('as-1', 'as', { name: 'getBrands' })),
      node('visit-1', 'visit', { url: '/brands' }),
      node('waitAlias-1', 'waitAlias', { alias: '@getBrands' }),
    ]);
    expect(findSemanticIssues(flow)).toEqual([]);
  });

  it('intercept.as -> click -> waitAlias raises no issue (an action-group trigger is in between)', () => {
    const flow = node('it-1', 'it', { label: 'x' }, [
      chain('chain-1', node('intercept-1', 'intercept', { method: 'GET', url: '/api/brands' }), node('as-1', 'as', { name: 'getBrands' })),
      node('click-1', 'click', { selector: '#load' }),
      node('waitAlias-1', 'waitAlias', { alias: '@getBrands' }),
    ]);
    expect(findSemanticIssues(flow)).toEqual([]);
  });

  it('intercept.as -> waitAlias with NO intervening action is flagged (the ordering lint)', () => {
    const flow = node('it-1', 'it', { label: 'x' }, [
      chain('chain-1', node('intercept-1', 'intercept', { method: 'GET', url: '/api/brands' }), node('as-1', 'as', { name: 'getBrands' })),
      node('waitAlias-1', 'waitAlias', { alias: '@getBrands' }),
    ]);
    const issues = findSemanticIssues(flow);
    expect(issues).toEqual([
      expect.objectContaining({ id: 'waitAlias-1', kind: 'reference-used-without-trigger' }),
    ]);
  });

  it('an action BEFORE the intercept does not count — a trigger must occur after the producer', () => {
    const flow = node('it-1', 'it', { label: 'x' }, [
      node('visit-1', 'visit', { url: '/brands' }),
      chain('chain-1', node('intercept-1', 'intercept', { method: 'GET', url: '/api/brands' }), node('as-1', 'as', { name: 'getBrands' })),
      node('waitAlias-1', 'waitAlias', { alias: '@getBrands' }),
    ]);
    const issues = findSemanticIssues(flow);
    expect(issues).toEqual([
      expect.objectContaining({ id: 'waitAlias-1', kind: 'reference-used-without-trigger' }),
    ]);
  });

  it('the same alias consumed by an ordinary (non-waitAlias) command never triggers this check', () => {
    const flow = node('it-1', 'it', { label: 'x' }, [
      chain('chain-1', node('get-0', 'get', { selector: '.row' }), node('as-1', 'as', { name: 'row' })),
      node('get-1', 'get', { selector: '@row' }), // no action in between, but "get" doesn't require one
    ]);
    expect(findSemanticIssues(flow)).toEqual([]);
  });

  it('a trigger deep inside a nested block still counts (reuses the same traversal as scope)', () => {
    const flow = node('it-1', 'it', { label: 'x' }, [
      chain('chain-1', node('intercept-1', 'intercept', { method: 'GET', url: '/api/brands' }), node('as-1', 'as', { name: 'getBrands' })),
      { id: 'within-1', type: 'within', props: { selector: '.page' }, children: [node('click-1', 'click', { selector: '#load' })] },
      node('waitAlias-1', 'waitAlias', { alias: '@getBrands' }),
    ]);
    expect(findSemanticIssues(flow)).toEqual([]);
  });
});

describe('findSemanticIssues — Phase 5 completion: a trigger hidden inside a reusable-flow invocation still counts', () => {
  // A reuse invocation has no *real* children in the Flow JSON (only props),
  // so a trigger authored inside the reusable flow's body would otherwise be
  // invisible to computeTriggeredSinceProduction's tree walk — this is the
  // regression these tests guard (engine/references.ts's
  // `reuseSubtreeContainsTrigger`).
  const CLICKS_THEN_LOGS: ReusableFlowDef = {
    id: 'clicksThenLogs',
    name: 'Clicks then logs',
    params: [],
    body: [node('c1', 'click', { selector: '#go' }), node('l1', 'log', { message: 'done' })],
  };
  const NO_TRIGGER: ReusableFlowDef = {
    id: 'noTrigger',
    name: 'No trigger',
    params: [],
    body: [node('l1', 'log', { message: 'noop' })],
  };
  const NESTED_TRIGGER: ReusableFlowDef = {
    id: 'nestedTrigger',
    name: 'Nested trigger',
    params: [],
    body: [
      { id: 'within-1', type: 'within', props: { selector: '.modal' }, children: [node('c1', 'click', { selector: '#confirm' })] },
    ],
  };
  const CALLS_CLICKS_THEN_LOGS: ReusableFlowDef = {
    id: 'callsClicksThenLogs',
    name: 'Calls clicksThenLogs',
    params: [],
    body: [node('inv', 'flowInvocation', { flowId: 'clicksThenLogs' })],
  };

  it('a click authored inside the invoked flow satisfies waitAlias\'s trigger requirement', () => {
    const flow = node('it-1', 'it', { label: 'x' }, [
      chain('chain-1', node('intercept-1', 'intercept', { url: '/api/x' }), node('as-1', 'as', { name: 'x' })),
      node('invoke-1', 'flowInvocation', { flowId: 'clicksThenLogs' }),
      node('waitAlias-1', 'waitAlias', { alias: '@x' }),
    ]);
    expect(findSemanticIssues(flow, undefined, [CLICKS_THEN_LOGS])).toEqual([]);
  });

  it('an invoked flow with no trigger inside it still raises the ordering warning', () => {
    const flow = node('it-1', 'it', { label: 'x' }, [
      chain('chain-1', node('intercept-1', 'intercept', { url: '/api/x' }), node('as-1', 'as', { name: 'x' })),
      node('invoke-1', 'flowInvocation', { flowId: 'noTrigger' }),
      node('waitAlias-1', 'waitAlias', { alias: '@x' }),
    ]);
    const issues = findSemanticIssues(flow, undefined, [NO_TRIGGER]);
    expect(issues).toEqual([expect.objectContaining({ id: 'waitAlias-1', kind: 'reference-used-without-trigger' })]);
  });

  it('a trigger nested inside a block inside the invoked flow still counts', () => {
    const flow = node('it-1', 'it', { label: 'x' }, [
      chain('chain-1', node('intercept-1', 'intercept', { url: '/api/x' }), node('as-1', 'as', { name: 'x' })),
      node('invoke-1', 'flowInvocation', { flowId: 'nestedTrigger' }),
      node('waitAlias-1', 'waitAlias', { alias: '@x' }),
    ]);
    expect(findSemanticIssues(flow, undefined, [NESTED_TRIGGER])).toEqual([]);
  });

  it('a trigger reached transitively through a flow invoking another flow still counts', () => {
    const flow = node('it-1', 'it', { label: 'x' }, [
      chain('chain-1', node('intercept-1', 'intercept', { url: '/api/x' }), node('as-1', 'as', { name: 'x' })),
      node('invoke-1', 'flowInvocation', { flowId: 'callsClicksThenLogs' }),
      node('waitAlias-1', 'waitAlias', { alias: '@x' }),
    ]);
    expect(findSemanticIssues(flow, undefined, [CALLS_CLICKS_THEN_LOGS, CLICKS_THEN_LOGS])).toEqual([]);
  });

  it('a cyclic reusable-flow reference cannot make the trigger scan loop forever (visiting guard)', () => {
    const SELF: ReusableFlowDef = {
      id: 'selfInvoking',
      name: 'Self',
      params: [],
      body: [node('inv', 'flowInvocation', { flowId: 'selfInvoking' })],
    };
    const flow = node('it-1', 'it', { label: 'x' }, [
      chain('chain-1', node('intercept-1', 'intercept', { url: '/api/x' }), node('as-1', 'as', { name: 'x' })),
      node('invoke-1', 'flowInvocation', { flowId: 'selfInvoking' }),
      node('waitAlias-1', 'waitAlias', { alias: '@x' }),
    ]);
    // Terminates (no trigger reachable through an infinite self-reference) and
    // — separately — the cycle itself is flagged on the invocation.
    const issues = findSemanticIssues(flow, undefined, [SELF]);
    expect(issues.some((i) => i.kind === 'reference-used-without-trigger')).toBe(true);
    expect(issues.some((i) => i.kind === 'cyclic-reusable-flow')).toBe(true);
  });
});

describe('findSemanticIssues — Phase 5 reusable-flow invocation (unknown / cyclic)', () => {
  const GREET: ReusableFlowDef = {
    id: 'greet',
    name: 'Greet',
    params: [{ key: 'name', label: 'Name', type: 'text', required: true }],
    body: [node('g1', 'log', { message: 'hi' })],
  };

  it('flags an invocation whose flowId names no known definition', () => {
    const flow = node('invoke-1', 'flowInvocation', { flowId: 'ghost' });
    expect(findSemanticIssues(flow, undefined, [GREET])).toEqual([
      {
        id: 'invoke-1',
        type: 'flowInvocation',
        label: 'Reusable Flow',
        kind: 'unknown-reusable-flow',
        message: '"ghost" has no matching reusable-flow definition.',
        severity: 'error',
      },
    ]);
  });

  it('does not flag an invocation with no flow selected yet (that is a structural/missing-field concern, not a semantic one)', () => {
    const flow = node('invoke-1', 'flowInvocation', {});
    expect(findSemanticIssues(flow, undefined, [GREET])).toEqual([]);
  });

  it('is clean for a valid, non-cyclic invocation', () => {
    const flow = node('invoke-1', 'flowInvocation', { flowId: 'greet', name: 'Al' });
    expect(findSemanticIssues(flow, undefined, [GREET])).toEqual([]);
  });

  it('flags a direct self-referencing reusable flow as cyclic', () => {
    const SELF: ReusableFlowDef = {
      id: 'self',
      name: 'Self',
      params: [],
      body: [node('inv', 'flowInvocation', { flowId: 'self' })],
    };
    const flow = node('invoke-1', 'flowInvocation', { flowId: 'self' });
    const issues = findSemanticIssues(flow, undefined, [SELF]);
    expect(issues).toEqual([
      expect.objectContaining({ id: 'invoke-1', type: 'flowInvocation', kind: 'cyclic-reusable-flow' }),
    ]);
    expect(issues[0].message).toContain('self -> self');
  });

  it('flags a transitive cycle through a second definition, regardless of which one is invoked from the canvas', () => {
    const A: ReusableFlowDef = { id: 'a', name: 'A', params: [], body: [node('inv-b', 'flowInvocation', { flowId: 'b' })] };
    const B: ReusableFlowDef = { id: 'b', name: 'B', params: [], body: [node('inv-a', 'flowInvocation', { flowId: 'a' })] };
    const flow = node('invoke-1', 'flowInvocation', { flowId: 'a' });
    expect(findSemanticIssues(flow, undefined, [A, B])).toEqual([
      expect.objectContaining({ id: 'invoke-1', kind: 'cyclic-reusable-flow' }),
    ]);
  });

  it('does not flag two unrelated, non-cyclic definitions where one invokes the other', () => {
    const A: ReusableFlowDef = { id: 'a', name: 'A', params: [], body: [node('inv-b', 'flowInvocation', { flowId: 'b' })] };
    const B: ReusableFlowDef = { id: 'b', name: 'B', params: [], body: [] };
    const flow = node('invoke-1', 'flowInvocation', { flowId: 'a' });
    expect(findSemanticIssues(flow, undefined, [A, B])).toEqual([]);
  });
});
