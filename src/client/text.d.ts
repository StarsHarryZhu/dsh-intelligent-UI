/** The build inlines these files as string modules; this is their type. */

/** A stylesheet: the page's own, or the base stylesheet of a widget frame. */
declare module '*.css' {
  const text: string
  export default text
}

/** The frame runtime, bundled from `src/frame/` into one script. */
declare module '*.runtime' {
  const text: string
  export default text
}
