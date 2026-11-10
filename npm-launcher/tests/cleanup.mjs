#!/usr/bin/env node
"use strict";

import fs from "node:fs";

// A detached background updater can still hold a handle on the temp root when
// the suite finishes. On Windows that turns rmSync into EBUSY and would fail a
// run whose assertions all passed. Retry briefly, then leave the directory for
// the OS temp cleanup instead of turning a green suite red.
export function removeTempRoot(root) {
  const wait = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  for (let i = 0; i < 10; i++) {
    try {
      fs.rmSync(root, { recursive: true, force: true });
      return;
    } catch (err) {
      if (!["EBUSY", "EPERM", "ENOTEMPTY", "EACCES"].includes(err.code)) throw err;
      wait(250);
    }
  }
  console.log(`SKIP  cleanup ${root}: directory still locked after 10 retries`);
}
