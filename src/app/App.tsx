/**
 * Application shell (HLD §7, "UI Architecture").
 *
 * Establishes the four-region layout: left palette, center canvas, right property
 * editor, and bottom output panel. Each region's content is provided by its own
 * module; this component only composes them.
 */

import { Canvas } from '../ui/canvas/Canvas';
import { Palette } from '../ui/palette/Palette';
import { OutputPanel } from '../ui/output/OutputPanel';
import { PropertyEditor } from '../ui/properties/PropertyEditor';

export function App() {
  return (
    <div className="app">
      <aside className="app__panel app__left" aria-label="Node palette">
        <Palette />
      </aside>
      <main className="app__panel app__canvas" aria-label="Flow canvas">
        <Canvas />
      </main>
      <aside className="app__panel app__right" aria-label="Property editor">
        <PropertyEditor />
      </aside>
      <section className="app__panel app__bottom" aria-label="Generated code">
        <OutputPanel />
      </section>
    </div>
  );
}
