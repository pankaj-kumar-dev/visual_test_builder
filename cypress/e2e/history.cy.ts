/**
 * Smoke — Phase 5 undo/redo (state/builderSlice.ts's history around the
 * `applyFlow` choke point).
 *
 * Sequence/no-pollution correctness is covered exhaustively by
 * src/state/history.test.ts at the reducer level; this spec only exercises
 * what genuinely needs a real browser — the toolbar buttons' enabled state
 * and that undo/redo actually drive the canvas and generated code.
 */

import { addChild, addRoot, selectNode, setProp } from '../support/flows';

describe('Undo/redo (Phase 5)', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  it('both buttons start disabled on an empty canvas', () => {
    cy.get('[data-testid=undo-button]').should('be.disabled');
    cy.get('[data-testid=redo-button]').should('be.disabled');
  });

  it('undo becomes enabled after the first edit; redo stays disabled until an undo happens', () => {
    addRoot('describe');
    cy.get('[data-testid=undo-button]').should('not.be.disabled');
    cy.get('[data-testid=redo-button]').should('be.disabled');
  });

  it('undo removes the most recent addition and re-enables redo', () => {
    addRoot('describe');
    cy.contains('[data-testid=tree-node]', 'Describe Block').should('exist');

    cy.get('[data-testid=undo-button]').click();
    cy.get('[data-testid=canvas]').should('contain.text', 'Drag a structural node here to start building.');
    cy.get('[data-testid=redo-button]').should('not.be.disabled');
  });

  it('redo restores what undo just removed', () => {
    addRoot('describe');
    cy.get('[data-testid=undo-button]').click();
    cy.get('[data-testid=redo-button]').click();

    cy.contains('[data-testid=tree-node]', 'Describe Block').should('exist');
    cy.get('[data-testid=redo-button]').should('be.disabled');
  });

  it('a new edit after undo clears the redo stack', () => {
    addRoot('describe');
    selectNode('Describe Block');
    setProp('label', 'First');
    cy.get('[data-testid=undo-button]').click(); // back to no label
    cy.get('[data-testid=redo-button]').should('not.be.disabled');

    selectNode('Describe Block');
    setProp('label', 'Second');
    cy.get('[data-testid=redo-button]').should('be.disabled');
  });

  it('walks add -> add child -> delete child, undo x3 back to empty, redo x3, using only atomic (single-dispatch) actions', () => {
    // Deliberately avoids `setProp`/typing here: each keystroke is its own
    // `updateProp` dispatch (state/builderSlice.ts), so a typed edit is really
    // several history entries, not one — exact keystroke-level step counting
    // belongs in src/state/history.test.ts, which dispatches precisely. This
    // spec only needs to prove undo/redo actually drives the real canvas.
    addRoot('describe');
    addChild('Describe Block', 'it');
    cy.get('[data-testid=tree-node]').should('have.length', 2);

    cy.contains('[data-testid=tree-node]', 'Test Case').find('[data-testid=node-delete]').click();
    cy.get('[data-testid=tree-node]').should('have.length', 1);

    cy.get('[data-testid=undo-button]').click(); // undo the delete
    cy.get('[data-testid=tree-node]').should('have.length', 2);

    cy.get('[data-testid=undo-button]').click(); // undo adding the child
    cy.get('[data-testid=tree-node]').should('have.length', 1);

    cy.get('[data-testid=undo-button]').click(); // undo adding the root
    cy.get('[data-testid=canvas]').should('contain.text', 'Drag a structural node here to start building.');
    cy.get('[data-testid=undo-button]').should('be.disabled');

    cy.get('[data-testid=redo-button]').click(); // redo the root
    cy.get('[data-testid=tree-node]').should('have.length', 1);

    cy.get('[data-testid=redo-button]').click(); // redo the child
    cy.get('[data-testid=tree-node]').should('have.length', 2);

    cy.get('[data-testid=redo-button]').click(); // redo the delete
    cy.get('[data-testid=tree-node]').should('have.length', 1);

    cy.get('[data-testid=redo-button]').should('be.disabled');
  });

  it('undo works across a delete, restoring the deleted subtree', () => {
    addRoot('describe');
    addChild('Describe Block', 'it');
    cy.contains('[data-testid=tree-node]', 'Test Case').should('exist');

    cy.contains('[data-testid=tree-node]', 'Test Case')
      .find('[data-testid=node-delete]')
      .click();
    cy.contains('[data-testid=tree-node]', 'Test Case').should('not.exist');

    cy.get('[data-testid=undo-button]').click();
    cy.contains('[data-testid=tree-node]', 'Test Case').should('exist');
  });
});
