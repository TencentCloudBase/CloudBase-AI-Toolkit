# CloudRun container deploy failure — diagnosis reference

Read this when `deploy_failed`, Pod never becomes ready, readiness/probe fails, or a third-party `imageUrl` will not stay up.

Follow the behavioral SOP in `../SKILL.md` (**docs → runtime logs → config**). This file expands signal tables. Do **not** start from a specific image name.

Official networking/VPC issues belong in [vpc-and-database.md](vpc-and-database.md), not here.

## 1. Pre-deploy: five facts from the image's own docs

Before the first `manageCloudRun(action="deploy")` with `imageUrl` (or a `FROM <image>` Dockerfile), open the **image's official run docs** (not just Docker Hub tags) and fill this table. Guessing from common defaults is how probe-delay misdiagnosis starts.

| # | Fact | Where it usually lives | CloudRun field |
| --- | --- | --- | --- |
| 1 | Foreground start command | `docker run … <cmd>`, compose `command:`, Dockerfile `ENTRYPOINT`/`CMD` | `serverConfig.EntryPoint`, `serverConfig.Cmd` |
| 2 | Listen port | `-p host:container`, compose `ports:`, docs "listens on" | `serverConfig.Port` and `EnvParams.PORT` if the app honors `PORT` |
| 3 | Bind-address / public-listen env | docs saying "set HOST=0.0.0.0" / "API disabled by default" | `serverConfig.EnvParams` |
| 4 | Required data directory | `-v host:container`, compose `volumes:` | `serverConfig.VolumesConf` (`VolumePath` = container path) |
| 5 | Health / ready signal | `/health`, `/ready`, or "probe the listen port" | CloudRun readiness probes the **service port**; a path-only health check does not replace a process that never binds |

Rules:

- Do **not** assume `80` or `3000`. Many images ignore platform `PORT`.
- Do **not** assume the image's default `CMD` is the HTTP server. Some images idle, print help, or start a supervisor with no app child.
- Bind address `127.0.0.1` inside the container makes the platform probe fail even when local `curl` inside the namespace would work.
- If docs require a volume and you omit it, the process may exit on first write — that looks like a probe failure.

## 2. After failure: which log, then which class

### 2.1 Pick the right log

| Deploy type | Build log `getDeployLog` | Runtime log `getProcessLog` |
| --- | --- | --- |
| Cloud source build (`targetPath`, CODING) | Yes — compile/package first | Yes — after the image exists |
| Existing image (`imageUrl`, `DeployType=image`) | **Skip** (no build; CODING-unaware accounts error) | **Yes** — this is the diagnosis tool |

```json
{
  "action": "getProcessLog",
  "detailServerName": "my-svc",
  "runId": "<from latestDeploy.RunId>"
}
```

`getProcessLog` returns deploy-step lines (for example `create_version_check_vpc` / `create_eks_virtual_service` / `check_eks_virtual_service`) plus container stdout/stderr (supervisor, app, probe reason). **Image and source deploys both work; it does not depend on CODING.**

### 2.2 Classify: scheduling vs port vs exit-on-start

Pull logs **twice**, 20–40 seconds apart. Compare the two `processLogText` dumps.

**Startup logs exist ≠ the service is running.** A boot banner, s6/tini line, or "starting …" is not a ready listener.

| Class | Typical signals (first pull) | Two-pull comparison | What to change | What not to change |
| --- | --- | --- | --- | --- |
| **A. Pod still scheduling / pulling** | Only deploy-step lines; empty or truncated container stdout; image-pull errors | Second pull still has no app stdout, or still stuck on pull | Registry access, image size, switch to source-build `FROM` (section 4) | `InitialDelaySeconds` |
| **B. Port / bind problem** | App stays up; "listening on 127.0.0.1" or a port ≠ `serverConfig.Port`; probe failed on connection refused | Same PID / no repeated boot banner; listener line does not match the probe port or is loopback-only | `Port`, bind-address env, `Cmd` that actually starts the HTTP server | `InitialDelaySeconds` |
| **C. Exit-on-start / restart loop** | Crash, missing command, usage/help text, supervisor respawn, `exit 0/1` immediately | **Same boot banner / same first N lines repeat** (new timestamps, same sequence) | `Cmd`/`EntryPoint`, required env, volume, supervisor workaround (section 5) | `InitialDelaySeconds` |

Only if class is **none of the above** — two pulls show **one continuous boot** (new init lines, no banner repeat) and the process has **not listened yet** — may the start be genuinely slow. Then raise `InitialDelaySeconds` (see section 3).

### 2.3 How to read a restart loop

1. Copy the first distinctive line after PID 1 (banner, "starting gateway", "s6-supervise").
2. Search that line in the same log. **Two or more copies with advancing timestamps** ⇒ respawn storm.
3. Confirm with a second `getProcessLog`: if the newest chunk is again that banner rather than later "listening" lines, the process is not making progress.
4. A single "listening" line that never updates, followed by probe failures, is class B, not a slow start.

## 3. Readiness probe mechanics

After deploy steps finish:

1. Wait **N** seconds (`serverConfig.InitialDelaySeconds`).
2. Probe the service **port** about every **5 seconds**.
3. About **30** consecutive failures ⇒ this deploy is failed.
4. Failure window ≈ **N + 150 seconds**. This is **not** "declare failed N seconds after deploy".

**Forbidden default:** `probe failed` / `deploy_failed` ⇒ set `InitialDelaySeconds=120`.

Raising N only **delays the same failure** when the process is crash-looping or bound to loopback. It helps only when logs prove the process is still doing one-shot init (JVM warmup, migrations) and will listen if given more of the window.

## 4. `docker.io` / Docker Hub pull loops → source build

When `imageUrl` points at a public registry (`docker.io`, Docker Hub) and deploys fail in class A with repeated pull errors:

1. Stop retrying the same `imageUrl` on CloudRun nodes.
2. Add a local Dockerfile whose only job is to let **CODING** pull the public image:

```dockerfile
FROM docker.io/example/app:latest
```

3. Deploy with `targetPath` (cloud source build), not `imageUrl`.
4. CODING build machines pull `docker.io`; the build artifact is stored in CCR; CloudRun nodes pull from the **intranet**.

Keep `Cmd` / `EnvParams` / `VolumesConf` / `Port` from section 1 on that source deploy. Source build fixes **pull topology**, not a wrong start command.

Private registries (`ghcr.io`, Harbor) still use the local-pull → tag → push-to-CCR path in `../SKILL.md`.

## 5. Supervisor images (s6 / tini / supervisord)

If PID 1 is `s6-svscan`, `tini`, `supervisord`, or similar:

- The line you see first is often the **supervisor**, not the HTTP app. Search logs for the child you documented in section 1.
- Respawn storms look like class C: the same child start line every few seconds.
- `pgrep -f` / duplicate-instance guards can match **container PID 1's argv** and kill/respawn the real process. If the image's issue tracker documents this, apply that workaround (absolute `Cmd`, flags such as `--no-supervise`) instead of probe-delay tuning.
- Workaround must come from **that image's docs or issues**. Do not invent supervisor flags.

## Appendix — worked example: hermes-agent

This appendix is **one** application of sections 1–5. Do not skip the generic SOP because the image name matches.

**Image:** `docker.io/nousresearch/hermes-agent:latest`  
**Docs:** https://hermes-agent.nousresearch.com/docs/user-guide/docker

### What the docs require (section 1)

| Fact | From official Docker docs | Typical CloudRun mapping |
| --- | --- | --- |
| Cmd | `gateway run` (compose `command: gateway run`) | `Cmd: ["gateway", "run"]` |
| Port | `8642` (API + health); dashboard `9119` is separate | `Port: 8642` — do not use `3000` |
| Bind / API env | API is **off** by default; loopback by default | `API_SERVER_ENABLED=true`, `API_SERVER_HOST=0.0.0.0`, `API_SERVER_KEY=…`, optional `API_SERVER_CORS_ORIGINS` |
| Volume | `-v ~/.hermes:/opt/data` | `VolumesConf` with `VolumePath: "/opt/data"` |
| Health | Port 8642 health endpoint once the API server is enabled | Probe succeeds only if the API server is on and bound to `0.0.0.0` |

### Wrong path (observed)

Assistants saw readiness probe failed / `deploy_failed` and repeatedly set `InitialDelaySeconds` from `2` to `120`. The probe window was already ~N+150s. The process was not "still warming up".

### Log class (section 2)

Two `getProcessLog` pulls showed the same boot sequence repeating (class **C**), not a single long init (slow start). Supervisor/s6 lines were present; that is **not** proof the gateway API was listening on `0.0.0.0:8642`.

### Root cause

1. Default image command did not run `gateway run`.
2. API server env was missing, so nothing public listened on the probe port.
3. `/opt/data` was not mounted.
4. Direct `docker.io` `imageUrl` also hit node pull issues — section 4 (Dockerfile `FROM docker.io/nousresearch/hermes-agent:latest` + source build) addresses pull, not Cmd/env.

### Supervisor workaround (section 5)

Known issue [NousResearch/hermes-agent#14128](https://github.com/NousResearch/hermes-agent/issues/14128): gateway duplicate-instance detection uses `pgrep -f` and can match container PID 1's path, causing a respawn storm. Documented direction: **absolute Cmd path** plus `--no-supervise`. Confirm against the current issue before copying flags.

### Correct diagnosis sentence

Not "probe delay too short". Instead: **missing start command + API bind env + data volume**, with source build only as a **pull** workaround.
