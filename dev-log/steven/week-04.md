# AI-Assisted Development Log

Name: Steven Fang
Week: Week 4 (June 18 - June 24, 2026)
Date: 2026-06-24

## 1. Task / Goal
This week I focused on the narrator experience and voice interaction:

- Refined persona definitions and system prompts for the three narrators (Captain Sinclair, Eleanor Whitmore, and Ming Chen) to give each a distinct voice and period-accurate perspective.
- Developed scene-specific context material to feed the LLM — grounding each narrator's responses in the physical space they inhabit and the details relevant to their role.
- Implemented end-to-end voice interaction (#65): browser-based speech recognition, chat API integration, and speech synthesis so visitors can speak to narrators and hear responses aloud.

## 2. AI Tools Used
Claude was used as a development partner for persona writing, scene context drafting, and implementing the voice interaction layer.

## 3. Prompts / Agent Workflow
For the persona and scene work, I asked Claude to help draft system prompts and review them for historical consistency and character distinctiveness. For the voice implementation, I worked step by step: wire up the Web Speech API for input, connect it to the existing `/chat` backend, then feed the response into the Speech Synthesis API for output.

## 4. Useful Output
- Three refined persona system prompts, each grounded in the narrator's role, class position, and the scenes they appear in.
- Scene-specific background material for each panorama location, giving the LLM enough context to answer location-aware questions in character.
- A working voice interaction loop: the user taps Talk, speaks, the transcript is sent to the backend, and the narrator's response is spoken aloud via the browser's speech synthesis engine. History is maintained client-side across turns so the narrator remembers the conversation.

## 5. Human Review / Changes
- I set the direction on Eleanor's class bias: moderate and unselfconscious, never announced. I also decided she should be British, which anchors her register.
- I pushed back multiple times when the scene prompts were too sparse relative to the reference section. Atmosphere, sensory detail, social hierarchy, and scale were all added to the prompts after I identified what was missing.
- I directed a rewrite to full declarative sentences, which is a more reliable instruction format for the LLM.

## 6. Reflection
The most interesting challenge this week was that good voice interaction depends on good persona writing — a technically working Talk button is only as useful as the responses it speaks. Spending time on the system prompts and scene context before wiring up the UI made the end result feel more coherent.

Claude was most useful for drafting and iterating on character voice. The structural decisions — how history is managed, which APIs to use, how the data model change affected the overlay component.
