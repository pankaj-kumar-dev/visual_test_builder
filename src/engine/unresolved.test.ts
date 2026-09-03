/**
 * Unresolved-property detection unit tests (docs/TEST_PLAN.md §5,
 * "Unit — engine/unresolved"). Covers both the pre-existing commands (regression)
 * and the Phase 1/2 additions, since `findUnresolvedNodes` mirrors the same
 * registry-driven schema resolution the code generator and property editor use,
 * and is the single source of truth for the drawer/canvas/property-field
 * unresolved-state UI (Phase 2 UI task).
 */

import { describe, expect, it } from 'vitest';
import { findUnresolvedNodes } from './unresolved';
import type { FlowNode, ReusableFlowDef } from '../domain/types';

function leaf(type: string, props: Record<string, string> = {}): FlowNode {
  return { id: `${type}-1`, type, props };
}

describe('findUnresolvedNodes', () => {
  it('returns nothing for a null flow', () => {
    expect(findUnresolvedNodes(null)).toEqual([]);
  });

  it('regression: flags a click with an empty required selector', () => {
    const result = findUnresolvedNodes(leaf('click', { selector: '' }));
    expect(result).toEqual([
      { id: 'click-1', type: 'click', label: 'Click', missing: ['Selector'], missingKeys: ['selector'] },
    ]);
  });

  it('regression: does not flag should when only the optional value is empty', () => {
    const result = findUnresolvedNodes(
      leaf('should', { selector: '#x', assertion: 'be.visible' }),
    );
    expect(result).toEqual([]);
  });

  it('flags find when the descendant target is missing', () => {
    const result = findUnresolvedNodes(leaf('find', { selector: '.container' }));
    expect(result).toEqual([
      {
        id: 'find-1',
        type: 'find',
        label: 'Find',
        missing: ['Descendant Selector'],
        missingKeys: ['target'],
      },
    ]);
  });

  it('flags eq when the index is missing', () => {
    const result = findUnresolvedNodes(leaf('eq', { selector: '.items' }));
    expect(result).toEqual([
      { id: 'eq-1', type: 'eq', label: 'Eq', missing: ['Index'], missingKeys: ['index'] },
    ]);
  });

  it('does not flag contains for a missing selector (it is optional)', () => {
    const result = findUnresolvedNodes(leaf('contains', { text: 'Login' }));
    expect(result).toEqual([]);
  });

  it('flags contains for a missing required text', () => {
    const result = findUnresolvedNodes(leaf('contains', {}));
    expect(result).toEqual([
      { id: 'contains-1', type: 'contains', label: 'Contains', missing: ['Text'], missingKeys: ['text'] },
    ]);
  });

  it('never flags have.length for the optional numeric count', () => {
    const result = findUnresolvedNodes(
      leaf('should', { selector: '.item', assertion: 'have.length' }),
    );
    expect(result).toEqual([]);
  });

  it('reports both missing label and missing key for a multi-field gap', () => {
    const result = findUnresolvedNodes(leaf('type', {}));
    expect(result).toEqual([
      {
        id: 'type-1',
        type: 'type',
        label: 'Type',
        missing: ['Selector', 'Value'],
        missingKeys: ['selector', 'value'],
      },
    ]);
  });

  it('Phase 2: walks into a chain node\'s children like any other structural node', () => {
    const flow: FlowNode = {
      id: 'chain-1',
      type: 'chain',
      props: {},
      children: [leaf('get', { selector: '' }), leaf('click', { selector: '' })],
    };
    // The chain root's own selector is still required — it is what creates the
    // subject — so the traversal does reach into a chain like any other block.
    const result = findUnresolvedNodes(flow);
    expect(result).toEqual([
      { id: 'get-1', type: 'get', label: 'Get', missing: ['Selector'], missingKeys: ['selector'] },
    ]);
  });

  it('context-aware: a subject command inside a chain is not flagged for the selector it never uses', () => {
    const flow: FlowNode = {
      id: 'chain-1',
      type: 'chain',
      props: {},
      children: [leaf('get', { selector: '.items' }), leaf('click', { selector: '' })],
    };
    // `click`'s chain fragment is `.click()` — the subject came from `get`, so the
    // selector field is hidden in this context (function-props.json `visibleWhen`)
    // and detection must agree with the editor: no unresolvable warning.
    expect(findUnresolvedNodes(flow)).toEqual([]);
  });

  it('context-aware: the same command standalone still requires its selector', () => {
    const flow: FlowNode = {
      id: 'it-1',
      type: 'it',
      props: { label: 'a test' },
      children: [leaf('click', { selector: '' })],
    };
    // Regression guard for the flip side: outside a chain nothing supplies a
    // subject, so the pre-existing requirement is unchanged.
    expect(findUnresolvedNodes(flow)).toEqual([
      { id: 'click-1', type: 'click', label: 'Click', missing: ['Selector'], missingKeys: ['selector'] },
    ]);
  });

  it('context-aware: a chain subject command is still flagged for its own required fields', () => {
    const flow: FlowNode = {
      id: 'chain-1',
      type: 'chain',
      props: {},
      children: [leaf('get', { selector: '.items' }), leaf('eq', {})],
    };
    // Only `selector` is context-hidden; `index` is intrinsic to `eq`, so it must
    // still be reported (hiding is per-field metadata, not per-node).
    expect(findUnresolvedNodes(flow)).toEqual([
      { id: 'eq-1', type: 'eq', label: 'Eq', missing: ['Index'], missingKeys: ['index'] },
    ]);
  });

  it('Phase 1: flags a number field with a non-numeric value, not just an empty one', () => {
    const result = findUnresolvedNodes(leaf('eq', { selector: '.items', index: 'abc' }));
    expect(result).toEqual([
      { id: 'eq-1', type: 'eq', label: 'Eq', missing: ['Index'], missingKeys: ['index'] },
    ]);
  });

  it('Phase 1: does not flag a valid numeric value', () => {
    const result = findUnresolvedNodes(leaf('eq', { selector: '.items', index: '0' }));
    expect(result).toEqual([]);
  });

  it('Phase 1: never flags an optional numeric field for a non-numeric value (have.length count)', () => {
    const result = findUnresolvedNodes(
      leaf('should', { selector: '.item', assertion: 'have.length', count: 'many' }),
    );
    expect(result).toEqual([]);
  });

  it('walks into new structural hooks (beforeEach/afterEach)', () => {
    const flow: FlowNode = {
      id: 'root',
      type: 'describe',
      props: { label: 'Suite' },
      children: [
        {
          id: 'be-1',
          type: 'beforeEach',
          props: {},
          children: [{ id: 'check-1', type: 'check', props: {} }],
        },
      ],
    };
    const result = findUnresolvedNodes(flow);
    expect(result).toEqual([
      { id: 'check-1', type: 'check', label: 'Check', missing: ['Selector'], missingKeys: ['selector'] },
    ]);
  });

  it('Phase 2: flags an empty within as unresolved (a block with no body is pointless, not broken)', () => {
    const flow: FlowNode = { id: 'within-1', type: 'within', props: { selector: '.row' } };
    expect(findUnresolvedNodes(flow)).toEqual([
      {
        id: 'within-1',
        type: 'within',
        label: 'Within',
        missing: ['Block body is empty'],
        missingKeys: ['__body'],
      },
    ]);
  });

  it('Phase 2: does not flag a within once it has at least one child', () => {
    const flow: FlowNode = {
      id: 'within-1',
      type: 'within',
      props: { selector: '.row' },
      children: [leaf('log', { message: 'x' })],
    };
    expect(findUnresolvedNodes(flow)).toEqual([]);
  });

  it('Phase 2: an empty block AND a missing required prop are both reported for the same node', () => {
    const flow: FlowNode = { id: 'each-1', type: 'each', props: {} };
    expect(findUnresolvedNodes(flow)).toEqual([
      {
        id: 'each-1',
        type: 'each',
        label: 'Each',
        missing: ['Selector', 'Block body is empty'],
        missingKeys: ['selector', '__body'],
      },
    ]);
  });

  it('Phase 2: an empty session (root-level block, no chainRole) is flagged the same generic way', () => {
    const flow: FlowNode = { id: 'session-1', type: 'session', props: { id: 'x' } };
    expect(findUnresolvedNodes(flow)).toEqual([
      {
        id: 'session-1',
        type: 'session',
        label: 'Session',
        missing: ['Block body is empty'],
        missingKeys: ['__body'],
      },
    ]);
  });

  it('Phase 2: a plain leaf command (no children by definition) is never flagged for emptiness', () => {
    expect(findUnresolvedNodes(leaf('click', { selector: '#x' }))).toEqual([]);
  });

  it('Phase 2: an invalid (non-identifier) binding on then does not affect the required/selector check', () => {
    const flow: FlowNode = {
      id: 'then-1',
      type: 'then',
      props: { selector: '#x', as: '2cool' },
      children: [leaf('log', { message: 'x' })],
    };
    // `as` is optional, so an invalid value must never be reported as "missing" —
    // it just silently drops from the generated callback signature (processFlow.test.ts).
    expect(findUnresolvedNodes(flow)).toEqual([]);
  });
});

describe('findUnresolvedNodes — Phase 5 multi-slot composition (if)', () => {
  function ifWithSlots(condition: string, slotNames: string[] = ['then', 'else']): FlowNode {
    return {
      id: 'if-1',
      type: 'if',
      props: { condition },
      children: slotNames.map((name) => ({ id: `slot-${name}`, type: 'slot', props: { name }, children: [] })),
    };
  }

  it('flags a missing condition, the same generic required-field rule as any other node', () => {
    expect(findUnresolvedNodes(ifWithSlots(''))).toEqual([
      { id: 'if-1', type: 'if', label: 'If', missing: ['Condition'], missingKeys: ['condition'] },
    ]);
  });

  it('a valid condition with both slots correctly wired is never flagged', () => {
    expect(findUnresolvedNodes(ifWithSlots('true'))).toEqual([]);
  });

  it('flags invalid slot placement when a child is not a slot wrapper at all', () => {
    const flow: FlowNode = {
      id: 'if-1',
      type: 'if',
      props: { condition: 'true' },
      children: [{ id: 'stray', type: 'click', props: { selector: '#x' } }],
    };
    const result = findUnresolvedNodes(flow);
    expect(result).toEqual([
      {
        id: 'if-1',
        type: 'if',
        label: 'If',
        missing: ['Invalid slot placement'],
        missingKeys: ['__slot'],
      },
    ]);
  });

  it('flags invalid slot placement when a slot wrapper names something outside ["then", "else"]', () => {
    const result = findUnresolvedNodes(ifWithSlots('true', ['then', 'otherwise']));
    expect(result).toEqual([
      {
        id: 'if-1',
        type: 'if',
        label: 'If',
        missing: ['Invalid slot placement'],
        missingKeys: ['__slot'],
      },
    ]);
  });

  it('flags a stray "slot" node placed under an ordinary (non-slots) parent', () => {
    const flow: FlowNode = {
      id: 'it-1',
      type: 'it',
      props: { label: 'a test' },
      children: [{ id: 'slot-1', type: 'slot', props: { name: 'then' }, children: [] }],
    };
    const result = findUnresolvedNodes(flow);
    expect(result).toEqual([
      {
        id: 'it-1',
        type: 'it',
        label: 'Test Case',
        missing: ['Invalid slot placement'],
        missingKeys: ['__slot'],
      },
    ]);
  });
});

describe('findUnresolvedNodes — Phase 5 forEach / customCommand regression', () => {
  it('flags a forEach missing both its source expression and item binding', () => {
    const flow: FlowNode = {
      id: 'forEach-1',
      type: 'forEach',
      props: {},
      children: [leaf('log', { message: 'x' })],
    };
    expect(findUnresolvedNodes(flow)).toEqual([
      {
        id: 'forEach-1',
        type: 'forEach',
        label: 'For Each',
        missing: ['Array / Expression', 'Item binding'],
        missingKeys: ['source', 'itemAs'],
      },
    ]);
  });

  it('an empty forEach body is flagged the same generic way as any other block (each, within, ...)', () => {
    const flow: FlowNode = { id: 'forEach-1', type: 'forEach', props: { source: 'xs', itemAs: 'x' } };
    expect(findUnresolvedNodes(flow)).toEqual([
      {
        id: 'forEach-1',
        type: 'forEach',
        label: 'For Each',
        missing: ['Block body is empty'],
        missingKeys: ['__body'],
      },
    ]);
  });

  it('never flags the optional index binding once the body is non-empty', () => {
    const flow: FlowNode = {
      id: 'forEach-1',
      type: 'forEach',
      props: { source: 'xs', itemAs: 'x' },
      children: [leaf('log', { message: 'x' })],
    };
    expect(findUnresolvedNodes(flow)).toEqual([]);
  });

  it('flags a customCommand missing its method name', () => {
    expect(findUnresolvedNodes(leaf('customCommand', {}))).toEqual([
      { id: 'customCommand-1', type: 'customCommand', label: 'Custom Command', missing: ['Command Name'], missingKeys: ['commandName'] },
    ]);
  });

  it('never flags the optional arguments field', () => {
    expect(findUnresolvedNodes(leaf('customCommand', { commandName: 'login' }))).toEqual([]);
  });
});

describe('findUnresolvedNodes — Phase 5 reusable-flow invocation (dynamic argument schema)', () => {
  const LOGIN: ReusableFlowDef = {
    id: 'login',
    name: 'Login',
    params: [
      { key: 'username', label: 'Username', type: 'text', required: true },
      { key: 'password', label: 'Password', type: 'text', required: true },
    ],
    body: [{ id: 'l1', type: 'log', props: { message: 'x' } }],
  };

  it('flags a missing flowId when no flow has been selected yet', () => {
    const flow: FlowNode = { id: 'invoke-1', type: 'flowInvocation', props: {} };
    expect(findUnresolvedNodes(flow, undefined, [LOGIN])).toEqual([
      { id: 'invoke-1', type: 'flowInvocation', label: 'Reusable Flow', missing: ['Flow'], missingKeys: ['flowId'] },
    ]);
  });

  it('flags every missing required argument once a flow is selected', () => {
    const flow: FlowNode = { id: 'invoke-1', type: 'flowInvocation', props: { flowId: 'login' } };
    expect(findUnresolvedNodes(flow, undefined, [LOGIN])).toEqual([
      {
        id: 'invoke-1',
        type: 'flowInvocation',
        label: 'Reusable Flow',
        missing: ['Username', 'Password'],
        missingKeys: ['username', 'password'],
      },
    ]);
  });

  it('an invalid argument (declared type not satisfied) is reported the same as a missing one', () => {
    const NUMERIC: ReusableFlowDef = {
      id: 'wait-n',
      name: 'Wait N',
      params: [{ key: 'ms', label: 'Milliseconds', type: 'number', required: true }],
      body: [],
    };
    const flow: FlowNode = { id: 'invoke-1', type: 'flowInvocation', props: { flowId: 'wait-n', ms: 'soon' } };
    expect(findUnresolvedNodes(flow, undefined, [NUMERIC])).toEqual([
      { id: 'invoke-1', type: 'flowInvocation', label: 'Reusable Flow', missing: ['Milliseconds'], missingKeys: ['ms'] },
    ]);
  });

  it('is fully resolved once every argument is present and valid', () => {
    const flow: FlowNode = {
      id: 'invoke-1',
      type: 'flowInvocation',
      props: { flowId: 'login', username: 'admin', password: 'hunter2' },
    };
    expect(findUnresolvedNodes(flow, undefined, [LOGIN])).toEqual([]);
  });
});
