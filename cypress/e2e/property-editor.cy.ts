/**
 * Smoke — Property editor: edit updates output; required indicator + warning
 * (SM-08, SM-13).
 */

import { addChild, addRoot, selectNode } from '../support/flows';

describe('Property editor', () => {
  beforeEach(() => {
    cy.visit('/');
    addRoot('describe');
    addChild('Describe Block', 'it');
  });

  context('SM-08 — editing a property updates the output', () => {
    it('compiles the type node from its property values', () => {
      addChild('Test Case', 'type');
      selectNode('Type');
      cy.get('[data-testid=prop-selector]').type('#username');
      cy.get('[data-testid=prop-value]').type('admin');

      cy.get('[data-testid=output-code]').should(
        'contain.text',
        "cy.get('#username').type('admin');",
      );
    });
  });

  context('SM-13 — required indicator and unresolved warning', () => {
    beforeEach(() => {
      addChild('Test Case', 'click');
      selectNode('Click');
    });

    it('marks the empty required field and lists the node, retaining the placeholder', () => {
      cy.get('[data-testid=prop-selector]').should('have.class', 'is-missing');
      cy.get('[data-testid=unresolved-warning]')
        .should('exist')
        .and('contain.text', 'Click');
      cy.get('[data-testid=output-code]').should('contain.text', '{{selector}}');
    });

    it('removes this node from the warning once its required field is filled', () => {
      // describe/it still have empty labels, so the warning persists overall; this
      // node (Click) must drop out of it and its selector placeholder must resolve.
      cy.get('[data-testid=prop-selector]').type('#login');
      cy.get('[data-testid=unresolved-warning]').should('not.contain.text', 'Click');
      cy.get('[data-testid=output-code]').should('not.contain.text', '{{selector}}');
    });
  });
});
