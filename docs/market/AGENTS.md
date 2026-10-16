# AGENTS.md

## 1. Role

The submission of this plugin to the community list awesome-dsh-plugin, kept
beside the code it describes. The list takes one YAML file per plugin in its own
repository; this folder holds that file as it will be submitted, and the steps
and pull request text that go with it, so the entry can be checked against the
code before it leaves this repository and updated when the plugin changes.

Nothing here is read by the harness or installed with the package. It is
documentation for the person who submits the entry and for the reviewer who
checks its claims.

## 2. Constraints

**The entry must be true of the code.** Every number and name in the description
is checked by the list's reviewers against this repository: the component count
is the catalog's length, the calculus operators are the ones `src/lang/expr.ts`
evaluates, the skill is the one in `skills/`, and the version it asks for is the
lower bound of `engines.dsh`. Change the entry in the same
change that makes a claim false.

**The list's format, exactly.** `url`, `name`, `category`, and `description.en`
are required; `description.zh` is optional. A description that contains a colon
followed by a space must be quoted. The file name is `<owner>__<repo>.yml`.

**The Chinese description is the one exception to English.** The list carries
both languages, so the YAML file holds Chinese text; every other file here is
English.

**Submission stays manual.** Pushing, forking, and opening the pull request are
the maintainer's actions; nothing in this repository automates them.

## 3. Contents

- `AGENTS.md` — this file: what the submission folder is and the rules for its
  claims.
- `StarsHarryZhu__dsh-intelligent-UI.yml` — the list entry, ready to copy to
  `data/plugins/` in a fork of the list.
- `SUBMIT.md` — the pre-flight checks, the copy step, and the pull request title
  and body.

## 4. Progress

**Done.**

- The entry parses as YAML, names category `ui`, and its claims match the code as
  of version 0.1.2, including the required harness version (`engines.dsh`
  `>=0.2.1-alpha.1 <0.3.0-0`) and that the desktop apps are not supported yet.
- The repository carries the `dsh-plugin` topic and a `screenshots.json`.

**Not done.**

- **Not yet submitted.** The repository becomes old enough for the list's age
  check at 2026-10-17T02:51Z.

**Known defects.**

- The list already holds several generative UI plugins; the description states
  the differences, but a reviewer may still judge the category crowded.

**Next goal.** Submit the entry once the age check passes, and record the pull
request here.
