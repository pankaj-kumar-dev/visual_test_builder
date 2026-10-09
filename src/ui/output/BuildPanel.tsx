/**
 * "Build Test" compile-ready panel (Phase 9, builder UX roadmap).
 *
 * The header's primary action: validate → generate the compile-ready spec +
 * commands pair (`engine/buildSpec.ts`) → syntax-check it
 * (`engine/compileCheck.ts`) → show one clear result, with dependencies and
 * downloadable files. Reuses the code drawer's layout (`.code-drawer` grid
 * sizing, slide-in, responsive breakpoints) the same way `ValidationPanel`
 * already does — this is the third panel in that family, not a new layout.
 *
 * Validation (structural/semantic) and the syntax compile-check are
 * deliberately shown as two independent results, not gated behind each
 * other: a required field left empty leaves its `{{key}}` placeholder
 * *inside a quoted string* (`engine/processFlow.ts`), which is syntactically
 * valid JS even though the flow isn't finished — so a flow can be
 * "syntax-clean" while still unresolved, and vice versa (invalid raw JS in
 * an `expression`-type field is a syntax problem with no required-field
 * story at all). Both are worth knowing, neither implies the other.
 */

import { useAppDispatch, useBuildResult, useSemanticIssues, useUnresolvedNodes } from '../../app/hooks';
import { revealNode, setBuildPanelOpen, setValidationPanelOpen } from '../../state/builderSlice';
import type { BuiltSpec } from '../../engine/buildSpec';

/**
 * The real, drop-in `support/commands.ts`: the ambient-type augmentation
 * ahead of the runtime registrations, with a trailing `export {}` — without
 * it the file is a global script, not a module, and `declare global` is
 * rejected by a real `tsc` run (see `engine/processFlow.ts`'s
 * `generateReusableFlowCommandType` and this project's own
 * `cypress/support/commands.ts`, which needs the same trailing `export {}`
 * for the same reason).
 */
function commandsFileContent(built: BuiltSpec): string {
  return `${built.commandTypesCode}\n\n${built.commandsCode}\n\nexport {};`;
}

function download(fileName: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export function BuildPanel() {
  const dispatch = useAppDispatch();
  const result = useBuildResult();
  const unresolved = useUnresolvedNodes();
  const semanticIssues = useSemanticIssues();

  const errorCount =
    unresolved.filter((node) => node.severity === 'error').length +
    semanticIssues.filter((issue) => issue.severity === 'error').length;
  const warningCount =
    unresolved.filter((node) => node.severity === 'warning').length +
    semanticIssues.filter((issue) => issue.severity === 'warning').length;

  function handleClose() {
    dispatch(setBuildPanelOpen(false));
  }

  function handleOpenValidation() {
    dispatch(setBuildPanelOpen(false));
    dispatch(setValidationPanelOpen(true));
  }

  function handleDiagnosticClick(nodeId: string | null) {
    if (nodeId) dispatch(revealNode(nodeId));
  }

  return (
    <aside className="code-drawer build-panel" data-testid="build-panel" role="dialog" aria-label="Build Test">
      <div className="code-drawer__header">
        <h2 className="code-drawer__title">Build Test</h2>
        <button type="button" className="code-drawer__close" data-testid="build-panel-close" onClick={handleClose} aria-label="Close build panel">
          ×
        </button>
      </div>

      <div className="code-drawer__body build-panel__body">
        {!result ? (
          <p className="build-panel__empty" data-testid="build-panel-empty">
            Add a step to the canvas to build a test.
          </p>
        ) : (
          <>
            <section className="build-panel__status-row">
              <button
                type="button"
                className={`build-panel__status build-panel__status--validation${errorCount > 0 ? ' is-error' : warningCount > 0 ? ' is-warning' : ' is-ok'}`}
                data-testid="build-panel-validation-status"
                onClick={handleOpenValidation}
              >
                {errorCount > 0
                  ? `✕ ${errorCount} validation ${errorCount === 1 ? 'error' : 'errors'}`
                  : warningCount > 0
                    ? `⚠ ${warningCount} ${warningCount === 1 ? 'warning' : 'warnings'}`
                    : '✓ Flow valid'}
              </button>

              <span
                className={`build-panel__status build-panel__status--compile${result.check.ok ? ' is-ok' : ' is-error'}`}
                data-testid="build-panel-compile-status"
              >
                {result.check.ok
                  ? '✓ Compile-ready (syntax)'
                  : `✕ ${result.check.diagnostics.length} syntax ${result.check.diagnostics.length === 1 ? 'error' : 'errors'}`}
              </span>
            </section>

            {!result.check.ok && (
              <section className="build-panel__section" data-testid="build-panel-diagnostics">
                <h3 className="build-panel__section-title">Syntax errors</h3>
                <ul className="build-panel__diagnostic-list">
                  {result.check.diagnostics.map((diagnostic, index) => (
                    <li key={index}>
                      <button
                        type="button"
                        className="build-panel__diagnostic"
                        disabled={!diagnostic.nodeId}
                        onClick={() => handleDiagnosticClick(diagnostic.nodeId)}
                      >
                        <span className="build-panel__diagnostic-line">Line {diagnostic.line}</span>
                        <span className="build-panel__diagnostic-message">{diagnostic.message}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="build-panel__section" data-testid="build-panel-dependencies">
              <h3 className="build-panel__section-title">Dependencies</h3>
              {result.built.usedFlowIds.length === 0 && result.built.fixturePaths.length === 0 ? (
                <p className="build-panel__empty-note">None — this test has no external dependencies.</p>
              ) : (
                <ul className="build-panel__dependency-list">
                  {result.built.usedFlowIds.map((id) => (
                    <li key={`flow-${id}`}>
                      <span className="build-panel__dependency-kind">Custom command</span> cy.{id}()
                    </li>
                  ))}
                  {result.built.fixturePaths.map((path) => (
                    <li key={`fixture-${path}`}>
                      <span className="build-panel__dependency-kind">Fixture</span> cypress/fixtures/{path}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="build-panel__section">
              <div className="build-panel__file-header">
                <h3 className="build-panel__section-title">{result.built.fileName}</h3>
                <button type="button" className="build-panel__file-action" onClick={() => download(result.built.fileName, result.check.cleanCode)}>
                  Download
                </button>
              </div>
              <pre className="code-drawer__code build-panel__code" data-testid="build-panel-spec">
                <code>{result.check.cleanCode}</code>
              </pre>
            </section>

            {result.built.commandsCode && (
              <section className="build-panel__section">
                <div className="build-panel__file-header">
                  <h3 className="build-panel__section-title">support/commands.ts</h3>
                  <button
                    type="button"
                    className="build-panel__file-action"
                    onClick={() => download('commands.ts', commandsFileContent(result.built))}
                  >
                    Download
                  </button>
                </div>
                <pre className="code-drawer__code build-panel__code" data-testid="build-panel-commands">
                  <code>{commandsFileContent(result.built)}</code>
                </pre>
              </section>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
