# AI-Assisted Development Log

Name: Steven Fang
Week: Week 5 (June 25 - July 1, 2026)
Date: 2026-06-30

## 1. Task / Goal
This week I focused on completing the scene content and improving the voice interaction:

- Completed scene specific context files for all remaining scenes, so the full set of locations now has both a scene prompt and a scene reference ready for backend composition.
- Continued refinement of the voice interaction flow integrated last week, fixing review feedback and addressing routing and CORS issues that surfaced when connecting to the deployed backend.
- Researched AWS Polly as a potential replacement for the browser's Web Speech Synthesis API to improve text to speech quality and give more control over voice and tone per narrator.

## 2. AI Tools Used
Claude was used as a development partner for scene file drafting, debugging the voice interaction integration, and researching AWS Polly's capabilities.

## 3. Prompts / Agent Workflow
For the scene files, I worked through each remaining location the same way as previous weeks: review the panorama image first, write the scene prompt as full declarative sentences with no implied detail, and check it against the scene reference section for completeness. For the voice interaction fixes, I worked through reviewer feedback on the pull request one item at a time, starting with the CORS configuration issue. For the Polly research, I asked Claude to explain how Polly compares to the browser's native speech synthesis, what voice options and SSML controls it offers, and what would need to change in the backend and frontend to integrate it.

## 4. Useful Output
- Scene context files for all remaining locations, completing the full set described in the project's scene index.
- A corrected CORS configuration: the allowed origin list moved from a hardcoded localhost value to an environment variable, so the deployed frontend can call `/chat` without code changes between environments.
- A research summary on AWS Polly covering neural voice options, SSML support for pacing and emphasis, and the rough integration path: the backend would call Polly after generating the narrator's text response and return audio instead of, or alongside, plain text, with the frontend playing the returned audio instead of using `speechSynthesis`.

## 5. Human Review / Changes
- I identified that the CORS allowed origins list was hardcoded to localhost only and would block the deployed frontend, then directed the fix to make it configurable via environment variable.
- I reviewed the Polly research and decided this is a future improvement rather than something to integrate immediately, since the current Web Speech API implementation is functional and Polly would add backend complexity, cost, and latency that needs more evaluation first.
- I judged which of the remaining scene files needed the most additional sensory and structural detail, based on the same standard set in earlier scene work: nothing implied, full declarative prose, no ownership language tying a scene to a single narrator.

## 6. Reflection
Finishing the full scene set this week means every narrator can now be placed in every location with a complete, structured prompt behind them. That closes the main content gap for the voice interaction.

The Polly research was a useful exercise even without committing to it yet. It made clear that voice quality is a separate concern from the interaction flow itself, and that improving it later would mean changing how audio is generated and delivered, not how the conversation logic works. The CORS fix was a good reminder that working code locally does not mean working code once deployed, since the failure only shows up at the network boundary between environments.
