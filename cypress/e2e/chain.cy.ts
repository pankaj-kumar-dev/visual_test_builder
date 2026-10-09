/**
 * Smoke — Chain (Phase 2): palette, drop validation, property editing, reorder,
 * and generated output for a composed subject expression.
 */

import {
  addChild,
  addRoot,
  nodeIdByLabel,
  openCodeDrawer,
  selectNode,
  setProp,
} from '../support/flows';

/**
 * Attempt a drop that is expected to be *rejected*. Unlike `addChild` (which
 * waits for the tree to grow by one and fails the test if it doesn't), this
 * performs the drag and then asserts the row count is unchanged — giving the
 * (non-)update a moment to settle either way.
 */
function attemptRejectedDrop(parentLabel: string, type: string): void {
  cy.get('[data-testid=tree-node]')
    .its('length')
    .then((before) => {
      nodeIdByLabel(parentLabel).then((id) => {
        cy.dragDrop(`[data-testid=palette-item-${type}]`, `[data-node-id="${id}"]`);
      });
      // Cypress's `.should()` here retries the read + assertion together, so a
      // slow (rejected) settle can't be mistaken for a real drop still in flight.
      cy.get('[data-testid=tree-node]').should('have.length', before);
    });
}

describe('Chain', () => {
  beforeEach(() => {
    cy.visitApp();
  });

  context('appears in the palette and can be added to an it block', () => {
    it('shows the Chain chip under Structural', () => {
      cy.get('[data-testid=palette-item-chain]').should('exist');
    });

    it('can be dropped as a child of a Test Case', () => {
      addRoot('describe');
      addChild('Describe Block', 'it');
      addChild('Test Case', 'chain');

      cy.get('[data-testid=tree-node]').should('have.length', 3);
      cy.contains('[data-testid=tree-node]', 'Chain').should('exist');
    });
  });

  context('building a valid multi-step chain', () => {
    beforeEach(() => {
      addRoot('describe');
      selectNode('Describe Block');
      setProp('label', 'Items');

      addChild('Describe Block', 'it');
      selectNode('Test Case');
      setProp('label', 'clicks the first item');

      addChild('Test Case', 'chain');
    });

    it('accepts a root command first, then subject commands, and generates the composed expression', () => {
      addChild('Chain', 'get');
      selectNode('Get');
      setProp('selector', '.items');

      addChild('Chain', 'first');
      addChild('Chain', 'click');
      openCodeDrawer();

      const expected = `describe('Items', () => {
  it('clicks the first item', () => {
    cy.get('.items')
      .first()
      .click();
  });
});`;
      cy.get('[data-testid=output-code]').should(($el) => {
        expect($el.text().trim()).to.eq(expected);
      });
    });

    it('rejects a subject command dropped before any root command exists', () => {
      // Chain is still empty — dropping `click` first must be silently rejected
      // (Phase 2 §14/§23: an invalid arrangement is never allowed to form, and if
      // it did, generation would render a comment rather than broken code).
      attemptRejectedDrop('Chain', 'click');

      cy.contains('[data-testid=tree-node]', 'Click').should('not.exist');
    });

    it('rejects visit inside a chain even after a valid root exists', () => {
      addChild('Chain', 'get');
      attemptRejectedDrop('Chain', 'visit');

      cy.contains('[data-testid=tree-node]', 'Visit').should('not.exist');
    });

    it('reorders commands inside the chain and the output reflects the new order', () => {
      addChild('Chain', 'get');
      selectNode('Get');
      setProp('selector', '.items');
      addChild('Chain', 'first');
      addChild('Chain', 'last'); // chain's children are now [get, first, last]

      nodeIdByLabel('Chain').then((chainId) => {
        nodeIdByLabel('Last').then((lastId) => {
          // Move "last" to sibling index 1 — right after "get", before "first" —
          // producing [get, last, first].
          cy.dragDrop(
            `[data-node-id="${lastId}"]`,
            `[data-parent-id="${chainId}"][data-before-index="1"]`,
          );
        });
      });
      openCodeDrawer();

      const expected = `describe('Items', () => {
  it('clicks the first item', () => {
    cy.get('.items')
      .last()
      .first();
  });
});`;
      // `.should()` on the element retries the whole read+assert, so the drag's
      // React commit has room to land before this fails the test.
      cy.get('[data-testid=output-code]').should(($el) => {
        expect($el.text().trim()).to.eq(expected);
      });
    });
  });
});
