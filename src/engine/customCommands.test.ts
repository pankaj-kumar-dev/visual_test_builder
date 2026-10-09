/**
 * Reusable flows as real Cypress custom commands (Phase 9, "compile-ready"
 * export). Covers `generateReusableFlowCommand` (the command definition) and
 * `reusableFlowCallArgs` (a call site's literal arguments) against both the
 * bundled starter flows (real-world shapes) and small fixtures for edge cases.
 */

import { describe, expect, it } from 'vitest';
import { generateReusableFlowCommand, reusableFlowCallArgs } from './processFlow';
import { getDefaultReusableFlows } from '../config/reusableFlowsConfig';
import type { FlowNode, ReusableFlowDef } from '../domain/types';

function findBundled(id: string): ReusableFlowDef {
  const def = getDefaultReusableFlows().find((f) => f.id === id);
  if (!def) throw new Error(`fixture error: no bundled flow "${id}"`);
  return def;
}

describe('generateReusableFlowCommand', () => {
  it('emits a zero-param command unchanged (bundled "logout")', () => {
    const code = generateReusableFlowCommand(findBundled('logout'));
    expect(code).toBe(
      "Cypress.Commands.add('logout', () => {\n" +
        "  cy.get('#logout-button').click();\n" +
        "  cy.get('#login-form').should('be.visible');\n" +
        '});',
    );
  });

  it('emits each declared param as a real, unquoted function argument, used unquoted in the body (bundled "login")', () => {
    const code = generateReusableFlowCommand(findBundled('login'));
    expect(code).toBe(
      "Cypress.Commands.add('login', (username, password) => {\n" +
        "  cy.visit('/login');\n" +
        "  cy.get('#username').type(username);\n" +
        "  cy.get('#password').type(password);\n" +
        "  cy.get('#login-submit').click();\n" +
        '});',
    );
  });

  it('threads params through a chain node in the body (bundled "notificationValidation")', () => {
    const code = generateReusableFlowCommand(findBundled('notificationValidation'));
    expect(code).toBe(
      "Cypress.Commands.add('notificationValidation', (url, triggerSelector, expectedText) => {\n" +
        "  cy.intercept(url).as('notifRequest');\n" +
        "  cy.get(triggerSelector).click();\n" +
        "  cy.wait('@notifRequest');\n" +
        "  cy.get('#notification').should('contain.text', expectedText);\n" +
        '});',
    );
  });

  it('falls back to literal text when a param token is embedded within a larger string, not the whole value', () => {
    const def: ReusableFlowDef = {
      id: 'partial',
      name: 'Partial',
      params: [{ key: 'name', label: 'Name', type: 'text', required: true }],
      body: [{ id: 'n1', type: 'visit', props: { url: '/users/{{name}}/profile' } }],
    };
    // Not a bare "{{name}}" value, so this is out of scope (documented limit)
    // and is treated as ordinary literal text, {{name}} left verbatim.
    expect(generateReusableFlowCommand(def)).toBe(
      "Cypress.Commands.add('partial', (name) => {\n" + "  cy.visit('/users/{{name}}/profile');\n" + '});',
    );
  });
});

describe('reusableFlowCallArgs', () => {
  it('produces quoted text arguments in declared param order (bundled "login")', () => {
    const def = findBundled('login');
    const node: FlowNode = {
      id: 'invoke-1',
      type: 'flowInvocation',
      props: { flowId: 'login', username: 'testuser', password: "O'Brien" },
    };
    expect(reusableFlowCallArgs(node, def)).toBe("'testuser', 'O\\'Brien'");
  });

  it('produces an unquoted numeric argument for a number-typed param', () => {
    const def: ReusableFlowDef = {
      id: 'wait-n',
      name: 'Wait N',
      params: [{ key: 'ms', label: 'Milliseconds', type: 'number', required: true }],
      body: [],
    };
    const node: FlowNode = { id: 'invoke-1', type: 'flowInvocation', props: { flowId: 'wait-n', ms: '250' } };
    expect(reusableFlowCallArgs(node, def)).toBe('250');
  });

  it('returns an empty string for a flow with no params', () => {
    const def = findBundled('logout');
    const node: FlowNode = { id: 'invoke-1', type: 'flowInvocation', props: { flowId: 'logout' } };
    expect(reusableFlowCallArgs(node, def)).toBe('');
  });
});
