/**
 * Smoke — Phase 5 reusable, parameterized flows: a single generic
 * `flowInvocation` node whose property-editor schema is derived dynamically
 * from whichever bundled starter flow (Login, Search) is selected.
 *
 * Exact expansion output (parameter substitution, nesting, cycles) is covered
 * by src/engine/goldenFlows.test.ts and src/engine/reusableFlows.test.ts; this
 * spec only exercises what genuinely needs a real browser — the dynamic
 * property editor and the drawer's unresolved-argument warning.
 */

import { addChild, addRoot, openCodeDrawer, selectNode, setProp } from '../support/flows';

describe('Reusable flows (Phase 5)', () => {
  beforeEach(() => {
    cy.visit('/');
    addRoot('describe');
    selectNode('Describe Block');
    setProp('label', 'Suite');
    addChild('Describe Block', 'it');
    selectNode('Test Case');
    setProp('label', 'a test');
  });

  it('appears in the palette under Workflow', () => {
    cy.get('[data-testid=palette-item-flowInvocation]').should('exist');
  });

  it('shows only the Flow picker until one is selected; its parameters appear once one is', () => {
    addChild('Test Case', 'flowInvocation');
    selectNode('Reusable Flow');

    cy.get('[data-testid=prop-flowId]').should('exist');
    cy.get('[data-testid=prop-username]').should('not.exist');

    cy.get('[data-testid=prop-flowId]').select('login');
    cy.get('[data-testid=prop-username]').should('exist');
    cy.get('[data-testid=prop-password]').should('exist');
  });

  it('switching the selected flow replaces the argument fields with the new flow\'s own parameters', () => {
    addChild('Test Case', 'flowInvocation');
    selectNode('Reusable Flow');
    cy.get('[data-testid=prop-flowId]').select('login');
    cy.get('[data-testid=prop-username]').should('exist');

    cy.get('[data-testid=prop-flowId]').select('search');
    cy.get('[data-testid=prop-username]').should('not.exist');
    cy.get('[data-testid=prop-query]').should('exist');
  });

  it('flags missing required arguments as unresolved, the same generic rule as any other node', () => {
    addChild('Test Case', 'flowInvocation');
    selectNode('Reusable Flow');
    cy.get('[data-testid=prop-flowId]').select('login');

    cy.contains('[data-testid=tree-node]', 'Reusable Flow').should('have.attr', 'data-unresolved', 'true');
  });

  it('resolves once every argument is filled in', () => {
    addChild('Test Case', 'flowInvocation');
    selectNode('Reusable Flow');
    cy.get('[data-testid=prop-flowId]').select('login');
    setProp('username', 'admin');
    setProp('password', 'hunter2');

    cy.contains('[data-testid=tree-node]', 'Reusable Flow').should('not.have.attr', 'data-unresolved');
  });

  it('generates the exact Login expansion', () => {
    addChild('Test Case', 'flowInvocation');
    selectNode('Reusable Flow');
    cy.get('[data-testid=prop-flowId]').select('login');
    setProp('username', 'admin');
    setProp('password', 'hunter2');

    openCodeDrawer();
    const expected = `describe('Suite', () => {
  it('a test', () => {
    cy.visit('/login');
    cy.get('#username').type('admin');
    cy.get('#password').type('hunter2');
    cy.get('#login-submit').click();
  });
});`;
    cy.get('[data-testid=output-code]').should(($el) => {
      expect($el.text().trim()).to.eq(expected);
    });
  });

  it('the Flow picker offers the full expanded starter library (Phase 5 completion)', () => {
    addChild('Test Case', 'flowInvocation');
    selectNode('Reusable Flow');
    cy.get('[data-testid=prop-flowId] option').then(($options) => {
      const values = [...$options].map((o) => (o as HTMLOptionElement).value).filter(Boolean);
      expect(values.sort()).to.deep.equal([
        'createRecord',
        'deleteRecord',
        'gridRowAction',
        'login',
        'logout',
        'notificationValidation',
        'readRecord',
        'search',
        'updateRecord',
      ]);
    });
  });

  it('generates the exact Notification Validation expansion (Phase 4 network ordering inside a reusable flow)', () => {
    addChild('Test Case', 'flowInvocation');
    selectNode('Reusable Flow');
    cy.get('[data-testid=prop-flowId]').select('notificationValidation');
    setProp('url', '/api/save');
    setProp('triggerSelector', '#save-button');
    setProp('expectedText', 'Saved successfully');

    openCodeDrawer();
    const expected = `describe('Suite', () => {
  it('a test', () => {
    cy.intercept('/api/save').as('notifRequest');
    cy.get('#save-button').click();
    cy.wait('@notifRequest');
    cy.get('#notification').should('contain.text', 'Saved successfully');
  });
});`;
    cy.get('[data-testid=output-code]').should(($el) => {
      expect($el.text().trim()).to.eq(expected);
    });
  });

  it('generates the exact Grid Row Action expansion (Phase 2 chain composition inside a reusable flow)', () => {
    addChild('Test Case', 'flowInvocation');
    selectNode('Reusable Flow');
    cy.get('[data-testid=prop-flowId]').select('gridRowAction');
    setProp('rowSelector', '.grid-row');
    setProp('rowIndex', '2');
    setProp('actionSelector', '.archive-btn');

    openCodeDrawer();
    const expected = `describe('Suite', () => {
  it('a test', () => {
    cy.get('.grid-row')
      .eq(2)
      .find('.archive-btn')
      .click();
    cy.get('.grid-row')
      .eq(2)
      .should('be.visible');
  });
});`;
    cy.get('[data-testid=output-code]').should(($el) => {
      expect($el.text().trim()).to.eq(expected);
    });
  });

  it('generates the exact Search expansion for a different starter flow/argument', () => {
    addChild('Test Case', 'flowInvocation');
    selectNode('Reusable Flow');
    cy.get('[data-testid=prop-flowId]').select('search');
    setProp('query', 'Widget');

    openCodeDrawer();
    const expected = `describe('Suite', () => {
  it('a test', () => {
    cy.get('#search-input').type('Widget');
    cy.get('#search-button').click();
    cy.get('#search-results').should('be.visible');
  });
});`;
    cy.get('[data-testid=output-code]').should(($el) => {
      expect($el.text().trim()).to.eq(expected);
    });
  });
});
