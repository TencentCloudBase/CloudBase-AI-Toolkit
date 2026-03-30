# Evaluation

Use this file to test trigger quality and route-selection behavior.

## Should-trigger prompts

1. Help me design a CMS for a company website with articles, cases, event pages, and an editor review flow.
2. We need a mini program content backend for campaign pages, banners, and activity configuration.
3. Design a customer-facing project portal where each client can view project content, reports, and exported summaries.
4. I want a standard ledger database where customers can view project-collected data in a mini program and ask for charts and written reports through chat.

## Should-not-trigger prompts

1. Help me build an order management system for sales staff.
2. I need a generic dashboard to manage invoices and finance approvals.
3. Tune this PostgreSQL query and add indexes to improve performance.

## Closest-neighbor comparison

Prompt:

- Build an event registration platform with an admin console, public pages, and customer progress tracking.

Interpretation:

- Use `cms` when the core challenge is content pages, campaign content configuration, publishing, and customer-visible content delivery.
- Prefer a general app-planning skill when the core challenge is registration flow, transactional data, and business process logic.

## Acceptance checks

- The skill should choose `CloudBase-native` for lightweight campaign and content backends.
- The skill should choose `PG-based` or `Hybrid` for customer-facing portals with reporting and visibility constraints.
- The skill should not swallow generic CRUD or backend planning requests that are not content-management problems.
- The ledger + visualization + multi-user + mini program prompt should push the skill toward `PG-based` or `Hybrid`, not a naive CloudBase-only CMS recommendation.
