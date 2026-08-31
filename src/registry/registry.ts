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

function validateSources(sources: RegistrySources): void {
  for (const block of sources.blocks) {
    // A chain-composition node (Phase 2) builds its output entirely in
    // engine/processFlow.ts's chain generator, not via codeTemplate substitution,
    // so it is the one structural node exempt from requiring one.
    const templateRequired = block.childComposition !== 'chain';
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
  }
  for (const fn of sources.functions) {
    if (!fn.type || !fn.codeTemplate) {
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

  const blockMap = indexByType(sources.blocks, 'building-blocks.json');
  const functionMap = indexByType(sources.functions, 'functions.json');
  const propMap = sources.commandProps;

  return {
    getBlock: (type) => blockMap.get(type) ?? null,
    getFunction: (type) => functionMap.get(type) ?? null,
    getProps: (type) => propMap[type] ?? [],
    getAllBlocks: () => sources.blocks,
    getAllFunctions: () => sources.functions,
    getCategories: () => sources.categories ?? [],
  };
}
