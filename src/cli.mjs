// cli.mjs — matter-audit-reference CLI.
//
// Usage:
//   matter-audit-reference --output=examples/sample-output-stream.ndjson
//   matter-audit-reference --output=examples/sample-output-stream.ndjson --verify=false
//
// Test-mode only (no live mode). The orchestrator reads fixtures/, the
// verifier re-runs the spec's schema + 3 invariants on the produced output.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runEndToEnd, toNdjson } from "./orchestrator.mjs";
import { verifyStream } from "./verifier.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");

function parseArgs(argv) {
  const args = { verify: true };
  for (const raw of argv.slice(2)) {
    if (!raw.startsWith("--")) continue;
    const [k, v] = raw.slice(2).split("=");
    args[k] = v === undefined ? true : v;
  }
  return args;
}

export async function main(argv = process.argv) {
  const args = parseArgs(argv);
  const output = args.output ? resolve(process.cwd(), args.output) : null;

  const events = runEndToEnd({
    fixturesDir: resolve(REPO_ROOT, "fixtures"),
    // Deterministic timestamp + event_ids so committed example output is
    // byte-stable across CI runs — same trick as the FHIR ref impl.
    fixedTimestamp: "2026-09-12T14:30:00.000Z",
    log: (...m) => process.stderr.write(m.join(" ") + "\n")
  });

  const ndjson = toNdjson(events);

  if (output) {
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, ndjson, "utf8");
    process.stderr.write(`wrote ${events.length} events to ${output}\n`);
  } else {
    process.stdout.write(ndjson);
  }

  if (args.verify !== false && args.verify !== "false") {
    const result = verifyStream(events);
    if (result.ok) {
      process.stderr.write(`verified ${events.length} events: schema ✓ chain ✓ invariant#1 ✓ invariant#2 ✓ invariant#3 ✓\n`);
      return 0;
    }
    process.stderr.write(`VERIFICATION FAILED:\n${result.errors.join("\n")}\n`);
    return 1;
  }
  return 0;
}

if (process.argv[1]?.endsWith("cli.mjs") || process.argv[1]?.endsWith("matter-audit-reference")) {
  main().then((code) => process.exit(code)).catch((err) => {
    process.stderr.write(`ERROR: ${err.stack || err.message}\n`);
    process.exit(2);
  });
}
