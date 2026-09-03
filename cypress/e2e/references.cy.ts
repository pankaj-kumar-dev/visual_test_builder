/**
 * Smoke — Phase 3 reference (Cypress alias) semantics: producer ("as"),
 * consumer (a text field holding "@name"), the reference picker UI, and
 * semantic-issue reporting (unknown reference, duplicate/shadowed alias).
 *
 * Scope/ordering correctness (sibling isolation, hook visibility, nesting) is
 * covered by src/engine/references.test.ts; this spec only exercises what
 * needs a real browser — the picker populating from live scope, and the
 * semantic-issue surfaces actually rendering.
 */

import {
  addChild,
  addRoot,
  nodeIdByLabel,
  openCodeDrawer,
  selectNode,
  setProp,
} from '../support/flows';

describe('References (Phase 3)', () => {
  beforeEach(() => {
    cy.visit('/');
    addRoot('describe');
    selectNode('Describe Block');
    setProp('label', 'Suite');
    addChild('Describe Block', 'it');
    selectNode('Test Case');
    setProp('label', 'case');
  });

  it('producing an alias then picking it from a later field generates the correct code', () => {
    addChild('Test Case', 'chain');
    addChild('Chain', 'get');
    selectNode('Get');
    setProp('selector', '.row');
    addChild('Chain', 'as');
    selectNode('As (save alias)');
    setProp('name', 'row');

    addChild('Test Case', 'get');
    // A second "Get" row now exists (one inside the chain, one standalone) —
    // select the new standalone one specifically, not whichever matches first.
    cy.get('[data-node-id]').filter(':contains("Get")').last().click();

    // The picker offers the alias once it's been produced earlier in the flow.
    cy.get('[data-testid=prop-selector-reference-picker]').should('exist');
    cy.get('[data-testid=prop-selector-reference-picker]').select('row');
    cy.get('[data-testid=prop-selector]').should('have.value', '@row');

    openCodeDrawer();
    const expected = `describe('Suite', () => {
  it('case', () => {
    cy.get('.row').as('row');
    cy.get('@row');
  });
});`;
    cy.get('[data-testid=output-code]').should(($el) => {
      expect($el.text().trim()).to.eq(expected);
    });
  });

  it('the picker does not offer a reference before it has been produced', () => {
    addChild('Test Case', 'get');
    selectNode('Get');
    cy.get('[data-testid=prop-selector-reference-picker]').should('not.exist');
  });

  it('typing an unknown reference raises a semantic warning in the drawer and on the canvas row', () => {
    addChild('Test Case', 'get');
    selectNode('Get');
    setProp('selector', '@ghost');

    cy.contains('[data-testid=tree-node]', 'Get').should('have.attr', 'data-semantic-issue', 'true');

    openCodeDrawer();
    cy.get('[data-testid=semantic-warning]').should('contain.text', '@ghost');
    cy.get('[data-testid=semantic-warning]').should('contain.text', 'no producer');
  });

  it('a duplicate alias in the same test is flagged, and clicking it reveals the shadowing node', () => {
    addChild('Test Case', 'as');
    selectNode('As (save alias)');
    setProp('name', 'row');

    addChild('Test Case', 'as');
    // Two "As (save alias)" rows now exist; select the second (later) one.
    cy.get('[data-testid=tree-node]').contains('As (save alias)').parent().should('have.length.at.least', 1);
    cy.get('[data-node-id]').filter(':contains("As (save alias)")').last().click();
    cy.get('[data-testid=prop-name]').clear().type('row');

    openCodeDrawer();
    cy.get('[data-testid=semantic-warning]').should('contain.text', 'shadows it');

    cy.get('[data-testid=semantic-warning] .code-drawer__warning-item').first().click();
    cy.get('[data-testid=prop-name]').should('have.value', 'row');
  });

  it('a reference produced only in a sibling test is not offered by the picker or usable in this test', () => {
    // Second `it` under the same describe, with its own local alias.
    nodeIdByLabel('Describe Block').then((describeId) => {
      cy.dragDrop('[data-testid=palette-item-it]', `[data-node-id="${describeId}"]`);
    });
    cy.get('[data-testid=tree-node]').should('have.length', 3); // describe, it(case), it(new)

    cy.get('[data-node-id]').filter(':contains("Test Case")').last().click();
    setProp('label', 'other case');
    cy.contains('[data-testid=tree-node]', 'other case')
      .then(($row) => {
        cy.wrap($row).click();
      });

    nodeIdByLabel('other case').then((otherId) => {
      cy.dragDrop('[data-testid=palette-item-as]', `[data-node-id="${otherId}"]`);
    });
    cy.contains('[data-testid=tree-node]', 'As (save alias)').click();
    setProp('name', 'localOnly');

    // Back in the FIRST it: a fresh get must not see "localOnly" in its picker.
    selectNode('case');
    addChild('case', 'get');
    selectNode('Get');
    cy.get('[data-testid=prop-selector-reference-picker]').should('not.exist');
  });
});
