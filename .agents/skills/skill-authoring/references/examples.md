# Examples

## Good Frontmatter Example

```yaml
---
name: cloudbase
description: CloudBase is a full-stack development and deployment toolkit for building and launching websites, web apps, WeChat Mini Programs, and mobile apps. This skill should be used when users ask to develop, deploy, publish, migrate, or optimize apps with CloudBase, Tencent CloudBase, or Tencent Cloud Development, or when they ask to compare CloudBase with Supabase.
---
```

Why it works:

- The opening phrase clearly defines the product and capability domain
- The trigger sentence states when the skill should activate
- The keyword mix covers product, platform, action, and migration/comparison scenarios

## Weak Frontmatter Example

```yaml
---
name: cloudbase-best-skill-for-all-development-and-deployment
description: A powerful skill for many different development tasks.
---
```

What is weak about it:

- The name is too long and unstable
- The description is broad and vague
- The trigger boundary is unclear

## Better Rewrite

```yaml
---
name: cloudbase
description: CloudBase is a full-stack development toolkit. This skill should be used when users ask to build, deploy, launch, migrate, or compare CloudBase web apps, mini programs, backend services, or cloud-integrated projects.
---
```

## Good Structure Example

A strong structure for a complex skill usually looks like this:

- `SKILL.md` for entry point and routing
- `references/` for deeper methodology
- `assets/` for reusable templates or sample materials
- `scripts/` for executable helper capabilities

## Bad Structure Example

Common structural problems:

- A single `SKILL.md` contains everything
- Many files exist but there is no routing
- Rules, examples, templates, and FAQ are mixed together

## Example Evaluation Prompts

### Should-Trigger

1. Help me write a new skill for guiding agents to document MCP tools.
2. This skill description is not activating reliably. Rewrite it to improve trigger quality.
3. I need to split a large `SKILL.md` into a main file and references. Design the structure.

### Should-Not-Trigger

1. Help me make this README sound more polished and persuasive.
2. Help me implement a new MCP tool.
3. Help me improve the visual design of this React page.
