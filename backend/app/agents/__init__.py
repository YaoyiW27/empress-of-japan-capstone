"""Multi-agent backend (issue #31).

A minimal LangGraph topology: an orchestrator dispatches a visitor's question to
one persona agent (Storyteller/Curator/passenger archetypes), which answers from
its system prompt alone. Retrieval (RAG grounding + citations) is a deliberate
follow-up — the persona node is the seam where a ``retrieve`` step will plug in.
"""
