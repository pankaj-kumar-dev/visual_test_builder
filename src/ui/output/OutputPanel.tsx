/**
 * Output panel / Bottom Panel (HLD §6.7, §7, §16).
 *
 * Reads the generated code from the store and displays it read-only, offers a copy
 * control, and shows an inline warning listing nodes with unresolved required
 * properties. Presentation only — the code and the warning are both derived from
 * the store's flow by pure functions.
 */

import { useState } from 'react';
import { useAppSelector } from '../../app/hooks';
import { findUnresolvedNodes } from '../../engine/unresolved';

export function OutputPanel() {
  const code = useAppSelector((state) => state.generatedCode);
  const flow = useAppSelector((state) => state.flow);
  const [copied, setCopied] = useState(false);

  const unresolved = findUnresolvedNodes(flow);
  const hasCode = code.length > 0;

  async function handleCopy() {
    if (!hasCode || !navigator.clipboard) return;
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="output">
      <div className="output__header">
        <h2 className="output__title">Generated Cypress Code</h2>
        <button
          type="button"
          className="output__copy"
          data-testid="copy-button"
          onClick={handleCopy}
          disabled={!hasCode}
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>

      {unresolved.length > 0 && (
        <div className="output__warning" role="alert" data-testid="unresolved-warning">
          <strong>Unresolved properties:</strong>
          <ul>
            {unresolved.map((node, index) => (
              <li key={`${node.type}-${index}`}>
                {node.label}: {node.missing.join(', ')}
              </li>
            ))}
          </ul>
        </div>
      )}

      <pre className="output__code" data-testid="output-code">
        <code>{hasCode ? code : '// Generated code will appear here.'}</code>
      </pre>
    </div>
  );
}
