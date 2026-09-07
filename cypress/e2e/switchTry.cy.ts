/**
 * Smoke — Phase 5 completion: Switch/Case/Default (unbounded ordinary
 * composition + generic childCardinality validation) and Try/Recover
 * (generic multi-slot composition, reused from `if`'s pattern, compiling to
 * Cypress's own `cy.on('fail', ...)` recovery hook rather than plain JS
 * try/catch — see docs/HLD_Visual_Test_Builder.md §12E).
 *
 * Exact generated output at depth, multi-case ordering, and nested
 * constructs are covered by src/engine/switchCase.test.ts and
 * src/engine/tryRecover.test.ts; this spec only exercises what genuinely
 * needs a real browser — palette presence, drop validation, cardinality/
 * required-slot warnings appearing and clearing, and one end-to-end code
 * check per construct.
 */

import {
  addChild,
  addRoot,
  nodeIdByLabel,
  openCodeDrawer,
  selectNode,
  setProp,
} from '../support/flows';

function addSwitchNode(parentLabel: string): void {
  nodeIdByLabel(parentLabel).then((id) => {
    cy.dragDrop('[data-testid=palette-item-switch]', `[data-node-id="${id}"]`);
  });
  cy.contains('[data-testid=tree-node]', 'Switch').should('exist');
}

function addTryNode(parentLabel: string): void {
  nodeIdByLabel(parentLabel).then((id) => {
    cy.dragDrop('[data-testid=palette-item-try]', `[data-node-id="${id}"]`);
  });
  cy.contains('[data-testid=tree-node]', 'Recover').should('exist');
}

describe('Switch/Case/Default and Try/Recover (Phase 5 completion)', () => {
  beforeEach(() => {
    cy.visit('/');
    addRoot('describe');
    selectNode('Describe Block');
    setProp('label', 'Suite');
    addChild('Describe Block', 'it');
    selectNode('Test Case');
    setProp('label', 'a test');
  });

  context('Switch — unbounded ordinary composition + childCardinality validation', () => {
    it('appears in the palette under its own Switch/Control Flow sections', () => {
      cy.get('[data-testid=palette-item-switch]').should('exist');
      cy.get('[data-testid=palette-item-case]').should('exist');
      cy.get('[data-testid=palette-item-default]').should('exist');
    });

    it('a freshly created switch has no children and is flagged unresolved (missing expression AND zero cases)', () => {
      addSwitchNode('Test Case');
      cy.contains('[data-testid=tree-node]', 'Switch')
        .should('have.attr', 'data-unresolved', 'true')
        .find('[data-testid=tree-node-missing]')
        .should('contain.text', 'At least 1 Case is required');
    });

    it('rejects dropping an ordinary command directly onto Switch — only Case/Default are valid children', () => {
      addSwitchNode('Test Case');
      cy.get('[data-testid=tree-node]')
        .its('length')
        .then((before) => {
          nodeIdByLabel('Switch').then((id) => {
            cy.dragDrop('[data-testid=palette-item-click]', `[data-node-id="${id}"]`);
          });
          cy.get('[data-testid=tree-node]').should('have.length', before);
        });
    });

    it('adding one Case clears the cardinality warning specifically (expression still required separately)', () => {
      addSwitchNode('Test Case');
      addChild('Switch', 'case');
      // The cardinality violation is gone, but Switch is still unresolved for
      // its own unrelated required "expression" field — the two checks are
      // independent, same as the generic required-prop rule everywhere else.
      cy.contains('[data-testid=tree-node]', 'Switch')
        .find('[data-testid=tree-node-missing]')
        .should('not.contain.text', 'Case is required')
        .and('contain.text', 'Expression');

      selectNode('Switch');
      setProp('expression', 'role');
      cy.contains('[data-testid=tree-node]', 'Switch').should('not.have.attr', 'data-unresolved');
    });

    it('generates exact output for expression + one case + default, each with a nested command', () => {
      addSwitchNode('Test Case');
      selectNode('Switch');
      setProp('expression', 'role');
      addChild('Switch', 'case');
      selectNode('Switch Case');
      setProp('value', "'admin'");
      addChild('Switch Case', 'log');
      selectNode('Log');
      setProp('message', 'admin path');
      addChild('Switch', 'default');
      // A different command type than the Case's own body (log), so the
      // two rows stay unambiguous to `selectNode` by label alone — the
      // same rule controlFlow.cy.ts's If/Else test already follows.
      addChild('Default', 'pause');

      openCodeDrawer();
      const expected = `describe('Suite', () => {
  it('a test', () => {
    switch (role) {
      case 'admin':
        cy.log('admin path');
        break;
      default:
        cy.pause();
        break;
    }
  });
});`;
      cy.get('[data-testid=output-code]').should(($el) => {
        expect($el.text().trim()).to.eq(expected);
      });
    });
  });

  context('Try / Recover — generic multi-slot composition, reused from If', () => {
    it('appears in the palette under Control Flow', () => {
      cy.get('[data-testid=palette-item-try]').should('exist');
    });

    it('is created with three auto-seeded slot rows, labeled Try, Catch and Finally', () => {
      addTryNode('Test Case');
      cy.get('[data-testid=tree-node]').should('have.length', 6); // describe, it, try, try-slot, catch-slot, finally-slot
      cy.contains('[data-testid=tree-node]', 'Try').should('exist');
      cy.contains('[data-testid=tree-node]', 'Catch').should('exist');
      cy.contains('[data-testid=tree-node]', 'Finally').should('exist');
    });

    it('rejects a direct drop onto the Try row itself — only its slots accept children', () => {
      addTryNode('Test Case');
      cy.get('[data-testid=tree-node]')
        .its('length')
        .then((before) => {
          nodeIdByLabel('Recover').then((id) => {
            cy.dragDrop('[data-testid=palette-item-click]', `[data-node-id="${id}"]`);
          });
          cy.get('[data-testid=tree-node]').should('have.length', before);
        });
    });

    it('flags both Try and Catch as empty (Finally stays optional and does not appear in the warning)', () => {
      addTryNode('Test Case');
      cy.contains('[data-testid=tree-node]', 'Recover')
        .should('have.attr', 'data-unresolved', 'true')
        .find('[data-testid=tree-node-missing]')
        .should('contain.text', '"try" is empty')
        .should('contain.text', '"catch" is empty')
        .should('not.contain.text', 'finally');
    });

    it('resolves once Try and Catch both have content, even with Finally left empty', () => {
      addTryNode('Test Case');
      addChild('Try', 'click');
      selectNode('Click');
      setProp('selector', '.risky');
      addChild('Catch', 'log');
      selectNode('Log');
      setProp('message', 'recovered');

      cy.contains('[data-testid=tree-node]', 'Recover').should('not.have.attr', 'data-unresolved');
    });

    it('generates the exact cy.on(\'fail\', ...) recovery pattern, with Finally running unconditionally after', () => {
      addTryNode('Test Case');
      addChild('Try', 'click');
      selectNode('Click');
      setProp('selector', '.risky');
      addChild('Catch', 'log');
      selectNode('Log');
      setProp('message', 'recovered');
      // A different command type than Catch's own body (log), so the two
      // rows stay unambiguous to `selectNode` by label alone.
      addChild('Finally', 'pause');

      openCodeDrawer();
      const expected = `describe('Suite', () => {
  it('a test', () => {
    cy.on('fail', (err) => {
      cy.log('recovered');
      return false;
    });
    {
      cy.get('.risky').click();
    }
    {
      cy.pause();
    }
  });
});`;
      cy.get('[data-testid=output-code]').should(($el) => {
        expect($el.text().trim()).to.eq(expected);
      });
    });
  });
});
