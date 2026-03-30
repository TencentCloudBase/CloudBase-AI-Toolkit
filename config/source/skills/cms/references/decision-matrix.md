# Decision Matrix

Use this reference first when a CMS request needs architecture direction.

## Purpose

The route decision comes before schema design. This skill supports three routes:

- `CloudBase-native`
- `PG-based`
- `Hybrid`

## Route Selection Rules

### Choose `CloudBase-native` when

- The request is a lightweight or medium-complexity CMS
- Delivery is centered on websites, mini programs, mini games, or campaign operations
- The core need is content entry, media, publishing, and basic APIs
- Roles are simple, such as admin/editor/operator
- Multi-tenant isolation is not the main challenge

Typical examples:

- Official website CMS
- Campaign content backend
- Mini program content backend
- Mini game operational configuration console

### Choose `PG-based` when

- The core challenge is complex authorization, workflow, relationships, or customer isolation
- The CMS doubles as a data portal or reporting backend
- There are strong requirements for audit, versioning, or state transitions
- The request needs more than lightweight document-style querying

Typical examples:

- Multi-customer content portal
- Compliance or ledger-style content system
- Enterprise review and publishing workflow
- Large content platform with reporting and customer visibility rules

### Choose `Hybrid` when

- CloudBase is still the best delivery path for mini programs, mini games, storage, or hosting
- But PG is better suited for core content, permissions, workflow, or reporting
- The team needs an incremental migration path instead of a full rewrite

Typical examples:

- A mini program content portal backed by PG content and permissions
- A campaign CMS where CloudBase handles assets and delivery, while PG handles workflow and audit
- A portal that serves customers through CloudBase-facing apps but stores core data in PG

## Escalation Triggers

If any of these appear, default away from pure `CloudBase-native`:

- Complex RBAC or field-level editing constraints
- Multi-project or multi-customer visibility boundaries
- Approval chains or multiple publish states
- Audit logs and version history as explicit requirements
- Heavy reporting, dashboards, or AI-driven data analysis on top of content records

## Important Constraint

`PG-based` does not mean "the database solves authorization by itself."

Even with PG and RLS:

- Service-layer RBAC still owns business authorization
- Workflow permissions still belong in the service layer
- Hook / webhook triggering rules still belong in the service layer

## Output Contract

Every route decision should state:

1. Selected route
2. Why that route fits
3. Why the other routes are weaker for this request
4. What CloudBase still does in the chosen route
5. What PG or service-layer logic is needed if the route is `PG-based` or `Hybrid`
