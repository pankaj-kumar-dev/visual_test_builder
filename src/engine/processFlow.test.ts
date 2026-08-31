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
import type { FlowNode } from '../domain/types';

function leaf(type: string, props: Record<string, string> = {}): FlowNode {
  return { id: `${type}-1`, type, props };
}

function chain(...children: FlowNode[]): FlowNode {
  return { id: 'chain-1', type: 'chain', props: {}, children };
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
