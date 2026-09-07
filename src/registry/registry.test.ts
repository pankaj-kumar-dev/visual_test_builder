/**
 * Registry unit tests (docs/TEST_PLAN.md §5, "Unit — registry/registry").
 *
 * Two layers are covered:
 *  - `createRegistry` as a pure factory, exercised with small fixtures (existing
 *    validation behaviour: duplicate types, missing required fields).
 *  - The application's bundled registry (`getRegistry`), which is the contract the
 *    rest of the app relies on — every Phase 1 node must resolve through it.
 */

import { describe, expect, it } from 'vitest';
import { createRegistry, RegistryLoadError } from './registry';
import { getRegistry } from '../registry';
import { canContinueChain, getChainRole } from '../engine/chain';
import type { CommandNodeDef, FlowNode, StructuralNodeDef } from '../domain/types';

describe('createRegistry (pure factory)', () => {
  it('throws RegistryLoadError naming building-blocks.json on a duplicate structural type', () => {
    const block: StructuralNodeDef = {
      type: 'describe',
      label: 'Describe',
      category: 'structural',
      allowedChildren: [],
      props: [],
      codeTemplate: 'describe();',
    };
    expect(() =>
      createRegistry({ blocks: [block, block], functions: [], commandProps: {} }),
    ).toThrow(RegistryLoadError);
  });

  it('throws RegistryLoadError naming functions.json when a command has no codeTemplate', () => {
    const fn = { type: 'click', label: 'Click', category: 'command' } as CommandNodeDef;
    try {
      createRegistry({ blocks: [], functions: [fn], commandProps: {} });
      expect.unreachable('expected RegistryLoadError');
    } catch (error) {
      expect(error).toBeInstanceOf(RegistryLoadError);
      expect((error as RegistryLoadError).file).toBe('functions.json');
    }
  });

  it('throws RegistryLoadError when a structural node has no allowedChildren array', () => {
    const block = {
      type: 'describe',
      label: 'Describe',
      category: 'structural',
      props: [],
      codeTemplate: 'describe();',
    } as unknown as StructuralNodeDef;
    expect(() =>
      createRegistry({ blocks: [block], functions: [], commandProps: {} }),
    ).toThrow(RegistryLoadError);
  });

  it('derives codeTemplate for a chainRole:"subject" command that omits it (Phase 1, template dedup)', () => {
    const fn = {
      type: 'poke',
      label: 'Poke',
      category: 'command',
      chainRole: 'subject',
      chainTemplate: '.poke()',
    } as CommandNodeDef;
    const reg = createRegistry({ blocks: [], functions: [fn], commandProps: {} });
    expect(reg.getFunction('poke')?.codeTemplate).toBe("cy.get('{{selector}}').poke();");
  });

  it('still throws when codeTemplate is omitted and there is no chainTemplate to derive from', () => {
    const fn = { type: 'poke', label: 'Poke', category: 'command' } as CommandNodeDef;
    expect(() =>
      createRegistry({ blocks: [], functions: [fn], commandProps: {} }),
    ).toThrow(RegistryLoadError);
  });

  it('still throws when codeTemplate is omitted on a chainRole:"root" command (only "subject" is derivable)', () => {
    const fn = {
      type: 'poke',
      label: 'Poke',
      category: 'command',
      chainRole: 'root',
    } as CommandNodeDef;
    expect(() =>
      createRegistry({ blocks: [], functions: [fn], commandProps: {} }),
    ).toThrow(RegistryLoadError);
  });
});

describe('allowsChildType (Phase 1, "configuration scaling")', () => {
  it('matches a literal type entry', () => {
    const block = {
      type: 'container',
      label: 'Container',
      category: 'structural',
      allowedChildren: ['leaf'],
      props: [],
      codeTemplate: '{{children}}',
    } as StructuralNodeDef;
    const leaf = { type: 'leaf', label: 'Leaf', category: 'command', codeTemplate: 'leaf();' } as CommandNodeDef;
    const reg = createRegistry({ blocks: [block], functions: [leaf], commandProps: {} });
    expect(reg.allowsChildType(block, 'leaf')).toBe(true);
    expect(reg.allowsChildType(block, 'other')).toBe(false);
  });

  it('matches an "@group" wildcard entry against any definition sharing that group', () => {
    const block = {
      type: 'container',
      label: 'Container',
      category: 'structural',
      allowedChildren: ['@widget'],
      props: [],
      codeTemplate: '{{children}}',
    } as StructuralNodeDef;
    const a = { type: 'a', label: 'A', category: 'command', group: 'widget', codeTemplate: 'a();' } as CommandNodeDef;
    const b = { type: 'b', label: 'B', category: 'command', group: 'other', codeTemplate: 'b();' } as CommandNodeDef;
    const reg = createRegistry({ blocks: [block], functions: [a, b], commandProps: {} });
    expect(reg.allowsChildType(block, 'a')).toBe(true);
    expect(reg.allowsChildType(block, 'b')).toBe(false);
  });

  it('a group wildcard also matches a structural block sharing that group', () => {
    const parent = {
      type: 'parent',
      label: 'Parent',
      category: 'structural',
      allowedChildren: ['@nested'],
      props: [],
      codeTemplate: '{{children}}',
    } as StructuralNodeDef;
    const child = {
      type: 'child',
      label: 'Child',
      category: 'structural',
      group: 'nested',
      allowedChildren: [],
      props: [],
      codeTemplate: '{{children}}',
    } as StructuralNodeDef;
    const reg = createRegistry({ blocks: [parent, child], functions: [], commandProps: {} });
    expect(reg.allowsChildType(parent, 'child')).toBe(true);
  });

  it('an unknown child type never matches, wildcard or not', () => {
    const block = {
      type: 'container',
      label: 'Container',
      category: 'structural',
      allowedChildren: ['@anything'],
      props: [],
      codeTemplate: '{{children}}',
    } as StructuralNodeDef;
    const reg = createRegistry({ blocks: [block], functions: [], commandProps: {} });
    expect(reg.allowsChildType(block, 'ghost')).toBe(false);
  });
});

describe('bundled registry — structural nodes (Phase 1)', () => {
  const reg = getRegistry();

  it('exposes all nineteen structural blocks (incl. Phase 2\'s chain/within/then/each/session, Phase 5\'s slot/if/forEach/flowInvocation, and Phase 5 completion\'s switch/case/default/try)', () => {
    expect(reg.getAllBlocks()).toHaveLength(19);
  });

  it.each(['describe', 'it', 'beforeAll', 'afterAll', 'beforeEach', 'afterEach'])(
    'resolves "%s" with a codeTemplate',
    (type) => {
      const def = reg.getBlock(type);
      expect(def).not.toBeNull();
      expect(def?.codeTemplate).toBeTruthy();
    },
  );

  it('allows beforeEach and afterEach as children of describe', () => {
    const children = reg.getBlock('describe')?.allowedChildren ?? [];
    expect(children).toContain('beforeEach');
    expect(children).toContain('afterEach');
    // Regression: the pre-Phase-1 hooks must still be allowed.
    expect(children).toContain('beforeAll');
    expect(children).toContain('afterAll');
    expect(children).toContain('it');
  });

  it('beforeEach and afterEach compile to the expected function shells', () => {
    expect(reg.getBlock('beforeEach')?.codeTemplate).toBe('beforeEach(() => {\n{{children}}\n});');
    expect(reg.getBlock('afterEach')?.codeTemplate).toBe('afterEach(() => {\n{{children}}\n});');
  });

  it('every command type is an allowed child of it/beforeAll/afterAll/beforeEach/afterEach', () => {
    // Phase 1: hooks list their children as `@group` wildcards (configuration
    // scaling), so membership is checked through `allowsChildType` — the same
    // interface the drop rules use — rather than by scanning the raw array.
    const commandTypes = reg.getAllFunctions().map((fn) => fn.type);
    for (const hook of ['it', 'beforeAll', 'afterAll', 'beforeEach', 'afterEach']) {
      const def = reg.getBlock(hook)!;
      for (const commandType of commandTypes) {
        expect(reg.allowsChildType(def, commandType), `${hook} should allow ${commandType}`).toBe(
          true,
        );
      }
    }
  });
});

describe('bundled registry — command nodes (Phase 1)', () => {
  const reg = getRegistry();

  const NEW_QUERY = ['get', 'contains', 'find', 'first', 'last', 'eq'];
  const NEW_INTERACTION = [
    'clear', 'check', 'uncheck', 'select', 'dblclick', 'focus', 'blur', 'scrollIntoView',
  ];
  const EXISTING = ['click', 'type', 'visit', 'should'];

  it('exposes 56 command definitions in total (Phase 5 adds customCommand)', () => {
    expect(reg.getAllFunctions()).toHaveLength(56);
  });

  it.each([...EXISTING, ...NEW_QUERY, ...NEW_INTERACTION])(
    'resolves "%s" via getFunction with a codeTemplate',
    (type) => {
      const def = reg.getFunction(type);
      expect(def).not.toBeNull();
      expect(def?.category).toBe('command');
      expect(def?.codeTemplate).toBeTruthy();
    },
  );

  it('groups every command for the palette (no ungrouped command)', () => {
    for (const def of reg.getAllFunctions()) {
      expect(def.group, `${def.type} should have a palette group`).toBeTruthy();
    }
  });

  it('assigns the expected taxonomy category per command', () => {
    // Scalable Builder UI: `group` now carries the palette *taxonomy* category id
    // (categories.json) rather than the old ad-hoc navigation/query/interaction
    // buckets, so the palette can scale to the full Cypress taxonomy from config.
    const groupOf = (type: string) => reg.getFunction(type)?.group;
    expect(groupOf('visit')).toBe('browser');
    for (const type of NEW_QUERY) expect(groupOf(type)).toBe('traversal');
    for (const type of [...NEW_INTERACTION, 'click', 'type']) {
      expect(groupOf(type)).toBe('action');
    }
    expect(groupOf('should')).toBe('assertion');
  });

  it('requires selector on every new single-selector command', () => {
    for (const type of ['get', 'first', 'last', 'clear', 'check', 'uncheck', 'dblclick', 'focus', 'blur', 'scrollIntoView']) {
      const props = reg.getProps(type);
      const selector = props.find((p) => p.key === 'selector');
      expect(selector, `${type} should declare a selector prop`).toBeDefined();
      expect(selector?.required).toBe(true);
    }
  });

  it('contains requires text and allows an optional scoping selector', () => {
    const props = reg.getProps('contains');
    expect(props.find((p) => p.key === 'text')?.required).toBe(true);
    expect(props.find((p) => p.key === 'selector')?.required).toBe(false);
  });

  it('find requires both a container selector and a descendant target', () => {
    const props = reg.getProps('find');
    expect(props.find((p) => p.key === 'selector')?.required).toBe(true);
    expect(props.find((p) => p.key === 'target')?.required).toBe(true);
  });

  it('eq requires selector and index', () => {
    const props = reg.getProps('eq');
    expect(props.find((p) => p.key === 'selector')?.required).toBe(true);
    expect(props.find((p) => p.key === 'index')?.required).toBe(true);
  });

  it('select requires selector and value', () => {
    const props = reg.getProps('select');
    expect(props.find((p) => p.key === 'selector')?.required).toBe(true);
    expect(props.find((p) => p.key === 'value')?.required).toBe(true);
  });
});

describe('bundled registry — palette taxonomy (Scalable Builder UI)', () => {
  const reg = getRegistry();

  it('exposes the configured taxonomy in configuration order', () => {
    expect(reg.getCategories().map((c) => c.id)).toEqual([
      'structural',
      'traversal',
      'action',
      'assertion',
      'utility',
      'network',
      'browser',
      'data',
      'control-flow',
      'switch',
      'validation',
      'workflow',
      'custom-command',
    ]);
  });

  it('gives every category a display label so the palette never renders a raw id', () => {
    for (const category of reg.getCategories()) {
      expect(category.label, category.id).toBeTruthy();
    }
  });

  it('places every structural-group block in the structural category with a subgroup', () => {
    // Phase 5: not every *structural* (category) block sits in the *structural*
    // (taxonomy) group any more — `if`/`forEach`/`flowInvocation` are structural
    // nodes placed in their own control-flow/workflow groups (next test) — so
    // this only applies to the ones that do declare `group: 'structural'`.
    for (const def of reg.getAllBlocks()) {
      if (def.group !== 'structural') continue;
      expect(def.subgroup, def.type).toBeTruthy();
    }
  });

  it('places Phase 5 control-flow/workflow structural blocks in their own taxonomy groups', () => {
    expect(reg.getBlock('if')?.group).toBe('control-flow');
    expect(reg.getBlock('forEach')?.group).toBe('control-flow');
    expect(reg.getBlock('flowInvocation')?.group).toBe('workflow');
    expect(reg.getBlock('slot')?.group).toBe('structural');
  });

  it('points every node group at a configured category id', () => {
    const ids = new Set(reg.getCategories().map((c) => c.id));
    for (const def of [...reg.getAllBlocks(), ...reg.getAllFunctions()]) {
      expect(ids.has(def.group ?? ''), `${def.type} → ${def.group}`).toBe(true);
    }
  });

  it('points every declared subgroup at one configured for its category', () => {
    const byId = new Map(reg.getCategories().map((c) => [c.id, c]));
    for (const def of [...reg.getAllBlocks(), ...reg.getAllFunctions()]) {
      if (!def.subgroup) continue;
      const declared = (byId.get(def.group ?? '')?.subgroups ?? []).map((s) => s.id);
      expect(declared, `${def.type} → ${def.subgroup}`).toContain(def.subgroup);
    }
  });

  it('allows a category with no subgroups (assertion) and a node with no subgroup', () => {
    expect(reg.getCategories().find((c) => c.id === 'assertion')?.subgroups).toBeUndefined();
    expect(reg.getFunction('should')?.subgroup).toBeUndefined();
  });

  it('gives every node a description so palette search has text to match', () => {
    for (const def of [...reg.getAllBlocks(), ...reg.getAllFunctions()]) {
      expect(def.description, def.type).toBeTruthy();
    }
  });

  it('defaults to an empty taxonomy when configuration omits categories', () => {
    const reg2 = createRegistry({ blocks: [], functions: [], commandProps: {} });
    expect(reg2.getCategories()).toEqual([]);
  });

  it('throws RegistryLoadError naming categories.json on a duplicate category id', () => {
    const category = { id: 'action', label: 'Action' };
    try {
      createRegistry({
        blocks: [],
        functions: [],
        commandProps: {},
        categories: [category, category],
      });
      expect.unreachable('expected RegistryLoadError');
    } catch (error) {
      expect(error).toBeInstanceOf(RegistryLoadError);
      expect((error as RegistryLoadError).file).toBe('categories.json');
    }
  });
});

describe('bundled registry — context-aware property metadata', () => {
  const reg = getRegistry();

  it('hides a subject command\'s selector once the chain supplies the subject', () => {
    for (const type of [
      'find', 'first', 'last', 'eq', 'click', 'type', 'clear', 'check', 'uncheck',
      'select', 'dblclick', 'focus', 'blur', 'scrollIntoView', 'should',
    ]) {
      const selector = reg.getProps(type).find((p) => p.key === 'selector');
      expect(selector?.visibleWhen, type).toEqual({ hasSubject: false });
    }
  });

  it('leaves chain-root selectors unconditional (they create the subject)', () => {
    expect(reg.getProps('get').find((p) => p.key === 'selector')?.visibleWhen).toBeUndefined();
    expect(reg.getProps('contains').find((p) => p.key === 'selector')?.visibleWhen).toBeUndefined();
  });

  it('leaves a command\'s intrinsic fields unconditional', () => {
    expect(reg.getProps('eq').find((p) => p.key === 'index')?.visibleWhen).toBeUndefined();
    expect(reg.getProps('find').find((p) => p.key === 'target')?.visibleWhen).toBeUndefined();
    expect(reg.getProps('visit').find((p) => p.key === 'url')?.visibleWhen).toBeUndefined();
  });
});

describe('bundled registry — expanded assertion vocabulary', () => {
  const reg = getRegistry();
  const assertion = reg.getProps('should').find((p) => p.key === 'assertion');

  it('keeps every pre-existing assertion option (regression)', () => {
    for (const option of ['be.visible', 'not.exist', 'contain', 'have.value']) {
      expect(assertion?.options).toContain(option);
    }
  });

  it('adds the Phase 1 assertion options', () => {
    for (const option of [
      'exist', 'be.hidden', 'be.enabled', 'be.disabled', 'be.checked', 'not.be.checked',
      'have.text', 'contain.text', 'have.attr', 'have.class', 'have.length',
    ]) {
      expect(assertion?.options).toContain(option);
    }
  });

  it('exposes exactly 17 assertion options (Phase 2 adds eq/not.eq for its/invoke chains)', () => {
    expect(assertion?.options).toHaveLength(17);
  });

  it('keeps value optional and adds an optional numeric count for have.length', () => {
    const props = reg.getProps('should');
    expect(props.find((p) => p.key === 'value')?.required).toBe(false);
    expect(props.find((p) => p.key === 'count')?.required).toBe(false);
  });
});

describe('bundled registry — Phase 2 chain metadata', () => {
  const reg = getRegistry();

  it('registers "chain" as a structural, chain-composition node', () => {
    const def = reg.getBlock('chain');
    expect(def).not.toBeNull();
    expect(def?.category).toBe('structural');
    expect(def?.childComposition).toBe('chain');
  });

  it('allows chain as a child of every hook that allows commands', () => {
    for (const hook of ['it', 'beforeAll', 'afterAll', 'beforeEach', 'afterEach']) {
      expect(reg.getBlock(hook)?.allowedChildren, hook).toContain('chain');
    }
  });

  it('does not allow chain directly under describe', () => {
    expect(reg.getBlock('describe')?.allowedChildren).not.toContain('chain');
  });

  it('every command with a chainRole can open or continue a chain; every command without one never can', () => {
    // Phase 1: `chain`'s allowedChildren is now `@group` wildcards, so the real
    // gate is `canContinueChain` (engine/chain.ts) — the same rule the code
    // generator and drop rules apply — not raw array membership.
    const rootType = reg.getAllFunctions().find((fn) => fn.chainRole === 'root')!.type;
    const openedChain: FlowNode[] = [{ id: 'root-1', type: rootType, props: {} }];

    for (const fn of reg.getAllFunctions()) {
      if (fn.chainRole === 'root') {
        expect(canContinueChain([], fn.type, reg), `${fn.type} should open a chain`).toBe(true);
      } else if (fn.chainRole === 'subject') {
        expect(
          canContinueChain(openedChain, fn.type, reg),
          `${fn.type} should continue a chain`,
        ).toBe(true);
      } else {
        expect(canContinueChain([], fn.type, reg), `${fn.type} must not open a chain`).toBe(false);
        expect(
          canContinueChain(openedChain, fn.type, reg),
          `${fn.type} must not continue a chain`,
        ).toBe(false);
      }
    }
  });

  it('marks get/contains as chain roots', () => {
    expect(reg.getFunction('get')?.chainRole).toBe('root');
    expect(reg.getFunction('contains')?.chainRole).toBe('root');
  });

  it('marks visit with no chain role at all', () => {
    expect(reg.getFunction('visit')?.chainRole).toBeUndefined();
  });

  it('marks every other command as a subject continuation, with a chainTemplate', () => {
    const subjectCommands = [
      'find', 'first', 'last', 'eq', 'click', 'type', 'clear', 'check', 'uncheck',
      'select', 'dblclick', 'focus', 'blur', 'scrollIntoView', 'should',
    ];
    for (const type of subjectCommands) {
      const def = reg.getFunction(type);
      expect(def?.chainRole, type).toBe('subject');
      expect(def?.chainTemplate, type).toBeTruthy();
    }
  });
});

describe('bundled registry — Phase 1 command additions', () => {
  const reg = getRegistry();

  it('assigns the new commands to their taxonomy groups', () => {
    const groupOf = (type: string) => reg.getFunction(type)?.group;
    for (const type of ['children', 'parent', 'parents', 'siblings', 'next', 'prev', 'closest', 'filter']) {
      expect(groupOf(type), type).toBe('traversal');
    }
    for (const type of ['rightclick', 'trigger', 'submit']) {
      expect(groupOf(type), type).toBe('action');
    }
    expect(groupOf('and')).toBe('assertion');
    for (const type of ['reload', 'go', 'viewport', 'title', 'url']) {
      expect(groupOf(type), type).toBe('browser');
    }
    for (const type of ['log', 'wait', 'screenshot', 'pause', 'clearCookies', 'clearLocalStorage']) {
      expect(groupOf(type), type).toBe('utility');
    }
  });

  it('gives viewport and wait numeric props', () => {
    expect(reg.getProps('viewport').map((p) => p.type)).toEqual(['number', 'number']);
    expect(reg.getProps('wait').find((p) => p.key === 'ms')?.type).toBe('number');
  });

  it('gives eq and should(count) numeric props (Phase 1, "no invalid JS from numeric fields")', () => {
    expect(reg.getProps('eq').find((p) => p.key === 'index')?.type).toBe('number');
    expect(reg.getProps('should').find((p) => p.key === 'count')?.type).toBe('number');
    expect(reg.getProps('and').find((p) => p.key === 'count')?.type).toBe('number');
  });

  it('marks title/url as chain roots with no props of their own', () => {
    expect(reg.getFunction('title')?.chainRole).toBe('root');
    expect(reg.getFunction('url')?.chainRole).toBe('root');
    expect(reg.getProps('title')).toEqual([]);
    expect(reg.getProps('url')).toEqual([]);
  });

  it('gives reload/go/viewport/log/wait/screenshot/pause/clearCookies/clearLocalStorage no chain role', () => {
    for (const type of [
      'reload', 'go', 'viewport', 'log', 'wait', 'screenshot', 'pause', 'clearCookies', 'clearLocalStorage',
    ]) {
      expect(reg.getFunction(type)?.chainRole, type).toBeUndefined();
    }
  });

  it('describe/it/hooks resolve their allowedChildren via @group wildcards, still covering every command', () => {
    for (const hook of ['it', 'beforeAll', 'afterAll', 'beforeEach', 'afterEach']) {
      const raw = reg.getBlock(hook)?.allowedChildren ?? [];
      expect(raw.some((entry) => entry.startsWith('@')), hook).toBe(true);
    }
  });
});

describe('bundled registry — Phase 2 block nodes (within/then/each/session)', () => {
  const reg = getRegistry();

  it('registers all four as structural, block-composition nodes', () => {
    for (const type of ['within', 'then', 'each', 'session']) {
      const def = reg.getBlock(type);
      expect(def, type).not.toBeNull();
      expect(def?.category, type).toBe('structural');
      expect(def?.childComposition, type).toBe('block');
    }
  });

  it('within/then/each are chain-participable subject continuations; session never is', () => {
    expect(reg.getBlock('within')?.chainRole).toBe('subject');
    expect(reg.getBlock('then')?.chainRole).toBe('subject');
    expect(reg.getBlock('each')?.chainRole).toBe('subject');
    expect(reg.getBlock('session')?.chainRole).toBeUndefined();
  });

  it('getChainRole (engine/chain.ts) resolves a block node the same as a command', () => {
    expect(getChainRole('within', reg)).toBe('subject');
    expect(getChainRole('session', reg)).toBeNull();
  });

  it('derives within/then/each\'s standalone codeTemplate from chainTemplate, same rule as Phase 1 commands', () => {
    for (const type of ['within', 'then', 'each']) {
      const def = reg.getBlock(type)!;
      expect(def.codeTemplate).toBe(`cy.get('{{selector}}')${def.chainTemplate};`);
    }
  });

  it('session supplies its own explicit codeTemplate (not derivable — no chainRole)', () => {
    expect(reg.getBlock('session')?.codeTemplate).toBe(
      "cy.session('{{id}}', () => {\n{{children}}\n});",
    );
  });

  it('each has fixed literal bindsParameters; then has a single user-editable binding', () => {
    expect(reg.getBlock('each')?.bindsParameters).toEqual(['$el', 'index']);
    expect(reg.getBlock('then')?.bindsParameters).toEqual(['{{as}}']);
    expect(reg.getBlock('within')?.bindsParameters).toBeUndefined();
    expect(reg.getBlock('session')?.bindsParameters).toBeUndefined();
  });

  it('then\'s "as" prop is an optional binding field', () => {
    const asDef = reg.getBlock('then')?.props.find((p) => p.key === 'as');
    expect(asDef?.type).toBe('binding');
    expect(asDef?.required).toBe(false);
  });

  it('every block node can nest another block, chain, or ordinary command in its body', () => {
    for (const type of ['within', 'then', 'each', 'session']) {
      const allowed = reg.getBlock(type)!;
      for (const nested of ['within', 'then', 'each', 'session', 'chain']) {
        expect(reg.allowsChildType(allowed, nested), `${type} -> ${nested}`).toBe(true);
      }
      expect(reg.allowsChildType(allowed, 'click'), `${type} -> click`).toBe(true);
      expect(reg.allowsChildType(allowed, 'visit'), `${type} -> visit`).toBe(true);
    }
  });

  it('a chain accepts within/then/each as continuations but never session', () => {
    const chainDef = reg.getBlock('chain')!;
    expect(reg.allowsChildType(chainDef, 'within')).toBe(true);
    expect(reg.allowsChildType(chainDef, 'then')).toBe(true);
    expect(reg.allowsChildType(chainDef, 'each')).toBe(true);
    expect(reg.allowsChildType(chainDef, 'session')).toBe(false);
  });

  it('it/hooks accept every block node as a direct (self-anchoring) child', () => {
    for (const hook of ['it', 'beforeAll', 'afterAll', 'beforeEach', 'afterEach']) {
      const def = reg.getBlock(hook)!;
      for (const type of ['within', 'then', 'each', 'session']) {
        expect(reg.allowsChildType(def, type), `${hook} -> ${type}`).toBe(true);
      }
    }
  });
});

describe('bundled registry — Phase 2 its/invoke/wrap', () => {
  const reg = getRegistry();

  it('its and invoke are subject continuations with a derived standalone template', () => {
    for (const type of ['its', 'invoke']) {
      const def = reg.getFunction(type)!;
      expect(def.chainRole).toBe('subject');
      expect(def.codeTemplate).toBe(`cy.get('{{selector}}')${def.chainTemplate};`);
    }
  });

  it('wrap is a chain root with its own explicit template and a raw "expression" prop', () => {
    const def = reg.getFunction('wrap')!;
    expect(def.chainRole).toBe('root');
    expect(def.codeTemplate).toBe('cy.wrap({{expression}});');
    expect(reg.getProps('wrap').find((p) => p.key === 'expression')?.type).toBe('expression');
  });

  it('a chain accepts wrap as a root and its/invoke as continuations (they are group: traversal)', () => {
    const chainDef = reg.getBlock('chain')!;
    expect(reg.allowsChildType(chainDef, 'wrap')).toBe(true);
    expect(reg.allowsChildType(chainDef, 'its')).toBe(true);
    expect(reg.allowsChildType(chainDef, 'invoke')).toBe(true);
  });
});

describe('bundled registry — Phase 3 references (as/fixture/env/task/readFile/writeFile/getCookie/setCookie)', () => {
  const reg = getRegistry();

  it('"as" is a subject continuation with a reference-name prop', () => {
    const def = reg.getFunction('as')!;
    expect(def.chainRole).toBe('subject');
    const nameProp = reg.getProps('as').find((p) => p.key === 'name');
    expect(nameProp?.type).toBe('reference-name');
    expect(nameProp?.required).toBe(true);
  });

  it('"as" derives its standalone codeTemplate like any other subject command (Phase 1 dedup)', () => {
    const def = reg.getFunction('as')!;
    expect(def.codeTemplate).toBe(`cy.get('{{selector}}')${def.chainTemplate};`);
  });

  it('fixture and env are chain roots', () => {
    expect(reg.getFunction('fixture')?.chainRole).toBe('root');
    expect(reg.getFunction('env')?.chainRole).toBe('root');
  });

  it('task/readFile/writeFile/getCookie are chain roots; setCookie has no chain role', () => {
    for (const type of ['task', 'readFile', 'writeFile', 'getCookie']) {
      expect(reg.getFunction(type)?.chainRole, type).toBe('root');
    }
    expect(reg.getFunction('setCookie')?.chainRole).toBeUndefined();
  });

  it('all eight new commands are in the "data" palette group', () => {
    for (const type of ['as', 'fixture', 'env', 'task', 'readFile', 'writeFile', 'getCookie', 'setCookie']) {
      expect(reg.getFunction(type)?.group, type).toBe('data');
    }
  });

  it('get/contains/find selectors accept a reference (picker-UI hint)', () => {
    expect(reg.getProps('get').find((p) => p.key === 'selector')?.acceptsReference).toBe(true);
    expect(reg.getProps('contains').find((p) => p.key === 'selector')?.acceptsReference).toBe(true);
    expect(reg.getProps('find').find((p) => p.key === 'selector')?.acceptsReference).toBe(true);
  });

  it('an unrelated field never accepts a reference by default', () => {
    expect(reg.getProps('click').find((p) => p.key === 'selector')?.acceptsReference).toBeUndefined();
  });

  it('it/hooks/blocks and chain all admit the new "data" group via the @data wildcard', () => {
    for (const type of ['it', 'beforeAll', 'afterAll', 'beforeEach', 'afterEach', 'within', 'then', 'each', 'session', 'chain']) {
      const def = reg.getBlock(type)!;
      expect(reg.allowsChildType(def, 'as'), `${type} -> as`).toBe(true);
      expect(reg.allowsChildType(def, 'fixture'), `${type} -> fixture`).toBe(true);
    }
  });
});

describe('bundled registry — Phase 4 network (intercept/waitAlias/request)', () => {
  const reg = getRegistry();

  it('intercept and request are chain roots; waitAlias is a chain root too', () => {
    for (const type of ['intercept', 'request', 'waitAlias']) {
      expect(reg.getFunction(type)?.chainRole, type).toBe('root');
    }
  });

  it('all three are in the "network" palette group', () => {
    for (const type of ['intercept', 'request', 'waitAlias']) {
      expect(reg.getFunction(type)?.group, type).toBe('network');
    }
  });

  it('only waitAlias carries requiresTriggerBeforeUse', () => {
    expect(reg.getFunction('waitAlias')?.requiresTriggerBeforeUse).toBe(true);
    expect(reg.getFunction('intercept')?.requiresTriggerBeforeUse).toBeUndefined();
    expect(reg.getFunction('request')?.requiresTriggerBeforeUse).toBeUndefined();
    expect(reg.getFunction('get')?.requiresTriggerBeforeUse).toBeUndefined();
  });

  it("waitAlias's alias field accepts a reference (picker-UI hint)", () => {
    expect(reg.getProps('waitAlias').find((p) => p.key === 'alias')?.acceptsReference).toBe(true);
  });

  it('intercept/request method and stub/body fields are optional', () => {
    for (const [type, key] of [['intercept', 'method'], ['intercept', 'stubResponse'], ['request', 'method'], ['request', 'body']] as const) {
      expect(reg.getProps(type).find((p) => p.key === key)?.required, `${type}.${key}`).toBe(false);
    }
  });

  it('it/hooks/blocks and chain admit the new "network" group via the @network wildcard', () => {
    for (const type of ['it', 'beforeAll', 'afterAll', 'beforeEach', 'afterEach', 'within', 'then', 'each', 'session', 'chain']) {
      const def = reg.getBlock(type)!;
      expect(reg.allowsChildType(def, 'intercept'), `${type} -> intercept`).toBe(true);
      expect(reg.allowsChildType(def, 'waitAlias'), `${type} -> waitAlias`).toBe(true);
    }
  });
});

describe('bundled registry — Phase 5 completion: switch/case/default, try, and timeout config', () => {
  const reg = getRegistry();

  it('switch, case, default and try are all present with a codeTemplate', () => {
    for (const type of ['switch', 'case', 'default', 'try']) {
      expect(reg.getBlock(type)?.codeTemplate, type).toBeTruthy();
    }
  });

  it('switch declares min-1/max-1 childCardinality for case/default; case and default declare none', () => {
    expect(reg.getBlock('switch')?.childCardinality).toEqual({
      case: { min: 1, label: 'Case' },
      default: { max: 1, label: 'Default' },
    });
    expect(reg.getBlock('case')?.childCardinality).toBeUndefined();
    expect(reg.getBlock('default')?.childCardinality).toBeUndefined();
  });

  it('try declares try/catch/finally slots, with try and catch required', () => {
    expect(reg.getBlock('try')?.slots).toEqual(['try', 'catch', 'finally']);
    expect(reg.getBlock('try')?.requiredSlots).toEqual(['try', 'catch']);
  });

  it('switch, case, default and try are none of them chain-participable (no chainRole)', () => {
    for (const type of ['switch', 'case', 'default', 'try']) {
      expect(reg.getBlock(type)?.chainRole, type).toBeUndefined();
    }
  });

  it("it/hooks/blocks admit 'switch' and 'try' via the existing @control-flow wildcard — no new wildcard was introduced", () => {
    // `chain` deliberately does NOT admit @control-flow (same as the
    // pre-existing `if`/`forEach`) — a chain composes one Cypress subject
    // expression, and none of these are chain-participable (no `chainRole`).
    for (const type of ['it', 'beforeAll', 'afterAll', 'beforeEach', 'afterEach', 'within', 'then', 'each', 'session', 'forEach']) {
      const def = reg.getBlock(type)!;
      expect(reg.allowsChildType(def, 'switch'), `${type} -> switch`).toBe(true);
      expect(reg.allowsChildType(def, 'try'), `${type} -> try`).toBe(true);
    }
    expect(reg.allowsChildType(reg.getBlock('chain')!, 'switch')).toBe(false);
    expect(reg.allowsChildType(reg.getBlock('chain')!, 'try')).toBe(false);
  });

  it("'case' and 'default' are reachable ONLY through switch's own explicit allowedChildren — never via a group wildcard used elsewhere", () => {
    // This is the deliberate design choice, not an oversight: case/default use
    // a "switch"-only group precisely so they can never be dropped as a bare,
    // switch-less statement (which would be invalid JavaScript) into any of
    // the containers that admit @control-flow.
    const switchDef = reg.getBlock('switch')!;
    expect(reg.allowsChildType(switchDef, 'case')).toBe(true);
    expect(reg.allowsChildType(switchDef, 'default')).toBe(true);

    for (const type of ['it', 'beforeAll', 'afterAll', 'beforeEach', 'afterEach', 'within', 'then', 'each', 'session', 'forEach', 'chain']) {
      const def = reg.getBlock(type)!;
      expect(reg.allowsChildType(def, 'case'), `${type} -> case`).toBe(false);
      expect(reg.allowsChildType(def, 'default'), `${type} -> default`).toBe(false);
    }
  });

  it('switch itself only allows case/default as children — not arbitrary commands', () => {
    const switchDef = reg.getBlock('switch')!;
    expect(reg.allowsChildType(switchDef, 'click')).toBe(false);
    expect(reg.allowsChildType(switchDef, 'if')).toBe(false);
  });

  it('get/contains/find gained an optional numeric "timeout" prop (Phase 5D: Cypress-native command retry configuration)', () => {
    for (const type of ['get', 'contains', 'find']) {
      const prop = reg.getProps(type).find((p) => p.key === 'timeout');
      expect(prop, type).toBeDefined();
      expect(prop?.type, type).toBe('number');
      expect(prop?.required, type).toBe(false);
    }
  });
});
