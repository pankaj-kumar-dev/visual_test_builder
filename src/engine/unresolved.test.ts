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
import type { FlowNode } from '../domain/types';

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
});
