# matter-decision-record-audit-stream-reference

[![ci](https://github.com/mizcausevic-dev/matter-decision-record-audit-stream-reference/actions/workflows/ci.yml/badge.svg)](https://github.com/mizcausevic-dev/matter-decision-record-audit-stream-reference/actions/workflows/ci.yml)
[![license: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)
[![node: ≥20](https://img.shields.io/badge/node-%E2%89%A520-brightgreen.svg)](package.json)

Node.js **reference implementation** of the
[`matter-decision-record-audit-stream`](https://github.com/mizcausevic-dev/matter-decision-record-audit-stream)
spec (LegalTech 6-pack #1). Proves the spec's **three orthogonal invariants** are mutually achievable end-to-end, not just individually checkable.

The second of two reference implementations in the Kinetic Gain Protocol Suite — the [first one](https://github.com/mizcausevic-dev/fhir-resource-access-audit-reference) covered HealthTech's `fhir-resource-access-audit`. Together they're evidence the Suite's parallel-structure thesis works in code, not just on paper.

## What this proves

The spec defines a JSON Schema, a canonical hash-chain convention, and three invariants:

1. **Privilege-tier consistency** — every `brief-draft-generated` / `citation-validated` / `work-product-stamped` event MUST carry a work-product-compatible `resource.privilege_tier`.
2. **Engagement-letter binding** — every matter-data-touching kind MUST include `conflict_check.passed_at` + `conflict_check.engagement_letter_url` (ABA Rule 1.7/1.9).
3. **Citation-validation-before-production-ready** — a `work-product-stamped` event with `outcome.recommendation = "production-ready"` MUST be preceded by a `citation-validated` event on the same resource (anti-*Mata v. Avianca*).

This ref impl runs a 7-step matter trajectory that satisfies **all three simultaneously**, then re-validates against the spec's own JSON Schema + recomputes every hash. A green CI is evidence the spec's invariants are achievable together, not contradictory.

## Quick start

```bash
npm install
npm run build:example   # writes examples/sample-output-stream.ndjson + verifies
npm test                # 9 tests across orchestrator + schema + chain + invariants
```

## Synthetic-only by design

Unlike the [FHIR ref impl](https://github.com/mizcausevic-dev/fhir-resource-access-audit-reference), there's no public matter-management API to point at (HAPI FHIR has a public test server; matter systems don't). Faking a "live mode" wouldn't add credibility — it'd just be theatrical fixtures behind a network adapter.

**Production embedders** replace `src/matter-client.mjs` with a thin adapter for their actual matter-management system (NetDocuments, iManage Work, Litera, MyCase, etc.). The orchestrator's contract with the client is small: load a document by fixture name → return `{ type, id_tokenized, fields }`. Anything that satisfies that surface works.

## What an event looks like

The first event in `examples/sample-output-stream.ndjson` (matter intake, genesis of the chain):

```json
{
  "event_id": "0190lt-ref-0001",
  "timestamp": "2026-09-12T14:30:00.000Z",
  "kind": "legaltech.matter.intake-document-read",
  "source": "anchor-reef-mattermind-prod",
  "matter_ref": { "scheme": "matter-id-tokenized", "value": "tok_matter_AR2026_0042" },
  "resource": {
    "type": "matter-intake-form",
    "id_tokenized": "tok_resource_intake_a1",
    "privilege_tier": "privileged"
  },
  "action": "read",
  "outcome": { "status": "success", "recommendation": "no-recommendation" },
  "agent": {
    "ai_tool_card_url": "https://vendorl-mattermind.example/.well-known/ai-tool-cards/mattermind-4.x.json",
    "ai_decision_card_url": "https://anchor-reef.example/.well-known/decisions/AR-DEC-2026-MATTER-0042.json",
    "supervising_attorney_bar_id_tokenized": "tok_bar_4f9c2e",
    "supervising_attorney_jurisdiction": "NY"
  },
  "regulatory_basis": ["aba-rule-1-6", "engagement-letter-binding"],
  "decision_card_ref": "https://anchor-reef.example/.well-known/decisions/AR-DEC-2026-MATTER-0042.json",
  "prev_hash": "0000000000000000000000000000000000000000000000000000000000000000",
  "conflict_check": {
    "passed_at": "2026-09-12T14:00:00Z",
    "engagement_letter_url": "https://anchor-reef.example/.well-known/engagement-letters/AR-ENG-2026-MATTER-0042.json",
    "conflicts_cleared": ["tok_party_op_xx12", "tok_party_op_yy44"]
  },
  "redaction_applied": [
    { "field": "client-name",         "action": "tokenize" },
    { "field": "opposing-party-name", "action": "tokenize" }
  ],
  "hash": "999b4e784a036061ec0ac09ccb1b954e0416cc405f8dbcce5a61e12d042dc8b3"
}
```

The next event's `prev_hash` equals this event's `hash`. That's the chain.

## The canonical 7-step trajectory

| Step | Kind | Privilege tier | What it proves |
| --- | --- | --- | --- |
| 1 | `intake-document-read` | privileged | Matter data ingested under engagement-letter-bound conflict check |
| 2 | `conflict-check-run` | work-product | Conflict check passed (the binding event for invariant #2) |
| 3 | `privilege-tier-assigned` | work-product | Internal memo classified before any output generation |
| 4 | `brief-draft-generated` | work-product | Draft brief produced; `outcome.recommendation = "draft-only"` |
| 5 | `citation-validated` | work-product | **The Mata-v-Avianca guard** — must precede step 6 |
| 6 | `work-product-stamped` | work-product | `outcome.recommendation = "production-ready"` (invariant #3 gate) |
| 7 | `privilege-log-entry-created` | work-product | Privilege log entry for downstream discovery |

Reorder any of steps 4-6 and the verifier rejects. That's invariant #3 working as intended.

## How it's organized

```
src/
  matter-client.mjs       # Reads matter docs from fixtures/ (replace with your real adapter)
  vault.mjs               # Attorney-client vault contract — privilege_tier per document type
  event-builder.mjs       # Hash-chained Suite-compliant event construction
  orchestrator.mjs        # End-to-end: load → vault → emit through 7-step trajectory
  verifier.mjs            # Re-run spec's schema + 3 invariants on produced output
  cli.mjs                 # CLI entry point
schema/
  matter-decision-event.schema.json   # vendored verbatim from the spec repo
fixtures/                 # synthetic matter docs (intake, conflict, memo, brief, priv-log)
examples/
  sample-output-stream.ndjson         # committed reference output (7 events)
tests/
  reference.test.mjs      # node --test runner, 9 tests
```

## Design choices

- **Privilege_tier flows from the vault** — `src/vault.mjs` maps document type → privilege_tier. The orchestrator never assigns a tier directly; it always comes from the vault. That keeps the rule in one place (avoids drift if the spec adds a new tier later).
- **Cross-matter-firewall via `isCrossMatterAllowed` predicate** — the vault module exposes the firewall rule as a function the orchestrator can consult before any cross-matter retrieval. We don't exercise it in the canonical 7-step trajectory (single matter), but the predicate is exported for embedders implementing cross-matter retrieval.
- **`requireConflictCheck` is on by default** on every event the EventBuilder produces — the conflict_check block is bound to the engagement_letter_url once in the constructor, then stamped on every event. The spec verifier rejects matter-data events without this binding; making it a default rather than an opt-in prevents the most common drift.
- **Deterministic test-mode** — fixed timestamp + sequential event_ids → byte-stable committed example output. Test #9 catches any silent change to the emitter's output shape.
- **Spec schema is vendored, not fetched** — `schema/` carries a copy of the spec repo's schema. If the spec evolves, this ref impl updates explicitly via the schema file (caught by CI). Beats remote-fetching at verify-time which would couple ref-impl CI to spec-repo availability.

## Scope (and what's intentionally not in scope)

This is a reference implementation, not a production legal-AI tool. Production use would add:

- Real matter-management adapter (NetDocuments / iManage / Litera / MyCase / etc.)
- Real vault provider (Skyflow / Privacera / self-hosted KMS) instead of the deterministic SHA-256-based tokenizer
- ed25519 signing per event (the spec's optional `signature` field)
- Multi-matter trajectory + cross-matter retrieval (uses `isCrossMatterAllowed` predicate)
- Joint-defense + common-interest workflows (different `privilege_tier`s + different conflict-check semantics)
- Tribunal-disclosure trajectory (ABA Rule 3.3 candor flow + court standing-order awareness)
- Outcome status `blocked-by-conflict-check` / `blocked-by-privilege-tier` paths

What's in scope is the *audit-stream emission contract for the canonical happy-path trajectory*. That one is fully covered, all three spec invariants green.

## Related

- [`matter-decision-record-audit-stream`](https://github.com/mizcausevic-dev/matter-decision-record-audit-stream) — the spec this implements
- [`attorney-client-data-vault-contract-profile`](https://github.com/mizcausevic-dev/attorney-client-data-vault-contract-profile) — the vault contract whose `privilege_tier` taxonomy this enforces
- [`state-bar-ai-disclosure-tracker`](https://github.com/mizcausevic-dev/state-bar-ai-disclosure-tracker) — state bar lifecycle context (incl. the Mata v. Avianca anchor)
- [`fhir-resource-access-audit-reference`](https://github.com/mizcausevic-dev/fhir-resource-access-audit-reference) — the sibling reference impl (HealthTech)
- [Kinetic Gain Protocol Suite](https://suite.kineticgain.com/verticals/legaltech/) — the LegalTech vertical hub

## Compliance posture

This repository is **reference scaffolding for ABA-relevant audit evidence**. It is not a state-bar-approved product, does not constitute ABA Model Rule compliance, and producing a verified audit stream does not waive privilege or guarantee admissibility of the stream in any tribunal. Compliance posture depends on the firm's full ethics-program environment, state bar licensure of the supervising attorney, and the appropriate external attestation.

## License

[AGPL-3.0](LICENSE) — the spec is MIT, but reference implementations of the Kinetic Gain Protocol Suite are AGPL-3.0 so they can be inspected, modified, and re-deployed under copyleft (matching the sibling FHIR ref impl).
