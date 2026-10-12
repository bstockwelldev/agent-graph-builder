"""Seeded demo workflows for the public gallery.

The first entry is the one canonical demo workflow (POC spec section 3): classify
the user's question, then route to a deterministic tool lookup for technical
questions or a free-form LLM answer for everything else. Later entries are added
by the demo-gallery program. Every entry in SEEDED_DEMOS is seeded at startup,
served read-only through protected_graph(), and listed by GET /api/demos.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from .models import EdgeKind, GraphDefinition, GraphEdge, GraphNode, NodePosition, NodeType
from .models import Fixture, FixtureExpectation
from .resource_models import EvalScorer, EvalSuite, FixtureDataset

DEMO_GRAPH_ID = "demo_classify_and_route"


@dataclass(frozen=True)
class SeededDemo:
    """One gallery entry: how to build it and how to present it."""

    id: str
    title: str
    tagline: str
    node_types: tuple[str, ...]
    build: Callable[[], GraphDefinition]


def protected_graph(graph_id: str) -> GraphDefinition | None:
    """The canonical definition of a seeded, read-only graph, or None for
    ordinary graphs. Every visitor to the public deploy lands on the gallery,
    so no one may edit or delete a seeded demo; the Studio forks edits into a copy."""
    for demo in SEEDED_DEMOS:
        if demo.id == graph_id:
            return demo.build()
    return None


def iter_seeded_demos() -> tuple[SeededDemo, ...]:
    return SEEDED_DEMOS


def build_demo_graph() -> GraphDefinition:
    nodes = [
        GraphNode(
            id="input_1",
            type=NodeType.INPUT,
            position=NodePosition(x=24, y=110),
            config={"variableName": "question"},
        ),
        GraphNode(
            id="prompt_classify",
            type=NodeType.PROMPT,
            position=NodePosition(x=360, y=110),
            config={
                "template": (
                    "Classify the following user question as exactly one word: "
                    "either 'technical' or 'other'. Respond with only that single word.\n\n"
                    "Question: {question}"
                )
            },
        ),
        GraphNode(
            id="llm_classify",
            type=NodeType.LLM,
            position=NodePosition(x=696, y=110),
            config={
                "model": "qwen2.5:3b",
                "systemPrompt": (
                    "You are a strict classifier. Respond with exactly one word: "
                    "technical or other."
                ),
            },
        ),
        GraphNode(
            id="router_1",
            type=NodeType.ROUTER,
            position=NodePosition(x=1032, y=110),
            config={},
        ),
        GraphNode(
            id="tool_lookup",
            type=NodeType.TOOL,
            position=NodePosition(x=1704, y=196),
            config={"toolName": "lookup_topic", "inputVariable": "question"},
        ),
        GraphNode(
            id="prompt_answer",
            type=NodeType.PROMPT,
            position=NodePosition(x=1368, y=24),
            config={
                "template": (
                    "Answer the user's question helpfully and concisely.\n\nQuestion: {question}"
                )
            },
        ),
        GraphNode(
            id="llm_answer",
            type=NodeType.LLM,
            position=NodePosition(x=1704, y=24),
            config={"model": "qwen2.5:3b", "systemPrompt": "You are a helpful assistant."},
        ),
        GraphNode(
            id="output_1",
            type=NodeType.OUTPUT,
            position=NodePosition(x=2040, y=110),
            config={},
        ),
    ]

    edges = [
        GraphEdge(
            id="e_input_prompt", source="input_1", target="prompt_classify", kind=EdgeKind.SEQUENCE
        ),
        GraphEdge(
            id="e_prompt_llm",
            source="prompt_classify",
            target="llm_classify",
            kind=EdgeKind.SEQUENCE,
        ),
        GraphEdge(
            id="e_llm_router", source="llm_classify", target="router_1", kind=EdgeKind.SEQUENCE
        ),
        GraphEdge(
            id="e_router_tool",
            source="router_1",
            target="tool_lookup",
            kind=EdgeKind.CONDITIONAL,
            condition="technical",
        ),
        GraphEdge(
            id="e_router_answer", source="router_1", target="prompt_answer", kind=EdgeKind.DEFAULT
        ),
        GraphEdge(
            id="e_tool_output", source="tool_lookup", target="output_1", kind=EdgeKind.SEQUENCE
        ),
        GraphEdge(
            id="e_answerprompt_llm",
            source="prompt_answer",
            target="llm_answer",
            kind=EdgeKind.SEQUENCE,
        ),
        GraphEdge(
            id="e_llmanswer_output", source="llm_answer", target="output_1", kind=EdgeKind.SEQUENCE
        ),
    ]

    return GraphDefinition(
        id=DEMO_GRAPH_ID,
        name="Classify & Route (demo)",
        entry_node_id="input_1",
        nodes=nodes,
        edges=edges,
        orientation="auto",
    )


# SEEDED_DEMOS is defined at the end of this module, after all builders,
# so every entry can reference its builder at import time.


# D2 (Decider) builder is defined below; D3 (Rulebook Q&A), D4 (Content Studio)
# and D5 (Research Agent) register here as their builders land.


DEMO_DECIDER_ID = "demo_decider"


def build_decider_demo() -> GraphDefinition:
    """D2 -- The Decider: a decision model routes every request to its tier.

    The decision node emits a schema-validated Route outcome (local_answer /
    frontier_reasoning / human_review / abstain) with a calibrated confidence,
    then routes by exact outcome match. A deterministic rule fires before any
    model call; low-confidence and abstained outcomes take the default edge.
    On the stub provider every path below is deterministic, so the demo is
    keyless and the eval suite can measure route accuracy exactly.
    """
    nodes = [
        GraphNode(
            id="input_1",
            type=NodeType.INPUT,
            position=NodePosition(x=24, y=300),
            config={"variableName": "request"},
        ),
        GraphNode(
            id="decide_1",
            type=NodeType.DECISION,
            position=NodePosition(x=360, y=300),
            config={
                "schema": "route",
                "threshold": 0.7,
                "onLowConfidence": "default",
                "provider": "stub",
                "rules": [
                    {
                        "name": "tournament-director",
                        "match": "tournament director",
                        "verdict": "human_review",
                    }
                ],
            },
        ),
        GraphNode(
            id="prompt_quick",
            type=NodeType.PROMPT,
            position=NodePosition(x=700, y=40),
            config={
                "template": "Answer briefly and directly.\n\nRequest: {request}"
            },
        ),
        GraphNode(
            id="llm_quick",
            type=NodeType.LLM,
            position=NodePosition(x=1036, y=40),
            config={
                "model": "qwen2.5:3b",
                "systemPrompt": "You are a concise assistant. Answer in one or two sentences.",
            },
        ),
        GraphNode(
            id="prompt_deep",
            type=NodeType.PROMPT,
            position=NodePosition(x=700, y=200),
            config={
                "template": "Think step by step, then answer thoroughly.\n\nRequest: {request}"
            },
        ),
        GraphNode(
            id="llm_deep",
            type=NodeType.LLM,
            position=NodePosition(x=1036, y=200),
            config={
                "model": "qwen2.5:3b",
                "systemPrompt": "You are a careful analyst. Reason first, then answer.",
            },
        ),
        GraphNode(
            id="human_gate_1",
            type=NodeType.HUMAN_GATE,
            position=NodePosition(x=700, y=360),
            config={
                "content": "A sensitive request needs human review before the assistant answers."
            },
        ),
        GraphNode(
            id="prompt_careful",
            type=NodeType.PROMPT,
            position=NodePosition(x=1036, y=360),
            config={
                "template": (
                    "You are a support lead. Draft a careful, policy-aware reply.\n\n"
                    "Request: {request}"
                )
            },
        ),
        GraphNode(
            id="llm_careful",
            type=NodeType.LLM,
            position=NodePosition(x=1372, y=360),
            config={
                "model": "qwen2.5:3b",
                "systemPrompt": "You are a support lead. Be careful and precise.",
            },
        ),
        GraphNode(
            id="transform_fallback",
            type=NodeType.TRANSFORM,
            position=NodePosition(x=700, y=520),
            config={
                "type": "format_message",
                "template": (
                    "I couldn't route that request confidently "
                    "(outcome: {value.outcome}, confidence: {value.confidence}) -- "
                    "a human will take a look."
                ),
            },
        ),
        GraphNode(
            id="output_1",
            type=NodeType.OUTPUT,
            position=NodePosition(x=1700, y=280),
            config={},
        ),
    ]

    edges = [
        GraphEdge(
            id="e_input_decide", source="input_1", target="decide_1", kind=EdgeKind.SEQUENCE
        ),
        GraphEdge(
            id="e_decide_quick",
            source="decide_1",
            target="prompt_quick",
            kind=EdgeKind.CONDITIONAL,
            condition="local_answer",
        ),
        GraphEdge(
            id="e_decide_deep",
            source="decide_1",
            target="prompt_deep",
            kind=EdgeKind.CONDITIONAL,
            condition="frontier_reasoning",
        ),
        GraphEdge(
            id="e_decide_review",
            source="decide_1",
            target="human_gate_1",
            kind=EdgeKind.CONDITIONAL,
            condition="human_review",
        ),
        GraphEdge(
            id="e_decide_default",
            source="decide_1",
            target="transform_fallback",
            kind=EdgeKind.DEFAULT,
        ),
        GraphEdge(
            id="e_quick_llm", source="prompt_quick", target="llm_quick", kind=EdgeKind.SEQUENCE
        ),
        GraphEdge(
            id="e_deep_llm", source="prompt_deep", target="llm_deep", kind=EdgeKind.SEQUENCE
        ),
        GraphEdge(
            id="e_gate_prompt",
            source="human_gate_1",
            target="prompt_careful",
            kind=EdgeKind.SEQUENCE,
        ),
        GraphEdge(
            id="e_careful_llm",
            source="prompt_careful",
            target="llm_careful",
            kind=EdgeKind.SEQUENCE,
        ),
        GraphEdge(
            id="e_quick_out", source="llm_quick", target="output_1", kind=EdgeKind.SEQUENCE
        ),
        GraphEdge(
            id="e_deep_out", source="llm_deep", target="output_1", kind=EdgeKind.SEQUENCE
        ),
        GraphEdge(
            id="e_careful_out", source="llm_careful", target="output_1", kind=EdgeKind.SEQUENCE
        ),
        GraphEdge(
            id="e_fallback_out",
            source="transform_fallback",
            target="output_1",
            kind=EdgeKind.SEQUENCE,
        ),
    ]

    return GraphDefinition(
        id=DEMO_DECIDER_ID,
        name="The Decider (demo)",
        entry_node_id="input_1",
        nodes=nodes,
        edges=edges,
        orientation="auto",
    )

# ---------------------------------------------------------------------------
# D3 supporting content: the Starlight Bazaar demo rulebook. Seeded as the
# graph's extraction document at startup (public demo mode disables uploads,
# so the demo ships its document). Synthetic and public-safe by construction.

STARLIGHT_BAZAAR_FILE_NAME = "starlight-bazaar-rulebook.md"
STARLIGHT_BAZAAR_MIME = "text/markdown"

STARLIGHT_BAZAAR_MARKDOWN = '# Starlight Bazaar — Rulebook\n\n*A synthetic board game invented as public demo content for the agent-graph-builder\ndemo gallery. Any resemblance to real games is coincidental.*\n\n**Players:** 2–4 · **Time:** 45–60 minutes · **Ages:** 10+\n\n## Components\n\n- 1 bazaar board (6 stalls arranged in a ring)\n- 48 goods cards (12 each: spice, silk, copper, glass)\n- 40 starlight shards (victory points)\n- 4 merchant pawns, 4 coin purses\n- 12 event cards (including 3 Solar Flare cards)\n- 1 round tracker, 1 first-player lantern\n\n## Setup\n\n1. Place the bazaar board in the center. Shuffle the goods cards and deal **3 face-up**\n   onto each stall.\n2. Shuffle the event cards and place them face-down beside the board.\n3. Each player takes a merchant pawn, a coin purse, and **5 coins**.\n4. Place 10 starlight shards in the general supply per player (e.g., 30 shards for 3 players);\n   return the rest to the box.\n5. The player who most recently bought something at a market takes the first-player lantern\n   and goes first.\n\n## Turn Structure\n\nOn your turn, perform **exactly two** of the following actions, in any order\n(you may repeat an action):\n\n- **Travel:** Move your merchant pawn to an adjacent stall (movement is free between actions).\n- **Trade:** Buy any number of goods cards from the stall your pawn occupies.\n  Each card costs the number of coins printed on it (1–3). Sold cards are replaced\n  immediately from the deck.\n- **Haggle:** Discard 2 goods of the same type to take 3 coins from the supply.\n- **Stargaze:** Pay 4 coins to draw an event card, resolve it immediately, then discard it.\n\nAfter your two actions, play passes clockwise. When the goods deck runs out, shuffle\nthe discard pile to form a new deck.\n\n## Starlight Shards\n\nStarlight shards are victory points. You earn shards by completing **sets**:\n\n- A set of **4 different goods** (one spice, one silk, one copper, one glass) is worth\n  **3 shards**. Discard the set to the box and take 3 shards from the supply.\n- A set of **3 identical goods** is worth **2 shards**.\n\nClaim sets at any time during your turn. Shards are kept face-up in front of you.\n\n## Event Cards\n\nMost event cards grant coins or goods. The **Solar Flare** is the exception:\n\n> **Solar Flare:** Every player discards half of their coins (rounded down) to the supply.\n> Then each player may immediately claim one set for free, ignoring the normal\n> "during your turn" timing. Reshuffle this card into the event deck instead of\n> discarding it — solar flares return.\n\n## Winning\n\nThe game ends immediately when a player holds **12 or more starlight shards**.\nThat player wins. Ties are broken by remaining coins, then by fewest goods cards held.\n'

# (graph id, document id, file name, mime, markdown, page count) seeded at startup.
SEEDED_DOCUMENTS: tuple[tuple[str, str, str, str, str, int], ...] = (
    (
        "demo_rulebook_qa",
        "demo_starlight_bazaar_doc",
        STARLIGHT_BAZAAR_FILE_NAME,
        STARLIGHT_BAZAAR_MIME,
        STARLIGHT_BAZAAR_MARKDOWN,
        2,
    ),
)


DEMO_RULEBOOK_QA_ID = "demo_rulebook_qa"
DEMO_CONTENT_STUDIO_ID = "demo_content_studio"
DEMO_RESEARCH_AGENT_ID = "demo_research_agent"


def build_rulebook_qa_demo() -> GraphDefinition:
    """D3 -- Rulebook Q&A: extract the (seeded) Starlight Bazaar rulebook,
    then answer a question about it.

    extract (stub) -> transform (select the markdown) -> prompt -> llm.
    The extract node binds the graph's latest upload, which the seeder
    provides, so the demo runs in one click -- including on the public
    deploy, where uploads are disabled. The stub returns the Starlight
    fixture for this file name, keeping the demo coherent and keyless.
    """
    nodes = [
        GraphNode(
            id="input_1",
            type=NodeType.INPUT,
            position=NodePosition(x=24, y=200),
            config={"variableName": "question"},
        ),
        GraphNode(
            id="extract_1",
            type=NodeType.EXTRACT,
            position=NodePosition(x=360, y=200),
            config={"source": "upload", "provider": "stub"},
        ),
        GraphNode(
            id="transform_1",
            type=NodeType.TRANSFORM,
            position=NodePosition(x=696, y=200),
            config={"type": "select", "pointer": "/markdown"},
        ),
        GraphNode(
            id="prompt_qa",
            type=NodeType.PROMPT,
            position=NodePosition(x=1032, y=200),
            config={
                "template": (
                    "Answer the question using only the document below. "
                    "If the document does not contain the answer, say so.\n\n"
                    "Document:\n{upstream}\n\nQuestion: {question}"
                )
            },
        ),
        GraphNode(
            id="llm_1",
            type=NodeType.LLM,
            position=NodePosition(x=1368, y=200),
            config={
                "model": "qwen2.5:3b",
                "systemPrompt": "Answer questions using only the provided document.",
            },
        ),
        GraphNode(
            id="output_1",
            type=NodeType.OUTPUT,
            position=NodePosition(x=1704, y=200),
            config={},
        ),
    ]

    edges = [
        GraphEdge(
            id="e_input_extract", source="input_1", target="extract_1", kind=EdgeKind.SEQUENCE
        ),
        GraphEdge(
            id="e_extract_transform",
            source="extract_1",
            target="transform_1",
            kind=EdgeKind.SEQUENCE,
        ),
        GraphEdge(
            id="e_transform_prompt",
            source="transform_1",
            target="prompt_qa",
            kind=EdgeKind.SEQUENCE,
        ),
        GraphEdge(
            id="e_prompt_llm", source="prompt_qa", target="llm_1", kind=EdgeKind.SEQUENCE
        ),
        GraphEdge(
            id="e_llm_output", source="llm_1", target="output_1", kind=EdgeKind.SEQUENCE
        ),
    ]

    return GraphDefinition(
        id=DEMO_RULEBOOK_QA_ID,
        name="Rulebook Q&A (demo)",
        entry_node_id="input_1",
        nodes=nodes,
        edges=edges,
        orientation="auto",
    )


def build_content_studio_demo() -> GraphDefinition:
    """D4 -- Content Studio: an editorial pipeline from brief to publish-ready draft.

    input -> rubric (blocks TODO/placeholder briefs) -> branch ("script" in the
    brief picks the YouTube-script template, else the blog template) ->
    prompt -> llm (draft) -> guardrail (URLs / injection phrases fail the run)
    -> human_gate (approve the draft) -> transform (wrap as markdown) -> output.
    On the stub the "draft" is an echo -- the generation story needs a live
    provider (or the recorded walkthrough); the pipeline mechanics are what
    the public demo shows.
    """
    nodes = [
        GraphNode(
            id="input_1",
            type=NodeType.INPUT,
            position=NodePosition(x=24, y=280),
            config={"variableName": "brief"},
        ),
        GraphNode(
            id="rubric_1",
            type=NodeType.RUBRIC,
            position=NodePosition(x=360, y=280),
            config={"rubricFailOnFindings": True},
        ),
        GraphNode(
            id="branch_1",
            type=NodeType.BRANCH,
            position=NodePosition(x=696, y=280),
            config={"content": "script"},
        ),
        GraphNode(
            id="prompt_script",
            type=NodeType.PROMPT,
            position=NodePosition(x=1032, y=140),
            config={
                "template": (
                    "Write a YouTube video script based on this brief. Include a hook, "
                    "three main beats, and a call to action.\n\nBrief: {brief}"
                )
            },
        ),
        GraphNode(
            id="prompt_blog",
            type=NodeType.PROMPT,
            position=NodePosition(x=1032, y=420),
            config={
                "template": (
                    "Write a blog post based on this brief. Include a headline, an intro, "
                    "three sections, and a closing.\n\nBrief: {brief}"
                )
            },
        ),
        GraphNode(
            id="llm_draft",
            type=NodeType.LLM,
            position=NodePosition(x=1368, y=280),
            config={
                "model": "qwen2.5:3b",
                "systemPrompt": "You are a content creator writing publish-ready drafts.",
            },
        ),
        GraphNode(
            id="guardrail_1",
            type=NodeType.GUARDRAIL,
            position=NodePosition(x=1704, y=280),
            config={"allowUrls": False},
        ),
        GraphNode(
            id="human_gate_1",
            type=NodeType.HUMAN_GATE,
            position=NodePosition(x=2040, y=280),
            config={"content": "Review the draft before it ships."},
        ),
        GraphNode(
            id="transform_1",
            type=NodeType.TRANSFORM,
            position=NodePosition(x=2376, y=280),
            config={
                "type": "format_message",
                "template": "# Publish-ready draft\n\n{value}",
            },
        ),
        GraphNode(
            id="output_1",
            type=NodeType.OUTPUT,
            position=NodePosition(x=2712, y=280),
            config={},
        ),
    ]

    edges = [
        GraphEdge(
            id="e_input_rubric", source="input_1", target="rubric_1", kind=EdgeKind.SEQUENCE
        ),
        GraphEdge(
            id="e_rubric_branch", source="rubric_1", target="branch_1", kind=EdgeKind.SEQUENCE
        ),
        GraphEdge(
            id="e_branch_script",
            source="branch_1",
            target="prompt_script",
            kind=EdgeKind.CONDITIONAL,
            condition="script",
        ),
        GraphEdge(
            id="e_branch_blog",
            source="branch_1",
            target="prompt_blog",
            kind=EdgeKind.DEFAULT,
        ),
        GraphEdge(
            id="e_script_llm",
            source="prompt_script",
            target="llm_draft",
            kind=EdgeKind.SEQUENCE,
        ),
        GraphEdge(
            id="e_blog_llm", source="prompt_blog", target="llm_draft", kind=EdgeKind.SEQUENCE
        ),
        GraphEdge(
            id="e_llm_guardrail",
            source="llm_draft",
            target="guardrail_1",
            kind=EdgeKind.SEQUENCE,
        ),
        GraphEdge(
            id="e_guardrail_gate",
            source="guardrail_1",
            target="human_gate_1",
            kind=EdgeKind.SEQUENCE,
        ),
        GraphEdge(
            id="e_gate_transform",
            source="human_gate_1",
            target="transform_1",
            kind=EdgeKind.SEQUENCE,
        ),
        GraphEdge(
            id="e_transform_output",
            source="transform_1",
            target="output_1",
            kind=EdgeKind.SEQUENCE,
        ),
    ]

    return GraphDefinition(
        id=DEMO_CONTENT_STUDIO_ID,
        name="Content Studio (demo)",
        entry_node_id="input_1",
        nodes=nodes,
        edges=edges,
        orientation="auto",
    )


def build_research_agent_demo() -> GraphDefinition:
    """D5 -- Research Agent: an agentic loop, then composition.

    input -> tool_loop (researches the topic; the stub makes exactly one
    deterministic lookup_topic call for technical questions) -> transform
    (frames the rulebook check) -> subgraph (runs the Rulebook Q&A demo as
    a nested run with its own trace) -> output.

    The topic/rulebook pairing is illustrative -- the demo's subject is the
    mechanics: the loop, the nested run, the inherited provider.
    """
    nodes = [
        GraphNode(
            id="input_1",
            type=NodeType.INPUT,
            position=NodePosition(x=24, y=280),
            config={"variableName": "topic"},
        ),
        GraphNode(
            id="tool_loop_1",
            type=NodeType.TOOL_LOOP,
            position=NodePosition(x=360, y=280),
            config={
                "model": "qwen2.5:3b",
                "provider": "stub",
                "maxToolIterations": 3,
                "systemPrompt": "You are a research assistant. Look up facts before answering.",
            },
        ),
        GraphNode(
            id="transform_1",
            type=NodeType.TRANSFORM,
            position=NodePosition(x=696, y=280),
            config={
                "type": "format_message",
                "template": (
                    "Research notes: {value}\n\n"
                    "What do the official Starlight Bazaar rules say about winning?"
                ),
            },
        ),
        GraphNode(
            id="subgraph_1",
            type=NodeType.SUBGRAPH,
            position=NodePosition(x=1032, y=280),
            config={"graphId": DEMO_RULEBOOK_QA_ID, "version": "latest"},
        ),
        GraphNode(
            id="output_1",
            type=NodeType.OUTPUT,
            position=NodePosition(x=1368, y=280),
            config={},
        ),
    ]

    edges = [
        GraphEdge(
            id="e_input_loop", source="input_1", target="tool_loop_1", kind=EdgeKind.SEQUENCE
        ),
        GraphEdge(
            id="e_loop_transform",
            source="tool_loop_1",
            target="transform_1",
            kind=EdgeKind.SEQUENCE,
        ),
        GraphEdge(
            id="e_transform_subgraph",
            source="transform_1",
            target="subgraph_1",
            kind=EdgeKind.SEQUENCE,
        ),
        GraphEdge(
            id="e_subgraph_output",
            source="subgraph_1",
            target="output_1",
            kind=EdgeKind.SEQUENCE,
        ),
    ]

    return GraphDefinition(
        id=DEMO_RESEARCH_AGENT_ID,
        name="Research Agent (demo)",
        entry_node_id="input_1",
        nodes=nodes,
        edges=edges,
        orientation="auto",
    )


SEEDED_DEMOS: tuple[SeededDemo, ...] = (
    SeededDemo(
        id=DEMO_GRAPH_ID,
        title="Classify & Route",
        tagline=(
            "The classic: classify a question, then route to a deterministic "
            "tool lookup or a free-form answer."
        ),
        node_types=("input", "prompt", "llm", "router", "tool", "output"),
        build=build_demo_graph,
    ),
    SeededDemo(
        id=DEMO_DECIDER_ID,
        title="The Decider",
        tagline=(
            "A decision model routes every request to its tier: typed outcome, "
            "calibrated confidence, exact-match routing."
        ),
        node_types=("input", "decision", "prompt", "llm", "human_gate", "transform", "output"),
        build=build_decider_demo,
    ),
    SeededDemo(
        id=DEMO_RULEBOOK_QA_ID,
        title="Rulebook Q&A",
        tagline="Extract a rulebook, then answer questions about it.",
        node_types=("input", "extract", "transform", "prompt", "llm", "output"),
        build=build_rulebook_qa_demo,
    ),
    SeededDemo(
        id=DEMO_CONTENT_STUDIO_ID,
        title="Content Studio",
        tagline="From brief to publish-ready draft: quality gates, safety checks, human approval.",
        node_types=(
            "input",
            "rubric",
            "branch",
            "prompt",
            "llm",
            "guardrail",
            "human_gate",
            "transform",
            "output",
        ),
        build=build_content_studio_demo,
    ),
    SeededDemo(
        id=DEMO_RESEARCH_AGENT_ID,
        title="Research Agent",
        tagline="An agentic tool loop, then a nested demo run: composition in action.",
        node_types=("input", "tool_loop", "transform", "subgraph", "output"),
        build=build_research_agent_demo,
    ),
)


# ---------------------------------------------------------------------------
# D2 supporting resources: a stub-deterministic routing dataset and the
# route-accuracy eval suite that measures the Decider demo. Seeded alongside
# the graphs so the demo is self-contained: open the Evals panel, run the
# suite, see 5/5 on the stub.

DEMO_DECIDER_DATASET_ID = "demo_decider_dataset"
DEMO_DECIDER_SUITE_ID = "demo_decider_suite"


def build_decider_dataset() -> FixtureDataset:
    return FixtureDataset(
        id=DEMO_DECIDER_DATASET_ID,
        name="Decider routes (demo)",
        description=(
            "Stub-deterministic routing fixtures for The Decider demo: each "
            "request must take its expected branch."
        ),
        graph_id=DEMO_DECIDER_ID,
        source="manual",
        fixtures=[
            Fixture(
                input={"request": "What is a starlight shard?"},
                expected=FixtureExpectation(route={"decide_1": "prompt_quick"}),
            ),
            Fixture(
                input={"request": "Compare the trade-offs of the new bazaar layout"},
                expected=FixtureExpectation(route={"decide_1": "prompt_deep"}),
            ),
            Fixture(
                input={"request": "?"},
                expected=FixtureExpectation(route={"decide_1": "transform_fallback"}),
            ),
            Fixture(
                input={"request": "Tell me about the weather"},
                expected=FixtureExpectation(route={"decide_1": "transform_fallback"}),
            ),
            Fixture(
                input={"request": "The tournament director needs to approve the finals bracket"},
                expected=FixtureExpectation(route={"decide_1": "human_gate_1"}),
            ),
        ],
    )


def build_decider_eval_suite() -> EvalSuite:
    return EvalSuite(
        id=DEMO_DECIDER_SUITE_ID,
        name="Decider route accuracy (demo)",
        description="Measures The Decider's route accuracy on the stub (never a live call).",
        graph_id=DEMO_DECIDER_ID,
        dataset_id=DEMO_DECIDER_DATASET_ID,
        scorers=[EvalScorer(kind="route")],
        pass_threshold=1.0,
    )


# (resource kind, resource id, builder) seeded at startup next to the graphs.
SEEDED_RESOURCES: tuple[tuple[str, str, Callable[[], object]], ...] = (
    ("datasets", DEMO_DECIDER_DATASET_ID, build_decider_dataset),
    ("eval_suites", DEMO_DECIDER_SUITE_ID, build_decider_eval_suite),
)
