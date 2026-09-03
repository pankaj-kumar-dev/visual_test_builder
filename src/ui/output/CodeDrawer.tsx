/**
 * Code drawer / DevTools-style right panel (Phase 2 UI).
 *
 * Successor to the old permanently visible bottom output panel — same underlying
 * data (generatedCode is still a pure derivation of Flow JSON; there is exactly one
 * code-generation mechanism, `processFlow`, unchanged by this component). Opening
 * and closing is pure UI state (`state.isCodeDrawerOpen`), independent of the Flow
 * JSON.
 *
 * Layout is a fixed header + a single scrollable body containing two independently
 * readable sections (code, then unresolved properties), per the "don't let a long
 * generated test push the warning off-screen" requirement — the code region gets
 * `overflow: auto` and a bounded `flex` size rather than `flex: 1` monopolizing the
 * body, so the warning section always stays reachable by scrolling the body.
 */

import { useEffect, useRef, useState } from 'react';
import { useAppDispatch, useAppSelector, useSemanticIssues, useUnresolvedNodes } from '../../app/hooks';
import { revealNode, setCodeDrawerOpen } from '../../state/builderSlice';

export function CodeDrawer() {
  const dispatch = useAppDispatch();
  const code = useAppSelector((state) => state.generatedCode);
  const unresolved = useUnresolvedNodes();
  const semanticIssues = useSemanticIssues();
  const [copied, setCopied] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const hasCode = code.length > 0;

  // Focus the close button on open (basic, non-trapping keyboard support — this
  // panel is part of the page layout, not a modal, so a focus trap would be
  // overkill) and let Escape close it from anywhere in the drawer.
  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        dispatch(setCodeDrawerOpen(false));
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [dispatch]);

  async function handleCopy() {
    if (!hasCode || !navigator.clipboard) return;
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  function handleClose() {
    dispatch(setCodeDrawerOpen(false));
  }

  // Clicking an unresolved-property entry reveals that node: REVEAL_NODE selects it
  // *and* expands every collapsed ancestor hiding it, so the user is never sent to a
  // node they cannot see (§31). Ancestors are read from the Flow JSON inside the
  // reducer — there is no duplicate "where is this node" logic here — and the row
  // scrolls itself into view once it renders as the selected node (TreeNode).
  function handleUnresolvedClick(nodeId: string) {
    dispatch(revealNode(nodeId));
  }

  // Same reveal behavior for a semantic-issue entry — one "jump to this node"
  // mechanism (REVEAL_NODE), shared by both the structural and semantic lists.
  function handleSemanticIssueClick(nodeId: string) {
    dispatch(revealNode(nodeId));
  }

  return (
    <aside
      className="code-drawer"
      data-testid="code-drawer"
      role="dialog"
      aria-label="Generated Cypress Code"
    >
      <div className="code-drawer__header">
        <h2 className="code-drawer__title">Generated Cypress Code</h2>
        <div className="code-drawer__header-actions">
          <button
            type="button"
            className="code-drawer__copy"
            data-testid="copy-button"
            onClick={handleCopy}
            disabled={!hasCode}
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button
            type="button"
            className="code-drawer__close"
            data-testid="code-drawer-close"
            onClick={handleClose}
            aria-label="Close code drawer"
            ref={closeButtonRef}
          >
            ×
          </button>
        </div>
      </div>

      <div className="code-drawer__body">
        <pre className="code-drawer__code" data-testid="output-code">
          <code>{hasCode ? code : '// Generated code will appear here.'}</code>
        </pre>

        {unresolved.length > 0 && (
          <div
            className="code-drawer__warning"
            role="alert"
            data-testid="unresolved-warning"
          >
            <strong>Unresolved properties:</strong>
            <ul>
              {unresolved.map((node) => (
                <li key={node.id}>
                  <button
                    type="button"
                    className="code-drawer__warning-item"
                    onClick={() => handleUnresolvedClick(node.id)}
                  >
                    {node.label}: {node.missing.join(', ')}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {semanticIssues.length > 0 && (
          // Phase 3: a genuinely separate section from "Unresolved properties"
          // above — a shape problem (required field empty) and a meaning
          // problem (reference resolves to nothing) are different questions,
          // per engine/references.ts's structural-vs-semantic distinction.
          <div
            className="code-drawer__warning code-drawer__warning--semantic"
            role="alert"
            data-testid="semantic-warning"
          >
            <strong>Reference issues:</strong>
            <ul>
              {semanticIssues.map((issue, index) => (
                <li key={`${issue.id}-${issue.kind}-${index}`}>
                  <button
                    type="button"
                    className="code-drawer__warning-item"
                    onClick={() => handleSemanticIssueClick(issue.id)}
                  >
                    {issue.label}: {issue.message}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </aside>
  );
}
