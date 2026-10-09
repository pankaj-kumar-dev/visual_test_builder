/**
 * Edge cases (reliability pass — "exercise edge cases").
 *
 * Unit tests already cover these rules in isolation (engine/references.test.ts,
 * engine/switchCase.test.ts, state/largeFlow.test.ts, ...). This spec checks the
 * other half: that each edge case actually surfaces to a user through the real
 * UI — the validation panel, the build panel — rather than failing silently or
 * only being true of the pure function that computes it.
 */

import type { FlowNode } from '../../src/domain/types';

function importFlow(flow: FlowNode): void {
  cy.get('[data-testid=import-flow-input]').selectFile(
    { contents: Cypress.Buffer.from(JSON.stringify(flow)), fileName: 'flow.json', mimeType: 'application/json' },
    { force: true },
  );
  cy.get('[data-testid=import-error]').should('not.exist');
}

describe('Edge cases', () => {
  beforeEach(() => {
    cy.visitApp();
  });

  it('a malformed raw-JS expression field is caught as a build panel syntax error, not silently broken code', () => {
    importFlow({
      id: 'root',
      type: 'describe',
      props: { label: 'Expr' },
      children: [
        {
          id: 'it-1',
          type: 'it',
          props: { label: 'wraps a malformed expression' },
          children: [{ id: 'wrap-1', type: 'wrap', props: { expression: '{{{ not valid js (' } }],
        },
      ],
    });

    cy.get('[data-testid=build-toggle]').click();
    cy.get('[data-testid=build-panel-compile-status]').should('have.class', 'is-error');
    cy.get('[data-testid=build-panel-diagnostics]').should('be.visible');
  });

  it('a reusable-flow invocation naming an unknown flow id is flagged, not silently rendered as nothing', () => {
    importFlow({
      id: 'root',
      type: 'describe',
      props: { label: 'Invocation' },
      children: [
        {
          id: 'it-1',
          type: 'it',
          props: { label: 'invokes a missing flow' },
          children: [{ id: 'invoke-1', type: 'flowInvocation', props: { flowId: 'does-not-exist' } }],
        },
      ],
    });

    cy.get('[data-testid=validation-toggle]').click();
    cy.get('[data-testid=validation-error-list]').should('be.visible');
    cy.contains('[data-testid=validation-issue]', '"does-not-exist" has no matching reusable-flow definition').should(
      'exist',
    );
  });

  it('an alias waited on with no producer anywhere is flagged as a validation error', () => {
    importFlow({
      id: 'root',
      type: 'describe',
      props: { label: 'Alias' },
      children: [
        {
          id: 'it-1',
          type: 'it',
          props: { label: 'waits on an alias nobody produced' },
          children: [{ id: 'wait-1', type: 'waitAlias', props: { alias: '@neverProduced' } }],
        },
      ],
    });

    cy.get('[data-testid=validation-toggle]').click();
    cy.get('[data-testid=validation-error-list]').should('be.visible');
    cy.contains('[data-testid=validation-issue]', '"@neverProduced" has no producer anywhere in this flow').should(
      'exist',
    );
  });

  it('a fixture dependency is surfaced in the build panel, not just the generated code text', () => {
    importFlow({
      id: 'root',
      type: 'describe',
      props: { label: 'Fixture' },
      children: [
        {
          id: 'it-1',
          type: 'it',
          props: { label: 'loads a fixture' },
          children: [{ id: 'fixture-1', type: 'fixture', props: { path: 'sample.json' } }],
        },
      ],
    });

    cy.get('[data-testid=build-toggle]').click();
    cy.get('[data-testid=build-panel-dependencies]').should('contain.text', 'cypress/fixtures/sample.json');
  });

  it('a deeply nested control-flow tree (well beyond the HLD\'s 5-6 level baseline) still renders and stays compile-ready', () => {
    const DEPTH = 60;

    function nestedIf(depth: number): FlowNode {
      if (depth === 0) {
        return { id: 'leaf-click', type: 'click', props: { selector: '#bottom' } };
      }
      return {
        id: `if-${depth}`,
        type: 'if',
        props: { condition: `level${depth}` },
        children: [{ id: `slot-then-${depth}`, type: 'slot', props: { name: 'then' }, children: [nestedIf(depth - 1)] }],
      };
    }

    importFlow({
      id: 'root',
      type: 'describe',
      props: { label: 'Deep' },
      children: [
        {
          id: 'it-1',
          type: 'it',
          props: { label: `${DEPTH} levels of nested if` },
          children: [nestedIf(DEPTH)],
        },
      ],
    });

    cy.get('[data-testid=tree-node]').should('have.length.greaterThan', DEPTH);
    cy.get('[data-testid=build-toggle]').click();
    cy.get('[data-testid=build-panel-compile-status]').should('have.class', 'is-ok');
    cy.get('[data-testid=build-panel-spec]').should('contain.text', "cy.get('#bottom').click();");
  });
});
