/**
 * Smoke — Palette search (Scalable Builder UI, Objective 1).
 *
 * Covers finding a node, the empty state, clearing, keyboard behaviour, and the
 * one that matters architecturally: a node dragged out of a *filtered* result is
 * inserted through the same validated path as one dragged from the category tree
 * (§32) — there is no second insertion mechanism.
 */

import { addChild, addRoot, openCodeDrawer, searchPalette, selectNode } from '../support/flows';

describe('Palette search', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  context('finding nodes', () => {
    it('filters to matching nodes as the user types', () => {
      searchPalette('sel');

      cy.get('[data-testid=palette-results]').should('exist');
      cy.get('[data-testid=palette-item-select]').should('be.visible');
      // Unrelated nodes are gone from the panel entirely.
      cy.get('[data-testid=palette-item-describe]').should('not.exist');
    });

    it('matches case-insensitively', () => {
      searchPalette('SELECT');
      cy.get('[data-testid=palette-item-select]').should('be.visible');
    });

    it('matches a label that differs from the node type', () => {
      searchPalette('assert');
      cy.get('[data-testid=palette-item-should]').should('be.visible');
    });

    it('matches description and keyword text, not just names', () => {
      searchPalette('dropdown');
      cy.get('[data-testid=palette-item-select]').should('be.visible');

      searchPalette('hook');
      cy.get('[data-testid=palette-item-beforeEach]').should('be.visible');
      cy.get('[data-testid=palette-item-afterEach]').should('be.visible');
    });

    it('keeps category context on every result instead of a bare flat list (§26)', () => {
      searchPalette('first');
      cy.get('[data-testid=palette-breadcrumb]')
        .should('have.length', 1)
        .and('have.text', 'Traversal / Position');
    });

    it('lets a whole category be browsed by typing its name', () => {
      searchPalette('traversal');
      cy.get('[data-testid=palette-results] [data-testid^=palette-item-]')
        .should('have.length', 17);
    });

    it('narrows further with a second token', () => {
      searchPalette('traversal position');
      cy.get('[data-testid=palette-results] [data-testid^=palette-item-]')
        .should('have.length', 3);
    });

    it('shows an empty state when nothing matches', () => {
      searchPalette('websocket');
      cy.get('[data-testid=palette-empty]').should('contain.text', 'No nodes match');
      cy.get('[data-testid=palette-results] [data-testid^=palette-item-]').should('not.exist');
    });
  });

  context('clearing', () => {
    it('restores the full hierarchy via the clear button', () => {
      searchPalette('click');
      cy.get('[data-testid=palette-item-describe]').should('not.exist');

      cy.get('[data-testid=palette-search-clear]').click();

      cy.get('[data-testid=palette-results]').should('not.exist');
      cy.get('[data-testid=palette-category-structural]').should('exist');
      cy.get('[data-testid=palette-item-describe]').should('be.visible');
      cy.get('[data-testid=palette-search]').should('have.value', '');
    });

    it('clears with Escape and keeps focus in the search box', () => {
      searchPalette('click');
      cy.get('[data-testid=palette-search]').type('{esc}');

      cy.get('[data-testid=palette-search]').should('have.value', '');
      cy.focused().should('have.attr', 'data-testid', 'palette-search');
      cy.get('[data-testid=palette-item-describe]').should('be.visible');
    });

    it('Escape in the search box does not also close the code drawer (§27)', () => {
      openCodeDrawer();
      searchPalette('click');

      cy.get('[data-testid=palette-search]').type('{esc}');

      cy.get('[data-testid=palette-search]').should('have.value', '');
      cy.get('[data-testid=code-drawer]').should('exist');
    });

    it('leaves the category tree organization intact after searching', () => {
      searchPalette('get');
      cy.get('[data-testid=palette-search-clear]').click();

      cy.get('[data-testid=palette-category-traversal]')
        .find('.palette__subtitle')
        .should('have.length', 4);
    });
  });

  context('search results drag exactly like category chips (§32)', () => {
    it('drops a filtered result into the flow and generates its code', () => {
      addRoot('describe');
      addChild('Describe Block', 'it');

      searchPalette('visit');
      addChild('Test Case', 'visit');

      cy.contains('[data-testid=tree-node]', 'Visit').should('exist');

      selectNode('Visit');
      cy.get('[data-testid=prop-url]').type('/login');
      openCodeDrawer();
      cy.get('[data-testid=output-code]').should('contain.text', "cy.visit('/login');");
    });

    it('still rejects an invalid drop made from a filtered result', () => {
      addRoot('describe');

      // `click` may not be a direct child of describe — filtering must not bypass
      // the registry's allowedChildren validation.
      searchPalette('click');
      cy.get('[data-testid=tree-node]')
        .its('length')
        .then((before) => {
          cy.dragDrop('[data-testid=palette-item-click]', '[data-testid=tree-node]');
          cy.get('[data-testid=tree-node]').should('have.length', before);
        });
      cy.contains('[data-testid=tree-node]', 'Click').should('not.exist');
    });
  });
});
