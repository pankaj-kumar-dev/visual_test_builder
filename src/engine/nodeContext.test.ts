/**
 * Context-aware property resolution unit tests (Scalable Builder UI, Objective 4).
 *
 * Covers the four contexts named in the brief — root query, subject chain, index
 * query, action-with-subject — against the bundled registry, plus the generic
 * condition mechanism against fixtures (so the rule is proven to be metadata-driven
 * rather than tuned to today's 18 commands).
 */

import { describe, expect, it } from 'vitest';
import {
  childContext,
  deriveNodeContext,
  hiddenProps,
  matchesCondition,
  resolveSchema,
  ROOT_CONTEXT,
} from './nodeContext';
import { createRegistry, getRegistry } from '../registry';
import type { CommandNodeDef, FlowNode, StructuralNodeDef } from '../domain/types';

const reg = getRegistry();

/**
 * The §38 reference flow, in miniature: describe > it > chain > [get, find, eq, click],
 * plus a standalone click directly under `it` for the same-command-different-context
 * comparison.
 */
function chainFlow(): FlowNode {
  return {
    id: 'describe-1',
    type: 'describe',
    props: { label: 'Items' },
    children: [
      {
        id: 'it-1',
        type: 'it',
        props: { label: 'clicks a row' },
        children: [
          {
            id: 'chain-1',
            type: 'chain',
            props: {},
            children: [
              { id: 'get-1', type: 'get', props: { selector: '.rows' } },
              { id: 'find-1', type: 'find', props: { target: '.cell' } },
              { id: 'eq-1', type: 'eq', props: { index: '2' } },
              { id: 'click-1', type: 'click', props: {} },
            ],
          },
          { id: 'click-2', type: 'click', props: {} },
        ],
      },
    ],
  };
}

const keysOf = (type: string, node: FlowNode | null, flow: FlowNode) =>
  resolveSchema(type, deriveNodeContext(flow, node?.id ?? '', reg), reg).map((p) => p.def.key);

describe('deriveNodeContext', () => {
  const flow = chainFlow();

  it('gives the flow root no parent, no chain, no subject', () => {
    expect(deriveNodeContext(flow, 'describe-1', reg)).toEqual(ROOT_CONTEXT);
  });

  it('reports the parent type for an ordinary nested node', () => {
    expect(deriveNodeContext(flow, 'chain-1', reg)).toEqual({
      parentType: 'it',
      isInsideChain: false,
      hasSubject: false,
      bindingsInScope: [],
    });
  });

  it('marks a chain\'s first child as inside a chain but without a subject', () => {
    expect(deriveNodeContext(flow, 'get-1', reg)).toEqual({
      parentType: 'chain',
      isInsideChain: true,
      hasSubject: false,
      bindingsInScope: [],
    });
  });

  it('marks every later chain child as having received a subject', () => {
    for (const id of ['find-1', 'eq-1', 'click-1']) {
      expect(deriveNodeContext(flow, id, reg).hasSubject, id).toBe(true);
    }
  });

  it('does not give a subject to a command outside a chain', () => {
    expect(deriveNodeContext(flow, 'click-2', reg)).toEqual({
      parentType: 'it',
      isInsideChain: false,
      hasSubject: false,
      bindingsInScope: [],
    });
  });

  it('falls back to the root context for an unknown id or an empty flow', () => {
    expect(deriveNodeContext(flow, 'nope', reg)).toEqual(ROOT_CONTEXT);
    expect(deriveNodeContext(null, 'get-1', reg)).toEqual(ROOT_CONTEXT);
  });

  it('derives context from composition metadata, not from the parent\'s type name', () => {
    // A non-chain parent never confers a subject, whatever its children's roles.
    const it: FlowNode = { id: 'it-9', type: 'it', children: [] };
    expect(childContext(it, 3, reg).hasSubject).toBe(false);
  });
});

describe('resolveSchema — the four contexts from the brief', () => {
  const flow = chainFlow();
  const at = (id: string) => flow.children![0].children![0].children!.find((n) => n.id === id)!;

  it('root query (chain > get): the selector is the subject source, so it is shown', () => {
    expect(keysOf('get', at('get-1'), flow)).toEqual(['selector', 'timeout']);
  });

  it('subject query (chain > get > find): only what Find itself needs', () => {
    expect(keysOf('find', at('find-1'), flow)).toEqual(['target', 'timeout']);
  });

  it('index query (chain > … > eq): the index, not another selector', () => {
    expect(keysOf('eq', at('eq-1'), flow)).toEqual(['index']);
  });

  it('action with a subject (chain > … > click): nothing left to configure', () => {
    expect(keysOf('click', at('click-1'), flow)).toEqual([]);
  });

  it('the same command outside a chain keeps its full Phase 1 schema', () => {
    const standalone = flow.children![0].children![1];
    expect(keysOf('click', standalone, flow)).toEqual(['selector']);
  });

  it('an assertion in a chain keeps assertion/value/count and drops only the selector', () => {
    const inChain = { parentType: 'chain', isInsideChain: true, hasSubject: true, bindingsInScope: [] };
    expect(resolveSchema('should', inChain, reg).map((p) => p.def.key)).toEqual([
      'assertion', 'value', 'count',
    ]);
  });

  it('structural nodes are unaffected by chain context', () => {
    expect(resolveSchema('it', ROOT_CONTEXT, reg).map((p) => p.def.key)).toEqual(['label']);
  });

  it('reports what a context hides, so the editor can explain the absence', () => {
    const inChain = { parentType: 'chain', isInsideChain: true, hasSubject: true, bindingsInScope: [] };
    expect(hiddenProps('find', inChain, reg).map((p) => p.label)).toEqual(['Container Selector']);
    expect(hiddenProps('find', ROOT_CONTEXT, reg)).toEqual([]);
  });
});

describe('matchesCondition — the generic rule', () => {
  const context = { parentType: 'chain', isInsideChain: true, hasSubject: true, bindingsInScope: [] };

  it('holds when there is no condition at all', () => {
    expect(matchesCondition(undefined, context)).toBe(true);
    expect(matchesCondition({}, context)).toBe(true);
  });

  it('compares a single flag', () => {
    expect(matchesCondition({ hasSubject: true }, context)).toBe(true);
    expect(matchesCondition({ hasSubject: false }, context)).toBe(false);
  });

  it('requires every declared flag to hold (AND)', () => {
    expect(matchesCondition({ isInsideChain: true, hasSubject: true }, context)).toBe(true);
    expect(matchesCondition({ isInsideChain: true, hasSubject: false }, context)).toBe(false);
  });
});

describe('resolveSchema — mechanism, on fixtures', () => {
  const fixture = (props: StructuralNodeDef['props']) =>
    createRegistry({
      blocks: [],
      functions: [
        { type: 'demo', label: 'Demo', category: 'command', codeTemplate: 'cy.demo();' } as CommandNodeDef,
      ],
      commandProps: { demo: props },
    });

  const inChain = { parentType: 'chain', isInsideChain: true, hasSubject: true, bindingsInScope: [] };

  it('hides a field whose visibleWhen does not hold', () => {
    const registry = fixture([
      { key: 'a', label: 'A', type: 'text', required: true, visibleWhen: { hasSubject: false } },
      { key: 'b', label: 'B', type: 'text', required: true },
    ]);
    expect(resolveSchema('demo', inChain, registry).map((p) => p.def.key)).toEqual(['b']);
    expect(resolveSchema('demo', ROOT_CONTEXT, registry).map((p) => p.def.key)).toEqual(['a', 'b']);
  });

  it('keeps a disabledWhen field visible and marks it read-only (§21)', () => {
    const registry = fixture([
      { key: 'a', label: 'A', type: 'text', required: true, disabledWhen: { isInsideChain: true } },
    ]);
    expect(resolveSchema('demo', inChain, registry)).toEqual([
      { def: expect.objectContaining({ key: 'a' }), disabled: true },
    ]);
    expect(resolveSchema('demo', ROOT_CONTEXT, registry)[0].disabled).toBe(false);
  });

  it('leaves an unconditional field enabled in every context', () => {
    const registry = fixture([{ key: 'a', label: 'A', type: 'text', required: true }]);
    expect(resolveSchema('demo', inChain, registry)[0].disabled).toBe(false);
  });

  it('returns an empty schema for an unknown node type', () => {
    expect(resolveSchema('nope', ROOT_CONTEXT, fixture([]))).toEqual([]);
  });
});

describe('deriveNodeContext — Phase 2 bindingsInScope', () => {
  /** describe > it > each($el,index) > then(as:'val') > [leaf placeholder]. */
  function nestedBindingFlow(): FlowNode {
    return {
      id: 'describe-1',
      type: 'describe',
      props: { label: 'Suite' },
      children: [
        {
          id: 'it-1',
          type: 'it',
          props: { label: 'test' },
          children: [
            {
              id: 'each-1',
              type: 'each',
              props: { selector: '.rows' },
              children: [
                {
                  id: 'then-1',
                  type: 'then',
                  props: { selector: '.rows', as: 'val' },
                  children: [{ id: 'log-1', type: 'log', props: { message: 'x' } }],
                },
              ],
            },
          ],
        },
      ],
    };
  }

  it('the root and a node with no block ancestors see no bindings', () => {
    expect(ROOT_CONTEXT.bindingsInScope).toEqual([]);
    const flow = nestedBindingFlow();
    expect(deriveNodeContext(flow, 'it-1', reg).bindingsInScope).toEqual([]);
  });

  it("each's fixed params are visible to its direct child", () => {
    const flow = nestedBindingFlow();
    expect(deriveNodeContext(flow, 'then-1', reg).bindingsInScope).toEqual(['$el', 'index']);
  });

  it("both each's and then's bindings are visible three levels down (closure accumulation)", () => {
    const flow = nestedBindingFlow();
    expect(deriveNodeContext(flow, 'log-1', reg).bindingsInScope).toEqual(['$el', 'index', 'val']);
  });

  it('an unbound then (empty "as") contributes nothing to scope', () => {
    const flow = nestedBindingFlow();
    flow.children![0].children![0].children![0].props!.as = '';
    expect(deriveNodeContext(flow, 'log-1', reg).bindingsInScope).toEqual(['$el', 'index']);
  });

  it('an invalid binding name ("as: 2cool") contributes nothing to scope — matches what the generator actually emits', () => {
    const flow = nestedBindingFlow();
    flow.children![0].children![0].children![0].props!.as = '2cool';
    expect(deriveNodeContext(flow, 'log-1', reg).bindingsInScope).toEqual(['$el', 'index']);
  });

  it("a sibling branch never sees another branch's bindings", () => {
    const flow = nestedBindingFlow();
    // A plain click dropped as a second child of `it`, alongside `each` — it must
    // not inherit `each`'s bindings just because they're both under the same test.
    flow.children![0].children!.push({ id: 'click-1', type: 'click', props: {} });
    expect(deriveNodeContext(flow, 'click-1', reg).bindingsInScope).toEqual([]);
  });

  it('childContext defaults bindingsInScope to empty when the caller does not track it (engine/unresolved.ts)', () => {
    const flow = nestedBindingFlow();
    const each = flow.children![0].children![0];
    expect(childContext(each, 0, reg).bindingsInScope).toEqual([]);
  });
});
