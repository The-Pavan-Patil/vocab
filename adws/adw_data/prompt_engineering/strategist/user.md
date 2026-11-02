# Planning Discovery Task

## Variables

### prompt

{{prompt}}

### previous_envelope

{{previous_envelope}}

### context_handoff_dir

{{context_handoff_dir}}

## Task

Inspect the repository and shape `prompt` into the smallest useful batch of
product decisions. Emit the report without changing the repository.

## Report

Respond with ONLY valid JSON matching `PlanningDiscoveryOutput`:

```json
{
  "status": "success",
  "summary": "<one sentence describing the classified work>",
  "artifacts": [],
  "notes_for_next_agent": "<evidence or assumptions the final planner must carry forward>",
  "work_type": "feature",
  "confidence": "high",
  "current_state": "<what exists today, grounded in repository evidence>",
  "preserved_flows": ["<existing journey, interface, or contract that must keep working>"],
  "risks": ["<material compatibility or reliability risk>"],
  "questions": [
    {
      "id": "delivery_boundary",
      "question": "<one decision the repository cannot answer>",
      "why_it_matters": "<how the answer changes the plan>",
      "options": [
        {"label": "Bounded rollout", "description": "<impact and trade-off>"},
        {"label": "Immediate replacement", "description": "<impact and trade-off>"}
      ],
      "recommended_label": "Bounded rollout"
    }
  ],
  "ready_for_plan": false
}
```

Set `questions` to `[]` and `ready_for_plan` to `true` when no material decision remains.
