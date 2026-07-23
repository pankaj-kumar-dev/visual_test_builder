/**
 * Smoke — Output panel: generated code correctness and copy
 * (SM-09, SM-10).
 */

import { buildLoginFlow } from '../support/flows';

const EXPECTED = `describe('Login Suite', () => {
  it('Successful Login', () => {
    cy.get('#username').type('admin');
    cy.get('#login').click();
  });
});`;

describe('Output panel', () => {
  beforeEach(() => {
    cy.visit('/');
    buildLoginFlow();
  });

  context('SM-09 — generated code matches the expected Cypress', () => {
    it('produces the exact HLD example output with no warning', () => {
      cy.get('[data-testid=unresolved-warning]').should('not.exist');
      cy.get('[data-testid=output-code]')
        .invoke('text')
        .then((text) => {
          expect(text.trim()).to.eq(EXPECTED);
        });
    });
  });

  context('SM-10 — copy the generated code', () => {
    it('writes the code to the clipboard and shows feedback', () => {
      cy.window().then((win) => {
        cy.stub(win.navigator.clipboard, 'writeText').resolves().as('writeText');
      });

      cy.get('[data-testid=copy-button]').click();

      cy.get('@writeText').should('have.been.calledOnce');
      cy.get('@writeText').should((stub) => {
        const arg = (stub as unknown as sinon.SinonStub).firstCall.args[0] as string;
        expect(arg.trim()).to.eq(EXPECTED);
      });
      cy.get('[data-testid=copy-button]').should('contain.text', 'Copied!');
    });
  });
});
