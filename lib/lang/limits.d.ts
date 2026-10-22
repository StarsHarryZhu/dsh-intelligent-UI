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
export declare const MAX_SPACE = 8;
/** Every bound the compiler enforces, with the value it reports to the model. */
export declare const LIMITS: {
    /** Character length of the model's source text. */
    readonly maxSourceBytes: number;
    /** Components in one program. */
    readonly maxNodes: 400;
    /** Nesting depth from a root. */
    readonly maxDepth: 8;
    /** `@state` plus `@calc` declarations. */
    readonly maxState: 64;
    /** Rows in one table. */
    readonly maxTableRows: 200;
    /** Cells in one table row. */
    readonly maxTableColumns: 12;
    /** Entries in one list prop. */
    readonly maxItems: 200;
    /** Characters in one code block; a longer block is cut and the cut reported. */
    readonly maxCodeChars: 8000;
    /** Lines in one code block. */
    readonly maxCodeLines: 400;
    /** `{…}` interpolations in one piece of text. */
    readonly maxInterpolations: 32;
    /** Positions tried when trimming junk around a JSON envelope; keeps recovery linear. */
    readonly maxJsonRecoveryAttempts: 64;
    /** Diagnostics returned to the model in one call. */
    readonly maxDiagnosticsReported: 24;
};
