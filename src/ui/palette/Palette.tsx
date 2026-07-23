/**
 * Node palette / Left Panel (HLD §6.3, §7).
 *
 * Single responsibility: read the registry and render draggable node chips grouped
 * by category (Structural, Commands). It never reads the store or dispatches.
 * New config entries appear here automatically (HLD §6.3).
 */

import { getRegistry } from '../../registry';
import { PaletteItem } from './PaletteItem';

export function Palette() {
  const registry = getRegistry();
  const structural = registry.getAllBlocks();
  const commands = registry.getAllFunctions();

  return (
    <div className="palette" data-testid="palette">
      <section className="palette__group">
        <h2 className="palette__title">Structural</h2>
        {structural.map((def) => (
          <PaletteItem key={def.type} type={def.type} label={def.label} />
        ))}
      </section>

      <section className="palette__group">
        <h2 className="palette__title">Commands</h2>
        {commands.map((def) => (
          <PaletteItem key={def.type} type={def.type} label={def.label} />
        ))}
      </section>
    </div>
  );
}
