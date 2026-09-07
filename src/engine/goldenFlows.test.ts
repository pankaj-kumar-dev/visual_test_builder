/**
 * Golden-file whole-flow tests (Phase 1, "golden-file tests"). Each spec builds
 * a realistic Flow JSON tree — the shape an actual user would produce, not a
 * synthetic single-node fixture — and asserts the *complete* generated file
 * against an exact expected string (Global Code Quality Rule: golden tests
 * compare whole output, never `toContain`).
 */

import { describe, expect, it } from 'vitest';
import { processFlow } from './processFlow';
import { findSemanticIssues } from './references';
import { findUnresolvedNodes } from './unresolved';
import type { FlowNode } from '../domain/types';

describe('golden flow — login', () => {
  it('describe > beforeEach(visit) + it(fill form, submit, assert redirect)', () => {
    const flow: FlowNode = {
      id: 'root',
      type: 'describe',
      props: { label: 'Login' },
      children: [
        {
          id: 'before-1',
          type: 'beforeEach',
          props: {},
          children: [{ id: 'visit-1', type: 'visit', props: { url: '/login' } }],
        },
        {
          id: 'it-1',
          type: 'it',
          props: { label: 'logs in with valid credentials' },
          children: [
            {
              id: 'chain-1',
              type: 'chain',
              props: {},
              children: [
                { id: 'get-1', type: 'get', props: { selector: '#email' } },
                { id: 'type-1', type: 'type', props: { value: 'user@example.com' } },
              ],
            },
            {
              id: 'chain-2',
              type: 'chain',
              props: {},
              children: [
                { id: 'get-2', type: 'get', props: { selector: '#password' } },
                { id: 'type-2', type: 'type', props: { value: 'hunter2' } },
              ],
            },
            { id: 'click-1', type: 'click', props: { selector: '#submit' } },
            {
              id: 'chain-3',
              type: 'chain',
              props: {},
              children: [
                { id: 'url-1', type: 'url', props: {} },
                { id: 'should-1', type: 'should', props: { assertion: 'contain', value: '/dashboard' } },
              ],
            },
          ],
        },
      ],
    };

    expect(processFlow(flow)).toBe(
      "describe('Login', () => {\n" +
        '  beforeEach(() => {\n' +
        "    cy.visit('/login');\n" +
        '  });\n' +
        "  it('logs in with valid credentials', () => {\n" +
        "    cy.get('#email').type('user@example.com');\n" +
        "    cy.get('#password').type('hunter2');\n" +
        "    cy.get('#submit').click();\n" +
        "    cy.url().should('contain', '/dashboard');\n" +
        '  });\n' +
        '});',
    );
  });
});

describe('golden flow — grid interaction', () => {
  it('describe > it(select a row, act on it, assert on a sibling cell)', () => {
    const flow: FlowNode = {
      id: 'root',
      type: 'describe',
      props: { label: 'Orders grid' },
      children: [
        {
          id: 'it-1',
          type: 'it',
          props: { label: 'archives the third row' },
          children: [
            { id: 'visit-1', type: 'visit', props: { url: '/orders' } },
            {
              id: 'chain-1',
              type: 'chain',
              props: {},
              children: [
                { id: 'get-1', type: 'get', props: { selector: '.grid-row' } },
                { id: 'eq-1', type: 'eq', props: { index: '2' } },
                { id: 'find-1', type: 'find', props: { target: '.archive-btn' } },
                { id: 'click-1', type: 'click', props: {} },
              ],
            },
            {
              id: 'chain-2',
              type: 'chain',
              props: {},
              children: [
                { id: 'get-2', type: 'get', props: { selector: '.grid-row' } },
                { id: 'eq-2', type: 'eq', props: { index: '2' } },
                { id: 'should-1', type: 'should', props: { assertion: 'have.class', value: 'archived' } },
              ],
            },
          ],
        },
      ],
    };

    expect(processFlow(flow)).toBe(
      "describe('Orders grid', () => {\n" +
        "  it('archives the third row', () => {\n" +
        "    cy.visit('/orders');\n" +
        "    cy.get('.grid-row')\n" +
        '      .eq(2)\n' +
        "      .find('.archive-btn')\n" +
        '      .click();\n' +
        "    cy.get('.grid-row')\n" +
        '      .eq(2)\n' +
        "      .should('have.class', 'archived');\n" +
        '  });\n' +
        '});',
    );
  });
});

describe('golden flow — form', () => {
  it('describe > it(fill several fields of different kinds, submit)', () => {
    const flow: FlowNode = {
      id: 'root',
      type: 'describe',
      props: { label: 'New brand form' },
      children: [
        {
          id: 'it-1',
          type: 'it',
          props: { label: 'creates a brand' },
          children: [
            { id: 'visit-1', type: 'visit', props: { url: '/brands/new' } },
            { id: 'type-1', type: 'type', props: { selector: '#name', value: 'Acme' } },
            { id: 'select-1', type: 'select', props: { selector: '#region', value: 'EMEA' } },
            { id: 'check-1', type: 'check', props: { selector: '#active' } },
            { id: 'submit-1', type: 'submit', props: { selector: 'form' } },
            { id: 'should-1', type: 'should', props: { selector: '.toast', assertion: 'contain.text', value: 'Brand created' } },
          ],
        },
      ],
    };

    expect(processFlow(flow)).toBe(
      "describe('New brand form', () => {\n" +
        "  it('creates a brand', () => {\n" +
        "    cy.visit('/brands/new');\n" +
        "    cy.get('#name').type('Acme');\n" +
        "    cy.get('#region').select('EMEA');\n" +
        "    cy.get('#active').check();\n" +
        "    cy.get('form').submit();\n" +
        "    cy.get('.toast').should('contain.text', 'Brand created');\n" +
        '  });\n' +
        '});',
    );
  });
});

describe('golden flow — assertion-heavy', () => {
  it('describe > it(several independent assertions plus a chained should+and)', () => {
    const flow: FlowNode = {
      id: 'root',
      type: 'describe',
      props: { label: 'Profile page' },
      children: [
        {
          id: 'it-1',
          type: 'it',
          props: { label: 'renders the expected fields' },
          children: [
            { id: 'visit-1', type: 'visit', props: { url: '/profile' } },
            { id: 'should-1', type: 'should', props: { selector: '.avatar', assertion: 'be.visible' } },
            { id: 'should-2', type: 'should', props: { selector: '.username', assertion: 'have.text', value: 'jdoe' } },
            { id: 'should-3', type: 'should', props: { selector: '.badge', assertion: 'have.length', count: '3' } },
            {
              id: 'chain-1',
              type: 'chain',
              props: {},
              children: [
                { id: 'get-1', type: 'get', props: { selector: '.email-link' } },
                { id: 'should-4', type: 'should', props: { assertion: 'have.attr', value: 'href' } },
                { id: 'and-1', type: 'and', props: { assertion: 'contain', value: 'mailto:' } },
              ],
            },
          ],
        },
      ],
    };

    expect(processFlow(flow)).toBe(
      "describe('Profile page', () => {\n" +
        "  it('renders the expected fields', () => {\n" +
        "    cy.visit('/profile');\n" +
        "    cy.get('.avatar').should('be.visible');\n" +
        "    cy.get('.username').should('have.text', 'jdoe');\n" +
        "    cy.get('.badge').should('have.length', 3);\n" +
        "    cy.get('.email-link')\n" +
        "      .should('have.attr', 'href')\n" +
        "      .and('contain', 'mailto:');\n" +
        '  });\n' +
        '});',
    );
  });
});

describe('golden flow — navigation', () => {
  it('describe > it(visit, navigate around, assert url/title, resize viewport)', () => {
    const flow: FlowNode = {
      id: 'root',
      type: 'describe',
      props: { label: 'Navigation' },
      children: [
        {
          id: 'it-1',
          type: 'it',
          props: { label: 'moves between pages and back' },
          children: [
            { id: 'viewport-1', type: 'viewport', props: { width: '1280', height: '800' } },
            { id: 'visit-1', type: 'visit', props: { url: '/' } },
            {
              id: 'chain-1',
              type: 'chain',
              props: {},
              children: [
                { id: 'contains-1', type: 'contains', props: { text: 'Settings' } },
                { id: 'click-1', type: 'click', props: {} },
              ],
            },
            {
              id: 'chain-2',
              type: 'chain',
              props: {},
              children: [
                { id: 'url-1', type: 'url', props: {} },
                { id: 'should-1', type: 'should', props: { assertion: 'contain', value: '/settings' } },
              ],
            },
            { id: 'go-1', type: 'go', props: { direction: 'back' } },
            {
              id: 'chain-3',
              type: 'chain',
              props: {},
              children: [
                { id: 'title-1', type: 'title', props: {} },
                { id: 'should-2', type: 'should', props: { assertion: 'eq', value: 'Home' } },
              ],
            },
          ],
        },
      ],
    };

    expect(processFlow(flow)).toBe(
      "describe('Navigation', () => {\n" +
        "  it('moves between pages and back', () => {\n" +
        '    cy.viewport(1280, 800);\n' +
        "    cy.visit('/');\n" +
        "    cy.contains('Settings').click();\n" +
        "    cy.url().should('contain', '/settings');\n" +
        "    cy.go('back');\n" +
        "    cy.title().should('eq', 'Home');\n" +
        '  });\n' +
        '});',
    );
  });
});

describe('golden flow — grid row validation (Phase 2: within + each + wrap, three composition layers)', () => {
  it('describe > it(visit, within(each(wrap.find.should)))', () => {
    const flow: FlowNode = {
      id: 'root',
      type: 'describe',
      props: { label: 'Grid' },
      children: [
        {
          id: 'it-1',
          type: 'it',
          props: { label: 'validates each visible row' },
          children: [
            { id: 'visit-1', type: 'visit', props: { url: '/grid' } },
            {
              id: 'within-1',
              type: 'within',
              props: { selector: '.grid' },
              children: [
                {
                  id: 'each-1',
                  type: 'each',
                  props: { selector: '.row' },
                  children: [
                    {
                      id: 'chain-1',
                      type: 'chain',
                      props: {},
                      children: [
                        { id: 'wrap-1', type: 'wrap', props: { expression: '$el' } },
                        { id: 'find-1', type: 'find', props: { target: '.status' } },
                        { id: 'should-1', type: 'should', props: { assertion: 'have.text', value: 'Active' } },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    expect(processFlow(flow)).toBe(
      `describe('Grid', () => {
  it('validates each visible row', () => {
    cy.visit('/grid');
    cy.get('.grid').within(() => {
      cy.get('.row').each(($el, index) => {
        cy.wrap($el)
          .find('.status')
          .should('have.text', 'Active');
      });
    });
  });
});`,
    );
  });
});

describe('golden flow — cached login session (Phase 2: session + within, a root-level block plus a chain block)', () => {
  it('describe > it(session(visit, chain), visit, within(chain))', () => {
    const flow: FlowNode = {
      id: 'root',
      type: 'describe',
      props: { label: 'Login persistence' },
      children: [
        {
          id: 'it-1',
          type: 'it',
          props: { label: 'restores a cached session' },
          children: [
            {
              id: 'session-1',
              type: 'session',
              props: { id: 'user-session' },
              children: [
                { id: 'visit-1', type: 'visit', props: { url: '/login' } },
                {
                  id: 'chain-1',
                  type: 'chain',
                  props: {},
                  children: [
                    { id: 'get-1', type: 'get', props: { selector: '#username' } },
                    { id: 'type-1', type: 'type', props: { value: 'admin' } },
                  ],
                },
              ],
            },
            { id: 'visit-2', type: 'visit', props: { url: '/dashboard' } },
            {
              id: 'within-1',
              type: 'within',
              props: { selector: '.header' },
              children: [
                {
                  id: 'chain-2',
                  type: 'chain',
                  props: {},
                  children: [
                    { id: 'contains-1', type: 'contains', props: { text: 'Welcome, admin' } },
                    { id: 'should-1', type: 'should', props: { assertion: 'be.visible' } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    expect(processFlow(flow)).toBe(
      `describe('Login persistence', () => {
  it('restores a cached session', () => {
    cy.session('user-session', () => {
      cy.visit('/login');
      cy.get('#username').type('admin');
    });
    cy.visit('/dashboard');
    cy.get('.header').within(() => {
      cy.contains('Welcome, admin').should('be.visible');
    });
  });
});`,
    );
  });
});

describe('golden flow — reference producer/consumer (Phase 3: beforeEach fixture -> it consumes)', () => {
  it('describe > beforeEach(fixture.as) > it(get by @alias, assert) — exact output, zero semantic issues', () => {
    const flow: FlowNode = {
      id: 'root',
      type: 'describe',
      props: { label: 'User profile' },
      children: [
        {
          id: 'before-1',
          type: 'beforeEach',
          props: {},
          children: [
            {
              id: 'chain-1',
              type: 'chain',
              props: {},
              children: [
                { id: 'fixture-1', type: 'fixture', props: { path: 'user' } },
                { id: 'as-1', type: 'as', props: { name: 'userData' } },
              ],
            },
          ],
        },
        {
          id: 'it-1',
          type: 'it',
          props: { label: 'shows the loaded user' },
          children: [
            { id: 'visit-1', type: 'visit', props: { url: '/profile' } },
            { id: 'get-1', type: 'get', props: { selector: '@userData' } },
            { id: 'should-1', type: 'should', props: { selector: '@userData', assertion: 'have.property', value: 'email' } },
          ],
        },
      ],
    };

    expect(processFlow(flow)).toBe(
      `describe('User profile', () => {
  beforeEach(() => {
    cy.fixture('user').as('userData');
  });
  it('shows the loaded user', () => {
    cy.visit('/profile');
    cy.get('@userData');
    cy.get('@userData').should('have.property', 'email');
  });
});`,
    );

    expect(findSemanticIssues(flow)).toEqual([]);
  });

  it('the same flow with the alias name mistyped in the test produces exactly one unknown-reference issue', () => {
    const flow: FlowNode = {
      id: 'root',
      type: 'describe',
      props: { label: 'User profile' },
      children: [
        {
          id: 'before-1',
          type: 'beforeEach',
          props: {},
          children: [
            {
              id: 'chain-1',
              type: 'chain',
              props: {},
              children: [
                { id: 'fixture-1', type: 'fixture', props: { path: 'user' } },
                { id: 'as-1', type: 'as', props: { name: 'userData' } },
              ],
            },
          ],
        },
        {
          id: 'it-1',
          type: 'it',
          props: { label: 'shows the loaded user' },
          children: [{ id: 'get-1', type: 'get', props: { selector: '@userdata' } }], // wrong case
        },
      ],
    };

    const issues = findSemanticIssues(flow);
    expect(issues).toEqual([
      {
        id: 'get-1',
        type: 'get',
        label: 'Get',
        kind: 'unknown-reference',
        message: '"@userdata" has no producer anywhere in this flow.',
        severity: 'error',
      },
    ]);
  });
});

describe('golden flow — if/else (Phase 5 multi-slot composition)', () => {
  it('describe > it(visit, if(condition){click} else {visit}) — exact output', () => {
    const flow: FlowNode = {
      id: 'root',
      type: 'describe',
      props: { label: 'Dashboard' },
      children: [
        {
          id: 'it-1',
          type: 'it',
          props: { label: 'shows the dashboard when already logged in' },
          children: [
            { id: 'visit-1', type: 'visit', props: { url: '/' } },
            {
              id: 'if-1',
              type: 'if',
              props: { condition: "Cypress.env('loggedIn')" },
              children: [
                {
                  id: 'slot-then',
                  type: 'slot',
                  props: { name: 'then' },
                  children: [{ id: 'click-1', type: 'click', props: { selector: '.dashboard-link' } }],
                },
                {
                  id: 'slot-else',
                  type: 'slot',
                  props: { name: 'else' },
                  children: [{ id: 'visit-2', type: 'visit', props: { url: '/login' } }],
                },
              ],
            },
          ],
        },
      ],
    };

    expect(processFlow(flow)).toBe(
      `describe('Dashboard', () => {
  it('shows the dashboard when already logged in', () => {
    cy.visit('/');
    if (Cypress.env('loggedIn')) {
      cy.get('.dashboard-link').click();
    } else {
      cy.visit('/login');
    }
  });
});`,
    );
  });
});

describe('golden flow — forEach (Phase 5 iteration via block/callback composition)', () => {
  it('describe > it(forEach(each status: chain wrap.should using the bound item)) — exact output', () => {
    const flow: FlowNode = {
      id: 'root',
      type: 'describe',
      props: { label: 'Orders' },
      children: [
        {
          id: 'it-1',
          type: 'it',
          props: { label: 'validates every row status' },
          children: [
            { id: 'visit-1', type: 'visit', props: { url: '/orders' } },
            {
              id: 'forEach-1',
              type: 'forEach',
              props: { source: 'statuses', itemAs: 'status', indexAs: 'index' },
              children: [
                {
                  id: 'chain-1',
                  type: 'chain',
                  props: {},
                  children: [
                    { id: 'wrap-1', type: 'wrap', props: { expression: 'status' } },
                    { id: 'should-1', type: 'should', props: { assertion: 'contain', value: 'Active' } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    expect(processFlow(flow)).toBe(
      `describe('Orders', () => {
  it('validates every row status', () => {
    cy.visit('/orders');
    statuses.forEach((status, index) => {
      cy.wrap(status).should('contain', 'Active');
    });
  });
});`,
    );
  });
});

describe('golden flow — Login reusable flow (Phase 5, bundled starter library)', () => {
  it('describe > it(flowInvocation(login, username, password)) — exact expansion', () => {
    const flow: FlowNode = {
      id: 'root',
      type: 'describe',
      props: { label: 'Login' },
      children: [
        {
          id: 'it-1',
          type: 'it',
          props: { label: 'logs in as an admin' },
          children: [
            {
              id: 'invoke-1',
              type: 'flowInvocation',
              props: { flowId: 'login', username: 'admin', password: 'hunter2' },
            },
          ],
        },
      ],
    };

    expect(processFlow(flow)).toBe(
      `describe('Login', () => {
  it('logs in as an admin', () => {
    cy.visit('/login');
    cy.get('#username').type('admin');
    cy.get('#password').type('hunter2');
    cy.get('#login-submit').click();
  });
});`,
    );
  });
});

describe('golden flow — Search reusable flow (Phase 5, bundled starter library)', () => {
  it('describe > it(flowInvocation(search, query)) — exact expansion', () => {
    const flow: FlowNode = {
      id: 'root',
      type: 'describe',
      props: { label: 'Search' },
      children: [
        {
          id: 'it-1',
          type: 'it',
          props: { label: 'finds a product by name' },
          children: [
            { id: 'visit-1', type: 'visit', props: { url: '/' } },
            {
              id: 'invoke-1',
              type: 'flowInvocation',
              props: { flowId: 'search', query: 'Widget' },
            },
          ],
        },
      ],
    };

    expect(processFlow(flow)).toBe(
      `describe('Search', () => {
  it('finds a product by name', () => {
    cy.visit('/');
    cy.get('#search-input').type('Widget');
    cy.get('#search-button').click();
    cy.get('#search-results').should('be.visible');
  });
});`,
    );
  });

  it('the same invocation with a different query argument produces a different, still-exact expansion (proves substitution, not a fixed template)', () => {
    const flow: FlowNode = {
      id: 'root',
      type: 'describe',
      props: { label: 'Search' },
      children: [
        {
          id: 'it-1',
          type: 'it',
          props: { label: 'finds a different product' },
          children: [{ id: 'invoke-1', type: 'flowInvocation', props: { flowId: 'search', query: 'Gadget' } }],
        },
      ],
    };

    expect(processFlow(flow)).toBe(
      `describe('Search', () => {
  it('finds a different product', () => {
    cy.get('#search-input').type('Gadget');
    cy.get('#search-button').click();
    cy.get('#search-results').should('be.visible');
  });
});`,
    );
  });
});

describe('golden flow — combined Phase 5 constructs (if containing a reusable-flow invocation, followed by forEach)', () => {
  it('describe > it(if(guest){Login invocation} else {customCommand}, forEach(assert each result))', () => {
    const flow: FlowNode = {
      id: 'root',
      type: 'describe',
      props: { label: 'Storefront' },
      children: [
        {
          id: 'it-1',
          type: 'it',
          props: { label: 'signs in, then searches, then validates every result' },
          children: [
            {
              id: 'if-1',
              type: 'if',
              props: { condition: 'isGuest' },
              children: [
                {
                  id: 'slot-then',
                  type: 'slot',
                  props: { name: 'then' },
                  children: [
                    {
                      id: 'invoke-login',
                      type: 'flowInvocation',
                      props: { flowId: 'login', username: 'admin', password: 'hunter2' },
                    },
                  ],
                },
                {
                  id: 'slot-else',
                  type: 'slot',
                  props: { name: 'else' },
                  children: [
                    { id: 'restore-session', type: 'customCommand', props: { commandName: 'restoreSession' } },
                  ],
                },
              ],
            },
            {
              id: 'invoke-search',
              type: 'flowInvocation',
              props: { flowId: 'search', query: 'Widget' },
            },
            {
              id: 'forEach-1',
              type: 'forEach',
              props: { source: 'results', itemAs: 'result' },
              children: [{ id: 'log-1', type: 'log', props: { message: 'result' } }],
            },
          ],
        },
      ],
    };

    expect(processFlow(flow)).toBe(
      `describe('Storefront', () => {
  it('signs in, then searches, then validates every result', () => {
    if (isGuest) {
      cy.visit('/login');
      cy.get('#username').type('admin');
      cy.get('#password').type('hunter2');
      cy.get('#login-submit').click();
    } else {
      cy.restoreSession();
    }
    cy.get('#search-input').type('Widget');
    cy.get('#search-button').click();
    cy.get('#search-results').should('be.visible');
    results.forEach((result) => {
      cy.log('result');
    });
  });
});`,
    );

    // Everything resolves and no reusable-flow issues survive — a fully valid
    // combined tree, not merely one that avoids crashing.
    expect(findUnresolvedNodes(flow)).toEqual([]);
    expect(findSemanticIssues(flow)).toEqual([]);
  });
});

describe('golden flow — Notification Validation reusable flow (Phase 5 completion: reference + Phase 4 network ordering inside an expanded reusable flow)', () => {
  it('describe > it(flowInvocation(notificationValidation)) — intercept/as/trigger/wait/assert, exact expansion', () => {
    const flow: FlowNode = {
      id: 'root',
      type: 'describe',
      props: { label: 'Notifications' },
      children: [
        {
          id: 'it-1',
          type: 'it',
          props: { label: 'shows a save confirmation' },
          children: [
            {
              id: 'invoke-1',
              type: 'flowInvocation',
              props: {
                flowId: 'notificationValidation',
                url: '/api/save',
                triggerSelector: '#save-button',
                expectedText: 'Saved successfully',
              },
            },
          ],
        },
      ],
    };

    expect(processFlow(flow)).toBe(
      `describe('Notifications', () => {
  it('shows a save confirmation', () => {
    cy.intercept('/api/save').as('notifRequest');
    cy.get('#save-button').click();
    cy.wait('@notifRequest');
    cy.get('#notification').should('contain.text', 'Saved successfully');
  });
});`,
    );

    // The flow's own internal alias production/trigger/consumption is
    // entirely self-contained — invoking it introduces no reference issue
    // visible from the outside.
    expect(findUnresolvedNodes(flow)).toEqual([]);
    expect(findSemanticIssues(flow)).toEqual([]);
  });
});

describe('golden flow — Grid Row Action reusable flow (Phase 5 completion: Phase 2 chain composition inside an expanded reusable flow)', () => {
  it('describe > it(flowInvocation(gridRowAction)) — get/eq/find/click then get/eq/should, exact expansion', () => {
    const flow: FlowNode = {
      id: 'root',
      type: 'describe',
      props: { label: 'Grid' },
      children: [
        {
          id: 'it-1',
          type: 'it',
          props: { label: 'archives a matched row' },
          children: [
            {
              id: 'invoke-1',
              type: 'flowInvocation',
              props: { flowId: 'gridRowAction', rowSelector: '.grid-row', rowIndex: '2', actionSelector: '.archive-btn' },
            },
          ],
        },
      ],
    };

    expect(processFlow(flow)).toBe(
      "describe('Grid', () => {\n" +
        "  it('archives a matched row', () => {\n" +
        "    cy.get('.grid-row')\n" +
        '      .eq(2)\n' +
        "      .find('.archive-btn')\n" +
        '      .click();\n' +
        "    cy.get('.grid-row')\n" +
        '      .eq(2)\n' +
        "      .should('be.visible');\n" +
        '  });\n' +
        '});',
    );
    expect(findUnresolvedNodes(flow)).toEqual([]);
  });
});

describe('golden flow — Switch invoking a reusable flow inside a Case (Phase 5 completion: control-flow composes with reuse)', () => {
  it('describe > it(switch(role){ case guest: Login invocation; default: log })', () => {
    const flow: FlowNode = {
      id: 'root',
      type: 'describe',
      props: { label: 'Role routing' },
      children: [
        {
          id: 'it-1',
          type: 'it',
          props: { label: 'routes based on role' },
          children: [
            {
              id: 'switch-1',
              type: 'switch',
              props: { expression: 'role' },
              children: [
                {
                  id: 'case-1',
                  type: 'case',
                  props: { value: "'guest'" },
                  children: [
                    {
                      id: 'invoke-1',
                      type: 'flowInvocation',
                      props: { flowId: 'login', username: 'guest', password: 'guest123' },
                    },
                  ],
                },
                {
                  id: 'default-1',
                  type: 'default',
                  props: {},
                  children: [{ id: 'log-1', type: 'log', props: { message: 'known user' } }],
                },
              ],
            },
          ],
        },
      ],
    };

    expect(processFlow(flow)).toBe(
      `describe('Role routing', () => {
  it('routes based on role', () => {
    switch (role) {
      case 'guest':
        cy.visit('/login');
        cy.get('#username').type('guest');
        cy.get('#password').type('guest123');
        cy.get('#login-submit').click();
        break;
      default:
        cy.log('known user');
        break;
    }
  });
});`,
    );
    expect(findUnresolvedNodes(flow)).toEqual([]);
    expect(findSemanticIssues(flow)).toEqual([]);
  });
});

describe('golden flow — nested slots: Try/Recover inside an If\'s Then branch (Phase 5 completion: multi-slot composes with multi-slot)', () => {
  it('describe > it(if(shouldAttempt){ try{click} catch{log} })', () => {
    const flow: FlowNode = {
      id: 'root',
      type: 'describe',
      props: { label: 'Recovery' },
      children: [
        {
          id: 'it-1',
          type: 'it',
          props: { label: 'recovers inside a conditional branch' },
          children: [
            {
              id: 'if-1',
              type: 'if',
              props: { condition: 'shouldAttempt' },
              children: [
                {
                  id: 'slot-then',
                  type: 'slot',
                  props: { name: 'then' },
                  children: [
                    {
                      id: 'try-1',
                      type: 'try',
                      props: {},
                      children: [
                        {
                          id: 'slot-try',
                          type: 'slot',
                          props: { name: 'try' },
                          children: [{ id: 'click-1', type: 'click', props: { selector: '.risky' } }],
                        },
                        {
                          id: 'slot-catch',
                          type: 'slot',
                          props: { name: 'catch' },
                          children: [{ id: 'log-1', type: 'log', props: { message: 'recovered' } }],
                        },
                        { id: 'slot-finally', type: 'slot', props: { name: 'finally' }, children: [] },
                      ],
                    },
                  ],
                },
                { id: 'slot-else', type: 'slot', props: { name: 'else' }, children: [] },
              ],
            },
          ],
        },
      ],
    };

    expect(processFlow(flow)).toBe(
      `describe('Recovery', () => {
  it('recovers inside a conditional branch', () => {
    if (shouldAttempt) {
      cy.on('fail', (err) => {
        cy.log('recovered');
        return false;
      });
      {
        cy.get('.risky').click();
      }
    }
  });
});`,
    );
    expect(findUnresolvedNodes(flow)).toEqual([]);
  });
});

describe('golden flow — hooks + references + a reusable-flow invocation as the trigger (Phase 5 completion: Phase 3/4 reference scoping sees through a reuse invocation)', () => {
  it('beforeEach(intercept.as) > it(invoke Search, then wait on the hook\'s alias)', () => {
    const flow: FlowNode = {
      id: 'root',
      type: 'describe',
      props: { label: 'Account' },
      children: [
        {
          id: 'before-1',
          type: 'beforeEach',
          props: {},
          children: [
            {
              id: 'chain-1',
              type: 'chain',
              props: {},
              children: [
                { id: 'intercept-1', type: 'intercept', props: { url: '/api/profile' } },
                { id: 'as-1', type: 'as', props: { name: 'profile' } },
              ],
            },
          ],
        },
        {
          id: 'it-1',
          type: 'it',
          props: { label: 'loads the profile after searching' },
          children: [
            { id: 'invoke-1', type: 'flowInvocation', props: { flowId: 'search', query: 'Widget' } },
            { id: 'wait-1', type: 'waitAlias', props: { alias: '@profile' } },
          ],
        },
      ],
    };

    expect(processFlow(flow)).toBe(
      `describe('Account', () => {
  beforeEach(() => {
    cy.intercept('/api/profile').as('profile');
  });
  it('loads the profile after searching', () => {
    cy.get('#search-input').type('Widget');
    cy.get('#search-button').click();
    cy.get('#search-results').should('be.visible');
    cy.wait('@profile');
  });
});`,
    );

    // The critical assertion: the Search invocation's own internal click
    // counts as the "trigger" the outer waitAlias needs, even though that
    // click lives inside the reusable flow's expanded (not literally
    // authored) body — `engine/references.ts`'s `reuseSubtreeContainsTrigger`
    // is what makes this resolve correctly rather than a false-positive
    // "reference-used-without-trigger" warning.
    expect(findUnresolvedNodes(flow)).toEqual([]);
    expect(findSemanticIssues(flow)).toEqual([]);
  });
});
