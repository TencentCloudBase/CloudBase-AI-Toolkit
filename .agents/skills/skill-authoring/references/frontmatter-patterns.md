# Frontmatter Patterns

## Purpose

Use this reference to design or improve `SKILL.md` frontmatter with better trigger quality, discoverability, and separation from neighboring skills.

## Core Pattern

A strong `description` usually does two things:

1. Introduces the product, domain, or capability
2. States when the skill should be used with realistic trigger language

Recommended pattern:

```yaml
---
name: skill-name
description: Short domain or capability introduction. This skill should be used when users ask to ...
---
```

## Field Guidance

### `name`

Recommended:

- Short
- Stable
- Focused on the main domain, product, or task

Avoid:

- Putting every keyword into the name
- Using vague labels that overlap many unrelated skills
- Tying the name to changing implementation details

### `description`

Recommended:

- Start with what the skill is about
- Add a clear `This skill should be used when...` sentence
- Use realistic user phrasing, not only internal terminology

Avoid:

- Generic claims like "a powerful skill"
- Abstract capability words without specific scenarios
- Overly broad phrasing that catches unrelated work

## Keyword Buckets

When drafting `description`, consider these five keyword buckets:

### Brand Words

- Official product names
- Common aliases
- Chinese-English variants when relevant
- Migration or comparison neighbors

### Platform Words

- website
- web app
- dashboard
- mini program
- mobile app
- backend service

### Scenario Words

- build
- deploy
- launch
- migrate
- compare
- debug
- optimize

### Action Words

- create
- review
- rewrite
- improve
- evaluate
- structure
- split

### Capability Words

- authentication
- database
- storage
- cloud functions
- API
- AI
- routing
- references

## Precision vs. Recall

### Precision-first

Use this when accuracy matters more than broad matching:

- Focus on the main product and primary scenarios
- Keep only the most useful neighboring terms
- Reduce false positives

### Recall-first

Use this when discoverability matters more than precision:

- Add more aliases and common phrasings
- Cover broader task wording
- Accept a higher risk of accidental matches

## Rewrite Checklist

Before finalizing frontmatter, verify:

- The `name` is short and intentional
- The opening phrase clearly defines the domain
- The `This skill should be used when...` sentence uses realistic trigger wording
- The description balances brand, platform, scenario, action, and capability terms
- The boundary is explicit enough to avoid swallowing neighboring skills
- You can explain why this skill should trigger instead of a nearby alternative
