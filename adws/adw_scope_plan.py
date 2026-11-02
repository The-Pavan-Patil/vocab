#!/usr/bin/env -S uv run
# /// script
# dependencies = ["pydantic", "python-dotenv", "pyyaml", "rich"]
# ///
"""ADW Scope Plan — staged discovery and durable, plan-only publication.

Usage:
    uv run adws/adw_scope_plan.py discover "<idea>" --round 1 --max-questions 3 [--adw-id a1b2c3d4]
    uv run adws/adw_scope_plan.py finalize "<idea + answers>" --work-type feature --adw-id a1b2c3d4

Phases: engineer(request) -> strategist (one or two rounds) -> feature_planner

The visible interface is `/forgeflow plan`; its cookbook coordinates these
stages so the engineer experiences one conversational command.
"""

import argparse
import sys
from pathlib import Path

from adw_modules import agents, planning, session, utils
from adw_modules.data_types import (
    AgentCall,
    PhaseParams,
    PlanningDiscoveryOutput,
    ScopedPlanOutput,
)

DEFAULT_CONFIG = "adws/adw_forgeflow_config/forgeflow.planning.config.yaml"
REQUIRED_AGENTS = ["strategist", "feature_planner"]


def run_discovery(args: argparse.Namespace) -> int:
    cfg = agents.load_config(args.config)
    agents.validate(cfg, REQUIRED_AGENTS)
    run = session.ensure(cfg, args.adw_id)
    prompt = utils.resolve_prompt(args.prompt)
    shaped_prompt = f"""Planning discovery round {args.round}.
Ask at most {args.max_questions} unresolved, high-impact question(s) in this batch.
Do not repeat decisions already answered in the prompt. Ask fewer—or zero—when
repository evidence and prior answers are sufficient.

{prompt}"""

    suffix = f"discovery_{args.round}"
    with run.phase(PhaseParams(
            name=f"request_{suffix}", kind="engineer", owner=run.engineer,
            description="Record the idea and any prior answers without changing their intent")) as ph:
        ph.log(input=prompt)

    with run.phase(PhaseParams(
            name=suffix, kind="agent", owner="strategist", retries=1,
            description="Inspect the product, classify the scope, and surface only decisions evidence cannot settle")) as ph:
        ph.call(AgentCall(
            output_type=PlanningDiscoveryOutput,
            prompt=shaped_prompt,
            gates=[planning.discovery_within_budget(args.max_questions)],
        ))

    return run.finish()


def run_finalize(args: argparse.Namespace) -> int:
    cfg = agents.load_config(args.config)
    agents.validate(cfg, REQUIRED_AGENTS)
    backend = planning.detect_backend(Path.cwd())
    run = session.ensure(cfg, args.adw_id)
    prompt = utils.resolve_prompt(args.prompt)
    final_prompt = f"""Finalize the approved planning brief below.

Work type: {args.work_type}
Artifact backend: {backend}

The backend was selected by deterministic repository inspection. Use exactly
that backend, create no implementation tasks, and write no product code.

{prompt}"""

    with run.phase(PhaseParams(
            name="request_finalize", kind="engineer", owner=run.engineer,
            description="Record the evidence-backed brief and the engineer's verbatim decisions")) as ph:
        ph.log(input=prompt, work_type=args.work_type, artifact_backend=backend)

    with run.phase(PhaseParams(
            name="scope_plan", kind="agent", owner="feature_planner", retries=1,
            description="Publish an implementation-ready plan while preserving existing behavior and stopping before code")) as ph:
        ph.call(AgentCall(
            output_type=ScopedPlanOutput,
            prompt=final_prompt,
            gates=[planning.plan_artifact_valid(backend, args.work_type)],
        ))

    return run.finish()


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description=__doc__)
    stages = root.add_subparsers(dest="stage", required=True)

    discover = stages.add_parser("discover", help="inspect, classify, and return a question batch")
    discover.add_argument("prompt", help="inline idea/answers or a path to a prompt file")
    discover.add_argument("--round", type=int, choices=(1, 2), required=True)
    discover.add_argument("--max-questions", type=int, choices=range(4), required=True)
    discover.add_argument("--config", default=DEFAULT_CONFIG)
    discover.add_argument("--adw-id", default=None, help="join or pin an existing session")
    discover.set_defaults(handler=run_discovery)

    finalize = stages.add_parser("finalize", help="publish the final plan through the selected backend")
    finalize.add_argument("prompt", help="inline approved brief or a path to a prompt file")
    finalize.add_argument("--work-type", choices=("feature", "major_feature", "new_project"), required=True)
    finalize.add_argument("--config", default=DEFAULT_CONFIG)
    finalize.add_argument("--adw-id", required=True, help="the discovery session to continue")
    finalize.set_defaults(handler=run_finalize)
    return root


if __name__ == "__main__":
    arguments = parser().parse_args()
    sys.exit(arguments.handler(arguments))
