"""Append trusted Codex hook input to the active ForgeFlow agent's spool."""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path


def main() -> int:
    spool = os.environ.get("FORGEFLOW_HOOK_SPOOL", "").strip()
    if not spool:
        # SubagentStop requires valid JSON on stdout even when no ADW is
        # collecting lifecycle records (for example during interactive trust).
        print("{}")
        return 0
    try:
        payload = json.load(sys.stdin)
        payload["forgeflow_received_at"] = datetime.now(timezone.utc).isoformat(
            timespec="milliseconds")
        path = Path(spool)
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a") as handle:
            handle.write(json.dumps(payload, separators=(",", ":")) + "\n")
        print("{}")
    except Exception as error:
        print(f"forgeflow hook trace failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
