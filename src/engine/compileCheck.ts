/**
 * Syntax-level "compile-ready" check (Phase 9, builder UX roadmap).
 *
 * Deliberately **not** a full TypeScript type-check: that would require
 * resolving Cypress's ambient global types (`cy`, `Cypress`, `describe`,
 * `it`, ...) inside a from-scratch in-browser compiler host, which this
 * project doesn't attempt. What this *does* verify — using
 * `ts.transpileModule`, a single-file, syntax-only transform with no type
 * resolution at all, so no ambient types are needed — is that the generated
 * spec actually parses as valid TypeScript. That's a real, useful check: the
 * one place `engine/processFlow.ts` ever emits a prop's raw text completely
 * unescaped is an `expression`-type field (e.g. `intercept`'s stub response,
 * `wrap`'s subject) — a user typing invalid JS there currently produces
 * silently broken code with no warning anywhere else in the app. This is
 * what catches that before the user ever runs it.
 *
 * Runs entirely in the browser: `typescript` is pure JS with no Node-only
 * code path in `transpileModule`'s single-file parse, so no server and no
 * bundler plugin are needed beyond an ordinary import.
 */

import ts from 'typescript';
import { nodeIdForLine, parseNodeMarkers, stripNodeMarkers } from './nodeMarkers';

export interface CompileDiagnostic {
  message: string;
  /** 1-indexed line in the *clean* (displayed) code. */
  line: number;
  /** The flow node responsible, when the diagnostic's line maps to one — see `nodeMarkers.ts`. */
  nodeId: string | null;
}

export interface CompileCheckResult {
  ok: boolean;
  /** The annotated code's markers stripped — exactly what the user is shown. */
  cleanCode: string;
  diagnostics: CompileDiagnostic[];
}

/**
 * Check `annotatedCode` (`engine/processFlow.ts`'s `processFlowAnnotatedSpec`
 * output — markers included) for syntax errors, mapping each one back to the
 * responsible node. Markers are trailing comments, so they never affect
 * parsing and never shift any line's position — the diagnostic's line number
 * is valid for the stripped, displayed code without any translation.
 */
export function checkSpecSyntax(annotatedCode: string): CompileCheckResult {
  const markers = parseNodeMarkers(annotatedCode);
  const cleanCode = stripNodeMarkers(annotatedCode);

  if (annotatedCode.trim() === '') {
    return { ok: true, cleanCode, diagnostics: [] };
  }

  const { diagnostics } = ts.transpileModule(annotatedCode, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
    },
    reportDiagnostics: true,
    fileName: 'spec.cy.ts',
  });

  const mapped: CompileDiagnostic[] = (diagnostics ?? []).map((diagnostic) => {
    const line =
      diagnostic.start !== undefined && diagnostic.file
        ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line + 1
        : 1;
    return {
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
      line,
      nodeId: nodeIdForLine(markers, line),
    };
  });

  return { ok: mapped.length === 0, cleanCode, diagnostics: mapped };
}
