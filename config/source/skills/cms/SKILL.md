---
name: cms
description: Content management system planning and implementation guidance for websites, landing pages, event pages, mini programs, mini games, customer portals, and operational backends. This skill should be used when users ask to build, design, review, restructure, or improve a CMS, headless CMS, content schema, editorial workflow, publishing flow, content admin system, campaign content backend, or project-based content platform, especially when the solution may use CloudBase delivery, CloudBase CMS, cloud functions, storage, or a PG-based content core.
alwaysApply: false
---

# CMS

This skill turns vague "build a CMS" requests into a route selection, a reusable CMS archetype, and an implementation-ready plan instead of treating every request as a custom system from scratch.

## Activation Contract

### Use this first when

- The request is primarily about content modeling, content admin systems, editorial workflows, publishing, media management, content APIs, campaign configuration, or project-based content backends.

### Read before writing code if

- The user needs a route recommendation between CloudBase-native, PG-based, and Hybrid architectures.
- The request mixes websites, mini programs, mini games, portals, or campaign operations with content administration.

### Then also read

- CloudBase platform rules -> `../cloudbase-platform/SKILL.md`
- Mini program delivery -> `../miniprogram-development/SKILL.md`
- Web implementation -> `../web-development/SKILL.md`
- Visual/admin UX work -> `../ui-design/SKILL.md`
- Relational database design -> `../relational-database-tool/SKILL.md`

### Do NOT use for

- Generic business app planning where content management is not the core problem.
- Pure copywriting, SEO writing, or content marketing tasks.
- Database-only questions without CMS workflow or content-admin context.
- Product-specific tutorials for third-party CMS platforms.

### Common mistakes / gotchas

- Treating every CMS request as a full custom platform build.
- Recommending CloudBase-native for complex RBAC, workflow, or multi-tenant requirements by default.
- Assuming PG/RLS can replace CMS service-layer authorization.
- Skipping route selection and archetype selection before proposing data models.

## What this skill does

- Chooses the right route: `CloudBase-native`, `PG-based`, or `Hybrid`
- Maps the request to a stable CMS archetype before designing details
- Reuses fixed schema, workflow, media, permission, and webhook snippets
- Explains how CloudBase and PG should divide responsibility
- Produces implementation-ready output that can move into product or engineering work

## When to use this skill

Use this skill when the user needs:

- A website, campaign, mini program, or mini game content backend
- A CMS or headless CMS for publishing, media, and content APIs
- Editorial workflow, review, publishing, preview, or webhook planning
- Content schemas, content collections, blocks, taxonomies, or media libraries
- A route decision between CloudBase-first and PG-enhanced CMS architectures

## Do NOT use for

- Pure MVP application planning where the main challenge is forms, orders, or business process logic rather than content administration
- Simple CRUD dashboards that do not involve content workflows
- Questions limited to MySQL/Postgres schema tuning without CMS behavior
- UI-only design explorations without CMS or content-ops context

## How to use this skill (for a coding agent)

1. **Confirm the problem is really CMS-shaped**
   - Identify whether the core problem is content management, publishing, campaign operations, or a content admin backend.
   - If the request is broader than CMS, decide whether `app-builder` would be the better primary skill.

2. **Choose the architecture route before proposing implementation**
   - Use the route matrix in [decision matrix](references/decision-matrix.md).
   - Decide between `CloudBase-native`, `PG-based`, and `Hybrid` before going deep on schemas or APIs.

3. **Choose an archetype before inventing data structures**
   - Use [CMS archetypes](references/archetypes.md) to map the request to a stable pattern.
   - Prefer reusing archetypes and snippets over starting from a blank model.

4. **Apply snippets and platform mapping**
   - Use [snippets](references/snippets.md) for common fields, permissions, workflow, and hooks.
   - Use [CloudBase and PG mapping](references/cloudbase-mapping.md) to place responsibilities correctly.

5. **Produce a structured result**
   - Output route choice, archetype, schema direction, roles, workflow, APIs, delivery path, and implementation sequence.
   - Do not stop at generic product advice.

## Operating Rules

1. First action after trigger:
   - Decide whether the request belongs to CMS and whether the user needs route selection.

2. What to inspect before acting:
   - Delivery surfaces: website, admin portal, mini program, mini game, customer portal
   - Complexity: roles, review/publish flow, multi-project, external customers, reporting
   - Data sensitivity: project-level or customer-level visibility

3. What must never be skipped:
   - Route selection
   - Archetype selection
   - Separation of storage/data concerns from service-layer authorization

4. When to load references:
   - Always read [decision matrix](references/decision-matrix.md) first for architecture choice.
   - Read [archetypes](references/archetypes.md) when choosing the CMS pattern.
   - Read [snippets](references/snippets.md) when producing content models and workflows.
   - Read [CloudBase and PG mapping](references/cloudbase-mapping.md) when recommending platform responsibilities.
   - Read [evaluation](references/evaluation.md) when testing trigger quality and behavior.

5. When to stop and ask for clarification:
   - Only if the user’s request is truly ambiguous between CMS and a general business app, or if the delivery surfaces and permission model fundamentally change the route.

## Routing

| Task | Read | Why |
| --- | --- | --- |
| Decide CloudBase-native vs PG-based vs Hybrid | `references/decision-matrix.md` | Route selection is the first architectural decision |
| Choose the right CMS pattern | `references/archetypes.md` | Prevent blank-sheet design and reuse stable patterns |
| Define fields, workflow, permissions, and hooks | `references/snippets.md` | Reuse tested building blocks instead of improvising |
| Place capabilities on CloudBase, PG, or service layer | `references/cloudbase-mapping.md` | Keep responsibilities aligned with platform strengths |
| Validate trigger quality and output behavior | `references/evaluation.md` | Ensure the skill stays useful and distinct from neighbors |

## Quick workflow

1. Confirm the request is CMS-shaped.
2. Choose `CloudBase-native`, `PG-based`, or `Hybrid`.
3. Choose the closest CMS archetype.
4. Compose schemas, workflow, permissions, and APIs from snippets.
5. Map responsibilities to CloudBase, PG, and service layer.
6. Output implementation-ready structure and next steps.
7. Run the self-check.

## Minimum self-check

- Did I choose the route before suggesting implementation details?
- Did I avoid treating CloudBase collections or PG tables as the product concept?
- Did I use a stable archetype instead of inventing a one-off CMS?
- Did I keep complex RBAC and workflow logic in the service layer?
- Did I clearly separate this from generic app planning or pure data modeling?
