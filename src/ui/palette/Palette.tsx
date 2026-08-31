/**
 * Node palette / Left Panel (HLD §6.3, §7; Scalable Builder UI, Objectives 1 & 2).
 *
 * Single responsibility: render the registry-backed node hierarchy and a search box
 * over it. The taxonomy, its order, and the matching rules all live in
 * `paletteModel.ts` + configuration — this component knows only how to draw a
 * category, a subgroup, and a chip, so hundreds of future commands need no change
 * here (§34).
 *
 * Search query and which categories are open are purely local presentation state
 * (§13): nothing outside this panel needs to read them, and neither belongs in the
 * Flow JSON. Both category listing and search results render the *same*
 * `PaletteItem`, so a filtered result carries identical drag metadata and goes
 * through the existing drop validation — there is no second insertion path (§32).
 */

import { useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { getRegistry } from '../../registry';
import { PaletteItem } from './PaletteItem';
import {
  buildPaletteTree,
  searchPaletteTree,
  type PaletteCategory,
  type PaletteNode,
} from './paletteModel';

export function Palette() {
  const registry = getRegistry();
  // The registry is built once at startup and never mutates, so the tree is built
  // once per mount rather than on every keystroke.
  const categories = useMemo(() => buildPaletteTree(registry), [registry]);

  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  // Collapsed (not expanded) categories, keyed by id: every category starts open,
  // and only the ones the user closes are tracked.
  const [collapsed, setCollapsed] = useState<Record<string, true>>({});

  const trimmed = query.trim();
  const isSearching = trimmed.length > 0;
  const matches = useMemo(
    () => (isSearching ? searchPaletteTree(categories, trimmed) : []),
    [categories, trimmed, isSearching],
  );

  function toggleCategory(id: string) {
    setCollapsed((current) => {
      const next = { ...current };
      if (next[id]) delete next[id];
      else next[id] = true;
      return next;
    });
  }

  function clearSearch() {
    setQuery('');
    searchRef.current?.focus();
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Escape') return;
    // Escape clears the search box. stopPropagation keeps it from also reaching the
    // code drawer's document-level Escape handler, so clearing a search never
    // closes the drawer as a side effect (§27).
    event.stopPropagation();
    if (query !== '') {
      event.preventDefault();
      setQuery('');
    }
  }

  return (
    <div className="palette" data-testid="palette">
      <div className="palette__search">
        <label className="palette__search-label" htmlFor="palette-search">
          Search nodes
        </label>
        <div className="palette__search-row">
          <input
            id="palette-search"
            ref={searchRef}
            type="search"
            className="palette__search-input"
            data-testid="palette-search"
            placeholder="Search nodes…"
            value={query}
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleSearchKeyDown}
          />
          {isSearching && (
            <button
              type="button"
              className="palette__search-clear"
              data-testid="palette-search-clear"
              aria-label="Clear node search"
              onClick={clearSearch}
            >
              ×
            </button>
          )}
        </div>
      </div>

      {isSearching ? (
        <section className="palette__group" data-testid="palette-results">
          <h2 className="palette__title">
            Search Results
            <span className="palette__count">{matches.length}</span>
          </h2>
          {matches.length === 0 ? (
            <p className="palette__empty" data-testid="palette-empty">
              No nodes match “{trimmed}”.
            </p>
          ) : (
            matches.map(({ node, breadcrumb }) => (
              <div className="palette__result" key={node.type}>
                <span className="palette__breadcrumb" data-testid="palette-breadcrumb">
                  {breadcrumb}
                </span>
                <PaletteItem node={node} />
              </div>
            ))
          )}
        </section>
      ) : (
        categories.map((category) => (
          <CategorySection
            key={category.id}
            category={category}
            isCollapsed={!!collapsed[category.id]}
            onToggle={() => toggleCategory(category.id)}
          />
        ))
      )}
    </div>
  );
}

interface CategorySectionProps {
  category: PaletteCategory;
  isCollapsed: boolean;
  onToggle: () => void;
}

/** One top-level category: a disclosure header, direct items, then its subgroups. */
function CategorySection({ category, isCollapsed, onToggle }: CategorySectionProps) {
  const bodyId = `palette-category-${category.id}`;
  return (
    <section className="palette__group" data-testid={`palette-category-${category.id}`}>
      <h2 className="palette__title">
        <button
          type="button"
          className="palette__category-toggle"
          data-testid={`palette-category-toggle-${category.id}`}
          aria-expanded={!isCollapsed}
          aria-controls={bodyId}
          title={category.description}
          onClick={onToggle}
        >
          <span className="palette__chevron" aria-hidden="true">
            {isCollapsed ? '▶' : '▼'}
          </span>
          {category.label}
          <span className="palette__count">{category.total}</span>
        </button>
      </h2>

      <div id={bodyId} data-testid={`palette-category-body-${category.id}`} hidden={isCollapsed}>
        {category.items.map((node) => (
          <PaletteItem key={node.type} node={node} />
        ))}
        {category.subgroups.map((subgroup) => (
          <div className="palette__subgroup" key={subgroup.id}>
            <h3 className="palette__subtitle">{subgroup.label}</h3>
            {subgroup.items.map((node: PaletteNode) => (
              <PaletteItem key={node.type} node={node} />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
