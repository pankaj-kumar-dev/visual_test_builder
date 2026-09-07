/**
 * Smoke — Phase 5F dedicated validation panel.
 *
 * The panel renders the exact same `findUnresolvedNodes`/`findSemanticIssues`
 * results the canvas highlighting, property editor, and code drawer already
 * derive from (src/app/hooks.ts) — this spec only proves the panel's own
 * presentation (open/close, counts, click-to-reveal, and that fixing an
 * issue clears its row here too), not a second copy of validation logic.
 */

import { addChild, addRoot, nodeIdByLabel, selectNode, setProp } from '../support/flows';

function openValidationPanel(): void {
  cy.get('body').then(($body) => {
    if ($body.find('[data-testid=validation-panel]').length === 0) {
      cy.get('[data-testid=validation-toggle]').click();
    }
  });
  cy.get('[data-testid=validation-panel]').should('exist');
}

describe('Validation panel (Phase 5F)', () => {
  beforeEach(() => {
    cy.visit('/');
    addRoot('describe');
    selectNode('Describe Block');
    setProp('label', 'Suite');
  });

  it('opens and closes via the header toggle, and via Escape', () => {
    cy.get('[data-testid=validation-panel]').should('not.exist');
    cy.get('[data-testid=validation-toggle]').click();
    cy.get('[data-testid=validation-panel]').should('exist');
    cy.get('body').type('{esc}');
    cy.get('[data-testid=validation-panel]').should('not.exist');
  });

  it('shows an empty state when the flow has no issues', () => {
    // A "Describe Block" alone, with its Suite Name filled in, is fully resolved.
    openValidationPanel();
    cy.get('[data-testid=validation-error-count]').should('contain.text', '0 Errors');
    cy.get('[data-testid=validation-warning-count]').should('contain.text', '0 Warnings');
    cy.get('[data-testid=validation-empty]').should('exist');
  });

  it('counts an unresolved required property as an error, shown in both the panel and the header badge', () => {
    addChild('Describe Block', 'it'); // Test Name left empty — required
    openValidationPanel();
    cy.get('[data-testid=validation-error-count]').should('contain.text', '1 Error');
    cy.get('[data-testid=validation-issue][data-severity=error]')
      .should('have.length', 1)
      .and('contain.text', 'Test Case')
      .and('contain.text', 'Test Name');
    cy.get('[data-testid=validation-toggle] [data-testid=validation-badge-count]').should('have.text', '1');
  });

  it('counts a semantic reference-used-without-trigger issue as a warning, distinct from errors', () => {
    addChild('Describe Block', 'beforeEach');
    addChild('Before Each', 'chain');
    addChild('Chain', 'intercept');
    selectNode('Intercept');
    setProp('url', '/api/x');
    addChild('Chain', 'as');
    selectNode('As (save alias)');
    setProp('name', 'x');
    addChild('Describe Block', 'it');
    selectNode('Test Case');
    setProp('label', 'a test');
    addChild('Test Case', 'waitAlias');
    selectNode('Wait for Alias');
    setProp('alias', '@x');

    openValidationPanel();
    cy.get('[data-testid=validation-error-count]').should('contain.text', '0 Errors');
    cy.get('[data-testid=validation-warning-count]').should('contain.text', '1 Warning');
    cy.get('[data-testid=validation-issue][data-severity=warning]')
      .should('have.length', 1)
      .and('contain.text', 'awaited here');
  });

  it('clicking an error row selects that node (reveal), and fixing it clears the row', () => {
    addChild('Describe Block', 'it');
    openValidationPanel();
    cy.get('[data-testid=validation-issue][data-severity=error]').first().click();

    // REVEAL_NODE selected the Test Case node — its property editor is now showing.
    cy.get('[data-testid=property-context]').should('exist');
    cy.get('[data-testid=prop-label]').should('exist').type('a test');

    cy.get('[data-testid=validation-empty]').should('exist');
    cy.get('[data-testid=validation-error-count]').should('contain.text', '0 Errors');
  });

  it('a switch with zero cases is counted and reachable from the panel, same as any other unresolved node', () => {
    addChild('Describe Block', 'it');
    selectNode('Test Case');
    setProp('label', 'a test');
    nodeIdByLabel('Test Case').then((id) => {
      cy.dragDrop('[data-testid=palette-item-switch]', `[data-node-id="${id}"]`);
    });
    selectNode('Switch');
    setProp('expression', 'role');

    openValidationPanel();
    cy.get('[data-testid=validation-issue][data-severity=error]')
      .should('have.length', 1)
      .and('contain.text', 'At least 1 Case is required');
  });
});
