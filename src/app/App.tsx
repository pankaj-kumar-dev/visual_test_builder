import { useState } from 'react';
import { useAppSelector } from './hooks';
import { Header } from './Header';
import { Canvas } from '../ui/canvas/Canvas';
import { Palette } from '../ui/palette/Palette';
import { CodeDrawer } from '../ui/output/CodeDrawer';
import { PropertyEditor } from '../ui/properties/PropertyEditor';
import { ValidationPanel } from '../ui/validation/ValidationPanel';
import { LandingPage } from './LandingPage';

export function App() {
  const [showLanding, setShowLanding] = useState(true);
  const isCodeDrawerOpen = useAppSelector((state) => state.isCodeDrawerOpen);
  const isValidationPanelOpen = useAppSelector((state) => state.isValidationPanelOpen);
  const isSidePanelOpen = isCodeDrawerOpen || isValidationPanelOpen;

  if (showLanding) return <LandingPage onOpenBuilder={() => setShowLanding(false)} />;

  return (
    <div className="app">
      <Header />
      <div className={`app__workspace${isSidePanelOpen ? ' app__workspace--drawer-open' : ''}`}>
        <aside className="app__panel app__left" aria-label="Node palette">
          <div className="workspace-panel__header">
            <div>
              <span className="workspace-panel__eyebrow">BUILD</span>
              <h2 className="workspace-panel__title">Add step</h2>
            </div>
            <span className="workspace-panel__hint">Drag</span>
          </div>
          <div className="workspace-panel__body">
            <Palette />
          </div>
        </aside>

        <main className="app__panel app__canvas" aria-label="Flow canvas">
          <div className="workspace-panel__header workspace-panel__header--canvas">
            <div>
              <span className="workspace-panel__eyebrow">FLOW</span>
              <h2 className="workspace-panel__title">Test scenario</h2>
            </div>
            <span className="workspace-panel__hint">Visual editor</span>
          </div>
          <div className="workspace-panel__body workspace-panel__body--canvas">
            <Canvas />
          </div>
        </main>

        <aside className="app__panel app__right" aria-label="Property editor">
          <div className="workspace-panel__header">
            <div>
              <span className="workspace-panel__eyebrow">INSPECT</span>
              <h2 className="workspace-panel__title">Properties</h2>
            </div>
            <span className="workspace-panel__hint">Selected step</span>
          </div>
          <div className="workspace-panel__body">
            <PropertyEditor />
          </div>
        </aside>

        {isCodeDrawerOpen && <CodeDrawer />}
        {isValidationPanelOpen && <ValidationPanel />}
      </div>
    </div>
  );
}
