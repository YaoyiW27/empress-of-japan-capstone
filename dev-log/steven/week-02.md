# AI-Assisted Development Log

Name: Steven Fang
Week: Week 2 (June 3 – June 9, 2026)
Date: 2026-06-09

## 1. Task / Goal
[ux/design] Refine the end-to-end visitor journey and complete the high-fidelity UX prototype for the Empress of Japan experience. The goal was to move from broad concept into a clearer product flow: users discover the exhibit, access the website, review the ship overview, select a narrator, enter historical spaces, and interact with the narrator through real-time voice. This week focused on the high-fi prototype, character selection flow, artifact investigation flow, technical feasibility of WebXR vs panorama environments, and team alignment around the final experience direction.

## 2. AI Tools Used
ChatGPT, Claude, and image generation tools.

## 3. Prompts / Agent Workflow
I used AI in four main ways:
1. **UX flow critique** — asked AI to review whether the flow made sense for a museum visitor and whether the touchpoints were clear.
2. **Figma copy and wording** — iterated on short page descriptions, narrator bios, button text, and journey-map language.
3. **Technical feasibility discussion** — used AI to compare WebXR, 3D websites, device motion, panorama scenes, hotspots, and full 3D models so I could understand which direction was realistic for the team.
4. **Visual asset exploration** — generated and refined character portraits, ship environment references, and panorama-style scenes to support the high-fidelity prototype.

## 4. Useful Output
- High-fidelity prototype structure for the main visitor flow.
- Narrator selection direction with three characters: Ms. Eleanor Whitmore, Captain Sinclair, and Ming Chen.
- Short bios and location associations for each narrator.
- Clarified technical direction: panorama-based immersive scenes with hotspots and voice interaction, rather than a fully walkable 3D ship.
- Initial scene reference set: first-class cabin, bridge, engine/boiler room, dining saloon, promenade deck, loading dock, and swimming pool.
- Drafted Sprint 2 report language and time-tracking categories.

## 5. Human Review / Changes
- **Separated WebXR from full 3D modeling.** AI initially made the distinction sound vague, so I pushed the question until the difference was clear: WebXR can use panoramas, and the asset type does not have to be a full 3D model.
- **Chose panorama as the practical environment strategy.** Full 3D spaces would require too many models, textures, lighting setups, and collision/navigation work. Panorama scenes fit the project's museum timeline better.
- **Adjusted character design for tone and historical fit.** Some generated uniforms, faces, and names were too theatrical or historically off. I kept revising until the avatars felt closer to the class/role contrast we needed.
- **Rejected over-polished visual outputs.** Many images looked like AAA game production, which was not the intended direction. I pushed for a lower-poly, stylized, more achievable visual style.
- **Reworked weak report language.** The first AI drafts sounded like generic UX language. I replaced them with more concrete points about environment approach, artifact integration, and visual direction.

## 6. Reflection
This week showed that AI is useful for exploring options, but not for deciding what is actually feasible. The biggest design progress came from forcing the technical questions into simple terms: panorama vs. 3D model, hotspot vs. free walking, WebXR session vs. normal 3D webpage. Once those were clear, the prototype became easier to align with implementation. The main thing to improve next is design handoff: the prototype needs clearer notes so frontend work can follow the intended flow and interaction logic without relying on verbal explanation.
