/**
 * Reusable-flow template unit tests (Phase 5, engine/reusableFlows.ts).
 *
 * Covers the four kept-separate concepts (definition, invocation, parameter,
 * argument) plus expansion and cycle detection, entirely with small fixture
 * definitions — the bundled Login/Search starters are exercised end-to-end
 * through `processFlow` in engine/goldenFlows.test.ts instead.
 */

import { describe, expect, it } from 'vitest';
import {
  expandInvocation,
  findFlowCycle,
  findFlowDef,
  interpolate,
  resolveInvocationSchema,
} from './reusableFlows';
import type { FlowNode, ReusableFlowDef } from '../domain/types';

const GREET: ReusableFlowDef = {
  id: 'greet',
  name: 'Greet',
  params: [
    { key: 'name', label: 'Name', type: 'text', required: true },
    { key: 'times', label: 'Times', type: 'number', required: false },
  ],
  body: [
    { id: 'greet-log', type: 'log', props: { message: 'Hello {{name}}, {{times}}x, literal {{unknown}}' } },
    {
      id: 'greet-type',
      type: 'type',
      props: { selector: '#x', value: '{{name}}' },
      children: [],
    },
  ],
};

function invocation(props: Record<string, string>): FlowNode {
  return { id: 'inv-1', type: 'flowInvocation', props };
}

describe('findFlowDef', () => {
  it('finds a definition by id', () => {
    expect(findFlowDef('greet', [GREET])).toBe(GREET);
  });

  it('returns null for an unknown id', () => {
    expect(findFlowDef('ghost', [GREET])).toBeNull();
  });

  it('returns null for an absent/blank id', () => {
    expect(findFlowDef(undefined, [GREET])).toBeNull();
    expect(findFlowDef('', [GREET])).toBeNull();
  });
});

describe('resolveInvocationSchema', () => {
  it('always includes a required flowId picker with every known id as an option', () => {
    const schema = resolveInvocationSchema(invocation({}), [GREET]);
    expect(schema[0]).toEqual({
      key: 'flowId',
      label: 'Flow',
      type: 'dropdown',
      required: true,
      options: ['greet'],
    });
  });

  it('adds one field per parameter of the currently selected definition', () => {
    const schema = resolveInvocationSchema(invocation({ flowId: 'greet' }), [GREET]);
    expect(schema).toEqual([
      { key: 'flowId', label: 'Flow', type: 'dropdown', required: true, options: ['greet'] },
      { key: 'name', label: 'Name', type: 'text', required: true, options: undefined },
      { key: 'times', label: 'Times', type: 'number', required: false, options: undefined },
    ]);
  });

  it('adds no parameter fields when no definition is selected yet', () => {
    const schema = resolveInvocationSchema(invocation({}), [GREET]);
    expect(schema).toHaveLength(1);
  });

  it('adds no parameter fields when the selected flowId is unknown', () => {
    const schema = resolveInvocationSchema(invocation({ flowId: 'ghost' }), [GREET]);
    expect(schema).toHaveLength(1);
  });
});

describe('interpolate', () => {
  const params = GREET.params;

  it('replaces every occurrence of a declared parameter token', () => {
    expect(interpolate('{{name}} and {{name}} again', { name: 'Al' }, params)).toBe('Al and Al again');
  });

  it('substitutes an absent argument with an empty string rather than leaving a gap', () => {
    expect(interpolate('x={{name}}', {}, params)).toBe('x=');
  });

  it('leaves a token that names no declared parameter untouched', () => {
    expect(interpolate('{{unknown}}', { name: 'Al' }, params)).toBe('{{unknown}}');
  });

  it('leaves plain text with no tokens untouched', () => {
    expect(interpolate('no tokens here', {}, params)).toBe('no tokens here');
  });
});

describe('expandInvocation', () => {
  it('substitutes every declared parameter across the whole body, deep', () => {
    const expanded = expandInvocation(invocation({ flowId: 'greet', name: 'Al', times: '3' }), [GREET]);
    expect(expanded).toEqual([
      { id: 'greet-log', type: 'log', props: { message: 'Hello Al, 3x, literal {{unknown}}' } },
      { id: 'greet-type', type: 'type', props: { selector: '#x', value: 'Al' }, children: [] },
    ]);
  });

  it('returns null when the invocation names no known definition', () => {
    expect(expandInvocation(invocation({ flowId: 'ghost' }), [GREET])).toBeNull();
  });

  it('never mutates the source definition (repeated, differently-argued expansion)', () => {
    const before = JSON.stringify(GREET);
    expandInvocation(invocation({ flowId: 'greet', name: 'Al' }), [GREET]);
    expandInvocation(invocation({ flowId: 'greet', name: 'Zoe' }), [GREET]);
    expect(JSON.stringify(GREET)).toBe(before);
  });

  it('produces a deep copy, not a reference into the definition body', () => {
    const expanded = expandInvocation(invocation({ flowId: 'greet', name: 'Al' }), [GREET])!;
    expect(expanded[0]).not.toBe(GREET.body[0]);
    expect(expanded[1].children).not.toBe(GREET.body[1].children);
  });
});

describe('findFlowCycle', () => {
  it('returns null when a definition never invokes anything', () => {
    expect(findFlowCycle('greet', [GREET])).toBeNull();
  });

  it('returns null for an unknown flow id', () => {
    expect(findFlowCycle('ghost', [GREET])).toBeNull();
  });

  it('detects a definition that invokes itself directly', () => {
    const SELF: ReusableFlowDef = {
      id: 'self',
      name: 'Self',
      params: [],
      body: [{ id: 'inv', type: 'flowInvocation', props: { flowId: 'self' } }],
    };
    expect(findFlowCycle('self', [SELF])).toEqual(['self', 'self']);
  });

  it('detects a transitive cycle through another definition', () => {
    const A: ReusableFlowDef = {
      id: 'a',
      name: 'A',
      params: [],
      body: [{ id: 'inv-b', type: 'flowInvocation', props: { flowId: 'b' } }],
    };
    const B: ReusableFlowDef = {
      id: 'b',
      name: 'B',
      params: [],
      body: [{ id: 'inv-a', type: 'flowInvocation', props: { flowId: 'a' } }],
    };
    expect(findFlowCycle('a', [A, B])).toEqual(['a', 'b', 'a']);
  });

  it('finds a nested invocation several levels deep in the body tree', () => {
    const A: ReusableFlowDef = {
      id: 'a',
      name: 'A',
      params: [],
      body: [
        {
          id: 'wrapper',
          type: 'within',
          props: {},
          children: [{ id: 'inv', type: 'flowInvocation', props: { flowId: 'a' } }],
        },
      ],
    };
    expect(findFlowCycle('a', [A])).toEqual(['a', 'a']);
  });

  it('does not flag two definitions that invoke each other-free flows with no cycle', () => {
    const A: ReusableFlowDef = {
      id: 'a',
      name: 'A',
      params: [],
      body: [{ id: 'inv-b', type: 'flowInvocation', props: { flowId: 'b' } }],
    };
    const B: ReusableFlowDef = { id: 'b', name: 'B', params: [], body: [] };
    expect(findFlowCycle('a', [A, B])).toBeNull();
  });
});
