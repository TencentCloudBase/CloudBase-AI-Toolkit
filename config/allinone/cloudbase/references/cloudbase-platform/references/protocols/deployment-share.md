# Deployment Share (Post-Deployment, Optional)

A soft, non-intrusive flow for turning a verified deployment milestone into anonymized, shareable deliverables. The goal: willing users can share a reproducible result; no user ever feels pushed.

## Trigger & Boundaries

- Only after a deployment is **verified successful** (public URL reachable, or mini program upload/publish completed), offer **at most once**. Do not ask the same thing twice in one session.
- If the user declines or ignores, stop immediately — never follow up.
- Generate shareables only after the user asks for them (or clicks the share action on the deployment card). **Never post on the user's behalf**, and never fill the form for them: submission is theirs to do.
- Never delay, bloat, or overshadow the deployment report itself. This is a closing pleasantry, not a step of the deployment workflow.

## Two Modes

Pick the mode the user's request implies; do not make them ask twice.

- **One round (default)** — deliver the visual card, the paste-ready copy **and** the case-wall submission entry (`prepareFeedback` with `channel="case"`) together in a single reply. The user reads it, decides, and submits by hand if they want. Asking a second time just to hand over a link the user can ignore costs a whole turn and reads as nagging.
- **Shareables only (on demand)** — if the user asked for the card/copy alone, or said they do not want to submit anywhere, stop after the deliverables and do not bring up the case wall again in this session.

In both modes the draft is shown in full before anything else, and the entry is a link the user opens while signed in — we never submit, never prefill, never post.

## Required Information (both deliverables must cover all items)

1. Agent / CLI used
2. Project type (one sentence)
3. CloudBase resources used (e.g. static hosting, database, auth)
4. Deploy duration (distinguish cloud build time from end-to-end time)
5. At least one piece of **real process evidence** (terminal output, build ID, or deployment log lines)
6. **Reproduction path**: complete down to prerequisite steps such as connector / account authorization — not just the final one-line command. Include the toolkit docs link: https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/
7. **Key pitfalls resolved** along the way (1–2, optional but strongly recommended — the main source of content credibility)

## Default Exclusions (Anonymization Red Lines)

- Environment ID, secrets, credentials, private source code, user data, internal domains
- Public URL: include only after the user confirms the address is intended to be public

## Deliverables (generate both at once)

- **Visual card**: single-file HTML, portrait aspect ratio, ready to open and screenshot. Colors, layout, and typography are unconstrained; echoing the deployed app's visual style is encouraged.
- **Share copy**: a paste-ready paragraph. Style, tone, and platform formatting are unconstrained — just organize the 7 required items into it. Warn the user about platform hyperlink limits (e.g. Xiaohongshu body-text links are not clickable — suggest guiding readers to the comments section).
