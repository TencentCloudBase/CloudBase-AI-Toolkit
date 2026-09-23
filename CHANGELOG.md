# Changelog

All notable changes to this project will be documented in this file. Follow the repository's conventional commit guidelines and release workflow documentation when preparing releases.

## Unreleased

### Features

* **connectors**: build for the WorkBuddy `cloudbase-intl` connector — the international-site counterpart of the `cloudbase` connector (remote `streamableHttp` MCP with standard MCP OAuth, versus the domestic connector's local stdio + `tcb` CLI). `npm run build:connector:intl` (`scripts/build-connector-cloudbase-intl.mjs`) aggregates `config/source/**` into one skill at `connectors/cloudbase-intl/skills/` — the same content source as the domestic connector, no fork — rewrites China-site hosts to their international-site equivalents, injects the international-site reference, then validates and zips the submittable files into `dist/`. The bundled corpus is guarded, not just rewritten: the build fails on remaining China-site hosts, on a region/host contradiction (a China-site region named next to a site-specific host), or on secrets, rather than shipping a half-converted package. `skills/` is generated output — edit `config/source/**` (shared) or `connectors/cloudbase-intl/extra/**` (international only) and rebuild. The package lands at `dist/cloudbase-intl-connector.zip` — version-free asset naming with the version inside `connector-meta.json`, so the download URL stays stable — and the `Release Plugin Zips` workflow rebuilds and attaches it to every published release next to the plugin and expert zips. That build runs as its own job: it needs a full `pnpm install` for the tsx-based skill aggregation, and its fail-hard guards must not be able to take the unrelated plugin and expert zips down with them. Because the generated `skills/` tree is committed, a `config/source/**` change landing on main would otherwise leave the mirror stale until someone remembered to rebuild it, so `Sync Connector Intl Package` regenerates it on main and commits the drift — the same backfill shape as `plugin/cloudbase/skills` — which also surfaces a guard failure at push time instead of at release time. The same job advances `connector-meta.json`'s `version` (`scripts/bump-connector-versions.mjs`) whenever the shipped package content changes: that content is derived, so it changes for reasons that never touch the version file, and connector submission requires a monotonically increasing version. It compares the working tree against the last tag with the `version` field stripped (and ignoring the two paths that are not shipped, `SUBMISSION.md` and `extra/`, so editing reviewer notes does not consume a version), and it runs in the same job as the mirror sync so the two writes cannot race each other onto main.

* **telemetry**: tool-call and lifecycle events now carry `login_uin`, the account that owns the environment, so usage can be attributed to an account rather than only to an environment. The field matches the `tcb` CLI's own `login_uin` and both sides report under the same Beacon app key, so the two streams join on the same column. It is resolved per call: an `uin` injected by the host through `cloudBaseOptions` comes first (hosted MCP passes the OAuth-resolved owner account), then the local login state, skipped in cloud mode, then `DescribeEnvInfo`'s `EnvInfo.UserInfo.Uin` as a fallback for callers that hold credentials but have no local login. It travels as an explicit per-event field instead of a reporter-wide additional parameter, so one tenant's account cannot end up inside another tenant's events in the hosted multi-tenant process, and the fallback is cached per secretId so it does not become one cloud API call per tool invocation. `unknown` is reported when nothing resolves, and the lifecycle event is sent without the lookup so process exit is never blocked on it. Uins are handled as strings throughout: the 19-digit form exceeds `Number.MAX_SAFE_INTEGER`, so a numeric value that would be silently truncated is dropped instead of reported as a wrong account.
* **i18n**: full internationalization of tool copy — all tool descriptions/titles and user-visible output messages now go through the `t(key)` dictionary (`mcp/src/i18n/`, 28 modules, zh as the source of truth with en translations kept in sync at compile time). Tool descriptions are registered as dictionary keys and resolved per instance language at registration time; unknown keys fall through unchanged.
* **i18n**: instance-level language — `createCloudBaseMcpServer({ lang })` sets the output language for the whole instance. Resolution chain: per-call `lang` argument (auth tool) > instance `lang` option > `TCB_LANG` env > `.cloudbase/project.json` lang > default `zh`.
* **auth**: new optional `site` (`domestic`/`intl`), `region` and `lang` (`zh`/`en`) arguments on the auth tool. `site` takes priority over the instance-level site config and flows through `start_auth` (device + web), `login_by_api_key` and `status`; `status` echoes the resolved `site`. `set_env` persists explicitly-passed `site`/`region`/`lang` to `.cloudbase/project.json` (merged write; derived values are never persisted and no file is created when nothing explicit is passed).
* **site**: gateway and console URLs now resolve per site through `getGatewayBaseUrl` / `getConsoleDevUrl` helpers in `site-map.ts` — intl sites get `api.intl.tcloudbasegateway.com` and `tcb.tencentcloud.com`, domestic sites keep the existing hosts. Replaces hardcoded domains in storagePG, hosting and the interactive server.

* **capi**: `callCloudApi` service allow-list expanded from 10 to 57 Tencent Cloud products, and it stays an **enum + version map** (`SERVICE_VERSIONS` in `mcp/src/tools/capi.ts`) rather than a free-form string: identifiers outside the list are still rejected before the request leaves the process, while products that previously forced a fallback to raw SDK calls — SSL certificates `ssl`, DNS records `dnspod`, domain registration `domain`, logs `cls`, MySQL `cdb`, CVM `cvm`, KMS `kms`, TCR `tcr`, CKafka `ckafka`, … — are now callable directly. `version` may be omitted for the 51 single-version products (resolved from the map); only the 6 multi-version products (`tke` / `mongodb` / `teo` / `vod` / `sms` / `monitor`) require it explicitly, and omitting it fails fast with the available versions instead of guessing one. The daily-synced api-reference index (https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/api-reference.md) remains the first-stop Action lookup, and monitor auth-failure guidance still points to the official monitor API overview. `lowcode` (Weida low-code, only reachable as the data-model backend — not a public capability, and already blocked in evaluate mode) is removed from the list; the data-model tools keep calling it internally through the SDK, which does not go through this allow-list.

* **capi**: `callCloudApi`'s `service` / `action` / `params` / `region` descriptions were cut down to one actionable sentence each (196 / 130 / 168 / 187 characters). They had grown into documentation — inline Action inventories, request examples, naming gotchas — which belongs in the `cloud-api-operations` skill references, not in a schema the model reads on every `tools/list`. The task that a description does carry is stated plainly: `service` must come from the enum, `params` must not carry `Region`, and so on, with a pointer to the skill for the details. Newly added `.describe()` entries over 200 characters are now rejected by the i18n guard (existing ones are grandfathered into the ratchet baseline), so the surface cannot quietly refill.

* **rag**: `searchKnowledgeBase`'s description dropped from 14,135 to 1,444 characters (−90%, 58 → 20 lines) by removing the two inline catalogs — and nothing was lost, because both were already reaching the model as `skillName` / `apiName` **enums**: every skill and API name was being delivered twice, once in the schema and once in prose. What the prose copy uniquely carried was the per-skill `description` text, inlined in full, which is exactly what a client truncates first when the tool surface grows. That text is now served on demand: calling `mode=skill` without `skillName` (or `mode=openapi` without `apiName`) returns the current catalog with each entry's own `description` — the trigger wording itself — so the skills-disabled / IDE-cannot-read-skill-files fallback the paragraph exists for still works, one call later and without truncation. Across the 43-tool surface this is 139,627 → 126,880 characters (−9.1%) paid on every `tools/list`. The front-matter reader's `decsription` typo (a dead alternative in a regex that also matched the correct spelling) is gone with it.

* **skills**: `app.realtime()` now has skill coverage, and the two realtime surfaces are no longer confusable. A new `references/realtime.md` under the CloudBase PG skill documents the Supabase-compatible Broadcast / Presence / Postgres CDC surface against what a task can actually be built on: which synchronization shapes it carries (event-driven turn-based fits; high-frequency deterministic combat does not), the fire-and-forget delivery semantics (`ack: false` by default, `self: false`, no ordering guarantee) and the sequence-plus-snapshot pattern that follows from the ~270s connection hot-cut, private-channel authorization through RLS on `realtime.messages` — which the platform creates with RLS already enabled and **zero** policies, so a private channel denies every subscribe and send until policies are written, while a public channel consults no RLS at all and is readable by anyone who guesses the topic — and the database-side preparation CDC depends on (publication, the `cloudbase_realtime_admin` grant, `REPLICA IDENTITY FULL`, table RLS), which otherwise presents as "the subscription succeeds but no events ever arrive". The entry point is an environment probe that runs before any realtime code is written: realtime is not enabled on every environment, and a missing `realtime` schema is a hard stop rather than something to work around — with the caveat that a zero publication count is normal and cannot be used as the gate. Because `app.realtime()` lives in `@cloudbase/js-sdk/realtime-js` and document-database `collection.watch()` in `@cloudbase/js-sdk/realtime`, and the two do not replace each other, the document-database realtime page now states its own scope and points across, the platform routing skill routes realtime to the new reference, and that skill's description carries realtime trigger words so the routing layer can find it at all.

### Bug Fixes

* **auth**: an expired login credential no longer loses its `uin` when it is refreshed. `refreshTmpToken()` returns the refresh response, which carries no account information, and only `envId` was carried over from the previous credential — so a credential that had a `uin` came back without one, which would have made the reported account drop out for the rest of that session.
* **docs**: skill references no longer point at dead `docs.cloudbase.net/.../index.md` addresses. The site moved its Markdown sources from `<page>/index.md` to `<page>.md`, and the old form does not 404 — it answers with 200 plus the site's fallback page (the HTML carries 「页面不存在」), so a reader landed on a "page not found" shell and an agent fetched that shell as if it were the document. 23 links across the WeChat-integration, cloud-functions, cloudbase-platform, miniprogram-development and web-development skills now use `<page>.md`; all 14 site links referenced from `config/source` and `doc/prompts` return Markdown. A new `check-prompts-sync` check refuses any `<page>/index.md` address, while `/index` without the `.md` suffix stays allowed because it is a working rendered page. Hits under `plugin/cloudbase/skills/**` are reported as a warning only — that tree is synced from `TencentCloudBase/skills` and has to be fixed upstream.

* **capi**: `sts` no longer inherits the SDK's built-in default version. `@cloudbase/manager-node` maps `sts` to `2018-04-16` (SCF's version) while the official STS version is `2018-08-13`, so calls such as `GetCallerIdentity` failed with a misleading `The request action=... is invalid or not found in service=sts and version=2018-04-16`. The version map pins `sts` to `2018-08-13`, so calls that omit `version` now get the correct value instead of the SDK's wrong one.

* **i18n**: `setInstanceLang` was never called by the server, so the `lang` option of `createCloudBaseMcpServer` only affected tool descriptions — every tool's output messages stayed in Chinese. The resolved instance language is now propagated to the i18n module before tools register.
* **i18n**: parameter-level validation messages now follow the instance language. Four zod `.refine()` messages were written as `{ message: t("...") }` inside **module-level** schemas, so they were evaluated at import time — before `setInstanceLang()` runs — and permanently froze to the resolution chain's fallback language. On an `en` instance the affected rules (`functionDeploySchema.tagNoLatest`, `functionDeploySchema.buildCwdAbsolute`, `functionDeploySchema.buildDockerfileSafeRelative`, `functions.timerCron.refine`) silently returned Chinese with no error, which is harder to notice than a plain hardcoded string. They now use the callback form `() => ({ message: t("...") })`, evaluated per validation at request time, and the i18n guard rejects the eager form at the top level of a module so it cannot come back.
* **env**: `queryEnv(action="list")` no longer misreports how filters were applied, and `queryEnv(action="domains")` no longer ignores `envId`. Under env-scoped credentials (hosted OAuth token / API Key) the list path pins to the bound env and never sends `region` to `DescribeEnvs`, yet the response still echoed the requested region into `AppliedFilters.region` / `query_region` and flipped `currentEnvOnly` to `false` while returning the bound environment — so callers (and agents) could read the environment's region wrong. Those fields now reflect what actually ran: `AppliedFilters.region` is null and a new `ignored_params` entry plus a `scope_note` explain the credential boundary, while `query_region` reports the returned environment's own region on the pinned path. The "current environment only" filter now also keys off the envId actually queried (`CLOUDBASE_ENV_ID` can differ from the bound `envId`), so a pinned result can no longer be filtered away into an empty list. Separately, `action=domains` called `getManager()` and silently returned the bound environment's domains even when another `envId` was passed (dangerous when configuring Web security domains); it now resolves through `getManagerForEnvQuery(envId)` like `info` / `usage` / `metrics`, so a cross-environment lookup fails explicitly on the credential boundary instead of answering for the wrong environment.
* **env**: `manageEnv(action="create")` no longer misreports the region it will create in, and `resources` no longer offers `flexdb`. The confirm summary resolved its region through a hardcoded `ap-shanghai` tail (`cloudBaseOptions.region` → `TCB_REGION` → `ap-shanghai`), while the session manager the create actually runs through resolves via `resolveSiteAndRegion` — so on an intl session the summary announced `ap-shanghai` while the environment landed in `ap-singapore`, and a project-config / `cloudbaserc.json` region was ignored by the summary altogether. The fallback now goes through the same resolver as the manager (site default: `ap-shanghai` domestic, `ap-singapore` intl), so the confirmed summary matches what is created. The `region` schema keeps its own `CREATE_ENV_REGIONS` constant rather than reusing the query-region set, and the documented example no longer uses whitelist-gated `ap-guangzhou`. Separately, `flexdb` is removed from `resources` (`CREATE_ENV_RESOURCE_VALUES` is now `storage` / `function` / `postgresql`): new environments are created without a NoSQL tenant, and passing `flexdb` is rejected by the schema instead of being silently forwarded to CreateEnv. NoSQL availability is a runtime property of an environment — read it from `queryEnv(action="info")` → `EnvInfo.RuntimeBackends`.
* **auth**: international-site (`TCB_SITE=intl`) device-flow login now rewrites the OAuth endpoint and verification page to the intl hosts (`tcb-api.tencentcloud.com` / `tcb.tencentcloud.com`). The auth tool's `start_auth` device branch called `loginByWebAuth` directly and bypassed the intl rewrite in `ensureLogin`, so intl accounts kept getting domestic-site device codes that can never be authorized (the device-code registries are isolated per site). Both paths now share one `buildDeviceLoginOptions` helper.
* **auth**: allow `oauthCustom: false` together with an explicit `oauthEndpoint` — required for standard `{code,result}`-wrapped endpoints such as the intl OAuth backend; previously the tool rejected this combination outright.
* **auth**: `auth(action="login_by_api_key")` no longer hints a parameter name the tool cannot read. The missing-arguments error and `next_step.suggested_args` both said `envId`, while the schema and the handler only read `apiKeyEnvId` — so replaying the hint verbatim (exactly what an agent does after a failed call) returned the same `INVALID_ARGS` with an unchanged message, a loop that retrying can never break. `apiKeyEnvId` is the name the feature was introduced with and carries in the schema, so the message and the suggested arguments now use it; the parameters themselves are unchanged and `envId` keeps its `set_env` meaning. A regression test replays `next_step.suggested_args` as-is and requires the result to stop being `INVALID_ARGS`, so hint and implementation can no longer drift apart silently.

* **docs**: `searchKnowledgeBase(mode="docs", action="readDoc")` returns Markdown again. `docs.cloudbase.net` moved its Markdown sources from `<page>/index.md` to `<page>.md`, while `@cloudbase/manager-node`'s `DocsService.readDoc()` still appends `/index.md` — and the site answers unknown paths with **200 + the SPA HTML shell**, so the SDK silently handed back a whole HTML page as "document content" rather than failing. Measured against the live site, the old addressing produced the shell for **all 53 sampled docs**, which is why this read as a content bug instead of an error. `readDoc` now normalizes the path before delegating (including the `<page>/index.md` form that older skill docs still carry, and `/index`-style landing pages), and turns an HTML shell response into an explicit failure that names the Markdown address it tried and offers the rendered page URL as a fallback, instead of feeding the HTML to the model. The response also carries the resolved `markdownPath`. Because the SDK passes any path already ending in `.md` straight through, an SDK-side fix needs no follow-up here. A few sections are not covered by the move yet — `/http-api/**` serves no Markdown at all — and those now fail loudly instead of returning 17 KB of site HTML.

* **gateway**: `manageGateway(action="createRoute")` no longer registers a route whose upstream does not exist. The route was written unconditionally, so a typo in `upstreamResourceId` (or a function name belonging to another environment) produced a route that resolved to a 404 at request time with nothing in the response explaining why. The tool now probes the upstream — `functions.getFunctionList` for `SCF` / `WEB_SCF`, `cloudrun.list` for `CBR` — and returns `success: false` with the closest matching names plus a read-only next step instead of persisting anything. Probes are fail-open by design: `STATIC_STORE` / `LH` upstreams and environments where the list API is unavailable are recorded as `unknown` and the route is created as before, because failing to prove the upstream is missing is not proof that it is.

* **apps**: `queryApps(action="getBuildLog")` accepts the `BuildId` that `deployApp` returns. The deploy response carries `BuildId` as a **number** while the schema declared `buildId` as a string, so the natural round-trip — deploy, then poll the log with the id you were just handed — was rejected by the schema before a request was ever sent, and an agent could only recover by calling the tool a second time with a quoted id. `buildId` now accepts both forms (`z.union([z.string(), z.number()])`, normalized to a string) and is converted to the `Integer` that `DescribeCloudBaseRunBuildLog` documents at the call site, with an explicit error for non-numeric ids instead of a platform-side type error.

* **apps**: `deployApp`'s `cosTimestamp` no longer rejects the value `queryApps(action="getUploadUrl")` produces. The schema used `z.coerce.number()` with `exclusiveMinimum: 0`, so it advertised an integer to the model while `getUploadUrl` documents its `unixTimestamp` as a string — the two halves of one cloud-upload flow disagreed about the type of the value they hand each other, and a strict client sending the documented string had it coerced into a number and refused at the boundary. `cosTimestamp` is now `z.union([z.string(), z.number()])` normalized to a non-empty decimal string, and the handler normalizes identically on both the local-upload and pre-signed-URL paths.

* **hosting**: delete verification is no longer fooled by a sibling key sharing the same prefix, and no longer passes silently on COS-shaped responses. After `deleteFiles`, the object is re-read to confirm it is gone — but `findFiles` is **prefix** semantics, so deleting `/a/b.txt` while `/a/b.txt.bak` still existed was reported as "deletion not verified", and the list was read through `Array.isArray`, which is false for the COS `{ Contents: [...] }` shape and turned the check into a silent pass. The single-file path now compares the exact `Key` (tolerating a leading slash) and the list is normalized before use; `verified` keeps meaning "that path does not exist now".

* **cloudrun**: the "environment not opened" guard now recognizes the localized error the platform actually returns. `ensureCloudRunEnvInitialized`, `queryCloudRun(action="envStatus")` and `manageCloudRun(action="initEnv")` each matched a hardcoded English `ResourceNotFound`, but the same failure also arrives as 「资源不存在」 or as an `error.code` with no message, so it fell through and surfaced as a raw SDK error instead of the `initEnv` guidance — on the one action meant to explain it. The three copies of the predicate are now one exported helper that inspects both the code and the message.

* **env**: plain-text tool failures now set `isError: true`. Four catch paths in the env tool returned a human-readable explanation as ordinary text, which `withBusinessFailureIsError` cannot classify (it only recognizes a structured `{ success: false }` payload), so a failed call arrived looking like a success whose content happened to be an error message. They now build their result through `buildTextErrorResult`. Structured failures are unchanged — they already carry the marker.

* **capi**: `callCloudApi`'s description no longer ships unsubstituted placeholders. The description was registered as a bare dictionary key while the two documentation URLs were only passed on the error path, so every `tools/list` — in both languages — returned the literal `{controlPlaneUrl}` and `{dependencyUrl}` to the client. The URLs are interpolated at registration time. `{layerName}` / `{region}` are deliberate format placeholders and are untouched.

* **docs**: the `queryPermissions` / `managePermissions` descriptions now state the PostgreSQL capability boundary. Role actions (`listRoles`, `getRole`, `createRole`, `deleteRoles`, `updateRole`) are rejected outright on PostgreSQL environments with `The current API does not support PostgreSQL type environments.` — a platform boundary, not a configuration problem and not something retrying resolves. Both descriptions now say so and route to a mechanism that works: RLS via `managePgDatabase(action="execute")` with `CREATE POLICY`, or the console.

* **cloudrun**: the CloudRun skill no longer contradicts the platform on the two runtime contracts that decide whether a service starts at all. Its mandatory runtime rules said **Listen on `PORT`** for both modes, but in Function mode the function framework binds that port itself — so code written to the letter called `app.listen()` on top of the framework's own bind and the process died with `EADDRINUSE`. The rule, the mode-selection table and the `manageCloudRun` `Port` description now say one thing: Container mode must listen on the injected `PORT`, Function mode must not bind it at all. The skill also had no reachable answer to 「服务拿 CloudBase 凭证」: the VPC reference promised 「数据库凭证｜环境内置，无需注入账号密码」 — true of the *database* account, and read as "no credential needed" for everything else — while the credential recipe lived only under the cloud-functions skill, so a service calling PG `app.rdb()` / NoSQL / storage had to improvise. The obvious improvisation, copying a key out of the local client login state (`auth.json`, `.cloudbase/`), yields a credential with no `keyName`, no rotation record and no `keyId` to revoke. A new 「计算资源访问 CloudBase 的凭证决策门」 section states the three decisions (who issues / how injected / how revoked), names the official variable `CLOUDBASE_APIKEY` instead of leaving the name to guesswork, and routes to the recipe; that recipe is retitled and rescoped to cover CloudBase Run services alongside HTTP Functions, forbids keys taken from the local client login state, and notes that rotation invalidates the in-container copy silently.

* **cloudrun**: `manageCloudRun(action="init")` can no longer escape `targetPath` through `serverName`. The parameter was a bare `z.string()` even though its own description documented the naming rule (letters, digits, hyphens and underscores, starting with a letter, 3-45 characters), and `init` is the action that turns the value into a path: the Manager SDK resolves it against `targetPath`, extracts the downloaded template archive there, and the handler then writes `<targetPath>/<serverName>/cloudbaserc.json` — the same shape as `createAgent`, which writes a project skeleton into that directory. A value such as `../../victim` therefore landed outside the workspace, while the very same call already refused `..` in `targetPath` through `validateAndNormalizePath`, so two parameters of one call disagreed about whether traversal was allowed. `serverName` now carries an anchored pattern, and the actions that turn it into a directory (`init`, `download`, `createAgent`) resolve it through one helper that refuses anything but a direct child of `targetPath` — so relaxing the naming rule later cannot re-open traversal. `queryCloudRun`'s `serverName` keeps its open type on purpose: there it is a fuzzy-match filter over existing service names, not a path.

* **cloudrun**: `manageCloudRun(action="initEnv")` can now be called the way it is documented. Both the parameter description and the CloudRun skill said `initEnv` takes no `serverName` (`manageCloudRun(action="initEnv", envId=...)`), but the schema required it for every action, so the documented call failed validation with `Required at serverName` and callers had to invent a placeholder name. `initEnv` is the one action that never reads the value — checked in every branch, not assumed. `serverName` is now optional in the schema (the naming rule still applies whenever a value is present) and the handler enforces presence, fail-closed and before any credential work, for every other action, so a newly added action cannot silently receive `undefined`. `scripts/tools.json` and `doc/mcp-tools.md` are regenerated: `required` for `manageCloudRun` is now just `["action"]`.

* **storage**: `queryStorage(action="read")` no longer lets a Windows-style path name a temp file outside the temp directory. The download target was named with `path.posix.basename(cloudPath)`, which does not treat `\` as a separator — so `..\..\Windows\win.ini` survived as a single "basename" under POSIX rules and, once joined onto the `mkdtemp` directory, resolved above it on a Windows host (measured with `path.win32.join`). The name is now the last segment split on both `/` and `\`, with `.`, `..` and empty results falling back to the existing `storage-file` placeholder.

* **databasePG**: `managePgDatabase(action="fetchMigration")` now validates the remote `Version` before it becomes a file name. A fetched record's `Name` was checked against `MIGRATION_NAME_PATTERN` while `Version` was only trimmed, yet both are concatenated into `cloudbase/migrations/<version>_<name>.sql` — and `applyMigration.migrationVersion` has always required `/^\d{14}$/` — so a malformed history record could write a file outside `cloudbase/migrations/` (and overwrite one with `force`). Fetch now fails closed with `LOCAL_MIGRATION_FETCH_INVALID_VERSION` and writes nothing; the 14-digit rule is defined once and shared by the tool schema and the local-file matcher; and the invalid-name message no longer advertises a pattern that permits digits, which both the server and `applyMigration` already reject.

* **databasePG**: `managePgDatabase(action="rollbackMigration")` is removed — it called an action the cloud API does not implement. `RollbackPGUserMigrations` is registered in the API metadata and the CAM authorization list, so the request gets past action resolution: omitting its required `LastN` returns `The request is missing the required parameter 'LastN'.`. Supplying the parameter then fails with `unknown action: RollbackPGUserMigrations`, identically on account-level credentials over the public endpoint and on both hosted sites — the service's action dispatch has no such entry, so the call could only ever fail. The action was nevertheless exposed as a tool capability and taught in the PostgreSQL skill and prompts, so agents were directed at it. The action and its `lastN` parameter are gone from the schema, the handler, the i18n copy, the tool docs and the skill/prompt references alike; rollback scenarios use a forward repair migration (`applyMigration`), the same stance as the CLI, which documents "no automatic rollback — write the reverse SQL yourself". It can return once the platform implements the action.

* **docs**: the message-push reference no longer points at a path that exists on one machine only. Its "maintainer E2E" note named the maintainer-side skill by absolute path (`~/.workbuddy/skills/.../SKILL.md`) — meaningful to whoever wrote it and to nobody else, because this reference ships far beyond that machine: it is part of the skill corpus released with every version, and it is inside the international-site connector package, where `~/.workbuddy/` is not a directory the reader has. The note now names the skill and says it is not distributed with this repository, which is what a reader outside the maintainer's machine needs. The file's other mention of the same skill, which named it without a path, now says the same thing.

### Continuous Integration

* **ci**: the connector sync job now retries its push instead of losing the race. Its first real run failed the way a main-writing workflow eventually does: the regenerated package was committed, then `git push` was rejected with `! [rejected] main -> main (fetch first)`. A `concurrency:` group only serializes jobs that share its name, and every workflow here names its own, so nothing orders them against each other — about a dozen of them push to main. The job now recovers the way `Sync CloudBase Plugin Skills` does: reset onto `origin/main` and regenerate a clean commit, up to three attempts, with the rebuild and the version bump inside that loop because a reset discards the working tree the bump reads. `git fetch origin main` before the reset is what makes the second attempt a real retry rather than a repeat — the rejection means the remote moved, so resetting onto the stale local ref loses the race again. Verified by reproducing the race against a local repository (attempt 1 rejected, attempt 2 landed, the competing commit preserved) and by a control run with the fetch removed, where all three attempts are rejected.

* **ci**: the plugin-skill pull-back now runs *after* the upstream push instead of racing it. `Sync CloudBase Plugin Skills` and `Push Skills Repository` both listened on `config/source/skills/**`, so the two jobs started in the same second and the pull-back cloned `TencentCloudBase/skills` **before** the push had landed — it compared against its own `.sync-metadata.json`, found no drift, printed `No changes, skipping` and exited green while `plugin/cloudbase/skills/**` stayed a version behind until the next 12h cron. Observed on v2.34.2: pull-back started 16:23:00Z, the upstream push landed 16:23:16Z, and the plugin tree stayed on 2.34.1 for the rest of the day. `Push Skills Repository` now reports whether it pushed and dispatches the pull-back once the push has succeeded; the pull-back drops `config/source/skills/**` from its own triggers, keeping only its script and its workflow file, and the schedule stays as a safety net. Ordering is explicit instead of cron-covered.

* **ci**: `Internal Docs Guard` now also checks PR metadata and commit messages, not only the files a pull request adds. The existing step covered the file layer (`specs/`, `.workbuddy/`) and nothing else, so an internal identifier could still reach a public surface through the PR title, the PR body, or a commit message — all of which are as public as the diff, yet none of them appear in it. An automated flow can write an internal task marker (`ato-task:<uuid>`) into a PR body and append an internal short id to the commit headline, and a body may also cite an internal review round. `scripts/check-internal-refs.mjs` (`npm run check:internal-refs`) scans all four surfaces in two tiers: explicit internal markers are rejected everywhere, while a bare parenthesised hex id is only rejected in a title or headline — a hex reference inside prose is an ordinary way to cite a public commit and failing on it would be a false positive. Placeholder paths such as `/Users/xxx/...` are exempt so documentation examples do not trip the home-path rule, and the check skips rather than fails when the base revision is unavailable (no local `origin/main`, or the all-zero `before` on a push). The workflow additionally runs on `edited`, so correcting a title re-runs it; the job name is unchanged, which keeps the check identity stable.

* **ci**: `sync-skill-versions.mjs` no longer leaves skill entrypoints stuck at an old version. It walked only the direct children of `config/source/skills/` and matched `SKILL.md` case-sensitively, so the root all-in-one `SKILL.md` and the nested `cloudbase-agent/{py,ts}/skill.md` were never bumped and stayed at 2.21.1 through every later release while the other skills moved on. Collection is now recursive and case-insensitive, and a `--check` mode (`npm run check:skill-versions`) lists every drifted file and exits non-zero, so the gap surfaces instead of sitting silent. The default version source also pointed at the monorepo root `package.json`, whose `version` belongs to this repository rather than to what ships — a run without `--version` would have rewritten every skill to the wrong number; it now prefers `mcp/package.json`.

* **ci**: `compat-check` is green again. `compat-baseline.json` had not been regenerated since 2026-09-16 while `config/source/skills/**` kept gaining files — `cloud-api-operations/references/recipes/icp-filing-readiness.md`, added 2026-09-21, on its own left 11 text surfaces without a baseline entry — and `existenceMode: blocking` on that group means the check fails on any file added without one. The baseline is refreshed against the current generated set (1,654 files), so a pull request that adds a skill file no longer inherits a red check from a change it did not make.

* **ci**: a version bump can no longer leave `compat-baseline.json` behind. Every skill and guideline entrypoint carries a `version:` line that lands in the generated products, so a bump rewrites the text-surface hashes wholesale — 363 of the 1,654 generated files embed the version string. Text surfaces are `hashMode: report` on purpose (copy edits should not fail CI), and the same setting meant a stale baseline failed nothing: v2.34.5 → 2.34.6 left 451 report-only rows that surfaced only when someone read the report, while the group's blocking half is existence. Two changes close that. `sync-skill-versions.mjs` now refreshes the baseline as part of the bump — no version change, no baseline write — so the documented release flow cannot skip it, and `npm run update:compat-baseline` stays the manual entry point. A new `check:compat-baseline-sync` step in `compat-check.yml` fails when the diff changes a version declaration without changing the baseline, which covers the hand-edited-frontmatter path; it reads the PR base sha or the push's `before` sha and skips rather than guessing when neither resolves. The hashes stay advisory — the gate is about the baseline being current, not about which text changes are allowed.

## [2.33.0](https://github.com/TencentCloudBase/CloudBase-AI-Toolkit/compare/v2.32.5...v2.33.0) (2026-09-04)

### Features

* **functions**: support custom container image deploy for cloud functions, plus async deploy status query helpers so agents can poll without blocking on long builds (#985).
* **apps**: cloud upload channel — `queryApps(getUploadUrl)` plus `deployApp` accepting either localPath or cosTimestamp (#989).
* **env-binding**: treat `cloudbaserc.json` as a field-level env binding fallback (envId / region / site) after `.cloudbase/project.json`, supporting literal envId and `{{env.KEY}}` templates resolved from project-root `.env` / `.env.local` (#987).
* **skills**: add mini program virtual payment reference docs (#988).
* **skills**: add `codebuddy-ide-mcp-upgrade` skill for upgrading the IDE-bundled CloudBase MCP and regenerating tool whitelists (#976).
* **experts**: add WorkBuddy expert package source + sync workflow; replace saas-architect with focused webdev expert; attach expert package zips to release assets (#978/#979/#986).
* **rag**: teach agents to look up error codes via `searchKnowledgeBase` — the tool description now lists "tool call failed with a specific error code (e.g. `OperationDenied.FreePackageDenied`)" as a first-class `mode=docs` + `action=searchDocs` scenario, so agents query the official error-code docs before retrying or guessing.
* **skill**: add an error-code troubleshooting protocol to the `cloudbase-platform` skill — when a tool call fails with a specific error code (e.g. `OperationDenied.FreePackageDenied`), extract it and route through the official docs (`searchKnowledgeBase` docs search, falling back to `docs.cloudbase.net/error-code/basic` and cloud API error codes 876/34823). Never assert capability-per-plan or error-code semantics from memory; cite the official capability doc (e.g. Web 安全域名 876/127357) or the console plan comparison instead.

### Bug Fixes

* **errors**: add a centralized error-guidance registry (`mcp/src/utils/error-guidance.ts`) wired into the shared tool error exit, so every tool failure — not just NoSQL writes — can carry actionable guidance and an official docs link (fixes #994). Guidance is matched on the structured `Code` (the stable contract) rather than the `Message`; plan-specific thresholds stay in the linked docs.
* **mcp**: hosted MCP staging E2E defect batch — applyMigration, dataModel polling, isError semantics, storagePG gating, rag remote docs (#992).
* **mcp**: hosted MCP defect batch — cloud-mode gating, PG/dataModel, skills docs quality (#991).
* **apps**: harden cloud-mode `deployApp` localPath gate (#984).
* **skills**: restore activation-critical model vocabulary in cloudbase description (#993).

### Code Refactoring

* **env**: converge env domain tool naming into the `query*` / `manage*` system (#997).
* **dsh-plugin**: remove the right-side details panel for the 0.1.0 slim surface (#996).

### Continuous Integration

* **crawl-docs**: restore `npm ci` for `chore/pure_doc_skill` (branch still has npm lockfile only); the earlier pnpm switch broke the scheduled crawl when corepack resolved pnpm 11 on Node 20.

## [2.32.5](https://github.com/TencentCloudBase/CloudBase-AI-Toolkit/compare/v2.32.4...v2.32.5) (2026-09-01)

### Features

* **ide**: add Kimi Code & Kimi Work IDE support
* **auth**: probe management-plane (CAM) capability after a successful API Key login (`login_by_api_key` and the `start_auth` API Key branch). Some API Keys (e.g. AI-suite JWT keys) can only exchange for gateway-scoped temporary credentials whose STS tokens are rejected by TCB CAM — previously MCP reported `AUTH_READY` while every management tool (`queryEnv`, `queryAppAuth`, `manageAppAuth`, ...) silently failed. A cached, lightweight `DescribeEnvInfo` probe now appends an explicit warning recommending long-term `TENCENTCLOUD_SECRETID` / `TENCENTCLOUD_SECRETKEY` when CAM definitively rejects the credential; inconclusive results (timeout / network) produce no warning.

### Bug Fixes

* **auth**: pass resolved region to `loginByApiKey` when site is explicitly intl (`TCB_SITE=intl`), so international-site API keys exchange via the `ap-singapore` gateway instead of the domestic default. Gateway selection follows **site**, not env region: domestic multi-region envs (incl. `ap-guangzhou` / `ap-singapore`) keep using the default gateway which routes by envId — verified by live cross-region gateway probes (sh/gz succeed, sg rejects domestic keys with `SIGN_PARAM_INVALID`). Ambiguous region without explicit site (e.g. bare `TCB_REGION=ap-singapore`) also keeps the default to avoid breaking domestic Singapore-region envs.
* **auth**: enrich `auth(start_auth)` / `login_by_api_key` failure diagnostics — show resolved exchange gateway region, `TCB_SITE`, and a site-mismatch hint (intl keys require `TCB_SITE=intl`; domestic envs must not set it). The previous hard-coded `ap-shanghai` endpoint display is now resolved dynamically.
* **auth**: complete international-site device-flow login — for `TCB_SITE=intl`, device codes are now issued by the intl OAuth backend (`tcb-api.tencentcloud.com`, verified live: reachable device/code + token endpoints with an independent device-code registry) and the verification URL is rewritten to the intl auth host (`tcb.tencentcloud.com/dev#/cli-auth`) while preserving `user_code`. Previously the code was always issued by the domestic backend, so intl accounts could never complete authorization. Explicit `oauthEndpoint` overrides still take precedence.
* **mcp**: `queryEnv(list)` pin to the bound env for hosted OAuth (环境级 STS) tokens
* **hosting/pg/env**: correct misleading output from queryHosting, PG sqlPreview and queryEnv errors

### Code Refactoring

* **rag**: retire the `vector` mode of `searchKnowledgeBase`; official doc search (`mode=docs`, backed by the `app.docs` full-text search) is now the only retrieval path. The `content` / `id` / `threshold` / `limit` / `options` parameters are removed together with the two calls to the `tcb-advanced-a656fc` knowledge gateway. Callers should use `mode=docs` with `action=searchDocs` / `findByName` / `readDoc`.

### Security

* **cloudrun**: `queryCloudRun(action="detail")` 默认脱敏服务环境变量（`ServerConfig.EnvParams` 的值置为 `***`，保留 key），新增 `revealEnvParams` 入参（默认 `false`）显式获取明文，避免带密码的连接串等敏感值进入模型上下文
* **functions**: mask cloud-function environment variable values by default in `queryFunctions` (`getFunctionDetail` / `listFunctionTriggers`). The full raw SCF detail — including `Environment.Variables` plaintext — used to be returned to the model context on every read. Values are now replaced with `***` plus a `ValueLength` field (sufficient for config inspection and change verification); pass `revealEnvValues=true` to opt in to plaintext. Results written to the MCP server log are always masked, with no plaintext opt-out. Plaintext remains available via the console or `tcb fn detail` (fixes #971).

## [2.32.2](https://github.com/TencentCloudBase/CloudBase-AI-Toolkit/compare/v2.32.1...v2.32.2) (2026-08-25)

### Bug Fixes

* **msg-push**: degrade container-config read in list when WeChat apihttpagent returns -9991
* **deps**: bump `@cloudbase/manager-node` to 5.8.2 (requestFn support)

### Documentation

* **skill**: refine message-push / customer-service reference for container mode

## [2.32.1](https://github.com/TencentCloudBase/CloudBase-AI-Toolkit/compare/v2.32.0...v2.32.1) (2026-08-25)

### Features

* **msg-push**: detect container vs cloudfunction push mode; add `ensureContainerMode` / `setContainerCallback` and function-existence check on subscribe

### Bug Fixes

* **msg-push**: degrade function-existence check when host hook is absent (WeChat IDE compat)

### Documentation

* **skill**: document push-mode (cloudfunction/container) and WeChat-side tool names in message-push reference

## [2.32.0](https://github.com/TencentCloudBase/CloudBase-AI-Toolkit/compare/v2.31.0...v2.32.0) (2026-08-24)

### Features

* **msg-push**: add `queryMessagePush` / `manageMessagePush` for event and message-type subscriptions (virtual-pay defaults, idempotent merge, optional appid)
* **gateway**: verify HTTP service before custom-domain / route create, with certificate auto-select and structured DNS guidance

### Bug Fixes

* **cloudrun**: align getDeployLog CODING fallback with process-log next steps
* **msg-push**: pass appid through transport, preserve enable on rebound, prefer ret=80208 for VERSION_CONFLICT
* **skill**: compress miniprogram-development description under Codex 1024-char limit

### Documentation

* **miniprogram**: message-push / customer-service skill reference and layered Chinese localization

## [2.31.0](https://github.com/TencentCloudBase/CloudBase-AI-Toolkit/compare/v2.30.1...v2.31.0) (2026-08-20)

### Bug Fixes

* **cloudrun**: rewrite getDeployLog (DescribeCloudRunBuildLog) CODING-login / image-deploy failures to `getProcessLog` / `getDeployRecords` next steps instead of bubbling raw English errors

## [2.30.1](https://github.com/TencentCloudBase/CloudBase-AI-Toolkit/compare/v2.30.0...v2.30.1) (2026-08-20)

### Code Refactoring

* **kimi**: assemble sibling skills into `cloudbase/references` inside the plugin zip, keeping the archive self-contained and in sync with the manifest contract

## [2.30.0](https://github.com/TencentCloudBase/CloudBase-AI-Toolkit/compare/v2.29.0...v2.30.0) (2026-08-20)

### Features

* **mcp**: support cross-region env query and expose credential boundary for auth/env tools

### Code Refactoring

* **mcp**: drop redundant `login_mode`, keep `credential_scope` as the credential boundary signal
* **kimi**: whitelist-only plugin zip with a version-free asset name

## [2.29.0](https://github.com/TencentCloudBase/CloudBase-AI-Toolkit/compare/v2.28.1...v2.29.0) (2026-08-20)

### Features

* **kimi**: add Kimi Code plugin manifest reusing shared CloudBase skills and MCP assets
* **kimi**: pack Kimi plugin zip and attach it to GitHub Release assets on publish

### Bug Fixes

* **kimi**: align manifest with Kimi official docs (`INTEGRATION_IDE=Kimi`), pin MCP package version, and drop unsupported skill-inject hooks
* **kimi**: load a single routing skill via `searchKnowledgeBase` instead of shipping 29 skills
* **kimi**: prefer MCP `auth` device-code login and remove tcb CLI from skillInstructions

### Documentation

* **kimi**: rewrite plugin interface copy for scenarios and permissions; align with Vercel/Supabase Codex plugin patterns

## [2.28.1](https://github.com/TencentCloudBase/CloudBase-AI-Toolkit/compare/v2.28.0...v2.28.1) (2026-08-18)

### Bug Fixes

* **cloudrun**: set `CreateCloudRunEnv` `EnvType` to `baas` so Cloud Run environment creation matches the current platform contract
* **functions**: wait with a bounded timeout when SCF reports `Updating`, and type `waitUntilFunctionActive` status as string so deploy/update does not fail mid-transition

## [2.28.0](https://github.com/TencentCloudBase/CloudBase-AI-Toolkit/compare/v2.27.0...v2.28.0) (2026-08-18)

### Features

* **env**: add `queryEnv` metrics branch via `DescribeCurveData`
* **env**: add resource-usage query aligned with tcb env usage/info
* **cloudrun**: add `queryCloudRun(getProcessLog)`, traffic management, and deploy-record query
* **cloudrun**: image deploy returns `runId`/`next_step` for process-log polling
* **gateway**: add OPA authorization policy management
* **registry**: publish `@cloudbase/cloudbase-mcp` to the Official MCP Registry
* **skills**: ops-inspector v3 alarm interpretation and fault playbooks

### Bug Fixes

* **cloudrun / apps / gateway**: normalize platform status casing before compare — CloudRun `detail` deploy `FAILED`/`CREATING`, `queryApps(getAppVersion)` `failed`, and gateway default-domain `success` — so uppercase platform responses are not missed
* **cloudrun**: fix `manageCloudRun(initEnv)` missing `EnvType=tcbr`, add optional `vpcId`/`subnetIds` when an explicit VPC is required, normalize uppercase `NORMAL`/`CREATING` in `envStatus`, auto-fill deploy `vpcInfo` from env VPC, and guide CAM/API Key failures to device-code or SecretKey auth
* **nosql**: strengthen `readNoSql` projection / `MgoLimit` guidance
* **skill-inject**: match React fullstack prompts to `web-development`

## [1.7.0](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/compare/v1.6.0...v1.7.0) (2025-06-10)

### 其他

* update doc ([bd49e04](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/bd49e0488b5ebcd16dd5d9c19a9ca801b1b0942c))

### 新功能

* 新增 login 工具交互式选择环境,新增 interactiveDialog 统一的交互式对话工具，支持需求澄清和任务确认，当需要和用户确认下一步的操作的时候，可以调用这个工具的clarify，如果有敏感的操作，需要用户确认，可以调用这个工具的confirm ([d7d5293](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/d7d5293d8fc1611c9363fa45d743e637da07266e))
* 增加规则 交互式反馈规则：在需求不明确时主动与用户对话澄清，优先使用自动化工具完成配置。执行高风险操作前必须获得用户确认。环境管理通过login/logout工具完成，交互对话使用interactiveDialog工具处理需求澄清和风险确认。简单修改无需确认，关键节点（如部署、数据删除）需交互，保持消息简洁并用emoji标记状态。 ([c234e9a](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/c234e9a065fc23181125cacafcee0a6d75773762))

## [1.6.0](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/compare/v1.5.0...v1.6.0) (2025-06-06)

### 其他

* add cnb badge ([3eabacd](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/3eabacd1c27d6d201a3c7987402d795f5b895043))
* add cursor install link ([cf712a9](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/cf712a9315a63bdd610c2274878ec8027e65856c))
* add product-banner ([40e5532](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/40e553265b61d8bc62e993b53fe77cc779263bba))
* function runtime add SUPPORTED_NODEJS_RUNTIMES ([fd11d16](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/fd11d169f986453bc6a573c38e0e97ada3b8a982)), closes [#3](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/issues/3)
* update mcp log ([9aa03c8](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/9aa03c8e1d41d90846aba144378c381d2d7f81ed))
* update rules for envId not found ([0bbd874](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/0bbd87466606c69e48f092870a820cab94f95b8f))

### 新功能

* add rules for cross db query ([de52863](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/de52863f5546f2af667a1477189bcdef7dbb80fe))
* add universal templte ([3a6f55d](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/3a6f55d3dc98a08761c2393bc104b5effbb3f7d9))
* support ai download template ([502fff1](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/502fff1526d6879d4e4f4a8b9a3559bd8cd7f8fd))
* support miniprogram knowlege ([0ff5193](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/0ff5193dcce86f3cc214b9d2d3d1ce42356e5b5f))

## [1.5.0](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/compare/v1.4.0...v1.5.0) (2025-06-04)

### 修复

* function install Deps ([fffd16a](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/fffd16a120642d35dd115539301c05b12ffdbf9e))

### 新功能

* 支持文心快码 Comate ([1df3806](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/1df38060221373fdd41f817c3bffe11412ac4ebd))

### 其他

* update doc ([62132cf](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/62132cff9f10f60a4cb664cd43ec220c2b8dcd3a))
* update rules ([a4f9e92](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/a4f9e92b1d368e330a6df519a0246a4d600d4d0d))
* update searchKnowledgeBase tools name ([80353a6](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/80353a63f44666ad869e73c3149e10751c54af8e))

## [1.4.0](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/compare/v1.1.0...v1.4.0) (2025-05-30)

### 其他

* fix docs ([9b998fe](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/9b998fed7abfb0b8a9eccf8350c03bbfa2ca7d7a))
* update doc ([af460bd](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/af460bdf2d29c65c8f9ba661cf591c3e2e4cbdd2))
* update download link ([718a065](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/718a065c055940bd3ee85f1e0afb8819afece901))

### 新功能

* **mcp:** support searchKnowledgeBase tool 智能检索云开发知识库（支持云开发与云函数），通过向量搜索快速获取专业文档与答案 ([cf69963](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/cf699637ad3a2135fbfe2edcbe410e3398672d51))
* support roocode ([f32ac6c](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/f32ac6c9f0a8ff47818e44d6d6538e6dc48c9117))
* support RooCode ([2d1542d](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/2d1542d61cecee724f0588e805b9134932aba025))
* support tongyi lingma ([b7d2de0](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/b7d2de0f819b69201fdbd0da9562a03420590c0b))
* support tongyi lingma ([02c77f1](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/02c77f12e7092c103aca7a867edf4e61556eebfa))

## 1.3.0 (2025-05-28)

### 新功能

* 优化小程序规则 ([b3d8873](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/b3d8873ba2c6540f65f9fdf5ff8b088214743e0d))
* **init:** init project ([bd25a53](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/bd25a53188151ecf63c45e8c569f3a1c5115920f))
* mcp 支持登出功能 ([d2de655](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/d2de6555af8816670c01338320a47df3be2f8bca))
* support web auth ([375c70e](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/375c70ec4d665cf32e4273cbc930d3f84e05dbec))
* update config,support web auth ([870f3d4](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/870f3d4c363970646b0e823587185cefea83bfbc))

### 修复

* **mcp:** 修复 logout 出参的问题 ([3a4e0a4](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/3a4e0a446e73259fc167c82468f0a096bdad235b))
* update function deploy rules ([2892b07](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/2892b07ddf07fe081ea5c6fe1db5b01c32962722))
* windsurf error ([500dfd7](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/500dfd7556dca558ec42d58e38bfdfdaee0bd96b))

### 其他

* 默认使用最新版本的 mcp ([43b3faf](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/43b3faff99f7210aa244d0a5bd7da0090b725718))
* add scripts ([f3e9686](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/f3e968635943b4335cbad60464b669340e953ede))
* fix doc ([6029e16](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/6029e164148c73cdefa93f85626ccb27a1093dfc))
* fix envId config ([c1d0715](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/c1d0715f08c82f6183c3e6e6686769977efe34bd))
* update config ([d734d27](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/d734d272579e10b53bf7dd4d00d28c3bcd801a8c))
* update doc ([5d66e1b](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/5d66e1bb5502bfccedfdb54067fa3b6c4973d929))
* update doc ([736d78a](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/736d78a76905e470aae2b1881eb15424f85d25c6))
* update doc ([f377e23](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/f377e23317842b24c765d1f420898a8064199ce8))
* update doc ([167f3ba](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/167f3ba530571c41185aea92631f450fe42669fe))
* update doc ([fdb7e57](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/fdb7e57d7e4587cd9fe6dfb1f020332c668fc1cf))
* update doc ([d1586d6](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/d1586d6b02c2e646f7c5baa62400c7d8eb21d746))
* update doc ([696f5b0](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/696f5b0437894f70809177c61267bbb0d5cfdef2))
* update doc ([456b812](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/456b812e805382d1f45eed53b05f52dc32e385d4))
* update doc ([545212e](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/545212e9d1dc34934cca63c3ddb13f3475668bda))
* update doc ([1b39cc1](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/1b39cc16437dc0ca8244292d02e684838955a9a7))
* update doc ([be97279](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/be972795622ae739a54377ef9bbcdf9178dd804c))
* update README.md ([9003abb](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/9003abba3412b9a30e25dd0c31f82074e7024a35))
* update rules ([baf6e86](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/baf6e861edefd64263228579f0172ab9162cd78b))
* update rules ([dd3e48d](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/dd3e48dfb4c68921b0bc2a5ffd39cd8728256918))

## ## 1.2.1 (2025-05-28)

* chore: 默认使用最新版本的 mcp ([43b3faf](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/43b3faf))
* chore: add scripts ([f3e9686](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/f3e9686))
* chore: fix doc ([6029e16](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/6029e16))
* chore: fix envId config ([c1d0715](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/c1d0715))
* chore: update config ([d734d27](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/d734d27))
* chore: update doc ([5d66e1b](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/5d66e1b))
* chore: update doc ([736d78a](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/736d78a))
* chore: update doc ([f377e23](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/f377e23))
* chore: update doc ([167f3ba](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/167f3ba))
* chore: update doc ([fdb7e57](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/fdb7e57))
* chore: update doc ([d1586d6](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/d1586d6))
* chore: update doc ([696f5b0](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/696f5b0))
* chore: update doc ([456b812](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/456b812))
* chore: update doc ([545212e](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/545212e))
* chore: update doc ([1b39cc1](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/1b39cc1))
* chore: update doc ([be97279](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/be97279))
* chore: update README.md ([9003abb](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/9003abb))
* chore: update rules ([baf6e86](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/baf6e86))
* chore: update rules ([dd3e48d](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/dd3e48d))
* fix: update function deploy rules ([2892b07](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/2892b07))
* fix: windsurf error ([500dfd7](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/500dfd7))
* fix(mcp): 修复 logout 出参的问题 ([3a4e0a4](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/3a4e0a4))
* doc: add demo video ([6ac5189](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/6ac5189))
* doc: update codebuddy rules doc ([f396d85](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/f396d85))
* doc: update doc ([e16465c](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/e16465c))
* doc: update doc ([2e13ddb](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/2e13ddb))
* doc: update doc ([77c0e52](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/77c0e52))
* doc: update doc ([63d4639](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/63d4639))
* doc: update doc ([bf2b588](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/bf2b588))
* doc: update doc ([7b4adf1](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/7b4adf1))
* doc: update doc ([82458e9](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/82458e9))
* doc: update doc ([0d96e60](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/0d96e60))
* doc: update doc ([ff8e084](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/ff8e084))
* doc: update doc ([61b7b2e](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/61b7b2e))
* doc: update readme ([5e2d30c](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/5e2d30c))
* doc: update tool list ([6dc4859](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/6dc4859))
* doc: update wechat qrcode ([af1f216](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/af1f216))
* feat: 优化小程序规则 ([b3d8873](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/b3d8873))
* feat: mcp 支持登出功能 ([d2de655](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/d2de655))
* feat: support web auth ([375c70e](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/375c70e))
* feat: update config,support web auth ([870f3d4](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/870f3d4))
* feat(init): init project ([bd25a53](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/commit/bd25a53))
