/**
 * PostgreSQL version helpers for InsureCRM Desktop.
 *
 * Package / server versions come from Super Admin dependency API — not hardcoded URLs.
 * Server binaries typically report major.minor (e.g. 18.4) while the package id is 18.4.2.
 */

/** Fallback label for UI when API metadata is not yet loaded. */
export const PG_DEPENDENCY_NAME = 'postgresql';

/**
 * True when a pg_ctl/postgres version string matches the expected server version
 * from Super Admin metadata (e.g. "18.4").
 */
export const matchesServerVersion = (
  installed: string | null | undefined,
  expectedServerVersion: string
): boolean => {
  if (!installed || !expectedServerVersion) return false;
  const a = installed.trim().match(/^(\d+\.\d+)/)?.[1];
  const b = expectedServerVersion.trim().match(/^(\d+\.\d+)/)?.[1];
  return !!a && !!b && a === b;
};
