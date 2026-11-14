# Config & Project — CloudBase CLI

`tcb config` is **two different things** — know which half you are in:

| Half | Subcommands | Operates on |
|------|-------------|-------------|
| **CLI local settings** | `config get / set / list / delete` | The CLI's own local store (site, language) |
| **Project config sync** | `config init / pull / diff / update` | `cloudbaserc.json` ↔ the cloud |

Plus the project / tooling bootstrap commands: `init --without-template`, `new`, `open`, `validate`,
`self-update`, `rollback`, and the **`tcb ai` setup wizard**. (`pull` and the template branch of
`init` / `new` are retired — see Workflow 3.)

## When to Use

- Switching the CLI between the **domestic site and the international site** persistently
- Changing the CLI language
- Generating / pulling / pushing `cloudbaserc.json` instead of hand-writing it
- Diffing local config against what is actually deployed
- Bootstrapping a new project from a template
- Validating that a project matches CloudBase application standards
- Upgrading the CLI itself

## Do NOT use for

- `cloudbaserc.json` field-by-field reference → `core.md`
- Function config fields (timeout / memory / runtime) → `functions.md`
- Data model definitions and DB migrations → `schema.md`
- Integration instance lifecycle → `integration.md`

---

## Workflow 1: CLI local settings (`config get/set/list/delete`)

This half touches the CLI's **local store only** — no envId, no auth needed.

```bash
tcb config list
tcb config list --json

tcb config get isIntl
tcb config set isIntl true          # switch to the international site
tcb config set lang en
tcb config delete isIntl            # fall back to env var / default
```

Only two keys exist:

| Key | Type | Meaning | Env var override |
|-----|------|---------|------------------|
| `isIntl` | boolean | Whether to use the international site | `TCB_IS_INTL` |
| `lang` | string | Language: `zh` (中文) / `en` (English) | `TCB_LANG` |

Resolution order for `get`: local store → env var → default.

> ⚠️ **Site confusion is the #1 cause of "invalid token" / "env not found".** `isIntl` decides which
> site the CLI talks to. A credential issued on one site does not work on the other.
> - One-off: `tcb login --intl true` / `--intl false` (takes effect immediately for that process)
> - Persistent: `tcb config set isIntl <true|false>`
>
> Pick one method, and make sure it matches the site the target envId actually lives on.

---

## Workflow 2: `cloudbaserc.json` sync (`config init/pull/diff/update`)

Supported modules: **`fn`** (云函数) and **`integration`** (集成)。

### Initialize a template

```bash
tcb config init                              # common all-in-one template + directory skeleton
tcb config init --no-directory               # config file only, no skeleton
tcb config init fn myFunc                    # function module config
tcb config init integration key-xxx
tcb config init integration key-xxx --type weixinpaydc
tcb config init -o ./config/cloudbaserc.json # custom output path
```

### Pull cloud state into the config file

```bash
tcb config pull fn                           # pull function config
tcb config pull fn myFunc workFn             # only the listed functions (comma-separated also works)
tcb config pull fn --all
tcb config pull integration key-xxx
tcb config pull fn --stdout                  # print instead of writing the file
tcb config pull fn -o cloudbaserc.json
tcb config pull fn --dir ./functions         # infer config when the function does not exist in the cloud
tcb config pull fn --code-secret <secret>    # for code-encrypted functions
```

### Diff local vs cloud

```bash
tcb config diff fn                           # only the `fn` module is supported
tcb config diff fn myFunc
tcb config diff fn --all
```

> ⚠️ `config diff` currently supports **only `fn`**. `pull` / `update` / `init` also accept
> `integration`. Do not assume `diff integration` works.

### Push the config file to the cloud

```bash
tcb config update fn myFunc                  # push one function's config (no code upload)
tcb config update fn myFunc --timeout 30 --memory 512
tcb config update fn --all
tcb config update integration key-xxx
```

`config update fn` per-field overrides: `--timeout <seconds>`, `--memory <MB>`, `--runtime <runtime>`,
`--handler <handler>`, `--vpc <vpcId/subnetId>`.

> ⚠️ `tcb fn config update <name>` is deprecated — this is its replacement. See `functions.md`.

> ⚠️ **Verify before pushing.** `config update` overwrites the cloud-side config. Run
> `tcb config diff fn` first and show the user what will change.

---

## Workflow 3: Scaffold a project

```bash
# Initialize the current directory as a project (no template download)
tcb init --without-template

# Example code: clone the examples repo, then cd into the matching directory
git clone --depth 1 https://github.com/TencentCloudBase/awesome-cloudbase-examples

# Templates are delivered by `tcb ai` now, not by pull/init/new.
# Run the wizard once (AI tool + MCP + Skills config), then you can drop a
# built-in template into the current project:
tcb ai --setup
tcb ai --template vue        # miniprogram | react | vue | uniapp | rules
```

> ⛔ **Old template commands retired (2026-11).** `tcb pull`, `tcb init` without `--without-template`
> (including `--template <name>`), and `tcb new <appName>` without a Git URL only print a migration
> notice and exit with code `1`. They cannot succeed — do not suggest them, and do not report them as
> broken: template distribution was consolidated into the examples repo and `tcb ai`. `tcb ai
> --template <name>` is **still supported** and downloads the same built-in templates; it runs the AI
> setup wizard first if the toolkit is not configured yet.

| Built-in template | Example repo directory (if you want the plain code) |
| --- | --- |
| `miniprogram` | `miniprogram/cloudbase-miniprogram-template` |
| `react` | `web/cloudbase-react-template` |
| `vue` | `web/cloudbase-vue-template` |
| `uniapp` | `universal/cloudbase-uniapp-template` |

> ℹ️ `tcb init --without-template` and `tcb new` are implemented but **not listed in `tcb --help`**.
> They are valid commands — do not tell the user they do not exist.

### Create a new app / open the console

```bash
# Create a new CloudBase app by cloning a Git repo (a bare built-in template name is retired)
tcb new my-app https://github.com/user/repo
tcb new my-app https://github.com/user/repo --clone    # clone the whole repo, not just the template

# Open the CloudBase console / docs in the browser
tcb open
tcb open <link>          # a specific console or doc link
```

> ℹ️ `tcb new` differs from `tcb init --without-template`: `init` initializes the **current**
> directory, `new` creates a **new** one by cloning a repo. `tcb open` is a convenience wrapper —
> headless/CI environments have no browser, so do not use it there.

---

## Workflow 4: Validate a project

```bash
tcb validate
tcb validate --json
```

Checks whether the project meets CloudBase application standards (config shape, structure, required
fields). Run it before a first deploy of an unfamiliar project.

---

## Workflow 5: Upgrade the CLI

```bash
tcb self-update
tcb self-update --target-version <x.y.z>   # pin a version (NOT --version!)
tcb self-update --channel beta             # stable (default) | beta
tcb self-update --download-base <url>      # override the download base
tcb rollback                               # roll back to the previous CLI version
tcb --version                              # confirm the version afterwards
```

`self-update` flags: `--target-version`, `--channel`, `--download-base`, `--json`. `rollback` takes `--json` only.

> ⚠️ **`tcb self-update --version` is a trap** — `--version` is the *global* "print the CLI version"
> flag, so it prints the version and does nothing else. Use `--target-version` to pin.

> ⚠️ Prefer asking the user before running `self-update` in a shared/CI environment — it replaces the
> installed CLI. In CI pin the version explicitly instead.

> ℹ️ `self-update` / `rollback` only apply to the **standalone binary distribution**. If the CLI was
> installed through npm (`npm i -g @cloudbase/cli`), upgrade through the package manager instead.

---

## Workflow 6: Configure AI tools / MCP / Skills (`tcb ai`)

`tcb ai` is the CloudBase AI Toolkit entry point — it launches an AI coding tool and writes the
MCP + Skills configuration for it.

```bash
tcb ai                                  # launch / configure interactively
tcb ai -a claude                        # launch a specific agent
tcb ai --setup                          # run the MCP/Skills configuration wizard
tcb ai --setup --scope project          # write config into the current project
tcb ai --setup --scope global           # write config into the user home directory
tcb ai --setup --scope custom --dir <path>
tcb ai --config                         # show the current configuration
tcb ai --reset                          # reset it
```

| Flag | Meaning |
|------|---------|
| `-a, --agent <agent>` | Which AI tool to launch/configure |
| `--template <template>` | Template type |
| `--setup` | Run the MCP + Skills configuration wizard |
| `--scope <project\|global\|custom>` | Where the config is written (used with `--setup`) |
| `--dir <path>` | Target dir — **required** when `--scope custom` |
| `--config` | Print the current configuration |
| `--reset` | Reset the configuration |

> ⚠️ Writing MCP/Skills config modifies the user's IDE/tool setup. `--scope global` touches the user's
> home directory — confirm the scope and directory with the user before running it.
>
> ℹ️ `tcb ai` **is** listed in `tcb --help` (the version banner advertises it too). Use it when the user
> asks to set up CloudBase MCP / Skills in an AI tool.

---

## Command Quick Reference

```bash
tcb config list                                  # dump all CLI local settings
tcb config get <key>                             # isIntl | lang
tcb config set <key> <value>
tcb config delete <key>

tcb config init [module] [keyId]                 # write cloudbaserc.json template (+ skeleton)
tcb config pull <module> [keyId...]              # cloud -> local config file
tcb config diff <module> [name]                  # local vs cloud (fn only)
tcb config update <module> [keyId]               # local config file -> cloud

tcb init --without-template                      # initialize the CURRENT directory (no template)
tcb new <appName> <git-url> [--clone]            # create a NEW app by cloning a repo
tcb open [link]                                  # open the console / a doc link in a browser
tcb validate                                     # project standards check
tcb ai [--setup] [--scope project|global|custom] # configure AI tool + MCP + Skills
tcb self-update [--target-version <v>] [--channel stable|beta]
tcb rollback                                     # revert the standalone CLI one version
```

**Common flags:** `-o/--output <path>`, `-s/--source <t>`, `-f/--force`, `--stdout`, `--all`, `--json`, `--yes`.

---

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `invalid token` / env not found | CLI pointed at the wrong site | Check `tcb config get isIntl`; align with the env's site |
| "未知的配置项" | `config get/set` only accepts `isIntl` / `lang` | Do not pass `cloudbaserc.json` keys here |
| `config diff integration` not supported | `diff` is `fn`-only | Diff integrations manually via `tcb integration list` |
| Config pushed but function unchanged | `config update` only pushes config, not code | Use `tcb fn code update` / `tcb fn deploy` for code |
| `tcb pull` / `tcb init` exit `1` with `已下线` | Old template commands retired in 2026-11 | `tcb ai --template <name>` for a built-in template, or clone the examples repo |
| "not a valid command" for `init --without-template` / `ai` / `new` | These are hidden from `tcb --help` | They are valid — the help list is incomplete |
| `self-update --version` printed a version and did nothing | `--version` is the global "print version" flag | Use `--target-version <x.y.z>` to pin |
| `--dir` rejected | `--dir` needs `--scope custom` | Pass `tcb ai --setup --scope custom --dir <path>` |

---

## Self-Check

- [ ] Did I use the right half of `tcb config` (local settings vs project sync)?
- [ ] For site changes: is `isIntl` consistent with the target envId's site?
- [ ] For `config update`: ran `tcb config diff` and showed the user the changes first?
- [ ] Did I avoid the retired `tcb pull` / `tcb init <template>` / `tcb new <appName>` and point the user to `tcb ai --template <name>` or the examples repo instead?
- [ ] For `self-update`: got user approval (or pinned a version in CI instead)?
