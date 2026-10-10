"""Extract node executor tests.

Mirrors test_decision_node.py: stub extractor unit tests, ExtractConfig
validation, compute_extract through the compile+run seam on the stub
provider, RuleGate routing, and the upload route. Everything here is
offline -- OCR/vision live paths are covered by their honest
unavailability contracts, not by live runs.
"""

from __future__ import annotations

import asyncio
import io
import shutil

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from pypdf import PdfWriter

from app import storage
from app.compiler import compile_graph
from app.extraction import (
    BackendUnavailableError,
    DeterministicExtractor,
    DocumentFacts,
    ExtractionError,
    build_result,
    default_rule_gate,
    extract_with_rules,
    get_extractor,
    probe_document,
    resolve_extraction,
    resolve_extraction_schema,
    validate_fields,
)
from app.extraction.documents import get_document, latest_document, store_upload
from app.extraction.ocr import TesseractExtractor
from app.extraction.schemas import model_from_json_schema
from app.extraction.stub import StubExtractor
from app.extraction.text import TextExtractor
from app.extraction.vision import VisionExtractor
from app.main import app
from app.models import (
    GraphDefinition,
    GraphEdge,
    GraphNode,
    NodePosition,
    NodeTrace,
    NodeType,
)
from app.node_configs import ExtractConfig, validate_node_config
from app.replay import frozen_node_outputs
from app.runtime import COMPILED_WORKFLOWS, get_run_summary, start_run_inline
from tests.helpers import editable_demo_graph

client = TestClient(app)


def _fresh_demo() -> GraphDefinition:
    """An editable demo under a unique id: the session-scoped test DB is
    shared across tests, so uploads must not leak between them via the
    graph id."""
    from uuid import uuid4

    demo = editable_demo_graph()
    demo = demo.model_copy(update={"id": f"demo_extract_{uuid4().hex[:8]}"})
    storage.save_graph(demo)
    return demo


def run(coro):
    return asyncio.run(coro)


# --- synthetic documents (no machine-specific fixture paths) -----------------
# Ports the spike's eval-fixture-set idea: a small in-memory corpus the stub
# baseline runs over deterministically.


def text_pdf_bytes(line: str) -> bytes:
    """Minimal one-page PDF with embedded text; xref offsets computed so
    strict parsers accept it."""
    stream = f"BT /F1 24 Tf 100 700 Td ({line}) Tj ET\n".encode("latin-1")
    objs = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"endstream",
    ]
    out = [b"%PDF-1.4\n"]
    offsets = []
    for i, body in enumerate(objs, start=1):
        offsets.append(sum(len(p) for p in out))
        out.append(b"%d 0 obj\n" % i + body + b"\nendobj\n")
    xref_pos = sum(len(p) for p in out)
    out.append(b"xref\n0 %d\n" % (len(objs) + 1))
    out.append(b"0000000000 65535 f \n")
    for off in offsets:
        out.append(b"%010d 00000 n \n" % off)
    out.append(
        b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n"
        % (len(objs) + 1, xref_pos)
    )
    return b"".join(out)


def blank_pdf_bytes() -> bytes:
    writer = PdfWriter()
    writer.add_blank_page(612, 792)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


def blank_png_bytes() -> bytes:
    img = Image.new("RGB", (120, 120), "white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _extract_graph(
    config: dict, graph_id: str = "g_extract", input_variable: str = "question"
) -> GraphDefinition:
    nodes = [
        GraphNode(
            id="input_1",
            type=NodeType.INPUT,
            position=NodePosition(x=0, y=0),
            config={"variableName": input_variable},
        ),
        GraphNode(
            id="extract_1",
            type=NodeType.EXTRACT,
            position=NodePosition(x=200, y=0),
            config=config,
        ),
        GraphNode(
            id="out_1", type=NodeType.OUTPUT, position=NodePosition(x=400, y=0)
        ),
    ]
    edges = [
        GraphEdge(id="e_in", source="input_1", target="extract_1"),
        GraphEdge(id="e_out", source="extract_1", target="out_1"),
    ]
    return GraphDefinition(
        id=graph_id,
        name="Extract test graph",
        entry_node_id="input_1",
        nodes=nodes,
        edges=edges,
    )


async def _run(graph: GraphDefinition, run_input: dict, **kwargs):
    compiled = compile_graph(graph, "cwf_extract_test")
    assert compiled.ok, compiled.diagnostics
    COMPILED_WORKFLOWS["cwf_extract_test"] = graph
    run_id, bus = await start_run_inline(
        "cwf_extract_test", run_input, provider="stub", **kwargs
    )
    return get_run_summary(run_id), bus


def _extract_event(bus, event_type: str):
    return [e for e in bus.collected_events() if e.event_type == event_type]


async def _upload(graph_id: str, content: bytes, name: str, mime: str) -> dict:
    return await store_upload(graph_id, name, mime, content)


# --- stub backend ------------------------------------------------------------


def test_stub_deterministic():
    async def go():
        ext = StubExtractor()
        a = await ext.extract(
            document_bytes=b"FIXTURE",
            mime="application/pdf",
            schema=DocumentFacts,
            file_name="a.pdf",
        )
        b = await ext.extract(
            document_bytes=b"OTHER",
            mime="image/png",
            schema=DocumentFacts,
            file_name="b.png",
        )
        return a, b

    a, b = run(go())
    assert not a.abstained and not b.abstained
    # Same input always yields the same document -- the stable baseline.
    assert a.document.fields.model_dump() == b.document.fields.model_dump()
    assert a.document.markdown == b.document.markdown
    assert a.confidence == 1.0
    assert a.provider_name == "stub"


def test_stub_rejects_custom_schema():
    custom = model_from_json_schema(
        "CustomExtract",
        {"type": "object", "properties": {"title": {"type": "string"}}},
    )
    with pytest.raises(ExtractionError, match="document-facts"):
        run(
            StubExtractor().extract(
                document_bytes=b"FIXTURE", mime="application/pdf", schema=custom
            )
        )


def test_stub_fixture_set_deterministic():
    """The spike's eval-fixture-set idea, ported: a small in-memory corpus
    runs over the stub baseline deterministically."""

    async def go():
        ext = StubExtractor()
        corpus = [
            (text_pdf_bytes("Sorry game rules " * 10), "application/pdf", "sorry.pdf"),
            (text_pdf_bytes("Splendor rules " * 10), "application/pdf", "splendor.pdf"),
            (blank_pdf_bytes(), "application/pdf", "catan.pdf"),
            (blank_png_bytes(), "image/png", "photo.png"),
        ]
        return [
            await ext.extract(
                document_bytes=data, mime=mime, schema=DocumentFacts, file_name=name
            )
            for data, mime, name in corpus
        ]

    results = run(go())
    assert len(results) == 4
    first = results[0].document.fields.model_dump()
    for result in results:
        assert not result.abstained
        assert result.confidence == 1.0
        assert result.document.fields.model_dump() == first
        assert result.document.fields.extraction_method == "stub"


def test_get_extractor_defaults_to_stub():
    ext = get_extractor()
    assert ext.provider_name == "stub"
    ext = get_extractor(provider="stub")
    assert isinstance(ext, StubExtractor)


def test_get_extractor_unknown_provider():
    with pytest.raises(ValueError, match="unknown extraction provider"):
        get_extractor(provider="nope")


def test_get_extractor_deterministic_builds_stage_backends():
    ext = get_extractor(provider="deterministic", stages=["text", "ocr"])
    assert isinstance(ext, DeterministicExtractor)
    assert sorted(ext.extractors) == ["ocr", "text"]


# --- schemas -----------------------------------------------------------------


def test_resolve_extraction_schema_default_is_document_facts():
    assert resolve_extraction_schema(None) is DocumentFacts
    assert DocumentFacts.field_names() == [
        "extraction_method",
        "has_embedded_text",
        "layout_preserved",
        "page_count",
        "source_file",
        "title",
        "total_chars",
    ]


def test_model_from_json_schema_builds_custom_model():
    cls = model_from_json_schema(
        "CustomExtract",
        {
            "type": "object",
            "required": ["title", "confidence"],
            "properties": {
                "title": {"type": "string", "minLength": 1},
                "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                "kind": {"type": "string", "enum": ["a", "b"]},
            },
        },
    )
    obj = cls(title="t", confidence=0.5)
    assert obj.title == "t"
    assert obj.kind is None
    assert cls.field_names() == ["confidence", "kind", "title"]


def test_model_from_json_schema_rejects_bad_schemas():
    with pytest.raises(ValueError, match="type 'object'"):
        model_from_json_schema("X", {"type": "array"})
    with pytest.raises(ValueError, match="non-empty 'properties'"):
        model_from_json_schema("X", {"type": "object", "properties": {}})
    with pytest.raises(ValueError, match="unsupported type"):
        model_from_json_schema(
            "X", {"type": "object", "properties": {"a": {"type": "object"}}}
        )
    with pytest.raises(ValueError, match="enum"):
        model_from_json_schema(
            "X",
            {"type": "object", "properties": {"a": {"type": "integer", "enum": [1]}}},
        )


def test_validate_fields_hard_error_after_repair():
    bad = {"title": "", "page_count": 0}  # violates min_length and ge
    with pytest.raises(ExtractionError, match="after one repair retry"):
        run(validate_fields(DocumentFacts, bad, retry=lambda: dict(bad)))


def test_resolve_extraction_threshold():
    result = run(
        StubExtractor().extract(
            document_bytes=b"F", mime="application/pdf", schema=DocumentFacts
        )
    )
    assert resolve_extraction(result, threshold=0.9) is result.document
    assert resolve_extraction(result, threshold=1.1) == "escalate"
    abstained = build_result(
        document=None,
        confidence=0.0,
        provider_name="x",
        model="x",
        latency_ms=0.0,
        attempts=0,
        raw="x",
    )
    assert resolve_extraction(abstained, threshold=0.0) == "escalate"


# --- ExtractConfig validation ------------------------------------------------


def test_extract_config_defaults():
    cfg = ExtractConfig.model_validate({})
    assert cfg.source == "upload"
    assert cfg.stages == ["text", "ocr"]
    assert cfg.outputSchema is None
    assert cfg.provider == "stub"
    assert cfg.model is None
    assert cfg.threshold == 0.7
    assert cfg.pageLimit == 10


def test_extract_config_validation():
    assert validate_node_config(NodeType.EXTRACT, {}) == []
    assert (
        validate_node_config(NodeType.EXTRACT, {"stages": ["nope"]}) != []
    )  # unknown stage name fails at save time
    assert (
        validate_node_config(NodeType.EXTRACT, {"stages": []}) != []
    )  # deterministic routing needs a backend
    assert (
        validate_node_config(NodeType.EXTRACT, {"outputSchema": {"type": "array"}})
        != []
    )  # bad inline schema
    assert (
        validate_node_config(
            NodeType.EXTRACT, {"source": "variable"}
        )
        != []
    )  # variableName required with source=variable
    assert (
        validate_node_config(
            NodeType.EXTRACT, {"source": "variable", "variableName": "docVar"}
        )
        == []
    )


# --- RuleGate routing --------------------------------------------------------


def test_gate_routes_text_pdf_to_text():
    probe = probe_document(text_pdf_bytes("rules text " * 20), "application/pdf")
    assert probe.first_page_chars >= 50
    assert default_rule_gate().check(probe) == ("text_pdf", "text")


def test_gate_routes_image_to_ocr():
    probe = probe_document(blank_png_bytes(), "image/png")
    assert default_rule_gate().check(probe) == ("image_input", "ocr")


def test_gate_routes_blank_pdf_to_ocr():
    probe = probe_document(blank_pdf_bytes(), "application/pdf")
    assert probe.first_page_chars == 0
    assert default_rule_gate().check(probe) == ("scanned_pdf", "ocr")


def test_gate_abstains_on_unsupported_mime():
    result = run(
        extract_with_rules(
            default_rule_gate(),
            {"text": TextExtractor()},
            document_bytes=b"hello",
            mime="text/plain",
            schema=DocumentFacts,
        )
    )
    assert result.abstained
    assert result.document is None
    assert result.provider_name == "rule_gate"
    assert result.rule_hit == "unsupported_mime"
    assert result.attempts == 0


def test_deterministic_extractor_rejects_disabled_stage():
    # stages=["text", "vision"]: a blank PDF routes to ocr, which is not
    # enabled -> loud failure, never a silent fallback to another stage.
    # (A single configured stage instead forces that route -- see the
    # forced-route test below.)
    ext = get_extractor(provider="deterministic", stages=["text", "vision"])
    with pytest.raises(ExtractionError, match="not enabled"):
        run(
            ext.extract(
                document_bytes=blank_pdf_bytes(),
                mime="application/pdf",
                schema=DocumentFacts,
            )
        )


def test_deterministic_extractor_single_stage_forces_route():
    ext = get_extractor(provider="deterministic", stages=["text"])
    result = run(
        ext.extract(
            document_bytes=text_pdf_bytes("forced route " * 10),
            mime="application/pdf",
            schema=DocumentFacts,
            file_name="forced.pdf",
        )
    )
    assert not result.abstained
    assert result.rule_hit == "forced"
    assert result.provider_name == "text"


# --- text backend ------------------------------------------------------------


def test_text_backend_happy_path():
    result = run(
        extract_with_rules(
            default_rule_gate(),
            {"text": TextExtractor(), "ocr": TesseractExtractor()},
            document_bytes=text_pdf_bytes("Hello extraction world " * 10),
            mime="application/pdf",
            schema=DocumentFacts,
            file_name="hello.pdf",
        )
    )
    assert not result.abstained
    assert result.provider_name == "text"
    assert result.rule_hit == "text_pdf"
    fields = result.document.fields
    assert fields.title == ("Hello extraction world " * 10)[:200]
    assert fields.page_count == 1
    assert fields.extraction_method == "text"
    assert fields.layout_preserved is True
    assert fields.source_file == "hello.pdf"
    assert len(result.document.pages) == 1


def test_text_backend_abstains_on_empty_pdf():
    result = run(
        TextExtractor().extract(
            document_bytes=blank_pdf_bytes(),
            mime="application/pdf",
            schema=DocumentFacts,
        )
    )
    assert result.abstained
    assert result.document is None


def test_text_backend_rejects_images():
    with pytest.raises(ExtractionError, match="image"):
        run(
            TextExtractor().extract(
                document_bytes=blank_png_bytes(),
                mime="image/png",
                schema=DocumentFacts,
            )
        )


# --- OCR backend: unavailable path -------------------------------------------


def test_ocr_unavailable_reports_requirements(monkeypatch):
    monkeypatch.setattr(shutil, "which", lambda _name: None)
    ext = TesseractExtractor()
    with pytest.raises(BackendUnavailableError, match="tesseract-ocr"):
        run(
            ext.extract(
                document_bytes=blank_png_bytes(),
                mime="image/png",
                schema=DocumentFacts,
            )
        )


# --- vision backend: blocked, honestly ---------------------------------------


def test_vision_blocked_names_requirements(monkeypatch):
    import urllib.request

    monkeypatch.delenv("GROQ_API_KEY", raising=False)

    def _no_network(*args, **kwargs):
        raise OSError("no network in test")

    monkeypatch.setattr(urllib.request, "urlopen", _no_network)
    ext = VisionExtractor(model="qwen3-vl:8b")
    assert not ext.available()
    with pytest.raises(BackendUnavailableError, match="Vision backend blocked"):
        run(
            ext.extract(
                document_bytes=b"PNG", mime="image/png", schema=DocumentFacts
            )
        )


def test_vision_response_parser_contract():
    ext = VisionExtractor()
    raw = (
        '{"title": "Test Doc", "page_count": 3, "total_chars": 42, '
        '"source_file": "x.png", "has_embedded_text": false, '
        '"extraction_method": "vision", "layout_preserved": false}'
    )
    fields, attempts = run(ext.parse_vision_response(raw, DocumentFacts, "x.png"))
    assert attempts == 1
    assert fields.title == "Test Doc"
    assert fields.page_count == 3


def test_vision_response_parser_rejects_non_json():
    ext = VisionExtractor()
    with pytest.raises(BackendUnavailableError, match="non-JSON"):
        run(ext.parse_vision_response("not json at all", DocumentFacts, "x.png"))


# --- compute_extract through the run seam ------------------------------------


@pytest.mark.asyncio
async def test_extract_run_binds_latest_upload() -> None:
    demo = _fresh_demo()
    await _upload(demo.id, text_pdf_bytes("latest wins " * 10), "doc.pdf", "application/pdf")

    summary, bus = await _run(_extract_graph({}, demo.id), {})
    assert summary.status == "succeeded", summary.error
    completed = _extract_event(bus, "extract.completed")
    assert len(completed) == 1
    payload = completed[0].payload
    assert payload["abstained"] is False
    assert payload["provider"] == "stub"
    assert payload["ruleHit"] is None
    assert payload["confidence"] == 1.0
    assert payload["fieldNames"] == DocumentFacts.field_names()
    assert payload["fileName"] == "doc.pdf"
    assert payload["mime"] == "application/pdf"


@pytest.mark.asyncio
async def test_extract_run_binds_run_input_document_id() -> None:
    demo = _fresh_demo()
    first = await _upload(demo.id, b"first", "first.pdf", "application/pdf")
    second = await _upload(demo.id, b"second", "second.pdf", "application/pdf")

    summary, bus = await _run(_extract_graph({}, demo.id), {"documentId": second["documentId"]})
    assert summary.status == "succeeded", summary.error
    completed = _extract_event(bus, "extract.completed")
    assert completed[0].payload["documentId"] == second["documentId"]
    assert completed[0].payload["documentId"] != first["documentId"]


@pytest.mark.asyncio
async def test_extract_run_binds_variable_source() -> None:
    demo = _fresh_demo()
    uploaded = await _upload(demo.id, b"v", "v.pdf", "application/pdf")

    graph = _extract_graph(
        {"source": "variable", "variableName": "docVar"}, demo.id, input_variable="docVar"
    )
    summary, bus = await _run(graph, {"docVar": uploaded["documentId"]})
    assert summary.status == "succeeded", summary.error
    completed = _extract_event(bus, "extract.completed")
    assert completed[0].payload["documentId"] == uploaded["documentId"]


@pytest.mark.asyncio
async def test_extract_run_fails_without_upload() -> None:
    demo = _fresh_demo()

    summary, bus = await _run(_extract_graph({}, demo.id), {})
    assert summary.status == "failed"
    assert "no document uploaded" in (summary.error or "")
    # Fail-loud still emits nothing to extract: no extract.completed on the
    # unbound path (there is no document to report on).
    assert _extract_event(bus, "extract.completed") == []


@pytest.mark.asyncio
async def test_extract_abstain_emits_then_fails_loud() -> None:
    demo = _fresh_demo()
    # Blank PDF + text-only stage: the text backend honestly abstains.
    await _upload(demo.id, blank_pdf_bytes(), "blank.pdf", "application/pdf")

    summary, bus = await _run(
        _extract_graph({"provider": "deterministic", "stages": ["text"]}, demo.id), {}
    )
    assert summary.status == "failed"
    assert "abstained" in (summary.error or "")
    completed = _extract_event(bus, "extract.completed")
    assert len(completed) == 1
    assert completed[0].payload["abstained"] is True
    assert completed[0].payload["ruleHit"] == "forced"


@pytest.mark.asyncio
async def test_extract_custom_schema_on_stub_fails_loud() -> None:
    demo = _fresh_demo()
    await _upload(demo.id, b"x", "x.pdf", "application/pdf")

    # The stub only serves the built-in document-facts schema: a custom
    # schema fails the run with a clear error, never a guessed document.
    summary, _ = await _run(
        _extract_graph(
            {
                "outputSchema": {
                    "type": "object",
                    "properties": {"title": {"type": "string"}},
                }
            },
            demo.id,
        ),
        {},
    )
    assert summary.status == "failed"
    assert "document-facts" in (summary.error or "")


# --- upload route ------------------------------------------------------------


def test_upload_route_200() -> None:
    demo = _fresh_demo()
    content = text_pdf_bytes("upload route " * 10)
    response = client.post(
        f"/api/graphs/{demo.id}/extract",
        files={"file": ("rules.pdf", content, "application/pdf")},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["graphId"] == demo.id
    assert body["fileName"] == "rules.pdf"
    assert body["mime"] == "application/pdf"
    assert body["sizeBytes"] == len(content)
    assert body["pageCount"] == 1
    assert body["documentId"]
    # Stored bytes round-trip.
    stored = get_document(body["documentId"])
    assert stored is not None
    assert stored.content_bytes() == content
    assert latest_document(demo.id).id == body["documentId"]


def test_upload_route_404_for_unknown_graph() -> None:
    response = client.post(
        "/api/graphs/no-such-graph/extract",
        files={"file": ("x.pdf", b"%PDF", "application/pdf")},
    )
    assert response.status_code == 404


def test_upload_route_400_for_unsupported_mime() -> None:
    demo = _fresh_demo()
    response = client.post(
        f"/api/graphs/{demo.id}/extract",
        files={"file": ("notes.txt", b"hello", "text/plain")},
    )
    assert response.status_code == 400


def test_upload_route_413_over_size_cap(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.extraction.documents.EXTRACT_MAX_UPLOAD_BYTES", 10
    )
    demo = _fresh_demo()
    response = client.post(
        f"/api/graphs/{demo.id}/extract",
        files={"file": ("big.pdf", b"x" * 11, "application/pdf")},
    )
    assert response.status_code == 413


def test_upload_route_403_in_demo_mode(monkeypatch) -> None:
    monkeypatch.setenv("PUBLIC_DEMO_MODE", "1")
    demo = _fresh_demo()
    response = client.post(
        f"/api/graphs/{demo.id}/extract",
        files={"file": ("x.pdf", b"%PDF", "application/pdf")},
    )
    assert response.status_code == 403


# --- replay: deterministic extracts recompute --------------------------------


def _trace(node_id: str, node_type: NodeType, output: dict) -> NodeTrace:
    return NodeTrace(
        node_id=node_id,
        node_type=node_type,
        status="succeeded",
        output=output,
        started_at="2026-10-10T00:00:00+00:00",
        completed_at="2026-10-10T00:00:01+00:00",
    )


def test_replay_recomputes_deterministic_extract_nodes() -> None:
    graph = _extract_graph({"provider": "stub"})
    vision_graph = _extract_graph({"provider": "vision"})
    traces = [
        _trace("input_1", NodeType.INPUT, "q"),
        _trace("extract_1", NodeType.EXTRACT, {"fields": {}}),
        _trace("out_1", NodeType.OUTPUT, {}),
    ]
    frozen = frozen_node_outputs(graph, traces)
    # Deterministic given the bytes -> recompute, not frozen.
    assert "extract_1" not in frozen
    # Vision is non-deterministic -> frozen like any other model node.
    frozen_vision = frozen_node_outputs(vision_graph, traces)
    assert "extract_1" in frozen_vision
