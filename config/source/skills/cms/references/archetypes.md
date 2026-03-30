# CMS Archetypes

Choose an archetype before designing fields or APIs.

## Purpose

A good CMS design usually belongs to a small number of repeatable patterns. Reuse these archetypes instead of treating each request as a custom platform.

## Archetype 1: `collection-cms`

Best for:

- Blogs
- News and articles
- Event pages
- Cases, resources, FAQs, announcements

Core objects:

- Content entry
- Category
- Tag
- Author
- Media assets
- SEO metadata
- Publish state

Common outputs:

- Content model
- Taxonomy model
- Publishing flow
- Public content API

## Archetype 2: `page-builder-cms`

Best for:

- Official websites
- Landing pages
- Campaign pages
- Microsites

Core objects:

- Page
- Section or block
- Navigation
- Theme or layout settings
- Preview configuration

Common outputs:

- Block schema
- Page composition rules
- Preview / publish flow
- Website delivery path

## Archetype 3: `campaign-cms`

Best for:

- Campaign operations
- Mini program campaign pages
- Mini game activity configuration
- Event and reward operations

Core objects:

- Campaign
- Activity page
- Popup / banner / CTA
- Reward rules
- Task definitions
- Schedule and channel visibility

Common outputs:

- Campaign config schema
- Operational lifecycle
- Hook/webhook plan
- Delivery to mini program or mini game

## Archetype 4: `portal-cms`

Best for:

- Customer-facing content portals
- Project-based document portals
- Reporting-oriented content backends

Core objects:

- Workspace or project
- Customer-visible entry
- Access policy
- View model
- Report and export configuration

Common outputs:

- Project/customer visibility model
- Portal access model
- Content + reporting integration
- PG-based or Hybrid route recommendation

## Choosing Between Archetypes

Use this shortcut:

- Repeated article-like records -> `collection-cms`
- Page composition and blocks -> `page-builder-cms`
- Operations and campaign configuration -> `campaign-cms`
- Customer/project visibility and reporting -> `portal-cms`

If a request spans more than one archetype:

1. Choose the primary archetype first
2. Add secondary snippets instead of merging archetypes into a vague custom category

## Mapping Notes

- `collection-cms` and `campaign-cms` fit `CloudBase-native` most often
- `portal-cms` is the strongest signal for `PG-based` or `Hybrid`
- `page-builder-cms` can be either `CloudBase-native` or `Hybrid` depending on workflow and permission complexity
