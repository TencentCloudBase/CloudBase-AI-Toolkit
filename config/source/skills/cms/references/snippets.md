# Snippets

Use these fixed building blocks after selecting the route and archetype.

## Core Field Snippets

### Identity and SEO

- `title`
- `slug`
- `summary`
- `seoTitle`
- `seoDescription`

### Publishing

- `status`
- `publishedAt`
- `scheduledAt`
- `reviewedBy`

### Ownership and audit

- `author`
- `editor`
- `createdAt`
- `updatedAt`
- `changeNote`

### Taxonomy

- `categoryIds`
- `tagIds`

### Media

- `cover`
- `gallery`
- `attachments`

### Visibility

- `workspaceId`
- `projectId`
- `channel`
- `locale`
- `audience`

## Workflow Snippets

### Basic publish workflow

- `draft`
- `review`
- `published`
- `archived`

Recommended when:

- The team has editors and reviewers
- The user asks for preview or approval

### Campaign schedule workflow

- `draft`
- `ready`
- `live`
- `ended`

Recommended when:

- The request involves mini program or mini game operations
- Timing and channel visibility matter

## Permission Snippets

### Lightweight roles

- `admin`
- `editor`
- `operator`

Use for `CloudBase-native` when:

- Role boundaries are simple
- Complex field-level editing is not needed

### Extended roles

- `admin`
- `editor`
- `reviewer`
- `operator`
- `customerViewer`

Use for `PG-based` or `Hybrid` when:

- The request includes review or external customer visibility

## Hook and Webhook Snippets

### Content publish hooks

- Refresh cache
- Rebuild static pages
- Notify downstream systems

### Campaign hooks

- Activate rewards
- Push schedules to runtime config
- Trigger content distribution updates

### Reporting hooks

- Generate summary snapshots
- Queue report exports
- Trigger AI summary generation

## Use Rules

- Prefer a small number of stable snippets
- Do not generate exotic field sets unless the user needs them
- Escalate to `PG-based` or `Hybrid` when snippets imply customer isolation, audit, or complex workflow
