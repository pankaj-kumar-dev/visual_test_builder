/**
 * Processing engine unit tests (docs/TEST_PLAN.md §5, "Unit — engine/processFlow").
 *
 * Uses the bundled registry (the real config), since Phase 1's goal is coverage of
 * the actual shipped templates, not a synthetic fixture. Every new command gets a
 * generation test; the pre-Phase-1 commands are re-asserted as regression coverage
 * (docs/TEST_PLAN.md §16 requires this project to protect fixed/existing behaviour).
 */

import { describe, expect, it } from 'vitest';
import { processFlow } from './processFlow';
import { createRegistry } from '../registry/registry';
import { getRegistry } from '../registry';
import type { CommandNodeDef, FlowNode, ReusableFlowDef } from '../domain/types';

function leaf(type: string, props: Record<string, string> = {}): FlowNode {
  return { id: `${type}-1`, type, props };
}

function chain(...children: FlowNode[]): FlowNode {
  return { id: 'chain-1', type: 'chain', props: {}, children };
}

/** A node with its own children (Phase 2 block nodes: within/then/each/session). */
function block(
  type: string,
  props: Record<string, string> = {},
  children: FlowNode[] = [],
): FlowNode {
  return { id: `${type}-1`, type, props, children };
}

/**
 * An `if` node with its two slot wrappers built by hand (Phase 5) — mirrors
 * exactly what state/builderSlice.ts's `addNode` auto-seeds, since these tests
 * exercise the generator directly rather than through the reducer.
 */
function ifNode(condition: string, thenChildren: FlowNode[] = [], elseChildren: FlowNode[] = []): FlowNode {
  return {
    id: 'if-1',
    type: 'if',
    props: { condition },
    children: [
      { id: 'slot-then', type: 'slot', props: { name: 'then' }, children: thenChildren },
      { id: 'slot-else', type: 'slot', props: { name: 'else' }, children: elseChildren },
    ],
  };
}

/** A `flowInvocation` node (Phase 5) invoking `flowId` with the given arguments. */
function invoke(flowId: string, args: Record<string, string> = {}): FlowNode {
  return { id: 'invoke-1', type: 'flowInvocation', props: { flowId, ...args } };
}

describe('processFlow — regression: pre-existing commands', () => {
  it('click', () => {
    expect(processFlow(leaf('click', { selector: '#login' }))).toBe(
      "cy.get('#login').click();",
    );
  });

  it('type', () => {
    expect(processFlow(leaf('type', { selector: '#username', value: 'admin' }))).toBe(
      "cy.get('#username').type('admin');",
    );
  });

  it('visit', () => {
    expect(processFlow(leaf('visit', { url: '/login' }))).toBe("cy.visit('/login');");
  });

  it('should — be.visible (no value)', () => {
    expect(
      processFlow(leaf('should', { selector: '#message', assertion: 'be.visible' })),
    ).toBe("cy.get('#message').should('be.visible');");
  });

  it('should — have.value (existing optional value segment)', () => {
    expect(
      processFlow(
        leaf('should', { selector: '#email', assertion: 'have.value', value: 'dev@example.com' }),
      ),
    ).toBe("cy.get('#email').should('have.value', 'dev@example.com');");
  });

  it('retains the placeholder for a missing required prop instead of breaking', () => {
    expect(processFlow(leaf('click', {}))).toBe("cy.get('{{selector}}').click();");
  });

  it('escapes single quotes in an interpolated value', () => {
    expect(processFlow(leaf('type', { selector: '#name', value: "O'Brien" }))).toBe(
      "cy.get('#name').type('O\\'Brien');",
    );
  });

  it('emits a comment placeholder for an unknown node type', () => {
    expect(processFlow(leaf('teleport', {}))).toBe(
      '// [Unknown node: teleport] — not found in registry',
    );
  });

  it('reproduces the HLD/README worked example end to end (describe > it > [type, click])', () => {
    const flow: FlowNode = {
      id: 'root',
      type: 'describe',
      props: { label: 'Login Suite' },
      children: [
        {
          id: 'it-1',
          type: 'it',
          props: { label: 'Successful Login' },
          children: [
            { id: 'type-1', type: 'type', props: { selector: '#username', value: 'admin' } },
            { id: 'click-1', type: 'click', props: { selector: '#login' } },
          ],
        },
      ],
    };
    expect(processFlow(flow)).toBe(
      "describe('Login Suite', () => {\n" +
        "  it('Successful Login', () => {\n" +
        "    cy.get('#username').type('admin');\n" +
        "    cy.get('#login').click();\n" +
        '  });\n' +
        '});',
    );
  });
});

describe('processFlow — Phase 1 structural: beforeEach / afterEach', () => {
  it('beforeEach compiles to a bare function shell', () => {
    expect(processFlow(leaf('beforeEach'))).toBe('beforeEach(() => {\n\n});');
  });

  it('afterEach compiles to a bare function shell', () => {
    expect(processFlow(leaf('afterEach'))).toBe('afterEach(() => {\n\n});');
  });

  it('describe > beforeEach > visit, describe > it > click', () => {
    const flow: FlowNode = {
      id: 'root',
      type: 'describe',
      props: { label: 'Login' },
      children: [
        {
          id: 'be-1',
          type: 'beforeEach',
          props: {},
          children: [{ id: 'visit-1', type: 'visit', props: { url: '/login' } }],
        },
        {
          id: 'it-1',
          type: 'it',
          props: { label: 'logs in' },
          children: [{ id: 'click-1', type: 'click', props: { selector: '#submit' } }],
        },
      ],
    };
    expect(processFlow(flow)).toBe(
      "describe('Login', () => {\n" +
        '  beforeEach(() => {\n' +
        "    cy.visit('/login');\n" +
        '  });\n' +
        "  it('logs in', () => {\n" +
        "    cy.get('#submit').click();\n" +
        '  });\n' +
        '});',
    );
  });
});

describe('processFlow — Phase 1 query commands', () => {
  it('get', () => {
    expect(processFlow(leaf('get', { selector: '.foo' }))).toBe("cy.get('.foo');");
  });

  it('contains — primary form, no scoping selector', () => {
    expect(processFlow(leaf('contains', { text: 'Login' }))).toBe("cy.contains('Login');");
  });

  it('contains — with an optional scoping selector', () => {
    expect(processFlow(leaf('contains', { text: 'Login', selector: '.nav' }))).toBe(
      "cy.get('.nav').contains('Login');",
    );
  });

  it('find — self-contained container + descendant statement', () => {
    expect(
      processFlow(leaf('find', { selector: '.container', target: '.item' })),
    ).toBe("cy.get('.container').find('.item');");
  });

  it('first', () => {
    expect(processFlow(leaf('first', { selector: '.items' }))).toBe(
      "cy.get('.items').first();",
    );
  });

  it('last', () => {
    expect(processFlow(leaf('last', { selector: '.items' }))).toBe(
      "cy.get('.items').last();",
    );
  });

  it('eq — index is emitted unquoted (numeric argument)', () => {
    expect(processFlow(leaf('eq', { selector: '.items', index: '0' }))).toBe(
      "cy.get('.items').eq(0);",
    );
  });
});

describe('processFlow — Phase 1 interaction commands', () => {
  it('clear', () => {
    expect(processFlow(leaf('clear', { selector: '#email' }))).toBe(
      "cy.get('#email').clear();",
    );
  });

  it('check', () => {
    expect(processFlow(leaf('check', { selector: '#terms' }))).toBe(
      "cy.get('#terms').check();",
    );
  });

  it('uncheck', () => {
    expect(processFlow(leaf('uncheck', { selector: '#terms' }))).toBe(
      "cy.get('#terms').uncheck();",
    );
  });

  it('select', () => {
    expect(processFlow(leaf('select', { selector: '#country', value: 'India' }))).toBe(
      "cy.get('#country').select('India');",
    );
  });

  it('dblclick', () => {
    expect(processFlow(leaf('dblclick', { selector: '.card' }))).toBe(
      "cy.get('.card').dblclick();",
    );
  });

  it('focus', () => {
    expect(processFlow(leaf('focus', { selector: '#username' }))).toBe(
      "cy.get('#username').focus();",
    );
  });

  it('blur', () => {
    expect(processFlow(leaf('blur', { selector: '#username' }))).toBe(
      "cy.get('#username').blur();",
    );
  });

  it('scrollIntoView', () => {
    expect(processFlow(leaf('scrollIntoView', { selector: '#footer' }))).toBe(
      "cy.get('#footer').scrollIntoView();",
    );
  });
});

describe('processFlow — Phase 1 expanded assertions', () => {
  it.each([
    ['exist', "cy.get('#x').should('exist');"],
    ['be.hidden', "cy.get('#x').should('be.hidden');"],
    ['be.enabled', "cy.get('#x').should('be.enabled');"],
    ['be.disabled', "cy.get('#x').should('be.disabled');"],
    ['be.checked', "cy.get('#x').should('be.checked');"],
    ['not.be.checked', "cy.get('#x').should('not.be.checked');"],
  ])('%s — no value argument', (assertion, expected) => {
    expect(processFlow(leaf('should', { selector: '#x', assertion }))).toBe(expected);
  });

  it('have.text', () => {
    expect(
      processFlow(
        leaf('should', { selector: '.error', assertion: 'have.text', value: 'Invalid credentials' }),
      ),
    ).toBe("cy.get('.error').should('have.text', 'Invalid credentials');");
  });

  it('contain.text', () => {
    expect(
      processFlow(leaf('should', { selector: '.error', assertion: 'contain.text', value: 'Invalid' })),
    ).toBe("cy.get('.error').should('contain.text', 'Invalid');");
  });

  it('have.attr', () => {
    expect(
      processFlow(leaf('should', { selector: 'a', assertion: 'have.attr', value: 'href' })),
    ).toBe("cy.get('a').should('have.attr', 'href');");
  });

  it('have.class', () => {
    expect(
      processFlow(leaf('should', { selector: '.btn', assertion: 'have.class', value: 'active' })),
    ).toBe("cy.get('.btn').should('have.class', 'active');");
  });

  it('have.length — count is emitted unquoted (numeric argument)', () => {
    expect(
      processFlow(leaf('should', { selector: '.item', assertion: 'have.length', count: '5' })),
    ).toBe("cy.get('.item').should('have.length', 5);");
  });
});

describe('processFlow — Phase 2 chain generation', () => {
  it('basic: get → click, one line (two fragments)', () => {
    const flow = chain(leaf('get', { selector: '.button' }), leaf('click'));
    expect(processFlow(flow)).toBe("cy.get('.button').click();");
  });

  it('query chain: get → find, one line', () => {
    const flow = chain(leaf('get', { selector: '.container' }), leaf('find', { target: '.item' }));
    expect(processFlow(flow)).toBe("cy.get('.container').find('.item');");
  });

  it('multi-step: get → find → first → click, breaks onto indented lines', () => {
    const flow = chain(
      leaf('get', { selector: '.container' }),
      leaf('find', { target: '.item' }),
      leaf('first'),
      leaf('click'),
    );
    expect(processFlow(flow)).toBe(
      "cy.get('.container')\n" +
        "  .find('.item')\n" +
        '  .first()\n' +
        '  .click();',
    );
  });

  it('eq: get → eq → click, three fragments break onto indented lines', () => {
    const flow = chain(
      leaf('get', { selector: '.items' }),
      leaf('eq', { index: '0' }),
      leaf('click'),
    );
    // Three fragments -> multi-line per the formatting rule (only a 2-fragment
    // chain stays on one line); this locks in that rule for a 3-step chain too.
    expect(processFlow(flow)).toBe("cy.get('.items')\n  .eq(0)\n  .click();");
  });

  it('contains → click, one line', () => {
    const flow = chain(leaf('contains', { text: 'Login' }), leaf('click'));
    expect(processFlow(flow)).toBe("cy.contains('Login').click();");
  });

  it('assertion: get → should, one line', () => {
    const flow = chain(leaf('get', { selector: '#email' }), leaf('should', { assertion: 'be.visible' }));
    expect(processFlow(flow)).toBe("cy.get('#email').should('be.visible');");
  });

  it('assertion with value: get → should(have.value)', () => {
    const flow = chain(
      leaf('get', { selector: '#email' }),
      leaf('should', { assertion: 'have.value', value: 'dev@example.com' }),
    );
    expect(processFlow(flow)).toBe("cy.get('#email').should('have.value', 'dev@example.com');");
  });

  it('numeric assertion: get → should(have.length)', () => {
    const flow = chain(
      leaf('get', { selector: '.items' }),
      leaf('should', { assertion: 'have.length', count: '5' }),
    );
    expect(processFlow(flow)).toBe("cy.get('.items').should('have.length', 5);");
  });

  it('full form-fill example from the brief', () => {
    const flow = chain(
      leaf('get', { selector: '.form' }),
      leaf('find', { target: '#email' }),
      leaf('clear'),
      leaf('type', { value: 'dev@example.com' }),
      leaf('should', { assertion: 'have.value', value: 'dev@example.com' }),
    );
    expect(processFlow(flow)).toBe(
      "cy.get('.form')\n" +
        "  .find('#email')\n" +
        '  .clear()\n' +
        "  .type('dev@example.com')\n" +
        "  .should('have.value', 'dev@example.com');",
    );
  });

  it('nested inside describe > it, correctly indented alongside a standalone sibling', () => {
    const flow: FlowNode = {
      id: 'root',
      type: 'describe',
      props: { label: 'Example' },
      children: [
        {
          id: 'it-1',
          type: 'it',
          props: { label: 'does something' },
          children: [
            leaf('visit', { url: '/example' }),
            chain(
              leaf('get', { selector: '.container' }),
              leaf('find', { target: '.item' }),
              leaf('first'),
              leaf('click'),
              leaf('should', { assertion: 'be.visible' }),
            ),
          ],
        },
      ],
    };
    expect(processFlow(flow)).toBe(
      "describe('Example', () => {\n" +
        "  it('does something', () => {\n" +
        "    cy.visit('/example');\n" +
        "    cy.get('.container')\n" +
        "      .find('.item')\n" +
        '      .first()\n' +
        '      .click()\n' +
        "      .should('be.visible');\n" +
        '  });\n' +
        '});',
    );
  });

  it('nested inside a beforeEach hook', () => {
    const flow: FlowNode = {
      id: 'root',
      type: 'describe',
      props: { label: 'Login' },
      children: [
        {
          id: 'be-1',
          type: 'beforeEach',
          props: {},
          children: [chain(leaf('get', { selector: '#username' }), leaf('type', { value: 'admin' }))],
        },
      ],
    };
    expect(processFlow(flow)).toBe(
      "describe('Login', () => {\n" +
        '  beforeEach(() => {\n' +
        "    cy.get('#username').type('admin');\n" +
        '  });\n' +
        '});',
    );
  });
});

describe('processFlow — Phase 2 invalid chains render a comment, never broken code', () => {
  it('empty chain', () => {
    expect(processFlow(chain())).toBe(
      '// [Invalid chain] — chain must contain at least one command',
    );
  });

  it('chain starting with a subject command', () => {
    expect(processFlow(chain(leaf('click')))).toBe(
      '// [Invalid chain] — chain must begin with a root command (e.g. get, contains)',
    );
  });

  it('chain containing a non-chainable command (visit)', () => {
    expect(processFlow(chain(leaf('get', { selector: '.x' }), leaf('visit', { url: '/x' })))).toBe(
      '// [Invalid chain] — "visit" cannot be used inside a chain',
    );
  });

  it('chain with two root commands', () => {
    expect(
      processFlow(chain(leaf('get', { selector: '.a' }), leaf('get', { selector: '.b' }))),
    ).toMatch(/^\/\/ \[Invalid chain\]/);
  });
});

describe('processFlow — Phase 2 regression: standalone commands are unaffected by chaining', () => {
  it('a chainable command used standalone (outside any chain) still self-anchors exactly as Phase 1', () => {
    // Same assertions as the Phase 1 "regression: pre-existing commands" block above,
    // re-run here to make the point explicit: adding chainRole/chainTemplate metadata
    // to click/find/etc. did not change their standalone codeTemplate or output.
    expect(processFlow(leaf('find', { selector: '.container', target: '.item' }))).toBe(
      "cy.get('.container').find('.item');",
    );
    expect(processFlow(leaf('first', { selector: '.items' }))).toBe("cy.get('.items').first();");
    expect(processFlow(leaf('eq', { selector: '.items', index: '0' }))).toBe(
      "cy.get('.items').eq(0);",
    );
  });

  it('sibling standalone commands under `it` do not implicitly chain', () => {
    const flow: FlowNode = {
      id: 'it-1',
      type: 'it',
      props: { label: 'independent statements' },
      children: [
        leaf('get', { selector: '.items' }),
        leaf('click', { selector: '.items' }),
      ],
    };
    expect(processFlow(flow)).toBe(
      "it('independent statements', () => {\n" +
        "  cy.get('.items');\n" +
        "  cy.get('.items').click();\n" +
        '});',
    );
  });
});

describe('processFlow — Phase 1 traversal expansion', () => {
  it('children — no filter', () => {
    expect(processFlow(leaf('children', { selector: '.list' }))).toBe(
      "cy.get('.list').children();",
    );
  });

  it('children — with an optional filter (template-dedup: no codeTemplate authored)', () => {
    expect(processFlow(leaf('children', { selector: '.list', match: '.item' }))).toBe(
      "cy.get('.list').children('.item');",
    );
  });

  it('parent', () => {
    expect(processFlow(leaf('parent', { selector: '.item' }))).toBe("cy.get('.item').parent();");
  });

  it('parents — with filter', () => {
    expect(processFlow(leaf('parents', { selector: '.item', match: '.list' }))).toBe(
      "cy.get('.item').parents('.list');",
    );
  });

  it('siblings', () => {
    expect(processFlow(leaf('siblings', { selector: '.item' }))).toBe(
      "cy.get('.item').siblings();",
    );
  });

  it('next', () => {
    expect(processFlow(leaf('next', { selector: '.item' }))).toBe("cy.get('.item').next();");
  });

  it('prev', () => {
    expect(processFlow(leaf('prev', { selector: '.item' }))).toBe("cy.get('.item').prev();");
  });

  it('closest — required match', () => {
    expect(processFlow(leaf('closest', { selector: '.item', match: '.row' }))).toBe(
      "cy.get('.item').closest('.row');",
    );
  });

  it('filter — required match', () => {
    expect(processFlow(leaf('filter', { selector: '.item', match: '.active' }))).toBe(
      "cy.get('.item').filter('.active');",
    );
  });

  it('chained: get -> children -> click', () => {
    const flow = chain(
      leaf('get', { selector: '.list' }),
      leaf('children', { match: '.item' }),
      leaf('click'),
    );
    expect(processFlow(flow)).toBe("cy.get('.list')\n  .children('.item')\n  .click();");
  });
});

describe('processFlow — Phase 1 action expansion', () => {
  it('rightclick', () => {
    expect(processFlow(leaf('rightclick', { selector: '.card' }))).toBe(
      "cy.get('.card').rightclick();",
    );
  });

  it('trigger', () => {
    expect(processFlow(leaf('trigger', { selector: '.slider', eventName: 'mouseover' }))).toBe(
      "cy.get('.slider').trigger('mouseover');",
    );
  });

  it('submit', () => {
    expect(processFlow(leaf('submit', { selector: 'form' }))).toBe("cy.get('form').submit();");
  });

  it('chained: get -> rightclick', () => {
    const flow = chain(leaf('get', { selector: '.card' }), leaf('rightclick'));
    expect(processFlow(flow)).toBe("cy.get('.card').rightclick();");
  });
});

describe('processFlow — Phase 1 browser/navigation commands', () => {
  it('reload', () => {
    expect(processFlow(leaf('reload'))).toBe('cy.reload();');
  });

  it('go', () => {
    expect(processFlow(leaf('go', { direction: 'back' }))).toBe("cy.go('back');");
  });

  it('viewport — numeric width/height, emitted unquoted', () => {
    expect(processFlow(leaf('viewport', { width: '375', height: '667' }))).toBe(
      'cy.viewport(375, 667);',
    );
  });

  it('title', () => {
    expect(processFlow(leaf('title'))).toBe('cy.title();');
  });

  it('url', () => {
    expect(processFlow(leaf('url'))).toBe('cy.url();');
  });

  it('title is chainable with should (real Cypress semantics: cy.title() yields an assertable subject)', () => {
    const flow = chain(leaf('title'), leaf('should', { assertion: 'contain', value: 'My App' }));
    expect(processFlow(flow)).toBe("cy.title().should('contain', 'My App');");
  });

  it('url is chainable with should', () => {
    const flow = chain(leaf('url'), leaf('should', { assertion: 'contain', value: '/dashboard' }));
    expect(processFlow(flow)).toBe("cy.url().should('contain', '/dashboard');");
  });
});

describe('processFlow — Phase 1 utility commands', () => {
  it('log', () => {
    expect(processFlow(leaf('log', { message: 'checkpoint' }))).toBe("cy.log('checkpoint');");
  });

  it('wait — numeric ms, emitted unquoted', () => {
    expect(processFlow(leaf('wait', { ms: '500' }))).toBe('cy.wait(500);');
  });

  it('screenshot — no name', () => {
    expect(processFlow(leaf('screenshot'))).toBe('cy.screenshot();');
  });

  it('screenshot — with an optional name', () => {
    expect(processFlow(leaf('screenshot', { name: 'login-page' }))).toBe(
      "cy.screenshot('login-page');",
    );
  });

  it('pause', () => {
    expect(processFlow(leaf('pause'))).toBe('cy.pause();');
  });

  it('clearCookies', () => {
    expect(processFlow(leaf('clearCookies'))).toBe('cy.clearCookies();');
  });

  it('clearLocalStorage', () => {
    expect(processFlow(leaf('clearLocalStorage'))).toBe('cy.clearLocalStorage();');
  });
});

describe('processFlow — Phase 1 "and" assertion (chains onto should)', () => {
  it('and — standalone, self-anchoring like should', () => {
    expect(processFlow(leaf('and', { selector: '#x', assertion: 'be.visible' }))).toBe(
      "cy.get('#x').and('be.visible');",
    );
  });

  it('should -> and, chained (the real-world usage)', () => {
    const flow = chain(
      leaf('get', { selector: '#email' }),
      leaf('should', { assertion: 'be.visible' }),
      leaf('and', { assertion: 'have.attr', value: 'type' }),
    );
    expect(processFlow(flow)).toBe(
      "cy.get('#email')\n  .should('be.visible')\n  .and('have.attr', 'type');",
    );
  });
});

describe('processFlow — Phase 1 generator safety: number fields never produce invalid JS', () => {
  it('eq — non-numeric index leaves the placeholder instead of emitting invalid JS', () => {
    expect(processFlow(leaf('eq', { selector: '.items', index: 'abc' }))).toBe(
      "cy.get('.items').eq({{index}});",
    );
  });

  it('eq — missing index leaves the placeholder (regression: same visible-gap behavior as before)', () => {
    expect(processFlow(leaf('eq', { selector: '.items' }))).toBe("cy.get('.items').eq({{index}});");
  });

  it('eq — a decimal/whitespace-padded index still normalizes to a clean numeric literal', () => {
    expect(processFlow(leaf('eq', { selector: '.items', index: ' 2 ' }))).toBe(
      "cy.get('.items').eq(2);",
    );
  });

  it('viewport — a non-numeric width leaves that placeholder only', () => {
    expect(processFlow(leaf('viewport', { width: 'wide', height: '800' }))).toBe(
      'cy.viewport({{width}}, 800);',
    );
  });

  it('should(have.length) — a non-numeric optional count is dropped cleanly, no dangling comma', () => {
    expect(
      processFlow(leaf('should', { selector: '.item', assertion: 'have.length', count: 'many' })),
    ).toBe("cy.get('.item').should('have.length');");
  });

  it('should(have.length) — a valid count still renders as before (regression)', () => {
    expect(
      processFlow(leaf('should', { selector: '.item', assertion: 'have.length', count: '3' })),
    ).toBe("cy.get('.item').should('have.length', 3);");
  });
});

describe('processFlow — Phase 1 generator safety: optional placeholders never leak literally', () => {
  // A synthetic registry (not the bundled config) proves the rule generically:
  // even a template that references an optional prop *without* the [[key:...]]
  // wrapper must never leak "{{key}}" into output — the bundled config happens
  // to always use the wrapper today, but the engine must not depend on that.
  const reg = createRegistry({
    blocks: [],
    functions: [
      {
        type: 'ghost-optional',
        label: 'Ghost (optional)',
        category: 'command',
        codeTemplate: "cy.log('start {{tag}} end');",
      } as CommandNodeDef,
      {
        type: 'ghost-required',
        label: 'Ghost (required)',
        category: 'command',
        codeTemplate: "cy.log('{{msg}}');",
      } as CommandNodeDef,
    ],
    commandProps: {
      'ghost-optional': [{ key: 'tag', label: 'Tag', type: 'text', required: false }],
      'ghost-required': [{ key: 'msg', label: 'Msg', type: 'text', required: true }],
    },
  });

  it('drops a bare optional placeholder cleanly when the prop is absent', () => {
    expect(processFlow(leaf('ghost-optional', {}), reg)).toBe("cy.log('start  end');");
  });

  it('still fills a bare optional placeholder when the prop is present', () => {
    expect(processFlow(leaf('ghost-optional', { tag: 'X' }), reg)).toBe("cy.log('start X end');");
  });

  it('a bare REQUIRED placeholder still stays visible when missing (unchanged deliberate behavior)', () => {
    expect(processFlow(leaf('ghost-required', {}), reg)).toBe("cy.log('{{msg}}');");
  });
});

describe('processFlow — Phase 1 template duplication: derived standalone codeTemplate', () => {
  // Proves engine/chain.ts's deriveStandaloneTemplate against the bundled config:
  // every command that omits its own codeTemplate in functions.json must still
  // compile to exactly `cy.get('{{selector}}')` + its chainTemplate.
  it.each(['children', 'parent', 'parents', 'siblings', 'next', 'prev', 'closest', 'filter', 'rightclick', 'trigger', 'submit', 'and'])(
    '"%s" has no authored codeTemplate; its standalone output is derived from chainTemplate',
    (type) => {
      const def = getRegistry().getFunction(type)!;
      expect(def.codeTemplate).toBe(`cy.get('{{selector}}')${def.chainTemplate};`);
    },
  );
});

describe('processFlow — Phase 2 block composition: within', () => {
  it('standalone (self-anchoring), one chained child', () => {
    const flow = block('within', { selector: '.row' }, [
      chain(leaf('get', { selector: '.name' }), leaf('should', { assertion: 'be.visible' })),
    ]);
    expect(processFlow(flow)).toBe(
      "cy.get('.row').within(() => {\n" + "  cy.get('.name').should('be.visible');\n" + '});',
    );
  });

  it('as a chain continuation produces the identical expression (get -> within)', () => {
    const flow = chain(
      leaf('get', { selector: '.row' }),
      block('within', {}, [
        chain(leaf('get', { selector: '.name' }), leaf('should', { assertion: 'be.visible' })),
      ]),
    );
    expect(processFlow(flow)).toBe(
      "cy.get('.row').within(() => {\n" + "  cy.get('.name').should('be.visible');\n" + '});',
    );
  });

  it('an empty within still generates a harmless shell, same as an empty hook', () => {
    expect(processFlow(block('within', { selector: '.row' }, []))).toBe(
      "cy.get('.row').within(() => {\n\n});",
    );
  });

  it('nested within-in-within, each self-anchoring, indentation compounds correctly', () => {
    const flow = block('within', { selector: '.section' }, [
      block('within', { selector: '.row' }, [
        chain(leaf('get', { selector: '.name' }), leaf('should', { assertion: 'be.visible' })),
      ]),
    ]);
    expect(processFlow(flow)).toBe(
      "cy.get('.section').within(() => {\n" +
        "  cy.get('.row').within(() => {\n" +
        "    cy.get('.name').should('be.visible');\n" +
        '  });\n' +
        '});',
    );
  });
});

describe('processFlow — Phase 2 block composition: then', () => {
  it('standalone, no bound name — callback takes no parameters', () => {
    const flow = block('then', { selector: '.user' }, [leaf('log', { message: 'ran' })]);
    expect(processFlow(flow)).toBe(
      "cy.get('.user').then(() => {\n" + "  cy.log('ran');\n" + '});',
    );
  });

  it('standalone, with a bound name — callback parameter appears', () => {
    const flow = block('then', { selector: '.user', as: 'user' }, [leaf('log', { message: 'ran' })]);
    expect(processFlow(flow)).toBe(
      "cy.get('.user').then((user) => {\n" + "  cy.log('ran');\n" + '});',
    );
  });

  it('an invalid binding name is dropped, not emitted as broken JS ("generator safety")', () => {
    const flow = block('then', { selector: '.user', as: '2cool' }, [leaf('log', { message: 'ran' })]);
    expect(processFlow(flow)).toBe(
      "cy.get('.user').then(() => {\n" + "  cy.log('ran');\n" + '});',
    );
  });
});

describe('processFlow — Phase 2 block composition: each (+ wrap, block containing a chain)', () => {
  it('fixed $el/index callback params; a chain inside iterates the bound element', () => {
    const flow = block('each', { selector: '.rows' }, [
      chain(
        leaf('wrap', { expression: '$el' }),
        leaf('find', { target: '.name' }),
        leaf('should', { assertion: 'be.visible' }),
      ),
    ]);
    expect(processFlow(flow)).toBe(
      "cy.get('.rows').each(($el, index) => {\n" +
        '  cy.wrap($el)\n' +
        "    .find('.name')\n" +
        "    .should('be.visible');\n" +
        '});',
    );
  });
});

describe('processFlow — Phase 2 block composition: session (root-level, never chain-participable)', () => {
  it('generates a setup callback with ordinary statement children', () => {
    const flow = block('session', { id: 'user-session' }, [
      leaf('visit', { url: '/login' }),
      leaf('type', { selector: '#username', value: 'admin' }),
    ]);
    expect(processFlow(flow)).toBe(
      "cy.session('user-session', () => {\n" +
        "  cy.visit('/login');\n" +
        "  cy.get('#username').type('admin');\n" +
        '});',
    );
  });

  it('never has a chainRole — cannot appear as a chain child at all', () => {
    const flow = chain(leaf('get', { selector: '.x' }), block('session', { id: 'x' }, []));
    expect(processFlow(flow)).toMatch(/^\/\/ \[Invalid chain\]/);
  });
});

describe('processFlow — Phase 2 nested blocks (within + each, block containing block)', () => {
  it('within > each > chain(wrap, find, should) — three composition layers deep', () => {
    const flow = block('within', { selector: '.list' }, [
      block('each', { selector: '.row' }, [
        chain(
          leaf('wrap', { expression: '$el' }),
          leaf('find', { target: '.name' }),
          leaf('should', { assertion: 'be.visible' }),
        ),
      ]),
    ]);
    expect(processFlow(flow)).toBe(
      "cy.get('.list').within(() => {\n" +
        "  cy.get('.row').each(($el, index) => {\n" +
        '    cy.wrap($el)\n' +
        "      .find('.name')\n" +
        "      .should('be.visible');\n" +
        '  });\n' +
        '});',
    );
  });

  it('each > then — two callback levels, second binds a name', () => {
    const flow = block('each', { selector: '.rows' }, [
      block('then', { selector: '.rows', as: 'val' }, [leaf('log', { message: 'logged' })]),
    ]);
    expect(processFlow(flow)).toBe(
      "cy.get('.rows').each(($el, index) => {\n" +
        "  cy.get('.rows').then((val) => {\n" +
        "    cy.log('logged');\n" +
        '  });\n' +
        '});',
    );
  });

  it('within > each > then — three callback levels deep, indentation compounds by one level each', () => {
    const flow = block('within', { selector: '.panel' }, [
      block('each', { selector: '.rows' }, [
        block('then', { selector: '.rows', as: 'val' }, [leaf('log', { message: 'x' })]),
      ]),
    ]);
    expect(processFlow(flow)).toBe(
      "cy.get('.panel').within(() => {\n" +
        "  cy.get('.rows').each(($el, index) => {\n" +
        "    cy.get('.rows').then((val) => {\n" +
        "      cy.log('x');\n" +
        '    });\n' +
        '  });\n' +
        '});',
    );
  });
});

describe('processFlow — Phase 2 its / invoke / wrap', () => {
  it('its — standalone', () => {
    expect(processFlow(leaf('its', { selector: '.list', propertyPath: 'length' }))).toBe(
      "cy.get('.list').its('length');",
    );
  });

  it('its — chained with should(eq)', () => {
    const flow = chain(
      leaf('get', { selector: '.list' }),
      leaf('its', { propertyPath: 'length' }),
      leaf('should', { assertion: 'eq', value: '3' }),
    );
    expect(processFlow(flow)).toBe("cy.get('.list')\n  .its('length')\n  .should('eq', '3');");
  });

  it('invoke — standalone', () => {
    expect(processFlow(leaf('invoke', { selector: 'button', methodName: 'text' }))).toBe(
      "cy.get('button').invoke('text');",
    );
  });

  it('invoke — chained with should(eq)', () => {
    const flow = chain(
      leaf('get', { selector: 'button' }),
      leaf('invoke', { methodName: 'text' }),
      leaf('should', { assertion: 'eq', value: 'Submit' }),
    );
    expect(processFlow(flow)).toBe(
      "cy.get('button')\n  .invoke('text')\n  .should('eq', 'Submit');",
    );
  });

  it('wrap — standalone, expression emitted raw/unescaped (not a quoted string)', () => {
    expect(processFlow(leaf('wrap', { expression: "Cypress.env('user')" }))).toBe(
      "cy.wrap(Cypress.env('user'));",
    );
  });

  it('wrap — starts a chain (root role)', () => {
    const flow = chain(leaf('wrap', { expression: '$row' }), leaf('should', { assertion: 'be.visible' }));
    expect(processFlow(flow)).toBe("cy.wrap($row).should('be.visible');");
  });
});

describe('processFlow — Phase 3 references: as/fixture/env', () => {
  it('as — standalone (self-anchoring)', () => {
    expect(processFlow(leaf('as', { selector: '.row', name: 'row' }))).toBe(
      "cy.get('.row').as('row');",
    );
  });

  it('as — invalid alias name leaves the placeholder (required, generator safety)', () => {
    expect(processFlow(leaf('as', { selector: '.row', name: '2cool' }))).toBe(
      "cy.get('.row').as('{{name}}');",
    );
  });

  it('fixture — standalone, and chained with as', () => {
    expect(processFlow(leaf('fixture', { path: 'user' }))).toBe("cy.fixture('user');");
    const flow = chain(leaf('fixture', { path: 'user' }), leaf('as', { name: 'userData' }));
    expect(processFlow(flow)).toBe("cy.fixture('user').as('userData');");
  });

  it('env — standalone', () => {
    expect(processFlow(leaf('env', { key: 'apiUrl' }))).toBe("cy.env('apiUrl');");
  });

  it('a literal "@alias" typed into an ordinary text field generates correctly (no new template mechanism needed)', () => {
    expect(processFlow(leaf('get', { selector: '@row' }))).toBe("cy.get('@row');");
  });
});

describe('processFlow — Phase 3 data commands: task/readFile/writeFile/getCookie/setCookie', () => {
  it('task — no arg', () => {
    expect(processFlow(leaf('task', { event: 'log:message' }))).toBe(
      "cy.task('log:message');",
    );
  });

  it('task — with a raw expression arg', () => {
    expect(processFlow(leaf('task', { event: 'seed:db', arg: '{ id: 1 }' }))).toBe(
      "cy.task('seed:db', { id: 1 });",
    );
  });

  it('readFile', () => {
    expect(processFlow(leaf('readFile', { path: 'data.json' }))).toBe(
      "cy.readFile('data.json');",
    );
  });

  it('writeFile', () => {
    expect(processFlow(leaf('writeFile', { path: 'out.txt', contents: 'hello' }))).toBe(
      "cy.writeFile('out.txt', 'hello');",
    );
  });

  it('getCookie', () => {
    expect(processFlow(leaf('getCookie', { name: 'session_id' }))).toBe(
      "cy.getCookie('session_id');",
    );
  });

  it('setCookie', () => {
    expect(processFlow(leaf('setCookie', { name: 'session_id', value: 'abc123' }))).toBe(
      "cy.setCookie('session_id', 'abc123');",
    );
  });
});

describe('processFlow — Phase 4 network: intercept/waitAlias/request', () => {
  it('intercept — url only (method omitted)', () => {
    expect(processFlow(leaf('intercept', { url: '/api/brands' }))).toBe(
      "cy.intercept('/api/brands');",
    );
  });

  it('intercept — with method', () => {
    expect(processFlow(leaf('intercept', { method: 'GET', url: '/api/brands' }))).toBe(
      "cy.intercept('GET', '/api/brands');",
    );
  });

  it('intercept — with method and a raw stub response', () => {
    expect(
      processFlow(
        leaf('intercept', {
          method: 'GET',
          url: '/api/brands',
          stubResponse: '{ statusCode: 200, body: [] }',
        }),
      ),
    ).toBe("cy.intercept('GET', '/api/brands', { statusCode: 200, body: [] });");
  });

  it('intercept -> as, chained: the exact real-world idiom', () => {
    const flow = chain(
      leaf('intercept', { method: 'GET', url: '/api/brands' }),
      leaf('as', { name: 'getBrands' }),
    );
    expect(processFlow(flow)).toBe("cy.intercept('GET', '/api/brands').as('getBrands');");
  });

  it('waitAlias — standalone', () => {
    expect(processFlow(leaf('waitAlias', { alias: '@getBrands' }))).toBe(
      "cy.wait('@getBrands');",
    );
  });

  it('waitAlias — chained with its/should (inspecting the response)', () => {
    const flow = chain(
      leaf('waitAlias', { alias: '@getBrands' }),
      leaf('its', { propertyPath: 'response.body' }),
      leaf('should', { assertion: 'have.length', count: '3' }),
    );
    expect(processFlow(flow)).toBe(
      "cy.wait('@getBrands')\n  .its('response.body')\n  .should('have.length', 3);",
    );
  });

  it('request — url only', () => {
    expect(processFlow(leaf('request', { url: '/api/brands' }))).toBe(
      "cy.request({\n  url: '/api/brands'\n});",
    );
  });

  it('request — with method and a raw body', () => {
    expect(
      processFlow(leaf('request', { method: 'POST', url: '/api/brands', body: "{ name: 'Acme' }" })),
    ).toBe(
      "cy.request({\n  method: 'POST',\n  url: '/api/brands',\n  body: { name: 'Acme' }\n});",
    );
  });

  it('request -> then, chained: response assertion pattern', () => {
    const flow = chain(
      leaf('request', { url: '/api/brands' }),
      block('then', { as: 'response' }, [leaf('log', { message: 'done' })]),
    );
    expect(processFlow(flow)).toBe(
      "cy.request({\n  url: '/api/brands'\n}).then((response) => {\n  cy.log('done');\n});",
    );
  });
});

describe('processFlow — Phase 4 golden: intercept -> visit -> wait -> assert', () => {
  it('describe > it(intercept.as, visit, wait, assert) — exact output', () => {
    const flow: FlowNode = {
      id: 'root',
      type: 'describe',
      props: { label: 'Brands' },
      children: [
        {
          id: 'it-1',
          type: 'it',
          props: { label: 'loads the brand list' },
          children: [
            {
              id: 'chain-1',
              type: 'chain',
              props: {},
              children: [
                { id: 'intercept-1', type: 'intercept', props: { method: 'GET', url: '/api/brands' } },
                { id: 'as-1', type: 'as', props: { name: 'getBrands' } },
              ],
            },
            { id: 'visit-1', type: 'visit', props: { url: '/brands' } },
            { id: 'waitAlias-1', type: 'waitAlias', props: { alias: '@getBrands' } },
            {
              id: 'chain-2',
              type: 'chain',
              props: {},
              children: [
                { id: 'get-1', type: 'get', props: { selector: '.brand-row' } },
                { id: 'should-1', type: 'should', props: { assertion: 'have.length', count: '3' } },
              ],
            },
          ],
        },
      ],
    };

    expect(processFlow(flow)).toBe(
      `describe('Brands', () => {
  it('loads the brand list', () => {
    cy.intercept('GET', '/api/brands').as('getBrands');
    cy.visit('/brands');
    cy.wait('@getBrands');
    cy.get('.brand-row').should('have.length', 3);
  });
});`,
    );
  });
});

describe('processFlow — Phase 5 multi-slot composition: if/else', () => {
  it('then only — no else in output at all', () => {
    const flow = ifNode('loggedIn', [leaf('visit', { url: '/dashboard' })]);
    expect(processFlow(flow)).toBe("if (loggedIn) {\n  cy.visit('/dashboard');\n}");
  });

  it('then + else', () => {
    const flow = ifNode(
      'loggedIn',
      [leaf('visit', { url: '/dashboard' })],
      [leaf('visit', { url: '/login' })],
    );
    expect(processFlow(flow)).toBe(
      "if (loggedIn) {\n" +
        "  cy.visit('/dashboard');\n" +
        '} else {\n' +
        "  cy.visit('/login');\n" +
        '}',
    );
  });

  it('nested if inside an else branch, indentation compounds correctly', () => {
    const inner = ifNode('b', [leaf('log', { message: 'inner' })]);
    const outer = ifNode('a', [leaf('log', { message: 'outer-then' })], [inner]);
    expect(processFlow(outer)).toBe(
      "if (a) {\n" +
        "  cy.log('outer-then');\n" +
        '} else {\n' +
        '  if (b) {\n' +
        "    cy.log('inner');\n" +
        '  }\n' +
        '}',
    );
  });

  it('if containing a block (within) in its then branch', () => {
    const flow = ifNode('ready', [
      block('within', { selector: '.modal' }, [leaf('log', { message: 'shown' })]),
    ]);
    expect(processFlow(flow)).toBe(
      'if (ready) {\n' +
        "  cy.get('.modal').within(() => {\n" +
        "    cy.log('shown');\n" +
        '  });\n' +
        '}',
    );
  });

  it('a block (within) containing an if', () => {
    const flow = block('within', { selector: '.panel' }, [
      ifNode('flag', [leaf('log', { message: 'on' })]),
    ]);
    expect(processFlow(flow)).toBe(
      "cy.get('.panel').within(() => {\n" +
        '  if (flag) {\n' +
        "    cy.log('on');\n" +
        '  }\n' +
        '});',
    );
  });

  it('a missing/empty condition leaves the placeholder visible rather than emitting broken JS', () => {
    const flow = ifNode('', [leaf('log', { message: 'x' })]);
    expect(processFlow(flow)).toBe('if ({{condition}}) {\n' + "  cy.log('x');\n" + '}');
  });

  it('omits the else branch when the else slot wrapper is structurally absent (not merely empty)', () => {
    const flow: FlowNode = {
      id: 'if-1',
      type: 'if',
      props: { condition: 'x' },
      children: [{ id: 'slot-then', type: 'slot', props: { name: 'then' }, children: [leaf('log', { message: 'y' })] }],
    };
    expect(processFlow(flow)).toBe("if (x) {\n  cy.log('y');\n}");
  });
});

describe('processFlow — Phase 5 iteration: forEach', () => {
  function forEachNode(props: Record<string, string>, children: FlowNode[] = []): FlowNode {
    return { id: 'forEach-1', type: 'forEach', props, children };
  }

  it('simple iteration with a single item binding', () => {
    const flow = forEachNode({ source: "['a', 'b']", itemAs: 'item' }, [leaf('log', { message: 'x' })]);
    expect(processFlow(flow)).toBe("['a', 'b'].forEach((item) => {\n  cy.log('x');\n});");
  });

  it('callback binding: both item and index appear in the signature', () => {
    const flow = forEachNode({ source: '$rows', itemAs: 'row', indexAs: 'i' }, [
      leaf('log', { message: 'y' }),
    ]);
    expect(processFlow(flow)).toBe('$rows.forEach((row, i) => {\n' + "  cy.log('y');\n" + '});');
  });

  it('nested forEach, each with its own binding', () => {
    const inner = forEachNode({ source: 'inner', itemAs: 'j' }, [leaf('log', { message: 'z' })]);
    const outer = forEachNode({ source: 'outer', itemAs: 'i' }, [inner]);
    expect(processFlow(outer)).toBe(
      'outer.forEach((i) => {\n' +
        '  inner.forEach((j) => {\n' +
        "    cy.log('z');\n" +
        '  });\n' +
        '});',
    );
  });

  it('forEach containing an existing chain', () => {
    const flow = forEachNode({ source: 'rows', itemAs: 'row' }, [
      chain(leaf('get', { selector: '.name' }), leaf('should', { assertion: 'be.visible' })),
    ]);
    expect(processFlow(flow)).toBe(
      'rows.forEach((row) => {\n' + "  cy.get('.name').should('be.visible');\n" + '});',
    );
  });

  it('forEach containing an existing block (within)', () => {
    const flow = forEachNode({ source: 'rows', itemAs: 'row' }, [
      block('within', { selector: '.row' }, [leaf('log', { message: 'in' })]),
    ]);
    expect(processFlow(flow)).toBe(
      'rows.forEach((row) => {\n' +
        "  cy.get('.row').within(() => {\n" +
        "    cy.log('in');\n" +
        '  });\n' +
        '});',
    );
  });

  it('an invalid item-binding name is dropped, not emitted as broken JS ("generator safety")', () => {
    const flow = forEachNode({ source: 'rows', itemAs: '2cool' }, [leaf('log', { message: 'x' })]);
    expect(processFlow(flow)).toBe('rows.forEach(() => {\n' + "  cy.log('x');\n" + '});');
  });
});

describe('processFlow — Phase 5 customCommand', () => {
  it('a valid method name with no arguments', () => {
    expect(processFlow(leaf('customCommand', { commandName: 'login' }))).toBe('cy.login();');
  });

  it('a valid method name with arguments (raw JS expression)', () => {
    const flow = leaf('customCommand', { commandName: 'login', args: "'admin', 'secret'" });
    expect(processFlow(flow)).toBe("cy.login('admin', 'secret');");
  });

  it('an invalid method name leaves the placeholder visible rather than emitting broken JS', () => {
    const flow = leaf('customCommand', { commandName: 'not a valid name' });
    expect(processFlow(flow)).toBe('cy.{{commandName}}();');
  });

  it('chains onto a preceding subject inside a chain node', () => {
    const flow = chain(
      leaf('get', { selector: '.row' }),
      leaf('customCommand', { commandName: 'selectOption', args: "'Gold'" }),
    );
    expect(processFlow(flow)).toBe("cy.get('.row').selectOption('Gold');");
  });
});

describe('processFlow — Phase 5 reusable-flow invocation', () => {
  const GREET: ReusableFlowDef = {
    id: 'greet',
    name: 'Greet',
    params: [{ key: 'name', label: 'Name', type: 'text', required: true }],
    body: [{ id: 'g1', type: 'log', props: { message: 'Hi {{name}}' } }],
  };
  const LOGIN: ReusableFlowDef = {
    id: 'login',
    name: 'Login',
    params: [{ key: 'user', label: 'User', type: 'text', required: true }],
    body: [
      { id: 'l1', type: 'visit', props: { url: '/login' } },
      { id: 'l2', type: 'type', props: { selector: '#u', value: '{{user}}' } },
    ],
  };

  it('expands a single-statement definition with its argument substituted', () => {
    expect(processFlow(invoke('greet', { name: 'Al' }), undefined, [GREET])).toBe("cy.log('Hi Al');");
  });

  it('expands a multi-statement body, each as an ordinary generated statement', () => {
    expect(processFlow(invoke('login', { user: 'admin' }), undefined, [LOGIN])).toBe(
      "cy.visit('/login');\ncy.get('#u').type('admin');",
    );
  });

  it('an unknown flowId renders a placeholder comment, never broken code', () => {
    expect(processFlow(invoke('ghost'), undefined, [GREET])).toBe('// [Unknown reusable flow: ghost]');
  });

  it('no flow selected yet renders a placeholder comment', () => {
    expect(processFlow(invoke(''), undefined, [GREET])).toBe('// [Unknown reusable flow: (none selected)]');
  });

  it('a direct self-cycle renders a placeholder instead of recursing forever', () => {
    const SELF: ReusableFlowDef = {
      id: 'self',
      name: 'Self',
      params: [],
      body: [{ id: 'inv', type: 'flowInvocation', props: { flowId: 'self' } }],
    };
    expect(processFlow(invoke('self'), undefined, [SELF])).toBe(
      '// [Cyclic reusable-flow reference] — "Self" is already being expanded',
    );
  });

  it('a nested (non-cyclic) reusable-flow invocation expands transitively', () => {
    const INNER: ReusableFlowDef = {
      id: 'inner',
      name: 'Inner',
      params: [],
      body: [{ id: 'i1', type: 'log', props: { message: 'inner' } }],
    };
    const OUTER: ReusableFlowDef = {
      id: 'outer',
      name: 'Outer',
      params: [],
      body: [{ id: 'o1', type: 'flowInvocation', props: { flowId: 'inner' } }],
    };
    expect(processFlow(invoke('outer'), undefined, [OUTER, INNER])).toBe("cy.log('inner');");
  });

  it('never mutates the source definition across repeated, differently-argued invocations', () => {
    const before = JSON.stringify(GREET);
    processFlow(invoke('greet', { name: 'Al' }), undefined, [GREET]);
    processFlow(invoke('greet', { name: 'Zoe' }), undefined, [GREET]);
    expect(JSON.stringify(GREET)).toBe(before);
  });
});
