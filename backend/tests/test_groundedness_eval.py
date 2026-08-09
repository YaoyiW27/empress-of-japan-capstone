from pathlib import Path

from app.evaluation.groundedness import (
    EvaluationCase,
    evaluate_case,
    evaluate_cases,
    format_report,
    load_cases,
    main,
)


FIXTURE = Path(__file__).parent / "fixtures" / "groundedness_eval.jsonl"


def test_load_cases_reads_jsonl_fixture() -> None:
    cases = load_cases(FIXTURE)

    assert [case.id for case in cases] == [
        "grounded-voyage-date",
        "visitor-greeting",
        "missing-manifest",
    ]
    assert cases[0].citation_count == 1
    assert cases[0].citation_titles == ("Empress of Japan II service history",)


def test_evaluate_cases_passes_matching_groundedness_decisions() -> None:
    report = evaluate_cases(load_cases(FIXTURE))

    assert report.total == 3
    assert report.passed == 3
    assert report.failed == 0
    assert report.accuracy == 1.0


def test_evaluate_case_flags_unsupported_grounded_answer() -> None:
    result = evaluate_case(
        EvaluationCase(
            id="grounded-without-source",
            question="What year was the ship launched?",
            expected_mode="grounded",
            actual_mode="grounded",
            response="The ship was launched in 1930.",
            citation_count=0,
        )
    )

    assert not result.passed
    assert result.reasons == ("grounded answer selected no citations",)


def test_evaluate_case_flags_mode_mismatch_and_spoken_citation_marker() -> None:
    result = evaluate_case(
        EvaluationCase(
            id="inline-source",
            question="Tell me about a menu.",
            expected_mode="grounded",
            actual_mode="conversational",
            response="The menu mentions dinner service [1].",
            citation_count=0,
        )
    )

    assert not result.passed
    assert "expected grounded, got conversational" in result.reasons
    assert "spoken response contains an inline citation marker" in result.reasons


def test_format_report_includes_confusion_matrix_and_failures() -> None:
    report = evaluate_cases(
        [
            EvaluationCase(
                id="bad-case",
                question="What happened?",
                expected_mode="grounded",
                actual_mode="insufficient_evidence",
                response="I do not have enough evidence.",
                citation_count=0,
            )
        ]
    )

    output = format_report(report)

    assert "accuracy: 0.0%" in output
    assert "- grounded: grounded=0, conversational=0, insufficient_evidence=1" in output
    assert "- bad-case: expected grounded, got insufficient_evidence" in output


def test_cli_returns_zero_for_passing_fixture(capsys) -> None:
    exit_code = main([str(FIXTURE)])

    captured = capsys.readouterr()
    assert exit_code == 0
    assert "passed: 3" in captured.out
