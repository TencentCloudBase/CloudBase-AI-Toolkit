# CloudBase PG Realtime

`app.realtime()` is the PostgreSQL-mode realtime surface. It is Supabase-Realtime compatible and ships three primitives:

| Primitive | Listen type | Use for |
| --- | --- | --- |
| Broadcast | `broadcast` | Ephemeral in-channel messages, signaling, cursors, actions |
| Presence | `presence` | Who is on a channel; join / leave |
| Postgres CDC | `postgres_changes` | Reacting to `INSERT` / `UPDATE` / `DELETE` on business tables |

It is **not** the document-database `collection.watch()` path. See "Not the same as `watch()`" below.

## Step 0 — Probe the environment before writing any code

Realtime is not enabled on every environment yet. Run this **first**, via `queryPgDatabase` with `action=sql`:

```sql
SELECT
  (SELECT count(*) FROM pg_namespace WHERE nspname = 'realtime') AS has_realtime_schema,
  (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'realtime') AS realtime_table_cnt;
```

- `has_realtime_schema >= 1` → enabled. Continue.
- `has_realtime_schema = 0` → **not enabled**. Stop here. Do not write realtime code, do not try to enable it yourself, and do not substitute a hand-rolled polling loop. Tell the user the current environment has no realtime schema (the capability is not generally available yet) and let them file a capability request at the CloudBase developer community: <https://cnb.cool/tencent/cloud/cloudbase/community/-/issues>

Do **not** gate on `pg_publication LIKE 'cloudbase_realtime%'`. A publication count of `0` is normal — it only means no table has CDC enabled yet.

Once the schema exists, confirm the shape you will rely on:

```sql
SELECT table_name FROM information_schema.tables WHERE table_schema = 'realtime';
-- expect messages, subscription, schema_migrations
```

## Not the same as `watch()`

Two independent modules. They do **not** replace each other:

| You want | Module | Register | Call |
| --- | --- | --- | --- |
| Document-database collection changes | `@cloudbase/js-sdk/realtime` | `registerRealtime` | `collection.watch()` |
| Broadcast / Presence / Postgres CDC | `@cloudbase/js-sdk/realtime-js` | `registerRealtimeJs` | `app.realtime()` |

Full-import users get both registered automatically. On-demand imports must register only the one they use. Never answer a realtime question with `watch()` code without confirming which database model the project uses.

## Channel lifecycle

```js
const realtime = app.realtime();
const channel = realtime.channel("room:42", { config: { private: true } });

channel
  .on("broadcast", { event: "move" }, (payload) => { /* ... */ })
  .on("presence", { event: "sync" }, () => channel.presenceState())
  .on("presence", { event: "join" }, ({ newPresences }) => { /* ... */ })
  .on("presence", { event: "leave" }, ({ leftPresences }) => { /* ... */ })
  .subscribe(async (status, err) => {
    if (status === "SUBSCRIBED") await channel.track({ user_id: 1, name: "Ada" });
    if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") console.error(status, err);
  });
```

Rules that the SDK does not enforce for you:

- **Bind `presence` and `postgres_changes` listeners before `subscribe()`.** Broadcast handlers may be added later; these two may not.
- `send()` / `track()` are only valid after `SUBSCRIBED`.
- Always clean up, or you leak connections: `await channel.unsubscribe()` then `await realtime.removeChannel(channel)`. Use `realtime.removeAllChannels()` to tear everything down.
- The same `app` instance reuses one realtime client.
- Node.js needs the optional `ws` dependency. WeChat mini programs must use `app.realtime()` — never `new RealtimeClient()` — and need a base library supporting `wx.connectSocket`.

## Delivery guarantees — treat Broadcast as fire-and-forget

Defaults are `broadcast: { ack: false, self: false }`:

- `ack: false` → `send()` resolves **without** waiting for server confirmation.
- `self: false` → the sender does not receive its own message.
- There is no ordering guarantee across messages.

For any state that must converge (turns, scores, board state), do **not** treat a received message as the source of truth:

1. Persist authoritative state in PostgreSQL (`app.rdb()`).
2. Broadcast carries only a "changed" hint plus a monotonic sequence number.
3. On a gap, out-of-order arrival, or `resubscribe`, re-read the snapshot from the database instead of replaying a message log.
4. **Connection hot-cut**: CloudBase keeps a ~270s dual-connection hot-cut to stay under the gateway connection lifetime. A message lost during a cut is indistinguishable from one never sent, so the sequence-plus-snapshot rule above is mandatory, not optional.

Set `ack: true` only where an occasional extra round trip is acceptable.

## Private channels and authorization

`config.private: false` is the default. With a public channel the RLS layer is **not** consulted: anyone who knows or guesses the topic can subscribe and send. For room-scoped game or user data that is unacceptable — `private: true` is required.

`private: true` routes authorization through RLS on `realtime.messages`, which the platform already creates with `topic`, `extension` (`broadcast` / `presence`), `payload`, `event`, `private` columns and RLS **enabled with zero policies**. Zero policies means deny: you must add the policies yourself or every private subscribe and send is rejected.

The helper `realtime.topic()` resolves to `current_setting('realtime.topic')`. Because the SDK prepends `realtime:` when it creates the channel, normalize before comparing:

```sql
-- Members of a room may read its channel
CREATE POLICY realtime_room_read ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    extension IN ('broadcast', 'presence')
    AND EXISTS (
      SELECT 1 FROM public.room_members m
      WHERE m.topic = replace(realtime.topic(), 'realtime:', '')
        AND m.user_id = auth.uid()
    )
  );

-- ...and may write to it
CREATE POLICY realtime_room_write ON realtime.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    extension IN ('broadcast', 'presence')
    AND EXISTS (
      SELECT 1 FROM public.room_members m
      WHERE m.topic = replace(realtime.topic(), 'realtime:', '')
        AND m.user_id = auth.uid()
    )
  );
```

- `USING` gates receiving; `WITH CHECK` gates sending. Both are needed.
- Keep the `extension IN (...)` clause so a broadcast policy cannot silently authorize presence, or the reverse.
- Membership is read from a business table, never from a client-supplied field.
- If a private `subscribe()` or `send()` is rejected after you added policies, first verify the topic string form actually matches (temporarily log `realtime.topic()`), then treat a persistent rejection as a platform-side question rather than working around it in client code.
- CloudBase driver code can also publish from SQL: `realtime.send(payload, event, topic, private)` — note `private` defaults to `true`, so recipients must be on a private channel.

`realtime.subscription` records active subscriptions — useful when debugging, and readable by `anon` / `authenticated`:

```sql
SELECT entity, filters, claims_role, created_at
FROM realtime.subscription ORDER BY created_at DESC;
```

## Postgres CDC — database-side setup

`postgres_changes` rides on logical replication. Publishing a table requires all of the following; skip any one and **the subscription succeeds but no events ever arrive**, which is easy to misread as an SDK bug.

```sql
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'cloudbase_realtime') THEN
    CREATE PUBLICATION cloudbase_realtime;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'cloudbase_realtime' AND schemaname = 'public' AND tablename = 'todos'
  ) THEN
    EXECUTE 'ALTER PUBLICATION cloudbase_realtime ADD TABLE public.todos';
  END IF;
END $$;

GRANT SELECT ON public.todos TO "cloudbase_realtime_admin";
ALTER TABLE public.todos REPLICA IDENTITY FULL;

GRANT SELECT ON public.todos TO anon, authenticated;
ALTER TABLE public.todos ENABLE ROW LEVEL SECURITY;
CREATE POLICY todos_select ON public.todos FOR SELECT TO authenticated
  USING (owner_id = auth.uid());
```

- The `GRANT` to `cloudbase_realtime_admin` is the connector role that reads the WAL. Without it the poller sees nothing.
- `REPLICA IDENTITY FULL` is what makes `payload.old` populated for `UPDATE` / `DELETE`. Omitting it is the usual cause of "`old_record` is empty".
- Change events are filtered **per subscriber** by the business table's own RLS, so the table needs RLS plus `SELECT` for the subscribing role. Without a `SELECT` grant the client subscription is rejected outright.
- Subscription role comes from the JWT: `anon` / `authenticated` / `service_role`.
- Adding a table takes roughly **10 seconds** to start delivering — the poller notices publication changes on its next cycle. Do not "fix" it by redeploying.
- Inspect what is currently published: `SELECT schemaname, tablename FROM pg_publication_tables WHERE pubname = 'cloudbase_realtime';`
- Remove one table with `ALTER PUBLICATION cloudbase_realtime DROP TABLE public.todos;`. `DROP PUBLICATION` removes every table at once. Never delete replication slots manually — the server manages them.

Client side:

```js
channel.on("postgres_changes", { event: "UPDATE", schema: "public", table: "users", filter: "username=eq.Ada" },
  (payload) => console.log(payload.new, payload.old));

// Reduce payload size; only the listed columns arrive in payload.new
channel.on("postgres_changes", { event: "*", schema: "public", table: "users", select: ["id", "first_name"] },
  (payload) => console.log(payload));
```

- `postgresChangesFilter()` from `@cloudbase/js-sdk/realtime-js` builds the same wire format as the raw string (`eq`, `neq`, `lt` / `lte` / `gt` / `gte`, `in`, `like` / `ilike`, `is`, `match` / `imatch`, `isdistinct`; `not.` prefix or `.not(...)` to negate; commas = AND).
- Filtering happens server-side over a single table's WAL: there is no resource embedding (`!inner`) and no `or()` grouping. `like` / `ilike` use `%`, not `*`.
- To delay `SUBSCRIBED` until the server confirms the CDC subscription is ready, set `config: { postgres_changes_options: { wait: true, timeout: 15000 } }`.

## What this can and cannot carry

Choose the integration shape from the game's synchronization model, not from the size of the codebase:

- **Event-driven turn-based** (board games, quizzes, asynchronous duels): fits directly. Broadcast the action, persist authoritative state to PostgreSQL, let CDC or a follow-up read drive the UI, Presence handles the lobby. This is the shape both the platform docs and the wider ecosystem target.
- **Low-frequency state sync** (grid movement, simple arena): workable at modest rates with client-side interpolation, but loss and latency handling must be written by hand — see the delivery-guarantee rules above.
- **High-frequency deterministic combat** (fighting, MOBA, FPS, frame-precise platformers): not this. Broadcast is a fire-and-forget hint channel; authoritative loop, frame sync and rollback need a dedicated game server. Do not promise this shape.

Published rate limits, per-channel message rates and payload ceilings are **not** documented. Measure them in the target environment before committing to a design; do not assume a number.

## Verification checklist

1. Step 0 probe returns `has_realtime_schema >= 1`.
2. Correct module registered; `watch()` code not mixed in.
3. `presence` / `postgres_changes` bound before `subscribe()`, and the client actually reaches `SUBSCRIBED`.
4. A round-trip message is observed by a second client (remember `self: false`).
5. Private channel: policies exist on `realtime.messages`, and a non-member is actually rejected.
6. CDC: table present in `pg_publication_tables`, `REPLICA IDENTITY FULL` set, connector and subscriber grants present, and an `UPDATE` actually arrives with `payload.old` populated.
7. Channels and the realtime client are released on teardown.
