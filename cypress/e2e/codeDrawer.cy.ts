/**
 * Smoke — Code drawer scrolling, keyboard, and responsive behavior (Phase 2 UI).
 *
 * Complements output.cy.ts (content correctness/copy) and app.cy.ts (open/close
 * toggle + no-permanent-panel) with: long-code scrolling, Escape-to-close,
 * click-through from an unresolved entry to its canvas node, and layout behavior
 * across the desktop/tablet/mobile breakpoints named in the brief.
 */

import { addChild, addRoot, openCodeDrawer } from '../support/flows';

function noHorizontalPageOverflow(): void {
  cy.window().then((win) => {
    expect(win.document.documentElement.scrollWidth).to.be.at.most(win.innerWidth + 1);
  });
}

describe('Code drawer — scrolling and keyboard', () => {
  beforeEach(() => {
    cy.visitApp();
  });

  it('a long generated test stays scrollable and the warning list stays reachable', () => {
    addRoot('describe');
    addChild('Describe Block', 'it');
    for (let i = 0; i < 40; i += 1) {
      addChild('Test Case', 'click');
    }
    openCodeDrawer();

    cy.get('[data-testid=output-code]').should('have.css', 'overflow', 'auto');
    cy.get('[data-testid=output-code]').then(($code) => {
      expect($code[0].scrollHeight).to.be.greaterThan($code[0].clientHeight);
    });

    // 40 unresolved `click` selectors plus the describe/it labels — long enough
    // that the warning section must be reached by scrolling the drawer body, not
    // hidden behind the code region above it.
    cy.get('[data-testid=unresolved-warning]').scrollIntoView().should('be.visible');
    cy.get('[data-testid=unresolved-warning] li').should('have.length.greaterThan', 10);
  });

  it('Escape closes the drawer', () => {
    openCodeDrawer();
    cy.get('[data-testid=code-drawer]').should('exist');
    cy.get('body').type('{esc}');
    cy.get('[data-testid=code-drawer]').should('not.exist');
  });

  it('clicking an unresolved entry selects its node and opens it in the property editor', () => {
    addRoot('describe');
    addChild('Describe Block', 'it');
    addChild('Test Case', 'click');
    openCodeDrawer();

    cy.get('[data-testid=unresolved-warning]').contains('button', 'Click').click();

    cy.contains('[data-testid=tree-node]', 'Click').should('have.class', 'is-selected');
    cy.get('[data-testid=prop-selector]').should('exist');
  });
});

describe('Code drawer — responsive layout', () => {
  beforeEach(() => {
    cy.visitApp();
  });

  it('desktop (1280x800): drawer adds a 4th column; palette/canvas/properties stay visible', () => {
    cy.viewport(1280, 800);
    cy.get('[data-testid=palette]').should('be.visible');
    cy.get('[data-testid=canvas]').should('be.visible');
    cy.get('[aria-label="Property editor"]').should('be.visible');
    noHorizontalPageOverflow();

    openCodeDrawer();
    cy.get('[data-testid=code-drawer]').should('be.visible');
    cy.get('[data-testid=palette]').should('be.visible');
    cy.get('[data-testid=canvas]').should('be.visible');
    cy.get('[aria-label="Property editor"]').should('be.visible');
    noHorizontalPageOverflow();
  });

  it('tablet (900x800): opening the drawer keeps the canvas usable', () => {
    cy.viewport(900, 800);
    cy.get('[data-testid=palette]').should('be.visible');
    cy.get('[data-testid=canvas]').should('be.visible');
    noHorizontalPageOverflow();

    openCodeDrawer();
    cy.get('[data-testid=code-drawer]').should('be.visible');
    cy.get('[data-testid=canvas]').should('be.visible');
    noHorizontalPageOverflow();
  });

  it('mobile (390x844): the drawer becomes full screen with a reachable close button', () => {
    cy.viewport(390, 844);
    noHorizontalPageOverflow();

    openCodeDrawer();
    cy.get('[data-testid=code-drawer]').should('be.visible');
    cy.get('[data-testid=code-drawer-close]').should('be.visible');
    noHorizontalPageOverflow();

    cy.get('[data-testid=code-drawer-close]').click();
    cy.get('[data-testid=code-drawer]').should('not.exist');
    noHorizontalPageOverflow();
  });

  it('survives desktop -> tablet -> mobile -> desktop without breaking', () => {
    cy.viewport(1280, 800);
    openCodeDrawer();
    cy.get('[data-testid=code-drawer]').should('be.visible');
    noHorizontalPageOverflow();

    cy.viewport(900, 800);
    cy.get('[data-testid=code-drawer]').should('be.visible');
    cy.get('[data-testid=canvas]').should('be.visible');
    noHorizontalPageOverflow();

    cy.viewport(390, 844);
    cy.get('[data-testid=code-drawer]').should('be.visible');
    cy.get('[data-testid=code-drawer-close]').should('be.visible');
    noHorizontalPageOverflow();

    cy.viewport(1280, 800);
    cy.get('[data-testid=code-drawer]').should('be.visible');
    cy.get('[aria-label="Property editor"]').should('be.visible');
    cy.get('[data-testid=canvas]').should('be.visible');
    noHorizontalPageOverflow();
  });
});
