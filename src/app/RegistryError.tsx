/**
 * Startup error state shown when the configuration registry fails to load
 * (HLD §16, "Registry Load Failure"). Purely presentational.
 *
 * When the failure is a RegistryLoadError, the offending configuration file is
 * named, as required by the HLD.
 */

import { RegistryLoadError } from '../registry';

interface RegistryErrorProps {
  error: unknown;
}

function describe(error: unknown): { file: string | null; message: string } {
  if (error instanceof RegistryLoadError) {
    return { file: error.file, message: error.message };
  }
  if (error instanceof Error) {
    return { file: null, message: error.message };
  }
  return { file: null, message: 'Unknown error while loading configuration.' };
}

export function RegistryError({ error }: RegistryErrorProps) {
  const { file, message } = describe(error);
  return (
    <div className="startup-error" role="alert" data-testid="registry-error">
      <h1>Configuration failed to load</h1>
      {file && (
        <p>
          File: <code>{file}</code>
        </p>
      )}
      <p>{message}</p>
      <p>The builder cannot start until the configuration is valid.</p>
    </div>
  );
}
