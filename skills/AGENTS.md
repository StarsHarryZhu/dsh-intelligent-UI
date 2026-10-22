# AGENTS.md

## 1. Role

The skills this plugin bundles, one folder per skill, in the
`skills/<name>/SKILL.md` layout the host's own skill packages use (the desktop
app's Office skills sit the same way). Today there is one: `dsh-intelligent-ui`,
which teaches the model to use `ui_render` well.

The bundle mounts the skill as its own row, `dsh-intelligent-ui-skill`
(`src/skill.ts`), beside the tool row, so the Plugin Manager lists the skill as
a part of the plugin with its own switch. That row registers one skill provider
with the host's registry — `bundled` source, bundled rank — the path the
first-party skill packages take, so installing the plugin installs the skill.

## 2. Constraints

**One folder per skill.** A skill's instructions are `<name>/SKILL.md`, and the
files it names sit beside it, because the host gives the model that folder as
the skill's base directory.

**The folder name is the skill name.** `src/host/skill.ts` derives the path from
the plugin id, and the frontmatter `name` must match it, or the row registers
nothing and logs why.

**Shipped as is.** `package.json` `files` publishes this folder whole; nothing
here is built.

## 3. Contents

- `AGENTS.md` — this file: the layout and how the skills are registered.
- `dsh-intelligent-ui/` — the skill that teaches `ui_render`: its instructions
  and two reference files.

## 4. Progress

**Done.**

- Moved to the `skills/<name>/SKILL.md` layout and registered through a
  provider from a row of its own (2026-10-22), after the skill did not show in
  the desktop app's pages under the earlier runtime registration.

- Confirmed live on 2026-10-22 in the web UI and the macOS desktop app: the
  Plugin Manager lists the skill row, `/` lists the skill, and the model loads
  it before drawing a card.

**Not done.**

- Not checked on the Windows desktop app.

**Known defects.** None known.

**Next goal.** Confirm the skill row on the Windows desktop app.
