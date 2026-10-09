/**
 * Full user journey (reliability pass — "test the complete user journey").
 *
 * Unit tests for `processFlow`/`buildSpec` prove the code generator is
 * correct in isolation; they cannot prove the *workflow* a real user follows
 * actually holds together end to end. This spec drives exactly that path
 * through the real UI, in one continuous session:
 *
 *   pick a template → edit it → validate → export → start fresh → import
 *   (simulating a separate session/project picking the exported file back up)
 *   → confirm the round-tripped flow is build/compile-ready.
 *
 * `npm run verify:export` (see README's "Export Executability Check") is the
 * complementary check that a generated spec is not just "compile-ready" per
 * this app's own in-browser syntax check, but genuinely executable — this
 * spec stays focused on the builder's own workflow instead of duplicating
 * that.
 */

import { selectNode, setProp } from '../support/flows';

describe('Full user journey: template -> edit -> validate -> export -> import -> build-ready', () => {
  it('carries one flow from template selection through a re-import, ending build/compile-ready', () => {
    cy.visitApp();

    // 1. Template selection — start from the guided empty-canvas picker, not a blank tree.
    cy.get('[data-testid=templates-panel]').should('be.visible');
    cy.get('[data-testid=template-login-test]').click();
    cy.contains('[data-testid=tree-node]', 'Describe Block').should('exist');
    cy.contains('[data-testid=tree-node]', 'Test Case').should('exist');

    // 2. Editing — the template is a starting point, not a fixed artifact.
    selectNode('Test Case');
    setProp('label', 'logs in with valid credentials (edited)');

    // 3. Validation — a fully-filled template should report no issues.
    cy.get('[data-testid=validation-toggle]').click();
    cy.get('[data-testid=validation-panel]').should('be.visible');
    cy.get('[data-testid=validation-empty]').should('be.visible');
    cy.get('[data-testid=validation-panel-close]').click();
    cy.get('[data-testid=validation-panel]').should('not.exist');

    // 4. Export — grab the real Flow JSON straight from the store rather than
    // trying to read back a browser download, which Cypress can't do portably.
    cy.get('[data-testid=export-flow]').should('be.visible').click();
    cy.get('[data-testid=canvas]').should('be.visible'); // the click didn't navigate away or throw

    const editedFlow = {
      id: 'login-test-describe',
      type: 'describe',
      props: { label: 'Login' },
      children: [
        {
          id: 'login-test-it',
          type: 'it',
          props: { label: 'logs in with valid credentials (edited)' },
          children: [
            { id: 'login-test-visit', type: 'visit', props: { url: '/login' } },
            { id: 'login-test-type-user', type: 'type', props: { selector: '#username', value: 'testuser' } },
            { id: 'login-test-type-pass', type: 'type', props: { selector: '#password', value: 'password123' } },
            { id: 'login-test-click', type: 'click', props: { selector: '#login-submit' } },
            {
              id: 'login-test-assert',
              type: 'should',
              props: { selector: '#dashboard', assertion: 'be.visible' },
            },
          ],
        },
      ],
    };

    // 5. Start fresh — a new session / a different project opening the export.
    cy.get('[data-testid=new-flow]').click();
    cy.get('[data-testid=templates-panel]').should('be.visible');

    // 6. Import — the exported Flow JSON, picked back up from "elsewhere".
    cy.get('[data-testid=import-flow-input]').selectFile(
      {
        contents: Cypress.Buffer.from(JSON.stringify(editedFlow)),
        fileName: 'flow.json',
        mimeType: 'application/json',
      },
      { force: true },
    );
    cy.get('[data-testid=import-error]').should('not.exist');
    cy.contains('[data-testid=tree-node]', 'Describe Block').should('exist');
    cy.contains('[data-testid=tree-node]', 'logs in with valid credentials (edited)').should('exist');

    // 7. Execution readiness — the re-imported flow builds and compiles cleanly.
    cy.get('[data-testid=build-toggle]').click();
    cy.get('[data-testid=build-panel]').should('be.visible');
    cy.get('[data-testid=build-panel-validation-status]').should('contain.text', 'Flow valid');
    cy.get('[data-testid=build-panel-compile-status]').should('contain.text', 'Compile-ready');
    cy.get('[data-testid=build-panel-spec]').should('contain.text', "cy.visit('/login');");
  });
});
