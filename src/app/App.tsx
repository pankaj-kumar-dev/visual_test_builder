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
        <aside className="app__panel app__left" aria-label="Node palette"><Palette /></aside>
        <main className="app__panel app__canvas" aria-label="Flow canvas"><Canvas /></main>
        <aside className="app__panel app__right" aria-label="Property editor"><PropertyEditor /></aside>
        {isCodeDrawerOpen && <CodeDrawer />}
        {isValidationPanelOpen && <ValidationPanel />}
      </div>
    </div>
  );
}
