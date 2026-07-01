# AI-Assisted Development Log

Name: Steven Fang
Week: Week 5 (June 25 - July 1, 2026)
Date: 2026-06-30

## 1. Task / Goal
This week I focused on completing the scene content and integrating the voice interaction:

- Re-implemented the voice interaction component after the frontend data model was restructured from scene-centric to narrator-centric, since the previous implementation no longer matched the new structure.
- Completed scene specific context files for all remaining scenes, so the full set of locations now has both a scene prompt and a scene reference ready for backend composition.
- Continued refinement of the voice interaction flow, fixing review feedback and addressing routing and CORS issues that surfaced when connecting to the deployed backend.
- Researched AWS Polly as a potential replacement for the browser's Web Speech Synthesis API to improve text to speech quality and give more control over voice and tone per narrator.

## 2. AI Tools Used
Claude was used as a development partner for understanding the frontend restructure, re-implementing the voice interaction component against the new data model, scene file drafting, debugging the voice interaction integration, and researching AWS Polly's capabilities.

## 3. Prompts / Agent Workflow
The frontend's data model had changed from scene-centric, where each scene held an array of narrators, to narrator-centric, where each narrator holds an array of scenes. This also changed the routing from `/explore/[sceneId]` to `/explore/[narratorId]` and removed the in-overlay narrator switcher, since only one narrator is active per route now. I had Claude review both the old and new file structures first, then rewrote the voice interaction component to match: removing the narrator switcher logic, seeding the initial message from the narrator's profile instead of a scene's greeting, and confirming the speech recognition, chat API call, and speech synthesis logic still applied correctly under the new structure. After the rewrite, the Next.js dev server failed to start due to a leftover dynamic route folder from the old structure, which I located and removed.

For the scene files, I worked through each remaining location the same way as previous weeks: review the panorama image first, write the scene prompt as full declarative sentences with no implied detail, and check it against the scene reference section for completeness. For the voice interaction fixes, I worked through reviewer feedback on the pull request one item at a time, starting with the CORS configuration issue. For the Polly research, I asked Claude to explain how Polly compares to the browser's native speech synthesis, what voice options and SSML controls it offers, and what would need to change in the backend and frontend to integrate it.

## 4. Useful Output
- A re-implemented voice interaction component (`NarratorOverlay`) that works against the new narrator-centric data model, with speech recognition, the chat API call, and speech synthesis all carried over correctly from the previous implementation.
- Scene context files for all remaining locations, completing the full set described in the project's scene index.
- A corrected CORS configuration: the allowed origin list moved from a hardcoded localhost value to an environment variable, so the deployed frontend can call `/chat` without code changes between environments.
- A research summary on AWS Polly covering neural voice options, SSML support for pacing and emphasis, and the rough integration path: the backend would call Polly after generating the narrator's text response and return audio instead of, or alongside, plain text, with the frontend playing the returned audio instead of using `speechSynthesis`.

## 5. Human Review / Changes
- I caught that the new component still seeded its initial message from the old scene-based greeting pattern and corrected it to use the narrator's own profile data, since the route no longer corresponds to a single fixed scene.
- I diagnosed the dev server startup failure as a leftover dynamic route folder from the old scene-centric structure conflicting with the new narrator-centric one, and removed it.
- I identified that the CORS allowed origins list was hardcoded to localhost only and would block the deployed frontend, then directed the fix to make it configurable via environment variable.
- I reviewed the Polly research and decided this is a future improvement rather than something to integrate immediately, since the current Web Speech API implementation is functional and Polly would add backend complexity, cost, and latency that needs more evaluation first.
- I judged which of the remaining scene files needed the most additional sensory and structural detail, based on the same standard set in earlier scene work: nothing implied, full declarative prose, no ownership language tying a scene to a single narrator.

## 6. Reflection
The data model restructure was a reminder that a working feature is tied to the structure underneath it, not just its own code. The voice interaction logic itself barely changed, but it had to be re-fitted to a new shape of data and a new routing scheme, and the bugs that came up (the stale greeting, the leftover route folder) were both structural mismatches rather than logic errors.

Finishing the full scene set this week means every narrator can now be placed in every location with a complete, structured prompt behind them. That closes the main content gap for the voice interaction.

The Polly research was a useful exercise even without committing to it yet. It made clear that voice quality is a separate concern from the interaction flow itself, and that improving it later would mean changing how audio is generated and delivered, not how the conversation logic works. The CORS fix was a good reminder that working code locally does not mean working code once deployed, since the failure only shows up at the network boundary between environments.