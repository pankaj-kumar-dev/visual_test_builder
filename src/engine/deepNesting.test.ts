/**
 * Regression — nested multi-slot nodes (e.g. `if` inside `if`'s `then`) must
 * generate in time linear in depth, not exponential.
 *
 * `renderBody` (engine/processFlow.ts) used to compute `node.children`'s
 * generated code unconditionally, even for a template with no `{{children}}`
 * token to put it in (a multi-slot node like `if` only ever uses
 * `{{slot:name}}`). That wasted computation re-generated the same subtree a
 * second time at every nesting level — once through the discarded result,
 * once through the slot it actually belongs to — compounding into O(2^depth):
 * fine at a handful of levels, a multi-minute hang by around 20, found while
 * exercising deeply nested trees as an edge case (reliability pass). Fixed by
 * only generating `node.children` when the template actually references
 * `{{children}}`.
 */

import { describe, expect, it } from 'vitest';
import { processFlow } from './processFlow';
import type { FlowNode } from '../domain/types';

function nestedIf(depth: number): FlowNode {
  if (depth === 0) return { id: 'leaf-click', type: 'click', props: { selector: '#bottom' } };
  return {
    id: `if-${depth}`,
    type: 'if',
    props: { condition: `level${depth}` },
    children: [
      { id: `slot-then-${depth}`, type: 'slot', props: { name: 'then' }, children: [nestedIf(depth - 1)] },
    ],
  };
}

describe('deeply nested multi-slot generation stays linear', () => {
  it('generates 200 levels of nested if in well under a second', () => {
    const flow: FlowNode = {
      id: 'root',
      type: 'describe',
      props: { label: 'Deep' },
      children: [{ id: 'it-1', type: 'it', props: { label: 'deep' }, children: [nestedIf(200)] }],
    };

    const start = Date.now();
    const code = processFlow(flow);
    const elapsedMs = Date.now() - start;

    expect(code).toContain("cy.get('#bottom').click();");
    expect(code.match(/if \(level/g)).toHaveLength(200);
    // Generous ceiling for a slow CI box: exponential blowup would be minutes,
    // not milliseconds, so this only needs to rule out the old behavior.
    expect(elapsedMs).toBeLessThan(2000);
  });
});
