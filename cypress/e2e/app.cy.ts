/**
 * Smoke — Application launch and registry load (SM-03).
 *
 * Updated for Phase 2 UI: the generated-code panel is no longer permanently
 * visible — it lives behind the "</> Code" drawer toggle in the header.
 */

describe('Application boot', () => {
  beforeEach(() => {
    cy.visitApp();
  });

  context('SM-03 — app launches and registry loads', () => {
    it('renders the three workspace panels, the code toggle, and no registry error', () => {
      cy.get('[data-testid=registry-error]').should('not.exist');
      cy.get('[data-testid=palette]').should('be.visible');
      cy.get('[data-testid=canvas]').should('be.visible');
      cy.get('[aria-label="Property editor"]').should('exist');
      cy.get('[data-testid=code-toggle]').should('be.visible');
    });

    it('does not show the code drawer until the toggle is clicked', () => {
      cy.get('[data-testid=code-drawer]').should('not.exist');
      cy.get('[data-testid=code-toggle]').should('have.attr', 'aria-pressed', 'false');

      cy.get('[data-testid=code-toggle]').click();
      cy.get('[data-testid=code-drawer]').should('be.visible');
      cy.get('[data-testid=code-toggle]').should('have.attr', 'aria-pressed', 'true');

      cy.get('[data-testid=code-toggle]').click();
      cy.get('[data-testid=code-drawer]').should('not.exist');
    });

    it('starts in the empty state, offering the templates panel instead of a bare drop target', () => {
      cy.get('[data-testid=tree-node]').should('not.exist');
      cy.get('[data-testid=templates-panel]').should('be.visible');
    });
  });
});
