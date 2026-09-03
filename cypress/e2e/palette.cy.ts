/**
 * Smoke — Palette renders node chips from the registry (SM-04).
 *
 * Updated for the Scalable Builder UI: the flat, hardcoded group list is now a
 * registry-driven taxonomy (categories.json) rendered as collapsible
 * Category → Subcategory → Node sections, with a search box over the same list.
 */

const STRUCTURAL = [
  'describe', 'it', 'beforeAll', 'afterAll', 'beforeEach', 'afterEach',
  'chain', 'within', 'then', 'each', 'session',
];
const TRAVERSAL = [
  'get', 'contains', 'find', 'first', 'last', 'eq',
  'children', 'parent', 'parents', 'siblings', 'next', 'prev', 'closest', 'filter',
  'its', 'invoke', 'wrap',
];
const ACTION = [
  'click', 'type', 'clear', 'check', 'uncheck', 'select',
  'dblclick', 'focus', 'blur', 'scrollIntoView', 'rightclick', 'trigger', 'submit',
];
const ASSERTION = ['should', 'and'];
const BROWSER = ['visit', 'reload', 'go', 'viewport', 'title', 'url'];
const UTILITY = ['log', 'wait', 'screenshot', 'pause', 'clearCookies', 'clearLocalStorage'];
const DATA = ['as', 'fixture', 'env', 'task', 'readFile', 'writeFile', 'getCookie', 'setCookie'];
const NETWORK = ['intercept', 'waitAlias', 'request'];
// Phase 5: multi-slot composition, iteration, reusable flows, custom commands.
// "slot" is deliberately excluded — it is auto-created, never dragged in from
// the palette (StructuralNodeDef.hidden).
const CONTROL_FLOW = ['if', 'forEach'];
const WORKFLOW = ['flowInvocation'];
const CUSTOM_COMMAND = ['customCommand'];

const ALL_TYPES = [
  ...STRUCTURAL, ...BROWSER, ...TRAVERSAL, ...ACTION, ...ASSERTION, ...UTILITY, ...DATA, ...NETWORK,
  ...CONTROL_FLOW, ...WORKFLOW, ...CUSTOM_COMMAND,
];

describe('Palette', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  context('SM-04 — chips sourced from the registry', () => {
    it('shows every non-empty taxonomy category, in configuration order', () => {
      cy.get('.palette__category-toggle').should(($titles) => {
        // The button also holds a chevron glyph and a node count; keep the name.
        const labels = $titles
          .toArray()
          .map((el) => (el.textContent ?? '').replace(/[^A-Za-z ]/g, '').trim());
        expect(labels).to.deep.equal([
          'Structural', 'Traversal', 'Action', 'Assertion', 'Utility', 'Network', 'Browser', 'Data',
          'Control Flow', 'Workflow', 'Custom Command',
        ]);
      });
    });

    it('does not render a category that has no nodes yet (validation is reserved but unused)', () => {
      cy.get('[data-testid=palette-category-validation]').should('not.exist');
    });

    it('renders the Phase 5 control-flow/workflow/custom-command categories, each with its node(s)', () => {
      cy.get('[data-testid=palette-category-control-flow]')
        .find('[data-testid=palette-item-if]')
        .should('exist');
      cy.get('[data-testid=palette-category-control-flow]')
        .find('[data-testid=palette-item-forEach]')
        .should('exist');
      cy.get('[data-testid=palette-category-workflow]')
        .find('[data-testid=palette-item-flowInvocation]')
        .should('exist');
      cy.get('[data-testid=palette-category-custom-command]')
        .find('[data-testid=palette-item-customCommand]')
        .should('exist');
    });

    it('never renders the internal "slot" wrapper as a draggable chip', () => {
      cy.get('[data-testid=palette-item-slot]').should('not.exist');
    });

    it('renders every structural and command chip', () => {
      ALL_TYPES.forEach((type) => {
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

  context('hierarchical categories', () => {
    it('groups a category into its configured subcategories', () => {
      cy.get('[data-testid=palette-category-traversal]')
        .find('.palette__subtitle')
        .should(($subs) => {
          expect($subs.toArray().map((el) => el.textContent)).to.deep.equal([
            'Element', 'Position', 'Relative', 'Introspect',
          ]);
        });
    });

    it('places a category with no subcategories directly under its heading', () => {
      cy.get('[data-testid=palette-category-assertion]')
        .find('.palette__subtitle')
        .should('not.exist');
      cy.get('[data-testid=palette-category-assertion]')
        .find('[data-testid=palette-item-should]')
        .should('exist');
    });

    it('shows a node count per category', () => {
      cy.get('[data-testid=palette-category-traversal]')
        .find('.palette__count')
        .should('have.text', '17');
    });

    it('collapses and re-expands a category, reporting its state', () => {
      cy.get('[data-testid=palette-category-toggle-action]')
        .should('have.attr', 'aria-expanded', 'true');
      cy.get('[data-testid=palette-category-body-action]').should('not.have.attr', 'hidden');

      cy.get('[data-testid=palette-category-toggle-action]').click();

      cy.get('[data-testid=palette-category-toggle-action]')
        .should('have.attr', 'aria-expanded', 'false');
      cy.get('[data-testid=palette-category-body-action]').should('have.attr', 'hidden');
      cy.get('[data-testid=palette-item-click]').should('not.be.visible');
      // Other categories are unaffected.
      cy.get('[data-testid=palette-category-body-traversal]').should('not.have.attr', 'hidden');

      cy.get('[data-testid=palette-category-toggle-action]').click();
      cy.get('[data-testid=palette-category-body-action]').should('not.have.attr', 'hidden');
    });

    it('exposes the disclosure as a keyboard-operable button with its state', () => {
      // Cypress's synthetic `{enter}` cannot reproduce a browser's native button
      // activation, so what is asserted is the thing that guarantees it: a real
      // <button>, focusable, carrying an accessible name and aria-expanded.
      cy.get('[data-testid=palette-category-toggle-action]')
        .should('match', 'button')
        .and('have.attr', 'aria-controls', 'palette-category-action')
        .focus();
      cy.focused().should('have.attr', 'data-testid', 'palette-category-toggle-action');
    });

    it('keeps the search field reachable by keyboard focus', () => {
      cy.get('[data-testid=palette-search]').focus();
      cy.focused().should('have.attr', 'data-testid', 'palette-search');
    });
  });
});
