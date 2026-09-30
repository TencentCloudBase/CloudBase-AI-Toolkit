---
stage: build
interface: mcp
product:
  - functions
topic:
  - security
---

Add a security definer function `public.read_own_note(note_id text)` that returns a note only for its owner. Callers without the owner id must get no row. Do not grant the table to anonymous.
