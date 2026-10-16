/**
 * Compile-input vocabulary limits.
 *
 * Limits are security invariants, not tunables: every one of them bounds what a
 * model-authored program may cost the host (compile time), the session log
 * (persisted bytes), and the browser (render time). They are deliberately not
 * exposed as plugin configuration.
 * @module dsh-intelligent-ui/lang/limits
 */

/** Largest spacing step accepted, in units of 4px. */
export const MAX_SPACE = 8

/** Every bound the compiler enforces, with the value it reports to the model. */
export const LIMITS = {
  /** Character length of the model's source text. */
  maxSourceBytes: 64 * 1024,
  /** Components in one program. */
  maxNodes: 400,
  /** Nesting depth from a root. */
  maxDepth: 8,
  /** `@state` plus `@calc` declarations. */
  maxState: 64,
  /** Rows in one table. */
  maxTableRows: 200,
  /** Cells in one table row. */
  maxTableColumns: 12,
  /** Entries in one list prop. */
  maxItems: 200,
  /** `{…}` interpolations in one piece of text. */
  maxInterpolations: 32,
  /** Positions tried when trimming junk around a JSON envelope; keeps recovery linear. */
  maxJsonRecoveryAttempts: 64,
  /** Diagnostics returned to the model in one call. */
  maxDiagnosticsReported: 24,
} as const
