/**
 * Smoke — Palette renders node chips from the registry (SM-04).
 */

const STRUCTURAL = ['describe', 'it', 'beforeAll', 'afterAll'];
const COMMANDS = ['click', 'type', 'visit', 'should'];

describe('Palette', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  context('SM-04 — chips sourced from the registry', () => {
    it('shows both category groups', () => {
      cy.contains('.palette__title', 'Structural').should('exist');
      cy.contains('.palette__title', 'Commands').should('exist');
    });

    it('renders every structural and command chip', () => {
      [...STRUCTURAL, ...COMMANDS].forEach((type) => {
        cy.get(`[data-testid=palette-item-${type}]`).should('exist');
      });
    });

    it('makes chips draggable', () => {
      cy.get('[data-testid=palette-item-describe]').should(
        'have.attr',
        'draggable',
        'true',
      );
    });
  });
});
