# Wide-Scope Plan Task

## Variables

### prompt

{{prompt}}

### previous_envelope

{{previous_envelope}}

### context_handoff_dir

{{context_handoff_dir}}

## Task

Finalize `prompt`, write `<context_handoff_dir>/plan.md`, publish the durable
artifact through the selected backend, and stop before implementation.

## Report

Respond with ONLY valid JSON matching `ScopedPlanOutput`:

```json
{
  "status": "success",
  "summary": "<one sentence describing the finished plan>",
  "artifacts": [
    "<context_handoff_dir>/plan.md",
    "specs/001-example/spec.md",
    "specs/001-example/plan.md"
  ],
  "notes_for_next_agent": "<important constraints for a future implementer>",
  "work_type": "major_feature",
  "artifact_backend": "spec_kit",
  "artifact_refs": ["specs/001-example/spec.md", "specs/001-example/plan.md"],
  "handoff_path": "<context_handoff_dir>/plan.md"
}
```

For Beads, `artifact_refs` contains exactly one Beads id and `artifacts` contains
only the handoff file. For Markdown, both lists declare the one durable spec as appropriate.
