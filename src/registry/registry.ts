/**
 * Configuration Registry (HLD §6.2, §9).
 *
 * Loads the static configuration into in-memory lookups and exposes the only
 * interface through which the rest of the app resolves node/prop configuration.
 * No component reads the config files directly after startup (HLD §9).
 *
 * This module is pure: no React, no Redux, no side effects.
 */

import type {
  CategoryDef,
  CommandNodeDef,
  PropDef,
  StructuralNodeDef,
} from '../domain/types';
import { deriveStandaloneTemplate } from '../engine/chain';

/** Registry lookup interface (HLD §9, "Registry Interface"). */
export interface Registry {
  /** Structural node definition, or null if not found. */
  getBlock(type: string): StructuralNodeDef | null;
  /** Command node definition, or null if not found. */
  getFunction(type: string): CommandNodeDef | null;
  /** Property schema for a command node; empty array if none/unknown. */
  getProps(type: string): PropDef[];
  /** All structural definitions, in configuration order. */
  getAllBlocks(): StructuralNodeDef[];
  /** All command definitions, in configuration order. */
  getAllFunctions(): CommandNodeDef[];
  /**
   * The palette taxonomy, in configuration order (categories.json). The order of
   * this array *is* the palette's category order — configuration decides it, not
   * the Palette component, so adding or reordering a category is a config change.
   */
  getCategories(): CategoryDef[];
  /**
   * Whether a node of `childType` may sit inside `parent.allowedChildren` (Phase 1,
   * "configuration scaling"). An entry is either a literal type (`"chain"`) or a
   * `@group` wildcard (`"@action"`) matching any definition — structural or
   * command — whose `group` equals it. A parent may mix both forms freely. This
   * is the one place that interprets `allowedChildren` membership; UI drop rules
   * and the chain engine both call it instead of re-reading the raw array.
   */
  allowsChildType(parent: StructuralNodeDef, childType: string): boolean;
}

/** Raw configuration inputs used to build a Registry. */
export interface RegistrySources {
  blocks: StructuralNodeDef[];
  functions: CommandNodeDef[];
  /** Command property schemas keyed by command type (function-props.json). */
  commandProps: Record<string, PropDef[]>;
  /**
   * Palette taxonomy (categories.json). Optional: a source set without it still
   * builds a valid registry, and nodes then fall back to an ungrouped listing —
   * so pre-taxonomy configuration keeps working (§33).
   */
  categories?: CategoryDef[];
}

/**
 * Thrown when configuration cannot be turned into a valid registry (HLD §16,
 * "Registry Load Failure"). `file` names the offending configuration source so
 * the startup layer can surface a specific error.
 */
export class RegistryLoadError extends Error {
  constructor(
    message: string,
    readonly file: string,
  ) {
    super(message);
    this.name = 'RegistryLoadError';
  }
}

function indexByType<T extends { type: string }>(
  defs: T[],
  file: string,
): Map<string, T> {
  const map = new Map<string, T>();
  for (const def of defs) {
    if (map.has(def.type)) {
      throw new RegistryLoadError(
        `Duplicate node type "${def.type}" in ${file}.`,
        file,
      );
    }
    map.set(def.type, def);
  }
  return map;
}

/**
 * Whether a definition's codeTemplate is derivable from its chainTemplate
 * (Phase 1, "template duplication"): a `chainRole: 'subject'` node with a
 * `chainTemplate`. True for a subject-role command *and* a subject-role Phase 2
 * block node (`within`, `then`, `each`) alike — both use the same self-anchoring
 * `cy.get('{{selector}}')` + chainTemplate rule.
 */
function isChainDerivable(def: { chainRole?: 'root' | 'subject'; chainTemplate?: string }): boolean {
  return def.chainRole === 'subject' && !!def.chainTemplate;
}

function validateSources(sources: RegistrySources): void {
  for (const block of sources.blocks) {
    // A chain-composition node (Phase 2) builds its output entirely in
    // engine/processFlow.ts's chain generator, not via codeTemplate substitution,
    // so it is the one structural node exempt from requiring one outright. A
    // block node (Phase 2) is exempt too when derivable, same rule as commands.
    // A reuse-composition node (Phase 5) is exempt the same way `chain` is: its
    // output is a generation-time expansion (engine/reusableFlows.ts), not
    // template substitution.
    const templateRequired =
      block.childComposition !== 'chain' && block.childComposition !== 'reuse' && !isChainDerivable(block);
    if (!block.type || (templateRequired && !block.codeTemplate)) {
      throw new RegistryLoadError(
        `Structural node is missing "type" or "codeTemplate".`,
        'building-blocks.json',
      );
    }
    if (!Array.isArray(block.allowedChildren)) {
      throw new RegistryLoadError(
        `Structural node "${block.type}" is missing "allowedChildren".`,
        'building-blocks.json',
      );
    }
    if (block.slots !== undefined && (!Array.isArray(block.slots) || block.slots.length === 0)) {
      throw new RegistryLoadError(
        `Structural node "${block.type}" has an invalid "slots" array.`,
        'building-blocks.json',
      );
    }
  }
  for (const fn of sources.functions) {
    // codeTemplate may be omitted only when it is derivable (see isChainDerivable).
    if (!fn.type || (!fn.codeTemplate && !isChainDerivable(fn))) {
      throw new RegistryLoadError(
        `Command node is missing "type" or "codeTemplate".`,
        'functions.json',
      );
    }
  }
  const seenCategories = new Set<string>();
  for (const category of sources.categories ?? []) {
    if (!category.id || !category.label) {
      throw new RegistryLoadError(
        `Palette category is missing "id" or "label".`,
        'categories.json',
      );
    }
    if (seenCategories.has(category.id)) {
      throw new RegistryLoadError(
        `Duplicate palette category "${category.id}".`,
        'categories.json',
      );
    }
    seenCategories.add(category.id);
  }
}

/**
 * Build a Registry from raw configuration sources. Pure factory — call once at
 * startup with the bundled config, or with fixtures in tests. Throws
 * RegistryLoadError if the configuration is structurally invalid (HLD §16).
 */
export function createRegistry(sources: RegistrySources): Registry {
  validateSources(sources);

  // Fill in any omitted codeTemplate (Phase 1/2, "template duplication") before
  // indexing, so every downstream consumer (generator, tests, UI) sees a
  // complete definition and never has to know the field was derived. Checked
  // against `undefined` specifically (not truthiness) so a node that legitimately
  // declares `codeTemplate: ""` — the `chain` composition node — is left alone
  // rather than mistaken for "omitted" and fed to a deriver it has no chainTemplate for.
  const blocks = sources.blocks.map((block) =>
    block.codeTemplate !== undefined
      ? block
      : { ...block, codeTemplate: deriveStandaloneTemplate(block.chainTemplate!) },
  );
  const functions = sources.functions.map((fn) =>
    fn.codeTemplate !== undefined
      ? fn
      : { ...fn, codeTemplate: deriveStandaloneTemplate(fn.chainTemplate!) },
  );

  const blockMap = indexByType(blocks, 'building-blocks.json');
  const functionMap = indexByType(functions, 'functions.json');
  const propMap = sources.commandProps;

  /** `group` of a type, wherever it's defined (structural block or command). */
  function groupOf(type: string): string | undefined {
    return blockMap.get(type)?.group ?? functionMap.get(type)?.group;
  }

  function allowsChildType(parent: StructuralNodeDef, childType: string): boolean {
    const childGroup = groupOf(childType);
    return parent.allowedChildren.some((entry) =>
      entry.startsWith('@') ? entry.slice(1) === childGroup : entry === childType,
    );
  }

  return {
    getBlock: (type) => blockMap.get(type) ?? null,
    getFunction: (type) => functionMap.get(type) ?? null,
    getProps: (type) => propMap[type] ?? [],
    getAllBlocks: () => blocks,
    getAllFunctions: () => functions,
    getCategories: () => sources.categories ?? [],
    allowsChildType,
  };
}
