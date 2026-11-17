/**
 * What a widget may reach and how large its parts may be.
 *
 * A widget is model-authored HTML, CSS, and JavaScript that runs inside a
 * sandboxed frame. The frame's own content policy, written here, is what keeps
 * it from reaching anything but the code hosts below; the limits bound what one
 * widget may cost the session log, the page, and the messages it sends. Both
 * halves read this file: the host to warn the model before a widget is shown,
 * the browser to write the frame's policy and to check every message the frame
 * sends.
 * @module dsh-intelligent-ui/widget/policy
 */
/** Hosts a widget may load scripts, styles, fonts, images, and data from. */
export declare const CODE_HOSTS: readonly ["cdnjs.cloudflare.com", "cdn.jsdelivr.net", "unpkg.com", "esm.sh"];
/** Hosts a widget may load web fonts from, as a stylesheet and its font files. */
export declare const FONT_HOSTS: readonly ["fonts.googleapis.com", "fonts.gstatic.com"];
/** Every bound on a widget and on what its frame may send. */
export declare const LIMITS: {
    /** Characters of one widget's source; a longer one is refused, because cutting HTML breaks it. */
    readonly maxSourceChars: 120000;
    /** Characters of the JSON a widget keeps with `dsh.state`. */
    readonly maxStateChars: number;
    /** Characters of the JSON of the control values the frame keeps by element id. */
    readonly maxControlsChars: number;
    /** Characters of one message a widget sends as the reader's next message. */
    readonly maxPromptChars: 4000;
    /** Characters of one runtime error the frame reports. */
    readonly maxErrorChars: 600;
    /** Characters of one link a widget opens. */
    readonly maxLinkChars: 2048;
    /** Smallest and largest frame height, in CSS pixels. */
    readonly minHeight: 24;
    readonly maxHeight: 4000;
    /** Problems reported to the model in one call. */
    readonly maxDiagnostics: 12;
};
/**
 * The `sandbox` tokens of a widget frame. Scripts run; forms are allowed only so
 * that `submit` events fire for the widget's own handlers, while the content
 * policy's `form-action 'none'` stops every real submission. Nothing else is
 * granted: no same origin, no top navigation, no popups, no modals, no downloads.
 */
export declare const FRAME_SANDBOX = "allow-scripts allow-forms";
/**
 * The content policy of a widget frame.
 *
 * Inline code is the widget itself, `blob:` is how the frame loads the
 * libraries this plugin ships, and `data:` serves inline images and fonts. Every
 * other request is refused except to the code and font hosts. The frame cannot
 * nest frames or change its base URL, and a form's own submission goes nowhere
 * (see {@link FRAME_SANDBOX}). Dynamic evaluation stays allowed because some
 * libraries need it, and the frame is sandboxed anyway.
 * @returns the policy text for a `<meta http-equiv="Content-Security-Policy">`.
 */
export declare function framePolicy(): string;
/**
 * Whether a widget may load this address: https on a code or font host.
 * @param url - an absolute address as written in the source.
 * @returns true when the frame's policy lets it through.
 */
export declare function isAllowedUrl(url: string): boolean;
