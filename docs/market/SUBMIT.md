# Submitting to awesome-dsh-plugin

The list at https://github.com/awesome-dsh-plugin/awesome-dsh-plugin takes one YAML file per plugin. The entry for this repository is `StarsHarryZhu__dsh-intelligent-UI.yml`, next to this file. Its rules are in that repository's `contributing.md`; the checks below are the ones that apply here.

## Before opening the pull request

1. Commit and push this repository, including `lib/`, `skills/`, `assets/`, and `screenshots.json`. Reviewers read the code on GitHub, and installs fetch it from there.
2. Confirm the repository is at least one day old. It was created at 2026-10-16T02:50:56Z, so the age check passes from 2026-10-17T02:51Z.
3. Confirm the `dsh-plugin` topic is set on the repository. It is set as of 2026-10-16.
4. Confirm a fresh install works: in the web UI of DeepSeek Harness 0.2.1-alpha.1 or later, install `https://github.com/StarsHarryZhu/dsh-intelligent-UI` from Settings → Plugins, restart, and ask for a card. Do not test in the desktop app: it is below the required version and is not supported yet.

## Opening it

1. Fork https://github.com/awesome-dsh-plugin/awesome-dsh-plugin.
2. Copy `StarsHarryZhu__dsh-intelligent-UI.yml` to `data/plugins/StarsHarryZhu__dsh-intelligent-UI.yml` in the fork. Add no other file and edit neither README; both are generated after the merge.
3. Commit on a branch and open a pull request with the title and body below.

Title:

```
Add StarsHarryZhu/dsh-intelligent-UI
```

Body:

```
Adds `data/plugins/StarsHarryZhu__dsh-intelligent-UI.yml` (category `ui`).

dsh-intelligent-ui registers one tool, `ui_render`. The model passes a small program in a line-based language; the host compiles it against a fixed catalog of 27 components and stores the compiled program as the tool result's presentation metadata. The browser half draws it as a native card in the tool row while the reply streams, and under the reply once the turn finishes. Controls recompute in the browser with no further model call; a button sends its prompt as the reader's next message through the composer.

How it differs from the generative UI plugins already listed: the model never writes HTML, CSS, or JavaScript, and nothing model-written is executed — the program is JSON over a closed expression language, drawn only by the plugin's own components with the host's theme tokens. It adds no session event type, so uninstalling it leaves every session opening. It includes a numerical calculus engine (adaptive Gauss–Kronrod integrals with infinite bounds, derivatives by Taylor-mode automatic differentiation, extrapolated limits, finite sums and products, Brent root finding, Taylor polynomials), `plot` and `formula` components, and a bundled skill that teaches the model when and how to use the tool.

- Manifest: `dsh.bundle.patch` and `dsh.client` (`platform: "web"`), `engines.dsh` `>=0.2.1-alpha.1 <0.3.0-0`. Web UI only for now: the desktop app (0.2.0-rc.2) is below that range and is not supported yet.
- Installs from GitHub without a build step: `lib/` is committed and there is no install script.
- Screenshots: `screenshots.json` in the repository; the README shows all 27 components.
- Tests: `node build.js && node node_modules/vitest/vitest.mjs run` in the repository.
```

## After the merge

Nothing else is needed: the list's READMEs and site rebuild from the YAML. To change the entry later, edit only this file in a new pull request.
