import { canonicalDigest } from './canonical.js'

function jsonFile(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

function pythonScaffold() {
  return `#!/usr/bin/env python3
"""Import preserved Frontier Repro attempts into a local-first Trackio logbook."""

import argparse
import json
import pathlib
import re

import trackio


ROOT = pathlib.Path(__file__).resolve().parent


def load(name):
    return json.loads((ROOT / name).read_text(encoding="utf-8"))


def safe_name(value):
    return re.sub(r"[^A-Za-z0-9._-]+", "-", str(value)).strip("-")[:120] or "frontier-evidence"


def numeric_metrics(attempt):
    values = {}
    for key, value in attempt.get("metrics", {}).items():
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            values[key] = value
    for key, value in attempt.get("resources", {}).items():
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            values[f"resources/{key}"] = value
    values["claim_score"] = attempt.get("rubricGrade", {}).get("score", 0)
    values["required_claims_passed"] = int(attempt.get("rubricGrade", {}).get("passed", False))
    return values


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--project", default="frontier-reproduction")
    parser.add_argument("--space-id", default=None, help="Optional Hugging Face Space; omit for local-only logging.")
    args = parser.parse_args()
    bundle = load("bundle.json")
    assessments = load("assessments.json")
    attempts = load("attempts.json")
    if not attempts:
        raise SystemExit("No preserved attempts exist yet; execute and record one before importing.")

    for attempt in attempts:
        trackio.init(
            project=args.project,
            name=safe_name(f"{bundle['id']}-attempt-{attempt.get('attemptNumber', 'x')}"),
            group=bundle["id"],
            space_id=args.space_id,
            embed=False,
            config={
                "event_id": bundle["id"],
                "event_digest": bundle["substantiveDigest"],
                "assessment_id": attempt.get("assessmentId"),
                "mode": attempt.get("mode"),
                "equivalence": attempt.get("equivalence"),
                "verdict": attempt.get("verdict"),
                "outcome": attempt.get("outcome"),
            },
        )
        metrics = numeric_metrics(attempt)
        if metrics:
            trackio.log(metrics, step=0)

        evidence = trackio.Artifact(
            name=safe_name(f"{bundle['id']}-evidence"),
            type="frontier-evidence",
            metadata={"bundle_digest": bundle["substantiveDigest"]},
        )
        for slot, entries in bundle.get("evidence", {}).items():
            for index, entry in enumerate(entries):
                evidence.add_reference(entry["url"], name=f"{slot}/{index}", checksum=False)
        evidence.add_file(ROOT / "bundle.json")
        evidence.add_file(ROOT / "assessments.json")
        evidence.add_file(ROOT / "attempts.json")
        trackio.log_artifact(evidence, aliases=[safe_name(f"bundle-v{bundle.get('version', 1)}")])

        for path_value in attempt.get("artifacts", []):
            path = pathlib.Path(path_value).expanduser()
            if not path.is_absolute():
                path = ROOT / path
            if path.exists():
                trackio.log_artifact(path, type="reproduction-output")
        trackio.finish()


if __name__ == "__main__":
    main()
`
}

/** Export a file-only Trackio handoff without creating a competing experiment UI. */
export function createTrackioScaffold({ event, assessments = [], attempts = [] }) {
  const files = {
    'bundle.json': jsonFile(event),
    'assessments.json': jsonFile(assessments),
    'attempts.json': jsonFile(attempts),
    'requirements.in': 'trackio\n',
    'trackio_logbook.py': pythonScaffold(),
    'README.md': `# Frontier reproduction Trackio logbook

This scaffold preserves one evidence-bundle version, every claim assessment, and all attempts—including failures and negative results. It does not execute a reproduction or alter its verdict.

1. Create an isolated Python 3.10+ environment.
2. Compile and install a lock from \`requirements.in\` (for example with \`uv pip compile\`), then retain that lock with the run artifacts.
3. Review the JSON for secrets, private paths, licensed data, and personal information.
4. Run \`python trackio_logbook.py\`. Logging is local by default; pass \`--space-id owner/space\` only when you intend to publish.
5. Open the local dashboard with \`trackio show --project frontier-reproduction\`.

Remote evidence is attached as a reference with network checksum probing disabled because the bundle already carries immutable revisions where the source supports them. Local output paths are logged only when they exist.
`,
  }
  return {
    format: 'trackio-logbook-scaffold/v1',
    eventId: event.id,
    eventDigest: event.substantiveDigest,
    generatedAt: new Date().toISOString(),
    files,
    digest: canonicalDigest(files),
  }
}
