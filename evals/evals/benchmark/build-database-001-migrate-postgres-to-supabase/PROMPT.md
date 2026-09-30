---
stage: build
interface: mcp
product:
  - database
topic:
  - sdk
---

Create `teams`, `members`, and `tasks` in `public`. `members.team_id` references `teams.id`. `tasks.member_id` references `members.id`.
