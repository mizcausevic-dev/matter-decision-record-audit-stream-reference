// vault.mjs — Apply the firm's attorney-client vault contract to a matter document.
//
// LegalTech-specific differences vs the FHIR ref impl's vault:
//   1. Privilege_tier is REQUIRED on every resource (vault assigns it from
//      document type — privileged / work-product / public-record / etc.).
//   2. Cross-matter-firewall is enforced via opposing-party-quarantine —
//      documents tagged as "opposing-party-discovery" can only be used inside
//      the matter they were produced in, never as cross-matter input.
//   3. Vendor contract assumed to include no-training-data-use clause (this
//      is a Decision-Card-level commitment, not enforced here — but the
//      audit trail proves the firm believed it).
//
// Maps DOCUMENT TYPE → (privilege_tier, redaction rules) following the
// canonical taxonomy from attorney-client-data-vault-contract-profile.

import { createHash } from "node:crypto";

// Document-type → vault rule mapping. Pulled from
// attorney-client-data-vault-contract-profile's data_category_taxonomy.
// Each entry: { privilege_tier, redactions[] }
//
// privilege_tier is the LegalTech-unique field that propagates into the
// audit-stream event's resource.privilege_tier (REQUIRED per the spec).
const VAULT_RULES = {
  "matter-intake-form":              { privilege_tier: "privileged",   redactions: [{ field: "client-name", action: "tokenize" }, { field: "opposing-party-name", action: "tokenize" }] },
  "engagement-letter":               { privilege_tier: "privileged",   redactions: [{ field: "client-name", action: "tokenize" }, { field: "fee-rate", action: "mask" }] },
  "client-communication":            { privilege_tier: "privileged",   redactions: [{ field: "client-name", action: "tokenize" }, { field: "client-email", action: "mask" }] },
  "internal-research-memo":          { privilege_tier: "work-product", redactions: [{ field: "client-name", action: "tokenize" }] },
  "draft-brief":                     { privilege_tier: "work-product", redactions: [{ field: "client-name", action: "tokenize" }, { field: "opposing-party-name", action: "tokenize" }] },
  "filed-brief":                     { privilege_tier: "public-record", redactions: [] }, // public-record = cleartext, no redaction
  "conflict-check-result":           { privilege_tier: "work-product", redactions: [{ field: "opposing-party-name", action: "tokenize" }] },
  "privilege-log":                   { privilege_tier: "work-product", redactions: [] },
  "work-product-notation":           { privilege_tier: "work-product", redactions: [] },
  "opposing-party-discovery":        { privilege_tier: "opposing-party-quarantine", redactions: [{ field: "opposing-party-name", action: "tokenize" }] }
};

function tokenize(value) {
  if (value === undefined || value === null) return value;
  const hash = createHash("sha256").update(String(value), "utf8").digest("hex").slice(0, 12);
  return `tok_${hash}`;
}

function maskString(s) {
  if (typeof s !== "string" || s.length <= 4) return "***";
  return s.slice(0, 2) + "***" + s.slice(-2);
}

/**
 * Apply the vault contract to a matter document.
 * Returns { tokenizedDocument, privilege_tier, redactionApplied }.
 *
 * If the document type is not in VAULT_RULES, defaults to privileged + no
 * redactions (fail-closed: better to over-mark privilege than under-mark).
 */
export function applyVaultContract(rawDocument) {
  const tokenizedDocument = JSON.parse(JSON.stringify(rawDocument)); // deep clone
  const rule = VAULT_RULES[rawDocument.type] || { privilege_tier: "privileged", redactions: [] };

  const redactionApplied = [];
  for (const r of rule.redactions) {
    if (rawDocument.fields && rawDocument.fields[r.field] !== undefined) {
      switch (r.action) {
        case "tokenize":
          tokenizedDocument.fields[r.field] = tokenize(rawDocument.fields[r.field]);
          break;
        case "mask":
          tokenizedDocument.fields[r.field] = maskString(String(rawDocument.fields[r.field]));
          break;
        case "drop":
          delete tokenizedDocument.fields[r.field];
          break;
      }
      redactionApplied.push({ field: r.field, action: r.action });
    }
  }

  return {
    tokenizedDocument,
    privilege_tier: rule.privilege_tier,
    redactionApplied
  };
}

/** Cross-matter-firewall check — used by the orchestrator before any
 * cross-matter retrieval. Returns true if document may flow across matters. */
export function isCrossMatterAllowed(document) {
  const rule = VAULT_RULES[document.type];
  if (!rule) return false;
  // opposing-party-quarantine + joint-defense + common-interest may never cross matters.
  return rule.privilege_tier === "public-record" || rule.privilege_tier === "tribunal-disclosure-required";
}
