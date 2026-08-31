/**
 * Application header / toolbar (Phase 2 UI).
 *
 * Single responsibility: the app title and the code-drawer toggle. The drawer's
 * open/closed state lives in Redux (`state.isCodeDrawerOpen`) alongside the app's
 * other UI state (`selectedNodeId`), not as component-local state, so any part of
 * the app can react to it consistently.
 */

import { useAppDispatch, useAppSelector } from './hooks';
import { setCodeDrawerOpen } from '../state/builderSlice';

export function Header() {
  const dispatch = useAppDispatch();
  const isOpen = useAppSelector((state) => state.isCodeDrawerOpen);

  return (
    <header className="app-header">
      <span className="app-header__title">Visual Test Builder</span>
      <button
        type="button"
        className={`app-header__code-toggle${isOpen ? ' is-active' : ''}`}
        data-testid="code-toggle"
        aria-pressed={isOpen}
        aria-label={isOpen ? 'Close generated code drawer' : 'Open generated code drawer'}
        onClick={() => dispatch(setCodeDrawerOpen(!isOpen))}
      >
        <span aria-hidden="true">{'</>'}</span> Code
      </button>
    </header>
  );
}
