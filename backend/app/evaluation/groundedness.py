"""Offline checks for grounded chat answer-mode decisions.

The evaluator is intentionally deterministic: it reads captured model decisions
from JSONL instead of calling Bedrock or the retrieval database.
"""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, Sequence

AnswerMode = Literal["grounded", "conversational", "insufficient_evidence"]
ANSWER_MODES: tuple[AnswerMode, ...] = (
    "grounded",
    "conversational",
    "insufficient_evidence",
)

_CITATION_MARKER_RE = re.compile(r"(?:\[\d+\]|【\d+】|\bsource\s*\d+\b)", re.IGNORECASE)


@dataclass(frozen=True)
class EvaluationCase:
    id: str
    question: str
    expected_mode: AnswerMode
    actual_mode: AnswerMode
    response: str
    citation_count: int
    citation_titles: tuple[str, ...] = ()
    expected_citation_titles: tuple[str, ...] = ()


@dataclass(frozen=True)
class CaseResult:
    case: EvaluationCase
    passed: bool
    reasons: tuple[str, ...]


@dataclass(frozen=True)
class EvaluationReport:
    results: tuple[CaseResult, ...]
    confusion_matrix: dict[tuple[AnswerMode, AnswerMode], int]

    @property
    def total(self) -> int:
        return len(self.results)

    @property
    def passed(self) -> int:
        return sum(1 for result in self.results if result.passed)

    @property
    def failed(self) -> int:
        return self.total - self.passed

    @property
    def accuracy(self) -> float:
        return self.passed / self.total if self.total else 0.0


def load_cases(path: Path) -> list[EvaluationCase]:
    """Load one groundedness evaluation case per JSONL line."""
    cases: list[EvaluationCase] = []
    for line_number, raw_line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        try:
            payload = json.loads(line)
        except json.JSONDecodeError as exc:
            raise ValueError(f"{path}:{line_number}: invalid JSON") from exc
        cases.append(_case_from_payload(payload, path=path, line_number=line_number))
    return cases


def evaluate_cases(cases: Sequence[EvaluationCase]) -> EvaluationReport:
    results = tuple(evaluate_case(case) for case in cases)
    matrix: Counter[tuple[AnswerMode, AnswerMode]] = Counter()
    for case in cases:
        matrix[(case.expected_mode, case.actual_mode)] += 1
    return EvaluationReport(results=results, confusion_matrix=dict(matrix))


def evaluate_case(case: EvaluationCase) -> CaseResult:
    reasons: list[str] = []

    if case.expected_mode != case.actual_mode:
        reasons.append(f"expected {case.expected_mode}, got {case.actual_mode}")

    if case.actual_mode == "grounded" and case.citation_count == 0:
        reasons.append("grounded answer selected no citations")

    if case.actual_mode != "grounded" and case.citation_count > 0:
        reasons.append("non-grounded answer selected citations")

    if _CITATION_MARKER_RE.search(case.response):
        reasons.append("spoken response contains an inline citation marker")

    for expected_title in case.expected_citation_titles:
        if not _title_present(expected_title, case.citation_titles):
            reasons.append(f"missing expected citation title: {expected_title}")

    return CaseResult(case=case, passed=not reasons, reasons=tuple(reasons))


def format_report(report: EvaluationReport) -> str:
    lines = [
        "Offline groundedness evaluation",
        f"cases: {report.total}",
        f"passed: {report.passed}",
        f"failed: {report.failed}",
        f"accuracy: {report.accuracy:.1%}",
        "",
        "confusion matrix (expected -> actual):",
    ]
    for expected in ANSWER_MODES:
        row = ", ".join(
            f"{actual}={report.confusion_matrix.get((expected, actual), 0)}"
            for actual in ANSWER_MODES
        )
        lines.append(f"- {expected}: {row}")

    failures = [result for result in report.results if not result.passed]
    if failures:
        lines.extend(["", "failures:"])
        for result in failures:
            reason_text = "; ".join(result.reasons)
            lines.append(f"- {result.case.id}: {reason_text}")

    return "\n".join(lines)


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Evaluate captured groundedness decisions from a JSONL file."
    )
    parser.add_argument("cases", type=Path, help="Path to groundedness cases in JSONL format.")
    args = parser.parse_args(argv)

    report = evaluate_cases(load_cases(args.cases))
    print(format_report(report))
    return 0 if report.failed == 0 else 1


def _case_from_payload(payload: object, *, path: Path, line_number: int) -> EvaluationCase:
    if not isinstance(payload, dict):
        raise ValueError(f"{path}:{line_number}: case must be a JSON object")

    citations = payload.get("citations", [])
    citation_titles = _citation_titles(citations, path=path, line_number=line_number)
    citation_count = int(payload.get("citation_count", len(citation_titles)))

    return EvaluationCase(
        id=_required_string(payload, "id", path=path, line_number=line_number),
        question=_required_string(payload, "question", path=path, line_number=line_number),
        expected_mode=_answer_mode(payload.get("expected_mode"), path=path, line_number=line_number),
        actual_mode=_answer_mode(payload.get("actual_mode"), path=path, line_number=line_number),
        response=str(payload.get("response", "")),
        citation_count=citation_count,
        citation_titles=citation_titles,
        expected_citation_titles=tuple(payload.get("expected_citation_titles", [])),
    )


def _required_string(
    payload: dict[str, object], key: str, *, path: Path, line_number: int
) -> str:
    value = payload.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{path}:{line_number}: {key} must be a non-empty string")
    return value


def _answer_mode(value: object, *, path: Path, line_number: int) -> AnswerMode:
    if value not in ANSWER_MODES:
        allowed = ", ".join(ANSWER_MODES)
        raise ValueError(f"{path}:{line_number}: answer mode must be one of {allowed}")
    return value


def _citation_titles(citations: object, *, path: Path, line_number: int) -> tuple[str, ...]:
    if citations == []:
        return ()
    if not isinstance(citations, list):
        raise ValueError(f"{path}:{line_number}: citations must be a list")

    titles: list[str] = []
    for citation in citations:
        if not isinstance(citation, dict):
            raise ValueError(f"{path}:{line_number}: each citation must be an object")
        title = citation.get("title")
        if isinstance(title, str) and title.strip():
            titles.append(title)
    return tuple(titles)


def _title_present(expected_title: str, citation_titles: tuple[str, ...]) -> bool:
    expected = expected_title.casefold()
    return any(expected in title.casefold() for title in citation_titles)


if __name__ == "__main__":
    raise SystemExit(main())

