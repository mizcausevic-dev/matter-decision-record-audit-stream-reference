// reference.test.mjs — End-to-end tests for matter-decision-record-audit-stream-reference.
//
// Proves:
//   1. Orchestrator produces exactly the 7-step canonical trajectory
//   2. Every event validates against the spec's published JSON Schema
//   3. Hash chain links from genesis (64 zeros) through last event
//   4. ALL THREE spec invariants hold simultaneously (privilege-tier consistency,
//      engagement-letter binding, citation-validation-before-production-ready)
//   5. The committed example output is byte-stable across re-runs

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runEndToEnd, toNdjson } from "../src/orchestrator.mjs";
import { verifyStream } from "../src/verifier.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");
const FIXTURES = resolve(REPO_ROOT, "fixtures");
const EXAMPLE = resolve(REPO_ROOT, "examples/sample-output-stream.ndjson");

const FIXED_TS = "2026-09-12T14:30:00.000Z";

function run() {
  return runEndToEnd({
    fixturesDir: FIXTURES,
    fixedTimestamp: FIXED_TS
  });
}

test("orchestrator produces 7 canonical-trajectory events", () => {
  const events = run();
  assert.equal(events.length, 7, "canonical trajectory is 7 steps (intake → conflict → tier → brief → cite-validate → wp-stamp → priv-log)");
});

test("every event validates against the spec JSON Schema", () => {
  const events = run();
  const result = verifyStream(events);
  const schemaErrors = result.errors.filter((e) => e.includes("schema:"));
  assert.equal(schemaErrors.length, 0, `schema errors:\n${schemaErrors.join("\n")}`);
});

test("hash chain links from genesis through last event", () => {
  const events = run();
  assert.equal(events[0].prev_hash, "0".repeat(64), "first event must start from genesis");
  for (let i = 1; i < events.length; i++) {
    assert.equal(events[i].prev_hash, events[i - 1].hash, `event[${i}].prev_hash must match event[${i - 1}].hash`);
  }
});

test("ALL three spec invariants hold simultaneously", () => {
  const events = run();
  const result = verifyStream(events);
  assert.equal(result.ok, true, `verifier failed:\n${result.errors.join("\n")}`);
  assert.equal(result.errors.length, 0);
});

test("invariant #1: every WP-aware event carries a WP-compatible privilege_tier", () => {
  const events = run();
  const wpKinds = new Set(["legaltech.matter.brief-draft-generated", "legaltech.matter.citation-validated", "legaltech.matter.work-product-stamped"]);
  const allowed = new Set(["privileged", "work-product", "joint-defense", "common-interest", "pre-litigation-investigative-privilege"]);
  for (const event of events) {
    if (wpKinds.has(event.kind)) {
      assert.ok(allowed.has(event.resource.privilege_tier), `${event.kind} requires WP-compatible tier; got "${event.resource.privilege_tier}"`);
    }
  }
});

test("invariant #2: every matter-data event binds to engagement_letter_url via conflict_check", () => {
  const events = run();
  for (const event of events) {
    assert.ok(event.conflict_check?.passed_at, `${event.kind} missing conflict_check.passed_at`);
    assert.ok(event.conflict_check?.engagement_letter_url, `${event.kind} missing engagement_letter_url binding`);
  }
});

test("invariant #3: production-ready WP-stamp is preceded by citation-validation on SAME resource", () => {
  const events = run();
  const wpStamped = events.find((e) => e.kind === "legaltech.matter.work-product-stamped" && e.outcome?.recommendation === "production-ready");
  assert.ok(wpStamped, "trajectory should include a production-ready work-product-stamped event");
  const wpIdx = events.indexOf(wpStamped);
  const priorValidation = events.slice(0, wpIdx).find((e) =>
    e.kind === "legaltech.matter.citation-validated" &&
    e.resource.id_tokenized === wpStamped.resource.id_tokenized
  );
  assert.ok(priorValidation, "production-ready WP-stamp must be preceded by citation-validation on the same resource (anti-Mata-v-Avianca)");
});

test("byte-stable: re-running with same fixedTimestamp produces identical NDJSON", () => {
  const a = toNdjson(run());
  const b = toNdjson(run());
  assert.equal(a, b, "deterministic test-mode output is not byte-stable across runs");
});

test("committed example matches current emitter (regenerate with `npm run build:example` on intentional changes)", (t) => {
  if (!existsSync(EXAMPLE)) {
    t.skip("examples/sample-output-stream.ndjson not yet generated");
    return;
  }
  const expected = readFileSync(EXAMPLE, "utf8");
  const actual = toNdjson(run());
  assert.equal(actual, expected, "committed example is out of date — regenerate with `npm run build:example`");
});
