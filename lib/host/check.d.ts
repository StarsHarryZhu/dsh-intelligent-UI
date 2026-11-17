/**
 * Check a widget before it is shown.
 *
 * The model's code never runs on the host. Each script is compiled, not
 * executed, with Node's `vm.Script`, which parses with the same engine the
 * browser uses, so a syntax error comes back to the model with its line while
 * it can still fix it in the same turn. Everything else here reads the source
 * as text: which addresses the frame will block, which libraries the plugin
 * ships, and which habits do not work inside a sandboxed frame.
 * @module dsh-intelligent-ui/host/check
 */
/** One problem, written as an instruction the model can act on. */
export interface Problem {
    /** Line of the source the problem is on, when it has one. */
    line?: number;
    message: string;
    repair: string;
    /** An error keeps the widget from being shown; a warning is reported with it. */
    severity: 'error' | 'warning';
}
/** What the check found. */
export interface Checked {
    /** The normalized source the frame shows. */
    source: string;
    problems: Problem[];
    /** Titles of the shipped libraries the widget loads. */
    shipped: string[];
    /** Addresses the widget loads from code hosts. */
    fetched: string[];
}
/**
 * Check one source.
 * @param written - the source as the model wrote it.
 * @returns the normalized source and every problem found.
 */
export declare function checkWidget(written: string): Checked;
