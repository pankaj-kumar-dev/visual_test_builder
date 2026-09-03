/**
 * Generic multi-slot composition unit tests (Phase 5, engine/slots.ts).
 *
 * These are deliberately generic — a "widget" host with slots named "a"/"b"
 * that has nothing to do with `if` — proving the mechanism is metadata-driven
 * rather than tuned to today's one multi-slot construct.
 */

import { describe, expect, it } from 'vitest';
import {
  createSlotChildren,
  findSlotChild,
  hasInvalidSlotPlacement,
  slotHasContent,
  slotNameOf,
  SLOT_NODE_TYPE,
} from './slots';
import type { FlowNode } from '../domain/types';

function slot(name: string, children: FlowNode[] = []): FlowNode {
  return { id: `slot-${name}`, type: SLOT_NODE_TYPE, props: { name }, children };
}

function leaf(type: string): FlowNode {
  return { id: `${type}-1`, type, props: {} };
}

describe('slotNameOf', () => {
  it('returns the name prop for a slot node', () => {
    expect(slotNameOf(slot('a'))).toBe('a');
  });

  it('returns null for any non-slot node', () => {
    expect(slotNameOf(leaf('click'))).toBeNull();
  });

  it('returns null for a slot node with no name prop', () => {
    expect(slotNameOf({ id: 'x', type: SLOT_NODE_TYPE, props: {} })).toBeNull();
  });
});

describe('findSlotChild / slotHasContent', () => {
  it('finds the wrapper with the matching name among several children', () => {
    const host: FlowNode = { id: 'host', type: 'widget', props: {}, children: [slot('a'), slot('b')] };
    expect(findSlotChild(host, 'b')?.id).toBe('slot-b');
  });

  it('returns null when no wrapper matches', () => {
    const host: FlowNode = { id: 'host', type: 'widget', props: {}, children: [slot('a')] };
    expect(findSlotChild(host, 'b')).toBeNull();
  });

  it('reports content only when the slot has at least one child', () => {
    const host: FlowNode = {
      id: 'host',
      type: 'widget',
      props: {},
      children: [slot('a', [leaf('click')]), slot('b')],
    };
    expect(slotHasContent(host, 'a')).toBe(true);
    expect(slotHasContent(host, 'b')).toBe(false);
  });

  it('reports no content for a slot that is entirely absent', () => {
    const host: FlowNode = { id: 'host', type: 'widget', props: {}, children: [] };
    expect(slotHasContent(host, 'a')).toBe(false);
  });
});

describe('createSlotChildren', () => {
  it('builds one empty wrapper per declared name, in order, with fresh ids', () => {
    let n = 0;
    const children = createSlotChildren(['a', 'b'], () => `gen-${(n += 1)}`);
    expect(children).toEqual([
      { id: 'gen-1', type: SLOT_NODE_TYPE, props: { name: 'a' }, children: [] },
      { id: 'gen-2', type: SLOT_NODE_TYPE, props: { name: 'b' }, children: [] },
    ]);
  });
});

describe('hasInvalidSlotPlacement', () => {
  it('is false for a slots-declaring host whose children exactly match its slots', () => {
    const host: FlowNode = { id: 'host', type: 'widget', props: {}, children: [slot('a'), slot('b')] };
    expect(hasInvalidSlotPlacement(host, ['a', 'b'])).toBe(false);
  });

  it('is true when a slots-declaring host has an ordinary (non-slot) child', () => {
    const host: FlowNode = { id: 'host', type: 'widget', props: {}, children: [leaf('click')] };
    expect(hasInvalidSlotPlacement(host, ['a', 'b'])).toBe(true);
  });

  it('is true when a slot wrapper names something outside the declared slots', () => {
    const host: FlowNode = { id: 'host', type: 'widget', props: {}, children: [slot('a'), slot('ghost')] };
    expect(hasInvalidSlotPlacement(host, ['a', 'b'])).toBe(true);
  });

  it('is true when the slot name was edited away to blank', () => {
    const host: FlowNode = {
      id: 'host',
      type: 'widget',
      props: {},
      children: [{ id: 'slot-1', type: SLOT_NODE_TYPE, props: { name: '' } }],
    };
    expect(hasInvalidSlotPlacement(host, ['a'])).toBe(true);
  });

  it('is false for a non-slots host with only ordinary children', () => {
    const host: FlowNode = { id: 'host', type: 'it', props: {}, children: [leaf('click')] };
    expect(hasInvalidSlotPlacement(host, undefined)).toBe(false);
  });

  it('is true for a non-slots host that somehow has a slot-typed child (e.g. a hand-edited import)', () => {
    const host: FlowNode = { id: 'host', type: 'it', props: {}, children: [slot('a')] };
    expect(hasInvalidSlotPlacement(host, undefined)).toBe(true);
  });
});
