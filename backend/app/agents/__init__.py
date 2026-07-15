"""Persona-agent backend with privacy-gated grounding (issues #31 and #69).

A minimal LangGraph topology: an orchestrator dispatches a visitor's question to
one persona agent. The persona retrieves archival candidates, chooses whether the
turn is grounded, conversational, or unsupported by available evidence, and keeps
structured citations separate from voice narration.
"""
