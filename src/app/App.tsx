/**
 * Application shell (HLD §7, "UI Architecture"; Phase 2 UI: DevTools-style layout).
 *
 * A header/toolbar on top, a three-region workspace (palette, canvas, property
 * editor) below it, and a right-side code drawer that opens/closes over the
 * workspace instead of a permanently visible bottom panel. Each region's content
 * is provided by its own module; this component only composes them and reads the
 * drawer's open state to decide whether to render it.
 */

import { useAppSelector } from './hooks';
import { Header } from './Header';
import { Canvas } from '../ui/canvas/Canvas';
import { Palette } from '../ui/palette/Palette';
import { CodeDrawer } from '../ui/output/CodeDrawer';
import { PropertyEditor } from '../ui/properties/PropertyEditor';

export function App() {
  const isCodeDrawerOpen = useAppSelector((state) => state.isCodeDrawerOpen);

  return (
    <div className="app">
      <Header />
      <div className={`app__workspace${isCodeDrawerOpen ? ' app__workspace--drawer-open' : ''}`}>
        <aside className="app__panel app__left" aria-label="Node palette">
          <Palette />
        </aside>
        <main className="app__panel app__canvas" aria-label="Flow canvas">
          <Canvas />
        </main>
        <aside className="app__panel app__right" aria-label="Property editor">
          <PropertyEditor />
        </aside>
        {isCodeDrawerOpen && <CodeDrawer />}
      </div>
    </div>
  );
}
