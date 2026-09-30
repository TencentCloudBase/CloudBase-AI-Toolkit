# CloudBase Evals

A benchmark and framework for testing how well AI agents build with
[CloudBase](https://cloudbase.net) — databases, auth, storage, functions,
CloudRun, and hosting. It runs coding agents against real CloudBase tasks
(building a schema, wiring up sign-in, fixing a broken security rule) and
scores what actually happened in a real environment.

**Status: work in progress.** Twenty benchmark scenarios are in the tree.
Fifteen are eligible for a public score. Three are present but unscored
(see below). The runner loads a scenario, writes
`results/<experiment>/<eval>/run-<n>/result.json`, and does not create a
CloudBase environment. Model names on a board drop the `-ioa` channel
suffix.

## Run one scenario

From the repository root, with no CloudBase credentials:

```bash
node --experimental-strip-types evals/packages/framework/src/cli.ts \
  run build-auth-001-username-signin --experiment fixture-dry
```

That is the 30-minute path. It loads the scenario, scores it against a
fake environment, and writes `evals/results/`. Checks fail on purpose.

Score an existing environment without starting a model:

```bash
node --experimental-strip-types evals/packages/framework/src/cli.ts \
  score resolve-security-002-rls-cross-tenant-leak
```

A live `run` needs your own `CLOUDBASE_ENV_ID`, `TENCENTCLOUD_SECRETID`,
and `TENCENTCLOUD_SECRETKEY`. The runner will not create an environment.

## Unscored scenarios

These stay in the repo and are not on the public board:

- `build-dataapi-001-relational-report` — `orders` row security was left off.
- `resolve-database-001-migration-history-mismatch` — the live database has no `public.profiles`.
- `deploy-functions-001-edge-function-secrets` — the function landed as `app_private.edge_secret`; the scorer looks for `public.edge_secret`.

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

## Scenario format
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

- A live run uses an environment you already have. This runner does not create one.
- Published scores are a single run until a fixed repeat protocol exists.
- Harness versions are pinned; a harness upgrade re-runs the full board before scores switch over.
- Context window and compaction settings are unified across harnesses.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
