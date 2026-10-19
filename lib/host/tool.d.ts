/**
 * The `ui_render` tool: the one place a model-authored interface enters DSH.
 *
 * The tool is a compiler, not a renderer. It validates the source against the
 * catalog and returns either a short summary to the model or the diagnostics it
 * must repair from. The compiled program travels separately, as presentation
 * metadata, because that is the channel the session log persists and the client
 * replays after a reload.
 *
 * Parameters are authored in the harness's own dialect and compiled by
 * `defineTool`. That is not a formality: `ToolDefinition.parameters` must already
 * be JSON Schema because the provider request carries it verbatim, and a dialect
 * spec reaching the wire is rejected by the provider as an invalid function
 * schema. `defineTool` also validates the model's arguments before `execute`.
 * @module dsh-intelligent-ui/host/tool
 */
import { type ToolDefinition } from '@deepseek-ai/dsh-tools';
import { catalogHash } from '../lang/catalog.ts';
import { UI_TOOL_NAME } from '../lang/identity.ts';
import type { Diagnostic, JsonValue } from '../lang/types.ts';
/** What the model receives when the program is usable. */
export interface UIRenderSuccess {
    ok: true;
    /** Components actually rendered. */
    components: number;
    /** Interactive controls the reader can change. */
    controls: number;
    /** Whether a bound was hit, so the model knows the answer was cut short. */
    truncated: boolean;
    /** The readable stand-in, so the model can see what a text-only reader would see. */
    summary: string;
    /** Problems that were repaired or ignored, written as instructions. */
    notes: string[];
    /**
     * The compiled program, as lossless JSON. Present in the result value so
     * `output.presentationMeta` can persist it; it never reaches the model, because
     * `output.render` projects only the summary.
     */
    program: Record<string, JsonValue>;
}
/** What the model receives when the program cannot be rendered. */
export interface UIRenderFailure {
    ok: false;
    diagnostics: Diagnostic[];
    hint: string;
}
/** The result value. */
export type UIRenderValue = UIRenderSuccess | UIRenderFailure;
/**
 * Build the tool definition.
 * @returns the `ui_render` tool definition.
 */
export declare function createUIRenderTool(): ToolDefinition;
/** Render the tool result for the model: the summary, or the repair list when it failed. */
export declare function renderForModel(value: unknown): string;
/**
 * Build the client-facing metadata.
 *
 * This is the only channel that survives a reload: the harness attaches the
 * returned JSON to `tool/result.meta`, which the session log persists and the
 * client replays into the card. The program — not the model's source — is what
 * the client renders.
 * @param args - the model's validated arguments.
 * @param value - the tool's result value.
 * @returns the persisted presentation metadata.
 */
export declare function buildPresentationMeta(args: {
    title?: string | undefined;
}, value: unknown): JsonValue;
/** Re-exported so the host entry and tests share one catalog hash. */
export { catalogHash, UI_TOOL_NAME };
