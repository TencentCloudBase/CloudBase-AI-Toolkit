# CloudBase PG Mode Overview

CloudBase PG mode is a Postgres-Native environment mode. It is not simply "adding a PostgreSQL instance" to a legacy environment.

## Environment facts

- PG mode is selected when creating a new CloudBase environment with PostgreSQL.
- Legacy environments cannot be upgraded in place to PG mode. If `RuntimeBackends.postgresql !== true`, use the matching legacy NoSQL/MySQL skill or create/select a PG-mode environment.
- In PG mode, PostgreSQL is the unified runtime for:
  - `public` schema: business tables.
  - `auth` schema: user data and JWT identity.
  - `storage` schema: bucket/object metadata.
- PG and NoSQL can coexist. Existing NoSQL collections keep using NoSQL APIs; new business data explicitly requested in PG should use PG APIs.

## Core access paths

- Web / frontend SDK: `app.rdb().from('<table>')`.
- MCP management: `queryPgDatabase` / `managePgDatabase`.
- REST fallback: PostgREST-compatible `/v1/rdb/rest/<table>`.
- Storage: `app.storage.from('<bucket>').upload('<key>', file)` against a PG storage bucket.

## Role and schema vocabulary

- `anon`: requests backed by Publishable Key / anonymous identity.
- `authenticated`: requests backed by a logged-in user's access token.
- `service_role`: API Key / privileged service role; bypasses RLS and must stay server-side only.
- `auth.uid()`: current JWT `sub`.
- `auth.role()`: current database role.
- `auth.jwt()`: full JWT claims.
- `auth.email()`: current user email when available.

## Common fit

Prefer PG mode for structured relational data, joins, transactions, row-level permission modeling, `pgvector` / SQL extensions, and apps that benefit from PostgREST and SQL-native authorization.
