/**
 * Empty-canvas quick-start (Phase 8, builder UX roadmap — test templates +
 * the spirit of "intent mode"). Replaces the old bare "drag a structural
 * node here" message with a guided starting point: a handful of complete,
 * pre-built starter flows (`config/testTemplates.json`), or a one-click
 * blank describe/it skeleton for anyone who'd rather start from nothing.
 *
 * A deliberate scope decision over the original wishlist's separate
 * "intent-mode wizard" (a nested "what do you want to test?" / "what do you
 * want to do?" picker): the in-canvas quick-add popover
 * (`AddStepPopover.tsx`) already *is* that guided, curated entry point for
 * every step *after* the first — building a second, narrower wizard on top
 * would duplicate its job. This panel only needs to solve the one thing the
 * popover can't: getting from a completely empty canvas to a first node.
 *
 * Loading a template clones its flow with fresh ids (`state/flowTree.ts`'s
 * `cloneWithNewIds` + `builderSlice.ts`'s `generateId`) before dispatching
 * `LOAD_FLOW` — picking the same template twice must never produce two trees
 * sharing an id.
 */

import { useAppDispatch } from '../../app/hooks';
import type { FlowNode, TestTemplateDef } from '../../domain/types';
import { getTestTemplates } from '../../config/testTemplatesConfig';
import { generateId, loadFlow } from '../../state/builderSlice';
import { cloneWithNewIds } from '../../state/flowTree';

function blankSkeleton(): FlowNode {
  return {
    id: generateId(),
    type: 'describe',
    props: {},
    children: [{ id: generateId(), type: 'it', props: {} }],
  };
}

export function TemplatesPanel() {
  const dispatch = useAppDispatch();
  const templates = getTestTemplates();

  function handlePick(template: TestTemplateDef) {
    dispatch(loadFlow(cloneWithNewIds(template.flow, generateId)));
  }

  function handleBlank() {
    dispatch(loadFlow(blankSkeleton()));
  }

  return (
    <div className="templates-panel" data-testid="templates-panel">
      <p className="templates-panel__eyebrow">START A NEW TEST</p>
      <h2 className="templates-panel__title">Pick a starting point</h2>
      <p className="templates-panel__subtitle">
        Load a complete starter flow and adjust it, or start from a blank test case.
      </p>

      <div className="templates-panel__grid">
        {templates.map((template) => (
          <button
            type="button"
            key={template.id}
            className="templates-panel__card"
            data-testid={`template-${template.id}`}
            onClick={() => handlePick(template)}
          >
            <strong className="templates-panel__card-name">{template.name}</strong>
            <span className="templates-panel__card-description">{template.description}</span>
          </button>
        ))}
      </div>

      <button
        type="button"
        className="templates-panel__blank"
        data-testid="template-blank"
        onClick={handleBlank}
      >
        Start from a blank test case
      </button>
    </div>
  );
}
