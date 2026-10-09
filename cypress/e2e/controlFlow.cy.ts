/**
 * Smoke — Phase 5 control flow: If/Else (generic multi-slot composition),
 * forEach (iteration via the existing block/callback composition), and
 * customCommand (one generic registry entry for any project-defined Cypress
 * command).
 *
 * Generator correctness (exact output at depth, nested constructs, reusable
 * flows) is covered by src/engine/processFlow.test.ts and
 * src/engine/goldenFlows.test.ts; this spec only exercises what genuinely
 * needs a real browser — palette presence, drop validation, the auto-seeded
 * slot rows, property editing, and the callback-signature display.
 */

import {
  addChild,
  addRoot,
  nodeIdByLabel,
  openCodeDrawer,
  selectNode,
  setProp,
} from '../support/flows';

/**
 * Drop an "If" node onto the node with `parentLabel`. Unlike `addChild`
 * (which waits for the tree to grow by exactly one row), adding an `if` grows
 * the tree by three rows in the same dispatch — itself plus its two
 * auto-seeded slot wrappers (Phase 5, state/builderSlice.ts) — so settling is
 * awaited by content (the new row appearing) rather than by count.
 */
function addIfNode(parentLabel: string): void {
  nodeIdByLabel(parentLabel).then((id) => {
    cy.dragDrop('[data-testid=palette-item-if]', `[data-node-id="${id}"]`);
  });
  cy.contains('[data-testid=tree-node]', 'If').should('exist');
}

describe('Control flow (Phase 5)', () => {
  beforeEach(() => {
    cy.visitApp();
    addRoot('describe');
    selectNode('Describe Block');
    setProp('label', 'Suite');
    addChild('Describe Block', 'it');
    selectNode('Test Case');
    setProp('label', 'a test');
  });

  context('If — generic multi-slot composition', () => {
    it('appears in the palette under Control Flow', () => {
      cy.get('[data-testid=palette-item-if]').should('exist');
    });

    it('is created with two auto-seeded slot rows, labeled Then and Else', () => {
      addIfNode('Test Case');
      cy.get('[data-testid=tree-node]').should('have.length', 5); // describe, it, if, then-slot, else-slot
      cy.contains('[data-testid=tree-node]', 'If').should('exist');
      cy.contains('[data-testid=tree-node]', 'Then').should('exist');
      cy.contains('[data-testid=tree-node]', 'Else').should('exist');
    });

    it('rejects a direct drop onto the If row itself — only its slots accept children', () => {
      addIfNode('Test Case');
      cy.get('[data-testid=tree-node]')
        .its('length')
        .then((before) => {
          nodeIdByLabel('If').then((id) => {
            cy.dragDrop('[data-testid=palette-item-click]', `[data-node-id="${id}"]`);
          });
          cy.get('[data-testid=tree-node]').should('have.length', before);
        });
    });

    it('flags a missing condition as unresolved, the same generic rule as any required field', () => {
      addIfNode('Test Case');
      cy.contains('[data-testid=tree-node]', 'If').should('have.attr', 'data-unresolved', 'true');
    });

    it('then-only: editing the condition and dropping a command into Then produces exact output with no else branch', () => {
      addIfNode('Test Case');
      selectNode('If');
      setProp('condition', 'loggedIn');
      addChild('Then', 'visit');
      selectNode('Visit');
      setProp('url', '/dashboard');

      openCodeDrawer();
      const expected = `describe('Suite', () => {
  it('a test', () => {
    if (loggedIn) {
      cy.visit('/dashboard');
    }
  });
});`;
      cy.get('[data-testid=output-code]').should(($el) => {
        expect($el.text().trim()).to.eq(expected);
      });
    });

    it('then + else: dropping into both slots produces both branches, each in the right place', () => {
      addIfNode('Test Case');
      selectNode('If');
      setProp('condition', 'loggedIn');
      addChild('Then', 'visit');
      selectNode('Visit');
      setProp('url', '/dashboard');
      addChild('Else', 'click'); // a distinct command type from Then's, so selection stays unambiguous
      selectNode('Click');
      setProp('selector', '#login-link');

      openCodeDrawer();
      const expected = `describe('Suite', () => {
  it('a test', () => {
    if (loggedIn) {
      cy.visit('/dashboard');
    } else {
      cy.get('#login-link').click();
    }
  });
});`;
      cy.get('[data-testid=output-code]').should(($el) => {
        expect($el.text().trim()).to.eq(expected);
      });
    });

    it('if containing a block (Within) in its Then branch', () => {
      addIfNode('Test Case');
      selectNode('If');
      setProp('condition', 'ready');
      addChild('Then', 'within');
      selectNode('Within');
      setProp('selector', '.modal');
      addChild('Within', 'log');
      selectNode('Log');
      setProp('message', 'shown');

      openCodeDrawer();
      const expected = `describe('Suite', () => {
  it('a test', () => {
    if (ready) {
      cy.get('.modal').within(() => {
        cy.log('shown');
      });
    }
  });
});`;
      cy.get('[data-testid=output-code]').should(($el) => {
        expect($el.text().trim()).to.eq(expected);
      });
    });
  });

  context('forEach — iteration via the existing block/callback composition', () => {
    it('appears in the palette under Control Flow', () => {
      cy.get('[data-testid=palette-item-forEach]').should('exist');
    });

    it('shows the resolved callback signature on the row as bindings are filled in', () => {
      addChild('Test Case', 'forEach');
      selectNode('For Each');
      setProp('source', 'items');

      cy.contains('[data-testid=tree-node]', 'For Each')
        .find('[data-testid=tree-node-params]')
        .should('not.exist');

      setProp('itemAs', 'item');
      cy.contains('[data-testid=tree-node]', 'For Each')
        .find('[data-testid=tree-node-params]')
        .should('have.text', '(item)');

      setProp('indexAs', 'i');
      cy.contains('[data-testid=tree-node]', 'For Each')
        .find('[data-testid=tree-node-params]')
        .should('have.text', '(item, i)');
    });

    it('flags an empty forEach body as unresolved, the same generic empty-block rule as within/each', () => {
      addChild('Test Case', 'forEach');
      selectNode('For Each');
      setProp('source', 'items');
      setProp('itemAs', 'item');
      cy.contains('[data-testid=tree-node]', 'For Each').should('have.attr', 'data-unresolved', 'true');
    });

    it('generates the exact iteration statement with a nested command using the bound item', () => {
      addChild('Test Case', 'forEach');
      selectNode('For Each');
      setProp('source', 'items');
      setProp('itemAs', 'item');
      addChild('For Each', 'log');
      selectNode('Log');
      setProp('message', 'x');

      openCodeDrawer();
      const expected = `describe('Suite', () => {
  it('a test', () => {
    items.forEach((item) => {
      cy.log('x');
    });
  });
});`;
      cy.get('[data-testid=output-code]').should(($el) => {
        expect($el.text().trim()).to.eq(expected);
      });
    });
  });

  context('customCommand — one generic registry entry for any project-defined command', () => {
    it('appears in the palette under Custom Command', () => {
      cy.get('[data-testid=palette-item-customCommand]').should('exist');
    });

    it('generates cy.<method>() from the method-name field', () => {
      addChild('Test Case', 'customCommand');
      selectNode('Custom Command');
      setProp('commandName', 'login');

      openCodeDrawer();
      cy.get('[data-testid=output-code]').should('contain.text', 'cy.login();');
    });

    it('accepts raw-JS arguments', () => {
      addChild('Test Case', 'customCommand');
      selectNode('Custom Command');
      setProp('commandName', 'login');
      setProp('args', "'admin', 'secret'");

      openCodeDrawer();
      cy.get('[data-testid=output-code]').should('contain.text', "cy.login('admin', 'secret');");
    });

    it('flags an invalid method name as unresolved (generator safety)', () => {
      addChild('Test Case', 'customCommand');
      selectNode('Custom Command');
      setProp('commandName', 'not a valid name');
      cy.contains('[data-testid=tree-node]', 'Custom Command').should('have.attr', 'data-unresolved', 'true');
    });

    it('chains onto a preceding subject inside a Chain node', () => {
      addChild('Test Case', 'chain');
      addChild('Chain', 'get');
      selectNode('Get');
      setProp('selector', '.row');
      addChild('Chain', 'customCommand');
      selectNode('Custom Command');
      setProp('commandName', 'selectOption');

      openCodeDrawer();
      cy.get('[data-testid=output-code]').should('contain.text', "cy.get('.row').selectOption();");
    });
  });
});
