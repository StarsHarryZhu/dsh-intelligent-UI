/**
 * The entry of the frame runtime: the script the page writes into each widget
 * frame's head. It starts the runtime once, in that frame's window.
 * @module dsh-intelligent-ui/frame/main
 */

import { boot } from './runtime.ts'

boot(window as unknown as Parameters<typeof boot>[0])
