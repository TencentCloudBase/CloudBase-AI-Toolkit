# CloudBase Evals

A benchmark and framework for testing how well AI agents build with
[CloudBase](https://cloudbase.net) — databases, auth, storage, functions,
CloudRun, and hosting. It runs coding agents against real CloudBase tasks
(building a schema, wiring up sign-in, fixing a broken security rule) and
scores what actually happened in a real environment.

**Status: work in progress.** Scenario authoring is still early (2 examples).
The runner can load a scenario, execute its scorer in dry-run, and write
`results/<experiment>/<eval>/run-<n>/result.json`. CodeBuddy Code can be
invoked headless (`cbc -p`); model ids on the board are canonical names,
and the `-ioa` channel id is only passed to `--model`. This runner never
creates a CloudBase environment.

## Why

Agents increasingly build CloudBase projects through our CLI, MCP server,
skills, and docs. We want a measurable, reproducible answer to "how well
does an agent build with CloudBase" — both to improve our tooling and to
give model vendors a public, rules-transparent leaderboard.

## Layout

```
evals/
  README.md                 # this file
  evals/
    benchmark/              # public benchmark scenarios (breadth)
    regression/             # known failure modes, tracked internally (depth)
  experiments/              # model + harness configurations
  packages/                 # core, framework, sandbox
  results/                  # run outputs: results/<experiment>/<eval>/run-<n>/
```

## Run one scenario

From the repository root, with no CloudBase credentials:

```bash
node --experimental-strip-types evals/packages/framework/src/cli.ts \
  run build-auth-001-username-signin --experiment fixture-dry
```

That is the 30-minute path: it loads the scenario, runs the scorer against a
fake environment, and writes `evals/results/`. Checks fail on purpose in
dry-run, because nothing was built in a real env. A live run requires
`CLOUDBASE_ENV_ID` pointing at an environment you already have; the runner
will not create one.

## Scenario format

Each scenario is a directory with a `PROMPT.md` (task + frontmatter
metadata) and an `EVAL.ts` (scorer):

```markdown
---
stage: build | resolve | investigate
interface: mcp | cli
product:
  - auth | database | storage | functions | cloudrun | hosting | ai
topic:
  - sdk | security | observability | ...
---

<task description>
```

Scorers assert against real state — data in the database, a hosting URL
that responds, an auth setting that takes effect — with deterministic
checks first. LLM-as-judge is only used where semantics require it.
Scorers are deliberately discriminating: wrong keys, pre-satisfied
sandbox state, and partial CRUD all fail as they should.

## Running and scoring rules

- Every scenario runs against a real CloudBase environment, one
  environment per run, created before and destroyed after the run.
- Benchmark scores are averages of 3 independent runs.
- Harness versions are pinned; a harness upgrade re-runs the full board
  before scores switch over.
- Context window and compaction settings are unified across harnesses.

## Contributing

Scenario and experiment contributions are welcome via PR. A
CONTRIBUTING.md with authoring guidelines (how to pick tasks, how to
write scorers, how results get verified) lands together with the runner.
