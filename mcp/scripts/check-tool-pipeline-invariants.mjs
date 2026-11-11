#!/usr/bin/env node
/**
 * Static invariants for the tool registration pipeline.
 *
 * These rules are written against the AST, not against comments or naming
 * conventions. The predicates are deliberately narrow: a gate is allowed to
 * live inside an `if` (that is how it decides), it just may not be gated by an
 * optional feature switch, and the pipeline install itself may not be wrapped
 * in any conditional at all.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const MCP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVER_FILE = path.join(MCP_DIR, "src/server.ts");
const WRAPPER_FILE = path.join(MCP_DIR, "src/utils/tool-wrapper.ts");

const INSTALL_NAMES = new Set(["installToolPipeline", "wrapServerWithTelemetry"]);
const OPTIONAL_SWITCHES = /telemetryEnabled|enableTelemetry|reportToolCall/;
const INSTALL_TOGGLE = /^(enabled|enable|install|shouldInstall|skip|mount|disable)/i;

const failures = [];
const fail = (message) => failures.push(message);

function parse(file) {
  const text = fs.readFileSync(file, "utf8");
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function walk(node, visit, ancestors = []) {
  visit(node, ancestors);
  const next = [...ancestors, node];
  node.forEachChild((child) => walk(child, visit, next));
}

function isConditionalAncestor(node) {
  if (
    ts.isIfStatement(node) ||
    ts.isConditionalExpression(node) ||
    ts.isSwitchStatement(node)
  ) {
    return true;
  }
  if (ts.isBinaryExpression(node)) {
    const kind = node.operatorToken.kind;
    if (kind === ts.SyntaxKind.AmpersandAmpersandToken || kind === ts.SyntaxKind.BarBarToken) {
      return true;
    }
  }
  return false;
}

function calleeName(node, source) {
  return node.expression.getText(source);
}

// --- Rule 1-3: the pipeline is installed once, unconditionally -----------------
const serverSource = parse(SERVER_FILE);
let factory = null;

walk(serverSource, (node, ancestors) => {
  if (factory) return;
  const isNamedDeclaration =
    (ts.isFunctionDeclaration(node) && node.name?.text === "createCloudBaseMcpServer") ||
    (ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "createCloudBaseMcpServer");
  if (isNamedDeclaration) factory = { node, depth: ancestors.length };
});

if (!factory) {
  fail("cannot locate createCloudBaseMcpServer in mcp/src/server.ts");
} else {
  let installs = 0;
  walk(serverSource, (node, ancestors) => {
    if (!ts.isCallExpression(node)) return;
    if (!INSTALL_NAMES.has(calleeName(node, serverSource))) return;

    const factoryIndex = ancestors.indexOf(factory.node);
    if (factoryIndex === -1) return;
    installs += 1;

    const inner = ancestors.slice(factoryIndex + 1);
    const conditional = inner.find(isConditionalAncestor);
    if (conditional) {
      fail(
        `pipeline install is inside a ${ts.SyntaxKind[conditional.kind]}; ` +
          "it must not depend on any optional switch",
      );
    }

    for (const arg of node.arguments) {
      if (!ts.isObjectLiteralExpression(arg)) continue;
      for (const property of arg.properties) {
        const name = property.name?.getText(serverSource) ?? "";
        if (INSTALL_TOGGLE.test(name)) {
          fail(`pipeline install receives an install-toggle argument: ${name}`);
        }
      }
    }
  });

  if (installs !== 1) {
    fail(`expected exactly 1 pipeline install in the factory, found ${installs}`);
  }
}

// --- Rule 4-5: gates exist, and their predicates do not read optional switches -
const wrapperSource = parse(WRAPPER_FILE);
const counts = { shouldRegisterTool: 0, guardCredentialWrite: 0, guardDestructiveAction: 0 };

walk(wrapperSource, (node, ancestors) => {
  if (!ts.isCallExpression(node)) return;
  const name = calleeName(node, wrapperSource);
  if (!(name in counts)) return;
  counts[name] += 1;

  if (name !== "shouldRegisterTool") return;
  for (const ancestor of ancestors) {
    if (!ts.isIfStatement(ancestor)) continue;
    const condition = ancestor.expression.getText(wrapperSource);
    if (OPTIONAL_SWITCHES.test(condition)) {
      fail(`registration gate predicate is controlled by an optional switch: ${condition}`);
    }
  }
});

for (const [name, count] of Object.entries(counts)) {
  if (count === 0) fail(`${name} is missing from the registration pipeline`);
}

if (failures.length > 0) {
  console.error("tool pipeline invariants FAILED");
  for (const message of failures) console.error(`  - ${message}`);
  process.exit(1);
}

console.log(
  `tool pipeline invariants OK (1 install, gates: ${JSON.stringify(counts)})`,
);
