#!/usr/bin/env node
/**
 * Retest that ~/.config/.cloudbase/auth.json stays a single flat credential.
 *
 * Default (no network):
 *   The file must parse, the top-level credential must resolve to secretId
 *   and secretKey, and it must not contain domestic/intl keys. A missing
 *   file or a still-slotted credential exits 1.
 *
 * FLAT_AUTH_LIVE=1:
 *   After the shape check, call CheckTcbService once with the credential
 *   already on disk. If there is no usable credential, skip and exit 0.
 *   A slotted file still fails. This never starts device or web login and
 *   never writes config.json.
 *
 * Usage:
 *   npm run test:auth:flat
 *   FLAT_AUTH_LIVE=1 npm run test:auth:flat
 *   TCB_SITE=intl FLAT_AUTH_LIVE=1 npm run test:auth:flat
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CloudApiService } from "@cloudbase/cloud-api";
import { cloudbaseConfigDir, resolveCredential } from "@cloudbase/toolbox";

const live = process.env.FLAT_AUTH_LIVE === "1";
const authPath = join(cloudbaseConfigDir, "auth.json");

function log(message) {
  console.log(`[flat-auth] ${message}`);
}

function fail(message) {
  console.error(`[flat-auth] ${message}`);
  process.exitCode = 1;
}

function liveRegion() {
  if (process.env.TCB_REGION) return process.env.TCB_REGION;
  if (process.env.TCB_SITE === "intl") return "ap-singapore";
  return "ap-shanghai";
}

function readAuthFile() {
  if (!existsSync(authPath)) {
    return { missing: true };
  }
  try {
    return { parsed: JSON.parse(readFileSync(authPath, "utf8")) };
  } catch (error) {
    return { error };
  }
}

function inspectCredential(parsed) {
  const credential = parsed?.credential;
  if (!credential || typeof credential !== "object" || Array.isArray(credential)) {
    return { kind: "empty" };
  }
  if ("domestic" in credential || "intl" in credential) {
    return { kind: "slotted" };
  }
  const resolved = resolveCredential(credential);
  if (!resolved?.secretId || !resolved?.secretKey) {
    return { kind: "empty" };
  }
  return { kind: "flat", resolved };
}

async function checkLive(resolved) {
  const region = liveRegion();
  const service = new CloudApiService({
    service: "tcb",
    timeout: 15000,
    credential: {
      secretId: resolved.secretId,
      secretKey: resolved.secretKey,
      token: resolved.token,
    },
  });
  await service.request({ region, action: "CheckTcbService" });
  log(`CheckTcbService accepted the flat credential (${region})`);
}

async function main() {
  const loaded = readAuthFile();
  if (loaded.error) {
    fail(`cannot parse ${authPath}`);
    return;
  }
  if (loaded.missing) {
    if (live) {
      log("no auth.json; live check skipped");
      return;
    }
    fail(`missing ${authPath}`);
    return;
  }

  const inspected = inspectCredential(loaded.parsed);
  if (inspected.kind === "slotted") {
    fail("credential is still slotted (domestic/intl); expected one flat record");
    return;
  }
  if (inspected.kind === "empty") {
    if (live) {
      log("no usable credential; live check skipped");
      return;
    }
    fail("flat credential has no secretId/secretKey");
    return;
  }

  log("auth.json is a single flat credential");
  if (!live) return;

  try {
    await checkLive(inspected.resolved);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fail(`CheckTcbService failed: ${message}`);
  }
}

await main();
