"""Deterministic policy for the interactive ForgeFlow planning workflow.

Agents decide what a plan says. Code decides how many questions are allowed,
which repository-native planning backend owns the durable record, and whether
the agent's declared artifact actually exists.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

from .data_types import (
    ArtifactBackend,
    GateReport,
    PlanningDiscoveryOutput,
    ScopedPlanOutput,
    WorkType,
)


class PlanningSetupError(RuntimeError):
    """An existing planning backend is present but cannot be used safely."""


def _from_repo(path: str, repo_root: Path) -> Path:
    candidate = Path(path)
    return candidate if candidate.is_absolute() else repo_root / candidate


def detect_backend(repo_root: Path) -> ArtifactBackend:
    """Prefer healthy Spec Kit, then healthy repo-local Beads, then Markdown.

    A broken marker fails closed. Silently falling back would create a second
    source of truth beside the tool the repository already chose.
    """
    root = repo_root.resolve()
    specify = root / ".specify"
    if specify.exists():
        if specify.is_symlink():
            raise PlanningSetupError("the repository's .specify directory is a symlink")
        required = [
            specify / "templates" / "spec-template.md",
            specify / "templates" / "plan-template.md",
        ]
        missing = [path.relative_to(root).as_posix() for path in required if not path.is_file()]
        if missing:
            raise PlanningSetupError(
                "Spec Kit is present but incomplete; missing " + ", ".join(missing))
        return "spec_kit"

    beads = root / ".beads"
    if beads.exists():
        if beads.is_symlink():
            raise PlanningSetupError("the repository's .beads directory is a symlink")
        binary = shutil.which("bd") or shutil.which("beads")
        if not binary:
            raise PlanningSetupError(
                "a .beads workspace exists but neither 'bd' nor 'beads' is on PATH")
        result = subprocess.run(
            [binary, "--readonly", "where", "--json"], cwd=root,
            capture_output=True, text=True, check=False,
        )
        if result.returncode != 0:
            detail = (result.stderr or result.stdout).strip()
            raise PlanningSetupError(
                "the repository-local Beads workspace is unhealthy"
                + (f": {detail}" if detail else ""))
        try:
            reported = Path(json.loads(result.stdout)["path"])
            reported = reported if reported.is_absolute() else root / reported
        except (json.JSONDecodeError, KeyError, TypeError):
            raise PlanningSetupError(
                "the Beads workspace check did not return a valid repository path") from None
        if reported.resolve() != beads.resolve():
            raise PlanningSetupError(
                f"Beads resolved to {reported.resolve()}, not repository-local {beads.resolve()}")
        return "beads"

    return "markdown"


def discovery_within_budget(max_questions: int):
    """Gate a discovery batch against both the UI batch and scope caps."""
    if max_questions < 0 or max_questions > 3:
        raise ValueError("max_questions must be between 0 and 3")

    def gate(envelope: PlanningDiscoveryOutput, run) -> GateReport:
        scope_cap = 2 if envelope.work_type == "feature" else 3
        allowed = min(max_questions, scope_cap)
        questions = envelope.questions
        report = GateReport().check(
            "question count", len(questions) <= allowed,
            f"{len(questions)} question(s), maximum {allowed}",
        )
        report.check(
            "question ids", len({question.id for question in questions}) == len(questions),
            "unique" if len({question.id for question in questions}) == len(questions)
            else "question ids must be unique",
        )
        for question in questions:
            labels = {option.label for option in question.options}
            report.check(
                f"{question.id} recommendation",
                question.recommended_label in labels,
                "matches an option" if question.recommended_label in labels
                else "recommended_label must match one option label",
            )
        report.check(
            "ready_for_plan consistency",
            envelope.ready_for_plan == (not questions),
            "ready exactly when no questions remain",
        )
        return report

    gate.__name__ = f"discovery_within_budget({max_questions})"
    return gate


def plan_artifact_valid(expected_backend: ArtifactBackend, expected_work_type: WorkType):
    """Verify the published plan without judging its prose."""
    def gate(envelope: ScopedPlanOutput, run) -> GateReport:
        report = GateReport()
        repo_root = Path(run.repo_root).resolve()
        report.check(
            "artifact backend", envelope.artifact_backend == expected_backend,
            f"reported {envelope.artifact_backend}, expected {expected_backend}",
        )
        report.check(
            "work type", envelope.work_type == expected_work_type,
            f"reported {envelope.work_type}, expected {expected_work_type}",
        )

        handoff = _from_repo(envelope.handoff_path, repo_root)
        handoff_ok = handoff.is_file() and handoff.stat().st_size > 0
        report.check(
            "handoff plan", handoff_ok,
            f"exists, {handoff.stat().st_size}B" if handoff_ok else "missing or empty",
        )
        report.check(
            "handoff declaration", envelope.handoff_path in envelope.artifacts,
            "declared in artifacts" if envelope.handoff_path in envelope.artifacts
            else "handoff_path must also be declared in artifacts",
        )

        refs = envelope.artifact_refs
        if expected_backend == "beads":
            report.check("Beads reference count", len(refs) == 1,
                         f"found {len(refs)}, expected 1")
            if len(refs) == 1:
                binary = shutil.which("bd") or shutil.which("beads")
                if not binary:
                    report.check(refs[0], False, "Beads CLI is unavailable")
                else:
                    result = subprocess.run(
                        [binary, "show", refs[0], "--json"], cwd=run.repo_root,
                        capture_output=True, text=True, check=False,
                    )
                    parses = False
                    if result.returncode == 0:
                        try:
                            json.loads(result.stdout)
                            parses = True
                        except json.JSONDecodeError:
                            pass
                    report.check(
                        refs[0], result.returncode == 0 and parses,
                        "exists and returns JSON" if result.returncode == 0 and parses
                        else (result.stderr or result.stdout).strip() or "could not read Beads item",
                    )
            return report

        expected_count = 2 if expected_backend == "spec_kit" else 1
        report.check(
            "file artifact count", len(refs) == expected_count,
            f"found {len(refs)}, expected {expected_count}",
        )
        for ref in refs:
            path = _from_repo(ref, repo_root)
            confined = path.resolve().is_relative_to(repo_root)
            report.check(
                f"{ref} confinement", confined,
                "inside repository" if confined else "durable file must be inside the repository",
            )
            ok = path.is_file() and path.stat().st_size > 0
            report.check(ref, ok,
                         f"exists, {path.stat().st_size}B" if ok else "missing or empty")
            report.check(
                f"{ref} declaration", ref in envelope.artifacts,
                "declared in artifacts" if ref in envelope.artifacts
                else "artifact_refs entries must also be declared in artifacts",
            )
        if expected_backend == "spec_kit":
            names = {Path(ref).name for ref in refs}
            report.check(
                "Spec Kit files", names == {"spec.md", "plan.md"},
                f"found {sorted(names)}, expected spec.md and plan.md",
            )
        return report

    gate.__name__ = f"plan_artifact_valid({expected_backend},{expected_work_type})"
    return gate
