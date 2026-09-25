"""The one canonical demo workflow (POC spec section 3): classify the user's
question, then route to a deterministic tool lookup for technical questions
or a free-form LLM answer for everything else.
"""

from __future__ import annotations

from .models import EdgeKind, GraphDefinition, GraphEdge, GraphNode, NodePosition, NodeType

DEMO_GRAPH_ID = "demo_classify_and_route"


def protected_graph(graph_id: str) -> GraphDefinition | None:
    """The canonical definition of a seeded, read-only graph, or None for
    ordinary graphs. Every visitor to the public deploy lands on the demo,
    so no one may edit or delete it; the Studio forks edits into a copy."""
    return build_demo_graph() if graph_id == DEMO_GRAPH_ID else None


def build_demo_graph() -> GraphDefinition:
    nodes = [
        GraphNode(
            id="input_1",
            type=NodeType.INPUT,
            position=NodePosition(x=40, y=200),
            config={"variableName": "question"},
        ),
        GraphNode(
            id="prompt_classify",
            type=NodeType.PROMPT,
            position=NodePosition(x=300, y=200),
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
            position=NodePosition(x=560, y=200),
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
            position=NodePosition(x=820, y=200),
            config={},
        ),
        GraphNode(
            id="tool_lookup",
            type=NodeType.TOOL,
            position=NodePosition(x=1080, y=60),
            config={"toolName": "lookup_topic", "inputVariable": "question"},
        ),
        GraphNode(
            id="prompt_answer",
            type=NodeType.PROMPT,
            position=NodePosition(x=1080, y=340),
            config={
                "template": (
                    "Answer the user's question helpfully and concisely.\n\nQuestion: {question}"
                )
            },
        ),
        GraphNode(
            id="llm_answer",
            type=NodeType.LLM,
            position=NodePosition(x=1340, y=340),
            config={"model": "qwen2.5:3b", "systemPrompt": "You are a helpful assistant."},
        ),
        GraphNode(
            id="output_1",
            type=NodeType.OUTPUT,
            position=NodePosition(x=1600, y=200),
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
