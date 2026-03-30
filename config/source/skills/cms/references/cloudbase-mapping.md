# CloudBase and PG Mapping

Use this reference after the route and archetype are chosen.

## Purpose

This file assigns responsibilities to CloudBase, PG, and the service layer so the design stays realistic and maintainable.

## CloudBase Responsibilities

CloudBase is strongest when handling:

- Mini program and mini game delivery
- Static hosting and website delivery
- Cloud storage for media and exported files
- Cloud functions for integration, orchestration, and lightweight hooks
- Campaign and configuration-oriented content backends
- Tencent ecosystem integration

Use `CloudBase-native` by default for:

- Lightweight content systems
- Campaign operations
- Mini program / mini game configuration
- Fast MVP delivery

## PG Responsibilities

PG is strongest when handling:

- Complex content relationships
- Multi-project or multi-customer isolation
- Workflow state persistence
- Audit logs and version history
- Complex querying and reporting
- Stronger permission primitives through relational modeling and RLS

Use `PG-based` or `Hybrid` by default for:

- Portals with customer-visible data
- Compliance-like or ledger-like systems
- Enterprise approval flows
- Reporting-heavy CMS platforms

## Service-Layer Responsibilities

Always keep these in the service layer:

- CMS RBAC and policy decisions
- Status transition permissions
- Field editability rules
- Bulk actions
- Hook / webhook triggering policies
- AI summary, report generation, and orchestration

Do not rely on:

- CloudBase security rules alone
- PG/RLS alone

to fully express CMS authorization behavior.

## Route Templates

### CloudBase-native

- Content and config documents -> CloudBase collections or managed content structures
- Media -> Cloud Storage
- Hook execution -> Cloud Functions
- Delivery -> mini program, mini game, static hosting, or admin frontend on CloudBase

### PG-based

- Core content records -> PG
- Roles, memberships, and policies -> PG + service authz
- Workflow and audit -> PG
- Delivery frontends -> separate app or service, optionally still integrated with CloudBase-facing channels

### Hybrid

- Core relational data, workflows, and permissions -> PG
- Assets, mini program delivery, campaign distribution, and Tencent-facing endpoints -> CloudBase
- Service layer bridges the two systems

## Practical Recommendation

If the team asks "Can we publish now without PG?":

- Yes, for CloudBase-native scenarios
- No, if they expect complex enterprise-grade authorization and workflow from day one

If the team asks "Will PG fix CMS permissions automatically?":

- No, but it improves the data layer significantly
- Service-layer authorization still remains required
