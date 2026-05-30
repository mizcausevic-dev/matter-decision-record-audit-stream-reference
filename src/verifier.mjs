// verifier.mjs — Re-run the spec's verifier logic on our own output.
//
// This is the "closing the loop" step: the same 3 invariants the spec
// publishes are what we run on our own emitted stream. A green CI on this
// repo is evidence the spec's three invariants are MUTUALLY achievable, not
// just individually checkable.
//
// Mirrors the FHIR ref impl's verifier pattern but with LegalTech's three
// orthogonal invariants instead of FHIR's single (chain only) check.

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = resolve(HERE, "../schema/matter-decision-event.schema.json");

const ZERO_HASH = "0".repeat(64);

const MATTER_DATA_KINDS = new Set([
  "legaltech.matter.intake-document-read",
  "legaltech.matter.recommendation-produced",
  "legaltech.matter.brief-draft-generated",
  "legaltech.matter.citation-validated",
  "legaltech.matter.opposing-party-data-quarantined",
  "legaltech.matter.privilege-log-entry-created",
  "legaltech.matter.work-product-stamped",
  "legaltech.matter.cross-matter-search-issued",
  "legaltech.matter.disclosure-to-tribunal-recommended"
]);

const WORK_PRODUCT_AWARE_KINDS = new Set([
  "legaltech.matter.brief-draft-generated",
  "legaltech.matter.citation-validated",
  "legaltech.matter.work-product-stamped"
]);

const ALLOWED_WP_TIERS = new Set([
  "privileged", "work-product", "joint-defense", "common-interest", "pre-litigation-investigative-privilege"
]);

function canonicalize(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalize(value[k])).join(",") + "}";
}
const sha256Hex = (s) => createHash("sha256").update(s, "utf8").digest("hex");

let _validator = null;
function getValidator() {
  if (_validator) return _validator;
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  _validator = ajv.compile(schema);
  return _validator;
}

export function verifyStream(events) {
  const errors = [];
  const validate = getValidator();

  // Pass 1: schema + hash chain (canonical-JSON SHA-256, prev_hash linkage)
  let prev = ZERO_HASH;
  events.forEach((event, idx) => {
    if (!validate(event)) {
      for (const e of validate.errors || []) {
        errors.push(`event[${idx}] (${event.event_id}) schema: ${e.instancePath} ${e.message}`);
      }
    }
    if (event.prev_hash !== prev) {
      errors.push(`event[${idx}] (${event.event_id}) chain: prev_hash=${event.prev_hash} expected=${prev}`);
    }
    const { hash, ...rest } = event;
    const recomputed = sha256Hex(canonicalize(rest));
    if (hash !== recomputed) {
      errors.push(`event[${idx}] (${event.event_id}) chain: hash=${hash} recomputed=${recomputed}`);
    }
    prev = event.hash;
  });

  // Pass 2: spec invariants (1) privilege-tier consistency on WP-aware kinds
  for (const [idx, event] of events.entries()) {
    if (WORK_PRODUCT_AWARE_KINDS.has(event.kind)) {
      if (!ALLOWED_WP_TIERS.has(event.resource?.privilege_tier)) {
        errors.push(`event[${idx}] (${event.event_id}) invariant#1 privilege-tier: kind=${event.kind} requires tier in {${[...ALLOWED_WP_TIERS].join(", ")}}, got "${event.resource?.privilege_tier}"`);
      }
    }
  }

  // Pass 2: spec invariant (2) engagement-letter binding on matter-data kinds
  for (const [idx, event] of events.entries()) {
    if (MATTER_DATA_KINDS.has(event.kind)) {
      if (!event.conflict_check?.passed_at || !event.conflict_check?.engagement_letter_url) {
        errors.push(`event[${idx}] (${event.event_id}) invariant#2 engagement-letter: kind=${event.kind} requires conflict_check.passed_at + conflict_check.engagement_letter_url`);
      }
    }
  }

  // Pass 2: spec invariant (3) citation-validation-before-production-ready
  for (const [idx, event] of events.entries()) {
    if (event.kind === "legaltech.matter.work-product-stamped" && event.outcome?.recommendation === "production-ready") {
      const resourceId = event.resource?.id_tokenized;
      const prior = events.slice(0, idx).filter((e) =>
        e.kind === "legaltech.matter.citation-validated" &&
        e.resource?.id_tokenized === resourceId
      );
      if (prior.length === 0) {
        errors.push(`event[${idx}] (${event.event_id}) invariant#3 citation-validation: production-ready work-product-stamped on resource ${resourceId} requires a prior citation-validated event on same resource`);
      }
    }
  }

  return { ok: errors.length === 0, errors, eventCount: events.length };
}
