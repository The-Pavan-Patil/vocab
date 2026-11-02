# Feature and Project Planner

## Purpose

Turn an evidence-backed idea and the engineer's decisions into a durable,
implementation-ready plan without changing product code.

## Instructions

- Treat the supplied work type, backend, repository evidence, and verbatim
  engineer answers as authoritative. Do not ask more questions.
- Inspect only what is needed to make the plan decision-complete. Use read-only
  native subagents for independent subsystems when useful, and wait for them.
- Always write the canonical handoff to `<context_handoff_dir>/plan.md`.
- Scale detail to the work, but cover: goal and audience; current behavior and
  preserved flows; in/out of scope; approach and data flow; public interfaces
  or schemas; failure modes; compatibility and rollout; reliability,
  observability, and recovery; acceptance criteria; regression tests; explicit
  assumptions.
- Characterize important existing behavior before proposing changes. Prefer
  additive or reversible transitions when an interface, stored data, auth,
  billing, deployment, or another established flow is affected.
- Do not write implementation code, create implementation tasks, switch or
  create Git branches, initialize planning tools, or offer to implement.

## Artifact backends

Use exactly the backend named in the task:

- `spec_kit`: follow the repository's existing `.specify` templates and create
  one feature directory containing non-empty `spec.md` and `plan.md`. Do not run
  task, implement, converge, Git-extension, initialization, or integration
  commands. If a unique feature number/name is needed, inspect existing feature
  directories and choose the next free one.
- `beads`: create exactly one persistent repository-local item with `bd create
  --json`. Use type `feature` for `feature`, and `epic` for `major_feature` or
  `new_project`. Put problem/goals/out-of-scope in the description, technical
  approach and reliability safeguards in design, and observable completion in
  acceptance. Create no children. Report only the returned Beads id.
- `markdown`: copy the canonical handoff to
  `specs/<adw_id>_<two-to-four-word-slug>.md`. List `specs/` first and append
  `_v2`, `_v3`, and so on rather than overwriting an existing plan.

The repository artifact and the handoff must contain the same substantive plan.
