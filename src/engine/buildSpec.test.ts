/**
 * "Build Test" compile-ready export unit tests (Phase 9, builder UX roadmap).
 */

import { describe, expect, it } from 'vitest';
import { buildSpec } from './buildSpec';
import { processFlowAsSpec } from './processFlow';
import type { FlowNode, ReusableFlowDef } from '../domain/types';

const LOGIN: ReusableFlowDef = {
  id: 'login',
  name: 'Login',
  params: [
    { key: 'username', label: 'Username', type: 'text', required: true },
    { key: 'password', label: 'Password', type: 'text', required: true },
  ],
  body: [
    { id: 'l1', type: 'visit', props: { url: '/login' } },
    { id: 'l2', type: 'type', props: { selector: '#username', value: '{{username}}' } },
    { id: 'l3', type: 'type', props: { selector: '#password', value: '{{password}}' } },
    { id: 'l4', type: 'click', props: { selector: '#login-submit' } },
  ],
};

function flowWithInvocation(): FlowNode {
  return {
    id: 'root',
    type: 'describe',
    props: { label: 'Dashboard' },
    children: [
      {
        id: 'it-1',
        type: 'it',
        props: { label: 'shows the dashboard after login' },
        children: [
          {
            id: 'invoke-1',
            type: 'flowInvocation',
            props: { flowId: 'login', username: 'admin', password: 'hunter2' },
          },
          { id: 'assert-1', type: 'should', props: { selector: '#dashboard', assertion: 'be.visible' } },
        ],
      },
    ],
  };
}

describe('processFlowAsSpec', () => {
  it('calls the custom command instead of inlining the expansion', () => {
    const code = processFlowAsSpec(flowWithInvocation(), undefined, [LOGIN]);
    expect(code).toBe(
      "describe('Dashboard', () => {\n" +
        "  it('shows the dashboard after login', () => {\n" +
        "    cy.login('admin', 'hunter2');\n" +
        "    cy.get('#dashboard').should('be.visible');\n" +
        '  });\n' +
        '});',
    );
  });

  it('matches ordinary processFlow when the tree has no reusable-flow invocation', () => {
    const flow: FlowNode = { id: 'click-1', type: 'click', props: { selector: '#x' } };
    expect(processFlowAsSpec(flow)).toBe("cy.get('#x').click();");
  });

  it('renders a placeholder for an unknown flow id, same as the inline path', () => {
    const flow: FlowNode = { id: 'invoke-1', type: 'flowInvocation', props: { flowId: 'missing' } };
    expect(processFlowAsSpec(flow, undefined, [])).toBe('// [Unknown reusable flow: missing]');
  });

  it('returns an empty string for a null flow', () => {
    expect(processFlowAsSpec(null)).toBe('');
  });
});

describe('buildSpec', () => {
  it('returns null for an empty canvas', () => {
    expect(buildSpec(null)).toBeNull();
  });

  it('derives a filename from the root describe label', () => {
    const built = buildSpec(flowWithInvocation(), undefined, [LOGIN])!;
    expect(built.fileName).toBe('dashboard.cy.ts');
  });

  it('falls back to "test.cy.ts" when the root has no label', () => {
    const flow: FlowNode = { id: 'click-1', type: 'click', props: { selector: '#x' } };
    expect(buildSpec(flow)!.fileName).toBe('test.cy.ts');
  });

  it('pairs the spec with exactly the commands it calls, self-contained', () => {
    const built = buildSpec(flowWithInvocation(), undefined, [LOGIN])!;
    expect(built.usedFlowIds).toEqual(['login']);
    expect(built.commandsCode).toBe(
      "Cypress.Commands.add('login', (username, password) => {\n" +
        "  cy.visit('/login');\n" +
        "  cy.get('#username').type(username);\n" +
        "  cy.get('#password').type(password);\n" +
        "  cy.get('#login-submit').click();\n" +
        '});',
    );
    expect(built.specCode).toContain("cy.login('admin', 'hunter2');");
  });

  it('pairs commandsCode with a matching Cypress.Chainable ambient-type augmentation', () => {
    const built = buildSpec(flowWithInvocation(), undefined, [LOGIN])!;
    expect(built.commandTypesCode).toBe(
      'declare global {\n' +
        '  namespace Cypress {\n' +
        '    interface Chainable {\n' +
        '      login(username: string, password: string): Chainable<void>;\n' +
        '    }\n' +
        '  }\n' +
        '}',
    );
  });

  it('types a number-typed param as number, not string', () => {
    const EQ: ReusableFlowDef = {
      id: 'pickNth',
      name: 'Pick Nth',
      params: [{ key: 'index', label: 'Index', type: 'number', required: true }],
      body: [{ id: 'b1', type: 'click', props: { selector: '#x' } }],
    };
    const flow: FlowNode = { id: 'invoke-1', type: 'flowInvocation', props: { flowId: 'pickNth', index: '2' } };
    const built = buildSpec(flow, undefined, [EQ])!;
    expect(built.commandTypesCode).toContain('pickNth(index: number): Chainable<void>;');
  });

  it('produces an empty commandsCode and commandTypesCode (not omitted) when no reusable flow is used', () => {
    const flow: FlowNode = { id: 'click-1', type: 'click', props: { selector: '#x' } };
    const built = buildSpec(flow)!;
    expect(built.commandsCode).toBe('');
    expect(built.commandTypesCode).toBe('');
    expect(built.usedFlowIds).toEqual([]);
  });

  it('ignores an invocation of an unknown flow id for dependency purposes', () => {
    const flow: FlowNode = { id: 'invoke-1', type: 'flowInvocation', props: { flowId: 'missing' } };
    const built = buildSpec(flow, undefined, [])!;
    expect(built.usedFlowIds).toEqual([]);
    expect(built.commandsCode).toBe('');
  });

  it('collects distinct fixture paths in first-seen order', () => {
    const flow: FlowNode = {
      id: 'it-1',
      type: 'it',
      props: { label: 'uses fixtures' },
      children: [
        { id: 'f1', type: 'fixture', props: { path: 'users.json' } },
        { id: 'f2', type: 'fixture', props: { path: 'orders.json' } },
        { id: 'f3', type: 'fixture', props: { path: 'users.json' } },
      ],
    };
    expect(buildSpec(flow)!.fixturePaths).toEqual(['users.json', 'orders.json']);
  });
});
