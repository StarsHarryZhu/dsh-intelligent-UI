/**
 * The `ui_render` tool: the one place a model-authored widget enters DSH.
 *
 * The model writes a widget as HTML, SVG, CSS, and JavaScript. The tool never
 * runs it: it cleans the source, compiles each script for its syntax only, and
 * returns either what the reader will see or the problems the model must fix.
 * The source travels separately, as presentation metadata, because that is the
 * channel the session log persists and the browser replays after a reload; the
 * browser runs it in a sandboxed frame.
 *
 * Parameters are authored in the harness's own dialect and compiled by
 * `defineTool`. That is not a formality: `ToolDefinition.parameters` must already
 * be JSON Schema because the provider request carries it verbatim, and a dialect
 * spec reaching the wire is rejected by the provider as an invalid function
 * schema. `defineTool` also validates the model's arguments before `execute`.
 * @module dsh-intelligent-ui/host/tool
 */
import { type ToolDefinition } from '@deepseek-ai/dsh-tools';
import { UI_TOOL_NAME } from '../widget/identity.ts';
/** A value the session log can hold. */
type Json = string | number | boolean | null | Json[] | {
    [key: string]: Json;
};
/** One problem as the result carries it. */
export interface ReportedProblem {
    line?: number;
    message: string;
    repair: string;
}
/** What the model receives when the widget is shown. */
export interface UIRenderSuccess {
    ok: true;
    /** Lines of the cleaned source. */
    lines: number;
    /** Script elements in it. */
    scripts: number;
    /** Shipped libraries it loads, which work offline. */
    shipped: string[];
    /** Addresses it loads from code hosts. */
    fetched: string[];
    /** Controls with an id, which the frame keeps across reloads. */
    controls: string[];
    /** Messages its buttons send, where the source writes them in place. */
    prompts: string[];
    /** The text shown before any script runs, cut short. */
    text: string;
    /** Problems that do not keep it from being shown, written as instructions. */
    notes: string[];
    /** This card's id, the call id, which a later call passes as `revises` to change it. */
    card?: string;
    /** Id of the earlier card this one replaces, when the model named a valid one. */
    revises?: string;
    /**
     * The cleaned source. Present in the result value so `output.presentationMeta`
     * can persist it; it never reaches the model, because `output.render` projects
     * only the summary.
     */
    source: string;
}
/** What the model receives when the widget is not shown. */
export interface UIRenderFailure {
    ok: false;
    problems: ReportedProblem[];
    hint: string;
}
/** The result value. */
export type UIRenderValue = UIRenderSuccess | UIRenderFailure;
/**
 * Build the tool definition.
 * @returns the `ui_render` tool definition.
 */
export declare function createUIRenderTool(): ToolDefinition;
/** Where the widget stands, told with every widget so the model goes on writing after it. */
export declare const PLACEMENT_NOTE = "It stands in your reply here, where you called ui_render. To put it inside your answer instead, write this block alone on its lines where it belongs; the widget moves there and the block is hidden:";
/**
 * The block that places a widget in the answer: a fence of the `widget`
 * language whose only line is the card id. The browser half finds it there.
 * @param card - the card id.
 * @returns the block's three lines.
 */
export declare function placementBlock(card: string): string;
/** Render the tool result for the model: what the reader sees, or the problems to fix. */
export declare function renderForModel(value: unknown): string;
/**
 * Build the client-facing metadata.
 *
 * This is the only channel that survives a reload: the harness attaches the
 * returned JSON to `tool/result.meta`, which the session log persists and the
 * client replays into the widget.
 * @param args - the model's validated arguments.
 * @param value - the tool's result value.
 * @returns the persisted presentation metadata.
 */
export declare function buildPresentationMeta(args: {
    title?: string | undefined;
}, value: unknown): Json;
export { UI_TOOL_NAME };
