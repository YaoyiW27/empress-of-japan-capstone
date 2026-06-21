# AI-Assisted Development Log

Name: Steven Fang
Week: Week 3 (June 11 – June 17, 2026)
Date: 2026-06-17

## 1. Task / Goal
[ux/assets/ai] Build out the visual and interaction foundation for the panorama-based visitor experience, and design the voice interaction layer. This week covered two parallel tracks: panorama scene generation to support frontend implementation, and voice interaction design including full persona development for all three narrators. The persona work involved converting character design documents into backend-ready system prompts, establishing the ai/ folder structure under data/, and preparing a handover package for the backend team.

## 2. AI Tools Used
ChatGPT, image generation tools, and Claude for voice interaction design, persona development, and prompt engineering.

## 3. Prompts / Agent Workflow
This week ran two parallel tracks:
1. **Panorama generation workflow** — used historical reference photos to generate new equirectangular 360 panoramas for ship spaces.
2. **Asset validation discussion** — used AI to understand which outputs were likely true 360 panoramas, how seams and camera height affect the scene, and how these assets would be checked in a panorama viewer.
3. **Journey-map refinement** — moved the map from a simple screen/action chart to a touchpoint-centered journey with a human outcome row.
4. **Voice interaction design** — designed the AI persona layer for the three narrators: Ming Chen, Captain Sinclair, and Ms. Eleanor Whitmore. Converted character design documents into structured backend-ready system prompts.
5. **Persona prompt engineering** — worked through each persona iteratively: establishing what they know, how they speak, what they avoid, and how class and cultural background shape their language. Eleanor Whitmore's upper-class British bias and Ming Chen's functional English fluency required particular care.
6. **ai/ folder structure** — established data/ai/ as the home for all AI content (personas/, scenes/, docs/), distinct from the project-level docs/ directory.
7. **Frontend intervention planning** — discussed Git branch workflow and how to safely contribute to frontend without overwriting another teammate's work.

## 4. Useful Output
- Panorama-style scene assets for promenade deck, first-class suite, dining saloon, smoking room/shop, crew mess hall, engine room, loading dock, swimming pool, and bridge view.
- A clearer asset strategy: scene panoramas as backgrounds, hotspots as interaction points, narrator avatars as overlays, and voice UI as the main engagement layer.
- User journey map structure aligned with the current prototype stages: Discover the exhibit, Access the website, Overview, Select Narrator, Explore scenes, Voice interaction, Switch Narrator, Exit.
- A new human-centered "insights and experience gained" row written from the visitor's perspective.
- QR-code exhibit entry concept showing how the physical model connects to the digital experience.
- Three complete persona files (ming.md, sinclair.md, whitmore.md) stored under data/ai/personas/, each containing YAML frontmatter, a backend-ready system prompt, a character reference, and a Python usage example.
- Established data/ai/ folder structure with a clear rationale for separating AI content from project documentation.
- Git workflow decision: create a separate feature branch before making frontend changes.

## 5. Human Review / Changes
- **Rejected bad panorama outputs.** Some generated panoramas had awkward seams, wrong camera height, or looked too much like normal wide images. I asked for new versions with lower camera angles, cleaner seams, and true equirectangular behavior.
- **Kept correcting visual style.** Several dining hall and environment images looked too polished or modern, so I pushed them toward early/mid-20th-century Western ocean-liner interiors.
- **Added people where the scene needed life.** Empty spaces felt like static museum rooms. Adding waiters, passengers, and crew made the scenes feel closer to lived environments.
- **Improved the journey map's emotional layer.** The first "gains" row sounded too functional, like "gains spatial awareness." I changed it to visitor thoughts such as "I can step beyond the model" and "history feels human, not distant."
- **Checked language and tone.** I revised awkward English in the map, including phrases like "this corner," which sounded too literal for a ship environment.
- **Did not edit main directly.** Since the frontend work belongs to another teammate, the plan is to use a separate branch and make focused changes through a PR.

## 6. Reflection
This week had two distinct creative challenges that turned out to be connected. Panorama generation requires constant judgment about historical fit, camera behavior, and visual tone — the same kind of judgment that persona design requires. A system prompt is not just a description of a character; it is an instruction set that shapes every response, so the constraints (what a persona avoids, how they speak, what they genuinely do not know) matter as much as the positive description. The most important decision was keeping the personas grounded in what each character would realistically experience: Ming Chen does not describe the dining saloon, Eleanor Whitmore has no curiosity about the engine room. That separation is what makes the voice interaction feel historically honest rather than like a costume on a generic AI. Next steps are scene files for the backend team, followed by the handover documentation (persona-scene matrix, prompt composition guide, and QA guide).
