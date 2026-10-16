/**
 * The model-facing contract: everything the tool description must state.
 *
 * Derived from the catalog so the description cannot describe a component the
 * compiler would reject. The text is deliberately concrete — the model was never
 * trained on this language, so the grammar, the examples, and the exact repair
 * text carry the success rate.
 * @module dsh-intelligent-ui/host/model-brief
 */
/** Worked example: an estimate the reader adjusts. Also pinned by the tests, so it must compile. */
export declare const ESTIMATE_EXAMPLE: string;
/** Worked example: a comparison. */
export declare const COMPARISON_EXAMPLE: string;
/** Worked example: a question answered with one click. */
export declare const QUIZ_EXAMPLE: string;
/** What the model must know before writing a program. */
export declare const UI_TOOL_DESCRIPTION: string;
/** Short reminder appended to a failed result so a repaired call keeps the contract in view. */
export declare const REPAIR_HINT = "Fix these and call ui_render again with the corrected source.";
