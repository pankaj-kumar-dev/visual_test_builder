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
import type { CommandNodeDef, StructuralNodeDef } from '../domain/types';

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
});

describe('bundled registry — structural nodes (Phase 1)', () => {
  const reg = getRegistry();

  it('exposes all seven structural blocks (incl. Phase 2\'s chain)', () => {
    expect(reg.getAllBlocks()).toHaveLength(7);
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
    const commandTypes = reg.getAllFunctions().map((fn) => fn.type);
    for (const hook of ['it', 'beforeAll', 'afterAll', 'beforeEach', 'afterEach']) {
      const allowed = reg.getBlock(hook)?.allowedChildren ?? [];
      for (const commandType of commandTypes) {
        expect(allowed, `${hook} should allow ${commandType}`).toContain(commandType);
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

  it('exposes 18 command definitions in total', () => {
    expect(reg.getAllFunctions()).toHaveLength(18);
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

  it('places every structural block in the structural category with a subgroup', () => {
    for (const def of reg.getAllBlocks()) {
      expect(def.group, def.type).toBe('structural');
      expect(def.subgroup, def.type).toBeTruthy();
    }
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

  it('exposes exactly 15 assertion options', () => {
    expect(assertion?.options).toHaveLength(15);
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

  it('lists every chainable command (all but visit) as an allowed chain child', () => {
    const allowed = reg.getBlock('chain')?.allowedChildren ?? [];
    for (const type of reg.getAllFunctions().map((fn) => fn.type)) {
      if (type === 'visit') {
        expect(allowed, 'visit must not be chainable').not.toContain(type);
      } else {
        expect(allowed, `${type} should be an allowed chain child`).toContain(type);
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
