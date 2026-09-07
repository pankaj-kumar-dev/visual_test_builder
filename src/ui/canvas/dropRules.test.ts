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

describe('canDropInto — Phase 5 multi-slot composition (if) and control-flow/workflow/custom-command groups', () => {
  it('rejects any direct drop onto "if" — it only ever holds its own auto-seeded slots', () => {
    expect(canDropInto('if', 'click', reg)).toBe(false);
    expect(canDropInto('if', 'slot', reg)).toBe(false);
  });

  it('allows an ordinary command, and a nested if/forEach/customCommand, inside a "slot"', () => {
    for (const type of ['click', 'if', 'forEach', 'customCommand', 'flowInvocation', 'within']) {
      expect(canDropInto('slot', type, reg), type).toBe(true);
    }
  });

  it('rejects a direct drop onto "flowInvocation" — it has no user-editable children', () => {
    expect(canDropInto('flowInvocation', 'click', reg)).toBe(false);
  });

  it('allows if/forEach/customCommand/flowInvocation under it/beforeEach (control-flow, workflow, custom-command groups)', () => {
    for (const hook of ['it', 'beforeEach']) {
      for (const type of ['if', 'forEach', 'customCommand', 'flowInvocation']) {
        expect(canDropInto(hook, type, reg), `${hook} <- ${type}`).toBe(true);
      }
    }
  });

  it('rejects if/forEach/flowInvocation directly under describe, same as any other non-hook node', () => {
    for (const type of ['if', 'forEach', 'flowInvocation']) {
      expect(canDropInto('describe', type, reg)).toBe(false);
    }
  });

  it('allows customCommand inside a chain (it is chain-participable) but not if/forEach/flowInvocation', () => {
    expect(canDropInto('chain', 'customCommand', reg, [leaf('get')])).toBe(true);
    expect(canDropInto('chain', 'if', reg, [leaf('get')])).toBe(false);
    expect(canDropInto('chain', 'forEach', reg, [leaf('get')])).toBe(false);
  });
});

describe('canDropInto — Phase 5 completion: switch/case/default and try', () => {
  it('rejects any direct drop onto "switch" other than case/default', () => {
    expect(canDropInto('switch', 'click', reg)).toBe(false);
    expect(canDropInto('switch', 'if', reg)).toBe(false);
  });

  it('allows case and default onto "switch"', () => {
    expect(canDropInto('switch', 'case', reg)).toBe(true);
    expect(canDropInto('switch', 'default', reg)).toBe(true);
  });

  it('allows ordinary commands and nested control-flow inside a "case"/"default" body', () => {
    for (const parent of ['case', 'default']) {
      for (const type of ['click', 'if', 'forEach', 'switch', 'try', 'within']) {
        expect(canDropInto(parent, type, reg), `${parent} <- ${type}`).toBe(true);
      }
    }
  });

  it('rejects case/default directly under it/beforeEach/describe — only switch\'s own allowedChildren admits them', () => {
    for (const parent of ['it', 'beforeEach', 'describe']) {
      expect(canDropInto(parent, 'case', reg), parent).toBe(false);
      expect(canDropInto(parent, 'default', reg), parent).toBe(false);
    }
  });

  it('allows switch and try under it/beforeEach, same as if/forEach (the @control-flow wildcard)', () => {
    for (const hook of ['it', 'beforeEach']) {
      expect(canDropInto(hook, 'switch', reg)).toBe(true);
      expect(canDropInto(hook, 'try', reg)).toBe(true);
    }
  });

  it('rejects any direct drop onto "try" — it only ever holds its own auto-seeded try/catch/finally slots', () => {
    expect(canDropInto('try', 'click', reg)).toBe(false);
    expect(canDropInto('try', 'slot', reg)).toBe(false);
  });

  it('rejects switch/try inside a chain — neither is chain-participable', () => {
    expect(canDropInto('chain', 'switch', reg, [leaf('get')])).toBe(false);
    expect(canDropInto('chain', 'try', reg, [leaf('get')])).toBe(false);
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
