// matter-client.mjs — Reads matter documents from fixtures/.
//
// Test-mode only. Unlike the FHIR ref impl (which can hit HAPI's public test
// server), there is no public matter-management API to point at — and faking
// one wouldn't add credibility. So this ref impl is fixtures-only by design.
//
// A production embedder would replace this with a client for their actual
// matter-management system (NetDocuments, iManage Work, Litera, MyCase, etc.)
// or roll their own thin adapter — the surface this client exposes is what
// the orchestrator depends on, not the backing store.

import { readFileSync } from "node:fs";
import { join } from "node:path";

export class MatterClient {
  constructor({ fixturesDir } = {}) {
    if (!fixturesDir) throw new Error("MatterClient: fixturesDir required");
    this.fixturesDir = fixturesDir;
  }

  /** Load a single matter document by fixture filename. */
  loadDocument(name) {
    return JSON.parse(readFileSync(join(this.fixturesDir, name), "utf8"));
  }

  /** Load a matter index — describes documents in scope for this matter. */
  loadMatter(matterFile) {
    return JSON.parse(readFileSync(join(this.fixturesDir, matterFile), "utf8"));
  }
}
