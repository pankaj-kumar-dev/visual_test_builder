/**
 * Smoke — Application launch and registry load (SM-03).
 */

describe('Application boot', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  context('SM-03 — app launches and registry loads', () => {
    it('renders all four panels and no registry error', () => {
      cy.get('[data-testid=registry-error]').should('not.exist');
      cy.get('[data-testid=palette]').should('be.visible');
      cy.get('[data-testid=canvas]').should('be.visible');
      cy.get('[aria-label="Property editor"]').should('exist');
      cy.get('[data-testid=output-code]').should('exist');
    });

    it('starts in the empty state', () => {
      cy.get('[data-testid=tree-node]').should('not.exist');
      cy.get('[data-testid=canvas]').should('contain.text', 'Drag a structural node');
    });
  });
});
