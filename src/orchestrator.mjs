// orchestrator.mjs — End-to-end: load matter docs → apply vault contract →
// emit hash-chained audit events through the canonical 7-step trajectory.
//
// The trajectory mirrors the spec's canonical example (Anchor & Reef LLP ×
// VendorL MatterMind v4.x) so the produced stream is structurally identical
// to the example in matter-decision-record-audit-stream/examples/. That's
// deliberate — the ref impl's job is to prove the example is something a
// real client can produce, not to invent a new shape.
//
// Step pattern: load → vault → emit. Each step's `privilege_tier` flows from
// the vault rule for that document type, satisfying invariant #1. The
// engagement-letter-bound conflict check is set on the EventBuilder once
// (constructor) and stamped on every matter-data-touching event, satisfying
// invariant #2. The citation-validated event precedes the work-product-
// stamped event with outcome.recommendation="production-ready" on the same
// resource, satisfying invariant #3.

import { MatterClient } from "./matter-client.mjs";
import { applyVaultContract } from "./vault.mjs";
import { EventBuilder } from "./event-builder.mjs";

const CANONICAL_DECISION_CARD     = "https://anchor-reef.example/.well-known/decisions/AR-DEC-2026-MATTER-0042.json";
const CANONICAL_AI_TOOL_CARD      = "https://vendorl-mattermind.example/.well-known/ai-tool-cards/mattermind-4.x.json";
const CANONICAL_ENGAGEMENT_LETTER = "https://anchor-reef.example/.well-known/engagement-letters/AR-ENG-2026-MATTER-0042.json";

// Canonical 7-step trajectory matching the spec's example.
const TRAJECTORY = [
  { step: 1, kind: "legaltech.matter.intake-document-read",        fixture: "matter-intake-form.json",   regBasis: ["aba-rule-1-6", "engagement-letter-binding"],                                action: "read",     outcomeRec: "no-recommendation" },
  { step: 2, kind: "legaltech.matter.conflict-check-run",          fixture: "conflict-check-result.json", regBasis: ["aba-rule-1-7-conflict", "aba-rule-1-9-former-client"],                      action: "search",   outcomeRec: "no-recommendation" },
  { step: 3, kind: "legaltech.matter.privilege-tier-assigned",     fixture: "internal-research-memo.json", regBasis: ["work-product-doctrine-fed-r-civ-p-26-b-3"],                                 action: "stamp",    outcomeRec: "no-recommendation" },
  { step: 4, kind: "legaltech.matter.brief-draft-generated",       fixture: "draft-brief.json",           regBasis: ["aba-rule-1-1-comment-8", "aba-rule-5-3-non-lawyer-supervision"],            action: "generate", outcomeRec: "draft-only" },
  { step: 5, kind: "legaltech.matter.citation-validated",          fixture: "draft-brief.json",           regBasis: ["aba-rule-3-3-candor-toward-tribunal"],                                       action: "transform", outcomeRec: "supervisor-review-required" },
  { step: 6, kind: "legaltech.matter.work-product-stamped",        fixture: "draft-brief.json",           regBasis: ["work-product-doctrine-fed-r-civ-p-26-b-3", "aba-rule-5-3-non-lawyer-supervision"], action: "stamp", outcomeRec: "production-ready" },
  { step: 7, kind: "legaltech.matter.privilege-log-entry-created", fixture: "privilege-log.json",         regBasis: ["aba-rule-1-6", "work-product-doctrine-fed-r-civ-p-26-b-3"],                  action: "stamp",    outcomeRec: "no-recommendation" }
];

export function runEndToEnd({
  fixturesDir,
  source                          = "anchor-reef-mattermind-prod",
  matterIdTokenized               = "tok_matter_AR2026_0042",
  supervisingAttorneyBarId        = "tok_bar_4f9c2e",
  supervisingAttorneyJurisdiction = "NY",
  conflictCheckPassedAt           = "2026-09-12T14:00:00Z",
  conflictsCleared                = ["tok_party_op_xx12", "tok_party_op_yy44"],
  fixedTimestamp,                 // pass to make output byte-stable
  log = () => {}
} = {}) {
  const client = new MatterClient({ fixturesDir });
  const builder = new EventBuilder({
    source,
    decisionCardRef:                  CANONICAL_DECISION_CARD,
    aiToolCardUrl:                    CANONICAL_AI_TOOL_CARD,
    supervisingAttorneyBarId,
    supervisingAttorneyJurisdiction,
    engagementLetterUrl:              CANONICAL_ENGAGEMENT_LETTER,
    conflictCheckPassedAt,
    fixedTimestamp
  });

  const matterRef = { scheme: "matter-id-tokenized", value: matterIdTokenized };
  const events = [];

  for (const step of TRAJECTORY) {
    log(`step ${step.step}: ${step.kind} ← ${step.fixture}`);
    const doc = client.loadDocument(step.fixture);
    const { tokenizedDocument, privilege_tier, redactionApplied } = applyVaultContract(doc);

    const event = builder.buildEvent({
      kind: step.kind,
      matterRef,
      resourceType: tokenizedDocument.type,
      resourceId: tokenizedDocument.id_tokenized,
      privilegeTier: privilege_tier,
      action: step.action,
      outcomeStatus: "success",
      outcomeRecommendation: step.outcomeRec,
      regulatoryBasis: step.regBasis,
      redactionApplied,
      conflictsCleared: step.step === 1 ? conflictsCleared : undefined,  // attach once, on the first event
      requireConflictCheck: true
    });
    events.push(event);
    log(`  emitted ${event.event_id} (${event.resource.type}, tier=${event.resource.privilege_tier}, ${redactionApplied.length} redactions)`);
  }

  return events;
}

export function toNdjson(events) {
  return events.map((e) => JSON.stringify(e)).join("\n") + "\n";
}
