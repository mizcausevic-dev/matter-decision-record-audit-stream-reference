// event-builder.mjs — Build hash-chained Suite-compliant matter-decision events.
//
// LegalTech specifics vs the FHIR ref impl's event-builder:
//   - resource.privilege_tier is REQUIRED on every event (spec invariant #1).
//   - conflict_check block is bound to engagement_letter_url for matter-data-
//     touching kinds (spec invariant #2).
//   - The supervising attorney's tokenized bar_id + jurisdiction live in
//     agent.supervising_attorney_bar_id_tokenized / agent.supervising_attorney_jurisdiction.
//
// The hash chain itself is byte-for-byte identical to FHIR's: canonical JSON
// (lex-sorted keys, no whitespace) → SHA-256 → hex. That's the Suite-wide
// invariant; any per-vertical departure would break cross-tool replay.

import { createHash, randomUUID } from "node:crypto";

const ZERO_HASH = "0".repeat(64);

function canonicalize(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalize(value[k])).join(",") + "}";
}
function sha256Hex(s) { return createHash("sha256").update(s, "utf8").digest("hex"); }

/** EventBuilder — same chain semantics as the FHIR ref impl; LegalTech fields added. */
export class EventBuilder {
  constructor({
    source,
    decisionCardRef,
    aiToolCardUrl,
    supervisingAttorneyBarId,        // tokenized
    supervisingAttorneyJurisdiction,
    engagementLetterUrl,
    conflictCheckPassedAt,
    fixedTimestamp                    // for deterministic test-mode output
  } = {}) {
    if (!source) throw new Error("source required");
    if (!decisionCardRef) throw new Error("decisionCardRef required");
    if (!aiToolCardUrl) throw new Error("aiToolCardUrl required");
    if (!engagementLetterUrl) throw new Error("engagementLetterUrl required");
    if (!conflictCheckPassedAt) throw new Error("conflictCheckPassedAt required");
    this.source = source;
    this.decisionCardRef = decisionCardRef;
    this.aiToolCardUrl = aiToolCardUrl;
    this.supervisingAttorneyBarId = supervisingAttorneyBarId;
    this.supervisingAttorneyJurisdiction = supervisingAttorneyJurisdiction;
    this.engagementLetterUrl = engagementLetterUrl;
    this.conflictCheckPassedAt = conflictCheckPassedAt;
    this.fixedTimestamp = fixedTimestamp || null;
    this.prevHash = ZERO_HASH;
    this.counter = 0;
  }

  buildEvent({
    kind,
    matterRef,                    // { scheme, value }
    resourceType,
    resourceId,
    privilegeTier,                 // REQUIRED — LegalTech-specific
    action = "read",
    outcomeStatus = "success",
    outcomeRecommendation = "no-recommendation",
    regulatoryBasis,               // array
    redactionApplied,
    requireConflictCheck = true,   // matter-data-touching kinds must bind to a passed conflict check
    conflictsCleared               // optional array of tokenized opposing-party IDs
  }) {
    this.counter += 1;

    const event = {
      event_id: this.fixedTimestamp ? `0190lt-ref-${this.counter.toString().padStart(4, "0")}` : randomUUID(),
      timestamp: this.fixedTimestamp || new Date().toISOString(),
      kind,
      source: this.source,
      matter_ref: matterRef,
      resource: {
        type: resourceType,
        id_tokenized: resourceId,
        privilege_tier: privilegeTier
      },
      action,
      outcome: { status: outcomeStatus, recommendation: outcomeRecommendation },
      agent: {
        ai_tool_card_url: this.aiToolCardUrl,
        ai_decision_card_url: this.decisionCardRef
      },
      regulatory_basis: regulatoryBasis,
      decision_card_ref: this.decisionCardRef,
      prev_hash: this.prevHash
    };

    if (this.supervisingAttorneyBarId) event.agent.supervising_attorney_bar_id_tokenized = this.supervisingAttorneyBarId;
    if (this.supervisingAttorneyJurisdiction) event.agent.supervising_attorney_jurisdiction = this.supervisingAttorneyJurisdiction;

    if (requireConflictCheck) {
      event.conflict_check = {
        passed_at: this.conflictCheckPassedAt,
        engagement_letter_url: this.engagementLetterUrl,
        ...(conflictsCleared && conflictsCleared.length > 0 ? { conflicts_cleared: conflictsCleared } : {})
      };
    }

    if (redactionApplied && redactionApplied.length > 0) event.redaction_applied = redactionApplied;

    event.hash = sha256Hex(canonicalize(event));
    this.prevHash = event.hash;
    return event;
  }
}
