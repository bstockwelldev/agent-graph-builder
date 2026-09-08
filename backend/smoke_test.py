"""Manual end-to-end smoke test (not part of the app): compile the demo graph
and execute it twice -- once with a technical question, once with a
non-technical one -- to prove routing actually forks execution.
"""

import asyncio

from app import runtime, storage
from app.demo_graph import build_demo_graph


async def main() -> None:
    graph = build_demo_graph()
    storage.save_graph(graph)

    compile_result = runtime.compile_workflow(graph)
    print("compile diagnostics:", compile_result.diagnostics)
    assert compile_result.ok, "expected demo graph to compile cleanly"

    for question in ["How does a database index work?", "What's a good pizza topping?"]:
        run_id, bus = runtime.start_run(compile_result.compiled_workflow_id, {"question": question})
        print(f"\n=== run {run_id} for {question!r} ===")
        async for event in bus.stream():
            print(f"[{event.sequence}] {event.event_type} node={event.node_id} payload={event.payload}")
        summary = runtime.RUN_STORE[run_id]
        print("STATUS:", summary.status)
        print("RESULT:", summary.result)


if __name__ == "__main__":
    asyncio.run(main())
