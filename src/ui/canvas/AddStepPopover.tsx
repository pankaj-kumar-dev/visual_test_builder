/**
 * In-canvas "+ Add step" quick-add (Phase 7, builder UX roadmap).
 *
 * The single highest-value item in the original UX review: instead of always
 * reaching for the palette (drag → find a drop target → drop → select →
 * configure), a "+" at any insertion gap opens a small searchable list right
 * there, filtered to only the node types that are actually structurally valid
 * at *this exact position* (`dropRules.ts`'s `canDropInto`, the same rule
 * drag-and-drop already enforces — one validity rule, two entry points) and
 * topped with a curated "Recommended" section (`engine/suggestions.ts`).
 * Picking an item dispatches the same `ADD_NODE` action drag-and-drop uses,
 * with an explicit `index` so it lands at this precise gap — drag-and-drop
 * remains available for anyone who prefers it; this is a second, faster path
 * to the same insertion, not a replacement.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppDispatch } from '../../app/hooks';
import type { FlowNode } from '../../domain/types';
import { suggestedNextTypes } from '../../engine/suggestions';
import { getRegistry } from '../../registry';
import { addNode } from '../../state/builderSlice';
import { collectPaletteNodes, type PaletteNode } from '../palette/paletteModel';
import { canDropInto } from './dropRules';

interface AddStepPopoverProps {
  parent: FlowNode;
  /** Insertion gap: 0 = before the first child, children.length = after the last. */
  beforeIndex: number;
}

/** Every token in `query` must appear (case-insensitively) somewhere in the node's searchable text. */
function matches(node: PaletteNode, tokens: string[]): boolean {
  const haystack = [node.type, node.label, node.description ?? '', (node.keywords ?? []).join(' ')]
    .join(' ')
    .toLowerCase();
  return tokens.every((token) => haystack.includes(token));
}

export function AddStepPopover({ parent, beforeIndex }: AddStepPopoverProps) {
  const dispatch = useAppDispatch();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const registry = getRegistry();
  const existingChildren = parent.children ?? [];
  const childrenBefore = existingChildren.slice(0, beforeIndex);
  const previousType = childrenBefore.length > 0 ? childrenBefore[childrenBefore.length - 1].type : null;

  // Every node this flow's structural rules actually allow at this exact gap
  // — not just "allowed as a child of this parent type" but, for a
  // chain-composition parent, also valid *in this position* among the
  // siblings that would precede it (dropRules.ts's own chain-position check).
  const candidates = useMemo(
    () =>
      collectPaletteNodes(registry).filter((node) =>
        canDropInto(parent.type, node.type, registry, childrenBefore),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [registry, parent.type, beforeIndex, existingChildren.length],
  );

  const candidateByType = useMemo(() => new Map(candidates.map((n) => [n.type, n])), [candidates]);
  const suggestions = useMemo(
    () =>
      suggestedNextTypes(parent.type, previousType)
        .map((type) => candidateByType.get(type))
        .filter((node): node is PaletteNode => !!node),
    [candidateByType, parent.type, previousType],
  );

  const trimmed = query.trim();
  const tokens = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
  const visible = tokens.length > 0 ? candidates.filter((node) => matches(node, tokens)) : candidates;
  const suggestedTypes = new Set(suggestions.map((n) => n.type));
  // "All steps" excludes whatever's already shown in Recommended, so nothing
  // appears twice in the unfiltered view.
  const rest = tokens.length > 0 ? visible : visible.filter((node) => !suggestedTypes.has(node.type));

  useEffect(() => {
    if (!isOpen) return;
    searchRef.current?.focus();
    function onDocumentClick(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setIsOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocumentClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocumentClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  function handlePick(type: string) {
    dispatch(addNode({ parentId: parent.id, type, index: beforeIndex }));
    setIsOpen(false);
    setQuery('');
  }

  return (
    <div className="add-step" ref={wrapRef}>
      <button
        type="button"
        className="add-step__trigger"
        data-testid="add-step-trigger"
        aria-label="Add step here"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={(event) => {
          event.stopPropagation();
          setIsOpen((open) => !open);
        }}
      >
        +
      </button>

      {isOpen && (
        <div className="add-step__popover" role="menu" data-testid="add-step-popover">
          <input
            ref={searchRef}
            type="search"
            className="add-step__search"
            data-testid="add-step-search"
            placeholder="Search steps…"
            value={query}
            autoComplete="off"
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => setQuery(event.target.value)}
          />

          <div className="add-step__list">
            {suggestions.length > 0 && tokens.length === 0 && (
              <>
                <div className="add-step__section-label">Recommended</div>
                {suggestions.map((node) => (
                  <button
                    type="button"
                    role="menuitem"
                    key={`suggested-${node.type}`}
                    className="add-step__item add-step__item--suggested"
                    data-testid={`add-step-item-${node.type}`}
                    title={node.description}
                    onClick={() => handlePick(node.type)}
                  >
                    {node.label}
                  </button>
                ))}
                <div className="add-step__section-label">All steps</div>
              </>
            )}

            {rest.length === 0 ? (
              <p className="add-step__empty">No matching steps.</p>
            ) : (
              rest.map((node) => (
                <button
                  type="button"
                  role="menuitem"
                  key={node.type}
                  className="add-step__item"
                  data-testid={`add-step-item-${node.type}`}
                  title={node.description}
                  onClick={() => handlePick(node.type)}
                >
                  {node.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
