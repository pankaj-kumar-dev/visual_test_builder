/**
 * Flow JSON import/export + the number property type (Phase 1).
 *
 * Only the parts that need a real browser are exercised here — file selection,
 * the browser's own numeric-input filtering, and the inline error surface.
 * Generator correctness (exact output, invalid-JS safety) is covered by
 * src/engine/processFlow.test.ts and src/state/flowIO.test.ts; this spec does
 * not re-assert that with E2E drag-and-drop.
 */

import { addChild, addRoot, openCodeDrawer, selectNode, setProp } from '../support/flows';

describe('Flow JSON import/export', () => {
  beforeEach(() => {
    cy.visitApp();
  });

  it('imports a valid Flow JSON file and renders + compiles it', () => {
    const flow = {
      id: 'root',
      type: 'describe',
      props: { label: 'Imported Suite' },
      children: [
        {
          id: 'it-1',
          type: 'it',
          props: { label: 'imported case' },
          children: [{ id: 'visit-1', type: 'visit', props: { url: '/imported' } }],
        },
      ],
    };

    cy.get('[data-testid=import-flow-input]').selectFile(
      { contents: Cypress.Buffer.from(JSON.stringify(flow)), fileName: 'flow.json', mimeType: 'application/json' },
      { force: true },
    );

    cy.contains('[data-testid=tree-node]', 'Describe Block').should('exist');
    cy.contains('[data-testid=tree-node]', 'Test Case').should('exist');
    cy.contains('[data-testid=tree-node]', 'Visit').should('exist');

    openCodeDrawer();
    cy.get('[data-testid=output-code]').should('contain.text', "cy.visit('/imported');");
  });

  it('rejects an invalid Flow JSON file, shows an inline error, and leaves the canvas untouched', () => {
    addRoot('describe');
    selectNode('Describe Block');
    setProp('label', 'Kept Suite');

    cy.get('[data-testid=import-flow-input]').selectFile(
      { contents: Cypress.Buffer.from(JSON.stringify({ type: 'describe' })), fileName: 'bad.json', mimeType: 'application/json' },
      { force: true },
    );

    cy.get('[data-testid=import-error]').should('be.visible');
    cy.contains('[data-testid=tree-node]', 'Describe Block').should('exist');
  });

  it('rejects a file that is not valid JSON at all', () => {
    cy.get('[data-testid=import-flow-input]').selectFile(
      { contents: Cypress.Buffer.from('not json at all'), fileName: 'bad.json', mimeType: 'application/json' },
      { force: true },
    );
    cy.get('[data-testid=import-error]').should('be.visible');
  });

  it('the Export button is present and clickable once a flow exists', () => {
    addRoot('describe');
    cy.get('[data-testid=export-flow]').should('be.visible').click();
    // A real download can't be asserted portably across CI file systems; the
    // click itself must not throw or navigate away.
    cy.get('[data-testid=canvas]').should('be.visible');
  });
});

describe('Number property type (Phase 1)', () => {
  beforeEach(() => {
    cy.visitApp();
  });

  it('renders a number field as a real <input type="number">', () => {
    addRoot('chain');
    addChild('Chain', 'get');
    selectNode('Get');
    setProp('selector', '.items');
    addChild('Chain', 'eq');
    selectNode('Eq');

    cy.get('[data-testid=prop-index]').should('have.attr', 'type', 'number');
  });

  it("the browser itself refuses non-numeric keystrokes in a number field — real UI-level protection against invalid JS", () => {
    addRoot('chain');
    addChild('Chain', 'get');
    selectNode('Get');
    setProp('selector', '.items');
    addChild('Chain', 'eq');
    selectNode('Eq');

    cy.get('[data-testid=prop-index]').type('abc');
    cy.get('[data-testid=prop-index]').should('have.value', '');

    cy.get('[data-testid=prop-index]').type('2');
    cy.get('[data-testid=prop-index]').should('have.value', '2');

    addChild('Chain', 'click');
    openCodeDrawer();
    cy.get('[data-testid=output-code]').should('contain.text', "cy.get('.items')\n  .eq(2)\n  .click();");
  });
});
