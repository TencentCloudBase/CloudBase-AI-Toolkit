# Contributing to CloudBase Evals

## 贡献 CloudBase Evals

Scenarios and experiments are added by pull request. Official scores come from official runs. A self-serve submission path is not open yet.

场景和实验通过 pull request 加入。公开分数来自官方代跑。自跑提交还没开放。

## Scenario names

`{build|resolve|investigate}-{domain}-NNN-{slug}`

`PROMPT.md` frontmatter must include `interface` (`mcp` or `cli`), `stage`, `product`, and `topic`. Do not copy CloudBase docs into the scenario. Link to https://docs.cloudbase.net when the task depends on a product behavior.

## Scorers

`EVAL.ts` exports `scorer`. Assert the end state: rows in a table, a page that responds, a user who can sign in. Do not grade the transcript. A check must fail when the fix is missing, and pass when the fix is real.

Without `CLOUDBASE_ENV_ID` plus `TENCENTCLOUD_SECRETID` and `TENCENTCLOUD_SECRETKEY`, the scorer stays on the dry-run path. Do not put key samples in the repository.

## Experiments

An experiment that is meant for the board needs a `-no-skills` twin. Harness CLI versions stay pinned in the runner. Model names on a board omit the `-ioa` channel suffix.

## Local check

From the repository root, with no CloudBase credentials:

```bash
node --experimental-strip-types evals/packages/framework/src/cli.ts \
  run build-auth-001-username-signin --experiment fixture-dry
```

That should finish in about 30 minutes for someone new to the repo. The dry-run checks fail on purpose.
