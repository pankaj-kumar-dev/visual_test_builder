/**
 * Drop-rule unit tests (docs/TEST_PLAN.md §5, "Unit — ui/canvas/dropRules").
 *
 * Covers the pre-existing `allowedChildren` membership rule (Phase 1 regression)
 * and the Phase 2 addition: chain-aware, position-sensitive validation driven by
 * each command's `chainRole` registry metadata.
 */

import { describe, expect, it } from 'vitest';
import { canDropInto, reorderTargetIndex } from './dropRules';
import { getRegistry } from '../../registry';
import type { FlowNode } from '../../domain/types';

const reg = getRegistry();

function leaf(type: string): FlowNode {
  return { id: `${type}-1`, type, props: {} };
}

describe('canDropInto — regression: ordinary structural nodes (Phase 1)', () => {
  it('allows a command as a direct child of it', () => {
    expect(canDropInto('it', 'click', reg)).toBe(true);
  });

  it('allows the expected hooks under describe', () => {
    for (const hook of ['it', 'beforeAll', 'afterAll', 'beforeEach', 'afterEach']) {
      expect(canDropInto('describe', hook, reg)).toBe(true);
    }
  });

  it('rejects a command directly under describe', () => {
    expect(canDropInto('describe', 'click', reg)).toBe(false);
  });

  it('rejects any drop into a command node (leaves accept no children)', () => {
    expect(canDropInto('click', 'type', reg)).toBe(false);
  });

  it('defaults existingChildren to empty and still validates non-chain parents correctly', () => {
    // No fourth argument passed — regression for callers written before Phase 2.
    expect(canDropInto('it', 'get', reg)).toBe(true);
  });
});

describe('canDropInto — Phase 2: chain is droppable only where a command was', () => {
  it('allows chain as a child of it/beforeAll/afterAll/beforeEach/afterEach', () => {
    for (const hook of ['it', 'beforeAll', 'afterAll', 'beforeEach', 'afterEach']) {
      expect(canDropInto(hook, 'chain', reg)).toBe(true);
    }
  });

  it('rejects chain directly under describe', () => {
    expect(canDropInto('describe', 'chain', reg)).toBe(false);
  });
});

describe('canDropInto — Phase 2: position-sensitive validation inside a chain', () => {
  it('allows a root command into an empty chain', () => {
    expect(canDropInto('chain', 'get', reg, [])).toBe(true);
    expect(canDropInto('chain', 'contains', reg, [])).toBe(true);
  });

  it('rejects a subject command as the first drop into an empty chain', () => {
    expect(canDropInto('chain', 'click', reg, [])).toBe(false);
    expect(canDropInto('chain', 'should', reg, [])).toBe(false);
  });

  it('allows a subject command after a root is already present', () => {
    expect(canDropInto('chain', 'click', reg, [leaf('get')])).toBe(true);
    expect(canDropInto('chain', 'find', reg, [leaf('get')])).toBe(true);
  });

  it('rejects a second root command after one is already present', () => {
    expect(canDropInto('chain', 'get', reg, [leaf('get')])).toBe(false);
    expect(canDropInto('chain', 'contains', reg, [leaf('get')])).toBe(false);
  });

  it('rejects visit inside a chain regardless of position', () => {
    expect(canDropInto('chain', 'visit', reg, [])).toBe(false);
    expect(canDropInto('chain', 'visit', reg, [leaf('get')])).toBe(false);
  });

  it('allows a subject command after multiple existing subject commands', () => {
    expect(
      canDropInto('chain', 'click', reg, [leaf('get'), leaf('find'), leaf('first')]),
    ).toBe(true);
  });
});

describe('reorderTargetIndex — regression: unaffected by the Phase 2 signature change', () => {
  it('resolves the target index for a sibling being moved earlier', () => {
    const children = [leaf('a'), leaf('b'), leaf('c')];
    expect(reorderTargetIndex(children, 'c-1', 0)).toBe(0);
  });

  it('returns null for a node that is not a current sibling', () => {
    const children = [leaf('a'), leaf('b')];
    expect(reorderTargetIndex(children, 'not-a-sibling', 0)).toBeNull();
  });
});
