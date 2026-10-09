/**
 * Smoke — Canvas: create, nest, select, delete, reorder
 * (SM-05, SM-06, SM-07, SM-11, SM-12).
 */

import { addChild, addRoot, nodeIdByLabel, selectNode } from '../support/flows';

describe('Canvas', () => {
  beforeEach(() => {
    cy.visitApp();
  });

  context('SM-05 — create the root node', () => {
    it('creates a describe root from a palette drop', () => {
      addRoot('describe');
      cy.get('[data-testid=tree-node]')
        .should('have.length', 1)
        .and('contain.text', 'Describe Block');
    });
  });

  context('SM-06 — build a nested flow', () => {
    beforeEach(() => {
      addRoot('describe');
      addChild('Describe Block', 'it');
      addChild('Test Case', 'type');
      addChild('Test Case', 'click');
    });

    it('renders describe > it > [type, click]', () => {
      cy.get('[data-testid=tree-node]').should('have.length', 4);
      cy.contains('[data-testid=tree-node]', 'Test Case').should('exist');
      cy.contains('[data-testid=tree-node]', 'Type').should('exist');
      cy.contains('[data-testid=tree-node]', 'Click').should('exist');
    });
  });

  context('SM-07 — select a node', () => {
    beforeEach(() => {
      addRoot('describe');
      addChild('Describe Block', 'it');
      addChild('Test Case', 'type');
    });

    it('highlights the node and loads its fields in the editor', () => {
      selectNode('Type');
      cy.contains('[data-testid=tree-node]', 'Type').should(
        'have.class',
        'is-selected',
      );
      cy.get('[data-testid=prop-selector]').should('exist');
    });
  });

  context('SM-11 — delete a node', () => {
    beforeEach(() => {
      addRoot('describe');
      addChild('Describe Block', 'it');
      addChild('Test Case', 'type');
      addChild('Test Case', 'click');
    });

    it('removes the node and clears selection when it was selected', () => {
      selectNode('Click');
      cy.contains('[data-testid=tree-node]', 'Click').find(
        '[data-testid=node-delete]',
      ).click();

      cy.get('[data-testid=tree-node]').should('have.length', 3);
      cy.contains('[data-testid=tree-node]', 'Click').should('not.exist');
      cy.get('[data-testid=prop-selector]').should('not.exist');
    });
  });

  context('SM-12 — reorder siblings', () => {
    beforeEach(() => {
      addRoot('describe');
      addChild('Describe Block', 'it');
      addChild('Test Case', 'type'); // index 0
      addChild('Test Case', 'click'); // index 1
    });

    it('moves the second child above the first', () => {
      // Before: describe(0), it(1), type(2), click(3)
      cy.get('[data-testid=tree-node]').eq(2).should('contain.text', 'Type');
      cy.get('[data-testid=tree-node]').eq(3).should('contain.text', 'Click');

      nodeIdByLabel('Test Case').then((itId) => {
        nodeIdByLabel('Click').then((clickId) => {
          cy.dragDrop(
            `[data-node-id="${clickId}"]`,
            `[data-parent-id="${itId}"][data-before-index="0"]`,
          );
        });
      });

      // After: click and type swap order.
      cy.get('[data-testid=tree-node]').eq(2).should('contain.text', 'Click');
      cy.get('[data-testid=tree-node]').eq(3).should('contain.text', 'Type');
    });
  });
});
