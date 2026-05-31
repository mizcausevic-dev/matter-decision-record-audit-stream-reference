# Changelog

## 1.0.0-prod — 2026-05-31

- Hardened to v1.0-prod per squad doctrine; member of the LegalTech vertical 6-pack.
- Spec-component repo (no Pages deploy required); AGPL-3.0-or-later, synthetic example data only.
- Pulse universe entry not applicable (no custom subdomain).



## [0.1] — 2026-05-31

### Added

- Initial Node.js reference implementation of the `matter-decision-record-audit-stream` spec.
- `MatterClient` — minimal fixture-loading client; production embedders swap this for their real matter-management adapter (NetDocuments, iManage, Litera, MyCase).
- `applyVaultContract()` — attorney-client vault layer covering 10 document types; assigns `privilege_tier` per type (privileged / work-product / public-record / opposing-party-quarantine) following `attorney-client-data-vault-contract-profile`.
- `isCrossMatterAllowed()` — predicate the orchestrator consults before cross-matter retrieval; encodes the cross-matter-firewall rule in one place.
- `EventBuilder` — hash-chained Suite-compliant event construction. Identical canonical-JSON SHA-256 hashing as the FHIR ref impl. `resource.privilege_tier` REQUIRED per spec. `conflict_check` block bound to `engagement_letter_url` once in constructor + stamped on every matter-data event.
- `verifyStream()` — re-validates produced stream against spec's JSON Schema + recomputes hash chain + enforces all THREE spec invariants (privilege-tier consistency, engagement-letter binding, citation-validation-before-production-ready).
- Canonical 7-step trajectory: intake → conflict check → privilege-tier assigned → brief draft → citation validated → work-product stamped → privilege log. Reorder steps 4-6 and the verifier rejects (invariant #3 acting).
- CLI (`bin/matter-audit-reference`) with `--output`, `--verify` flags. Test-mode only (no `--mode=live` — see "Synthetic-only by design" in README).
- 5 synthetic fixtures: matter-intake-form, conflict-check-result, internal-research-memo, draft-brief, privilege-log. Anonymized maritime cargo claim (Helios Maritime × Coral Reef Salvage).
- Committed example `examples/sample-output-stream.ndjson` — 7 events, all three invariants green.
- 9-test suite via `node --test`: orchestrator shape, schema validation, chain integrity, all-three-invariants-together, each invariant separately, byte-stability, example freshness.
- GitHub Actions CI: install → build canonical example → run tests → pretty-print first event for log readability.

### Design notes

- **Synthetic-only by design.** Unlike the FHIR ref impl, no public matter-management API to point at. Production embedders replace `src/matter-client.mjs` with their adapter; the orchestrator's contract with the client is small (load document by fixture name → return shape).
- **License is AGPL-3.0** matching the sibling FHIR ref impl; spec stays MIT, ref impls are copyleft so consumers must publish modifications.
- **Deterministic test-mode timestamp** (`2026-09-12T14:30:00.000Z`) + sequential `event_id` (`0190lt-ref-NNNN`) makes the committed example byte-stable across CI runs.
- **Spec schema is vendored, not remote-fetched** — keeps the ref impl's CI independent of the spec repo's availability and forces explicit upgrades when the spec evolves.

### Not yet

- Multi-matter trajectory exercising `isCrossMatterAllowed` predicate.
- Joint-defense + common-interest privilege-tier workflows.
- Tribunal-disclosure trajectory (ABA Rule 3.3 candor flow).
- ed25519 `signature` field examples.
- Blocked-outcome paths (`status: blocked-by-conflict-check` / `blocked-by-privilege-tier`).
- Real vault provider adapter (Skyflow / Privacera) — current tokenizer is deterministic SHA-256, fine for test/dev but doesn't give vault-provider unlinkability.