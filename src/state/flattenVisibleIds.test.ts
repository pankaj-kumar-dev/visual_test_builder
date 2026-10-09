/**
 * `flattenVisibleIds` unit tests (Phase 8, shift-click range-select).
 */

import { describe, expect, it } from 'vitest';
import { flattenVisibleIds } from './flowTree';
import type { FlowNode } from '../domain/types';

function tree(): FlowNode {
  return {
    id: 'describe-1',
    type: 'describe',
    props: {},
    children: [
      {
        id: 'it-1',
        type: 'it',
        props: {},
        children: [
          { id: 'visit-1', type: 'visit', props: {} },
          { id: 'click-1', type: 'click', props: {} },
        ],
      },
      { id: 'it-2', type: 'it', props: {}, children: [{ id: 'click-2', type: 'click', props: {} }] },
    ],
  };
}

describe('flattenVisibleIds', () => {
  it('lists every node in document order when nothing is collapsed', () => {
    expect(flattenVisibleIds(tree(), {})).toEqual([
      'describe-1',
      'it-1',
      'visit-1',
      'click-1',
      'it-2',
      'click-2',
    ]);
  });

  it('skips a collapsed node\'s descendants but still lists the node itself', () => {
    expect(flattenVisibleIds(tree(), { 'it-1': true })).toEqual(['describe-1', 'it-1', 'it-2', 'click-2']);
  });

  it('a stale collapsed flag on a now-childless node has no effect', () => {
    const leaf: FlowNode = { id: 'click-1', type: 'click', props: {} };
    expect(flattenVisibleIds(leaf, { 'click-1': true })).toEqual(['click-1']);
  });

  it('collapsing the root hides everything below it', () => {
    expect(flattenVisibleIds(tree(), { 'describe-1': true })).toEqual(['describe-1']);
  });
});
