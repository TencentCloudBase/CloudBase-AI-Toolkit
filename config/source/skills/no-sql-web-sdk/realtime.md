# Realtime Database with CloudBase

CloudBase document database supports **real-time push** functionality that allows applications to listen to all update events for documents in a specified collection that match query conditions. When monitored documents undergo any changes (such as addition, modification, deletion), the client receives notifications in real-time, enabling real-time data synchronization and updates.

## Critical: The Init Event Is Your Data-Ready Signal

When you call `.watch()`, the `onChange` callback fires **immediately** with an initialization event (`snapshot.type === "init"`). This is the **only moment you receive existing data**. You MUST handle this event to populate initial state — otherwise your UI will remain empty until the next change event arrives.

```javascript
db.collection("rooms")
  .where({ roomId: currentRoomId })
  .watch({
    onChange: function(snapshot) {
      if (snapshot.type === "init") {
        // Existing data is now available in snapshot.docs
        // This is your "data ready" notification
        // snapshot.docs contains ALL matching records (no 20-record limit)
        if (snapshot.docs.length > 0) {
          // Populate your initial state from snapshot.docs[0]
          setRoomState(snapshot.docs[0]);
        } else {
          // No matching documents exist yet
          setRoomState(null);
        }
      } else {
        // Handle subsequent changes (update, add, remove)
        // Use snapshot.docs for the full current state
        // Use snapshot.docChanges for incremental diffs
        setRoomState(snapshot.docs[0]);
      }
    },
    onError: function(err) {
      console.error("Watch error", err);
    }
  });
```

Key facts about the init event:
- **`snapshot.type === "init"`** — check this field to distinguish the initial load from subsequent changes.
- **`snapshot.docs`** — contains the full query result after applying this event. On init, this is all existing matching documents.
- **No 20-record limit** — unlike `get()`, the init event returns all matching records without the default 20-record cap.
- **`snapshot.docChanges`** — every change entry has `dataType: "init"` and `queueType: "init"`.
- If you skip handling `init`, your app will not display any existing data until a write triggers a subsequent change event.

## Core Features

### Real-time Data Change Monitoring
- Listen to all change events for documents in a collection that match query conditions
- Support for all types of changes: addition, modification, deletion
- Automatically push change snapshots to clients

### Use Cases
- Chat applications
- Real-time collaborative editing
- Live interactive features
- Real-time dashboards
- Multiplayer game state synchronization

## Basic Usage

### 1. Establish Monitoring

Use the `.watch()` method on the collection reference to establish monitoring:

```javascript
// db is the database instance from cloudbase js client sdk
let currentDocs = []; // Track the latest document state

const watcher = db.collection("todos") // Specify collection
  .where({ // Specify query conditions
    status: 'active',
    priority: _.in(['high', 'medium'])
  })
  .watch({
    onChange: function(snapshot) { // Data change callback
      if (snapshot.type === "init") {
        // Initial data ready — populate state with existing documents
        currentDocs = snapshot.docs;
        console.log("Initial data loaded:", currentDocs.length, "records");
      } else {
        // Subsequent changes — snapshot.docs always contains the full current state
        currentDocs = snapshot.docs;
        // You can also inspect snapshot.docChanges for incremental diffs
        snapshot.docChanges.forEach(change => {
          console.log(`Change: dataType=${change.dataType}, queueType=${change.queueType}`);
        });
      }
      updateUI(currentDocs);
    },
    onError: function(err) { // Error handling callback
      console.error("Monitoring closed due to error", err);
    }
  });
```

### 2. Close Monitoring

When you no longer need to monitor data changes, call the `watcher.close()` method:

```javascript
// Close monitoring when page or component unmounts
watcher.close();
```

## API Details

### watch(options)

Create a real-time data listener that returns a `watcher` object.

**Parameters:**
- `options.onChange` (Function): Callback function when data changes
- `options.onError` (Function): Callback function when monitoring encounters an error

**onChange callback parameter snapshot:**
```javascript
{
  type: "init",            // Snapshot type; "init" on first callback, undefined on subsequent changes
  id: 1,                   // Change event ID (number, increments)
  docChanges: [
    {
      id: 1,
      dataType: 'init' | 'update' | 'replace' | 'add' | 'remove' | 'limit',
      queueType: 'init' | 'update' | 'enqueue' | 'dequeue',
      docId: 'document-id',
      doc: { /* Document content after change */ },
      updatedFields: { /* Only on update/replace: changed field paths → new values */ },
      removedFields: [ /* Only on update/replace: deleted field paths */ ]
    },
    // More changes...
  ],
  docs: [ // Full query result after applying this event (ALL records on init, no 20-limit)
    // Document content...
  ]
}
```

**snapshot.type values:**
- `"init"`: First callback — existing data is ready in `snapshot.docs`
- Subsequent callbacks do not set `type` to a special value; check `docChanges[i].dataType` instead.

**docChanges dataType values:**
- `init`: Initialization — all existing matching documents (only on first callback)
- `update`: Document content partially updated
- `replace`: Document content replaced (via `.set()`)
- `add`: New document added
- `remove`: Document deleted
- `limit`: Record entered/left the list due to `limit` + ordering (not a record change)

**docChanges queueType values:**
- `init`: Initializing the monitored list (only on first callback)
- `update`: Record in the list was updated, list membership unchanged
- `enqueue`: Record entered the monitored list
- `dequeue`: Record left the monitored list

**Common dataType × queueType combinations:**

| dataType | queueType | Meaning |
|----------|-----------|---------|
| `init` | `init` | Initial data when watch starts |
| `update` | `update` | Record updated, stays in list |
| `update` | `enqueue` | Record updated, enters list |
| `update` | `dequeue` | Record updated, leaves list |
| `replace` | `update` | Record replaced, stays in list |
| `replace` | `enqueue` | Record replaced, enters list |
| `replace` | `dequeue` | Record replaced, leaves list |
| `add` | `enqueue` | New record added to list |
| `remove` | `dequeue` | Record removed from list |

**Watcher object methods:**
- `watcher.close()`: Close monitoring and release resources

## Best Practices

### 1. Specific Query Conditions

Set as specific query conditions as possible in the `.where()` method to monitor only the data changes you truly need:

```javascript
// Recommended: Specific query conditions
db.collection("messages")
  .where({
    chatRoomId: currentChatRoomId,
    isDeleted: false
  })
  .watch({...});

// Not recommended: Monitoring entire collection
db.collection("messages").watch({...});
```

### 2. Close Monitoring in a Timely Manner

Be sure to close monitoring when pages or components unmount to prevent memory leaks:

**React Component Example:**
```javascript
import { useEffect, useState } from 'react';

function ChatRoom({ roomId }) {
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    const watcher = db.collection("messages")
      .where({ chatRoomId: roomId })
      .watch({
        onChange: function(snapshot) {
          if (snapshot.type === "init") {
            // Populate initial state from existing data
            setMessages(snapshot.docs);
          } else {
            // Update state with the latest full snapshot
            setMessages(snapshot.docs);
          }
        },
        onError: function(err) {
          console.error("Watch error", err);
        }
      });

    // Close monitoring when component unmounts
    return () => {
      watcher.close();
    };
  }, [roomId]);
}
```

## Common Pitfalls

### 1. Not Handling the Init Event

The most common mistake is treating `onChange` as only a "change" handler and ignoring the initial callback. Without handling `snapshot.type === "init"`, your app will not display any existing data.

```javascript
// WRONG: Only reacts to changes, never shows existing data
db.collection("rooms").where({ roomId }).watch({
  onChange: (snapshot) => {
    // This fires on init too, but if you only look at docChanges
    // without checking snapshot.type, you'll miss existing data
    snapshot.docChanges.forEach(change => {
      if (change.dataType === "update") { // Misses init!
        setRoom(change.doc);
      }
    });
  }
});

// CORRECT: Handle init to populate initial state, then process changes
db.collection("rooms").where({ roomId }).watch({
  onChange: (snapshot) => {
    // snapshot.docs always has the full current state
    if (snapshot.docs.length > 0) {
      setRoom(snapshot.docs[0]);
    }
  }
});
```

### 2. Using get() Before watch() for Initial Data

Do not issue a separate `get()` call to load initial data before `watch()`. The `watch()` init event already delivers all matching documents. A separate `get()` introduces a race condition and an extra round-trip.

```javascript
// WRONG: Redundant get() before watch
const initial = await db.collection("rooms").where({ roomId }).get();
setRoom(initial.data[0]);
db.collection("rooms").where({ roomId }).watch({ ... });

// CORRECT: watch() delivers initial data via init event
db.collection("rooms").where({ roomId }).watch({
  onChange: (snapshot) => {
    setRoom(snapshot.docs[0] || null);
  }
});
```

### 3. Watch Record Limit

A single `watch()` instance monitors up to **5,000 records**. If the matching result set exceeds this limit, the watch will throw an error and stop. Use specific `.where()` conditions to narrow the result set.