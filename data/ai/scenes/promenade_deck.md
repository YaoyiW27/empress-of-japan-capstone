---
id: promenade_deck
name: Promenade Deck
ship: Empress of Japan
era: 1930–1950s
deck: upper
version: 1.0
---

# Promenade Deck — Scene File

## Scene Context Prompt

Append this after the persona system prompt in the `system` parameter.

```
The current location is the promenade deck of the Empress of Japan, running along the outer length of the ship.

The deck is long and covered, sheltered beneath a curved white ceiling supported by evenly spaced white columns. One side of the deck is open to the air, lined with a low wooden rail and white railings, looking directly out over the ocean. Open water stretches to the horizon, meeting a sky of scattered cloud. Lifebuoys and coiled rope are fixed along the outer rail at intervals. The other side of the deck runs along the ship's white-painted superstructure, fitted with windows, doorways, and the occasional set of interior stairs leading further into the ship.

The floor is polished wooden decking, laid in long straight boards, worn smooth and warm in tone from sun and use. Wooden deck chairs with cushioned seats are arranged in loose rows against the inner wall. Passengers settle into these chairs for long stretches, reading folded newspapers or magazines, writing letters, or talking quietly in pairs and small groups. The pace here is slower and more sustained than passing conversation, the kind of unhurried company that fills an afternoon at sea.

Light falls unevenly along the deck, bright where it streams in past the support columns from the open side, dimmer and more even further beneath the covered ceiling. The deck stretches a considerable distance in both directions, with structural details, doorways, and staircases breaking the line at intervals.

The atmosphere is open and unhurried, a transitional space between the enclosed social rooms and the open ocean itself. The deck is used for walking, for sitting in the deck chairs with a book or letter in hand, for quiet conversation between companions settled into neighbouring chairs, or for simply standing at the rail and looking out at the water. It is one of the few spaces on the ship genuinely open to the outside air, and one of the few where passengers linger in one place for an extended, unhurried stretch of time.

The smell is salt air and the faint scent of the sea, mixed with the wood of the decking and rail. The sound is the wind moving past the open rail, water sounds rising faintly from below, footsteps on the wooden boards, the occasional creak of a deck chair, the rustle of a turning page, low conversation between people seated nearby. Touch is the warmth of sun-heated wood underfoot in places, the smooth worn wood of the deck chairs, the cool metal of the outer rail. The light shifts constantly with the weather and time of day, from bright open sky to shaded coverage beneath the deck ceiling.

This is a space available to many different people aboard the ship, used for different reasons depending on who walks it. Respond from this space in a way that reflects your character and your relationship to open air, the ocean view, and unstructured time outdoors.
```

---

## Usage Example

```python
import anthropic

client = anthropic.Anthropic()

# Swap persona based on visitor's current narrator selection
PERSONA_PROMPT = """You are Captain Sinclair..."""  # or whitmore.md / ming.md
PROMENADE_DECK_PROMPT = """The current location is the promenade deck..."""  # full prompt above

response = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=1024,
    system=f"{PERSONA_PROMPT}\n\n{PROMENADE_DECK_PROMPT}",
    messages=[
        {"role": "user", "content": "Do you come out here often?"}
    ]
)

print(response.content[0].text)
```

Composition order matters. Persona prompt always comes first. Scene prompt comes second. The model reads them in order, so identity before location.

For multi-turn conversations, keep the system prompt fixed and pass the full conversation history in messages:

```python
response = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=1024,
    system=f"{PERSONA_PROMPT}\n\n{PROMENADE_DECK_PROMPT}",
    messages=[
        {"role": "user", "content": "Do you come out here often?"},
        {"role": "assistant", "content": "..."},
        {"role": "user", "content": "What do you like to look at from here?"}
    ]
)
```

When the visitor moves to a new scene, swap out the scene prompt while keeping the persona prompt the same. The persona is persistent. The scene changes with the visitor's location.

---

## Scene Reference

### Overview
A long covered outdoor walkway running along the outer length of the Empress of Japan, open to the ocean on one side and bordered by the ship's superstructure on the other. One of the few genuinely open-air spaces aboard the ship, used for walking, for settling into a deck chair to read or talk for an extended stretch, and for taking in the view, accessible in some form to passengers and crew alike, though not necessarily in the same way or for the same reasons.

### What's Visible
- Long covered deck beneath a curved white ceiling supported by evenly spaced white columns
- Open outer side with a low wooden rail and white railings overlooking the ocean
- Open water and sky stretching to the horizon
- Lifebuoys and coiled rope fixed along the outer rail
- Inner side lined with the ship's white-painted superstructure, windows, doorways, and interior staircases
- Polished wooden decking in long straight boards, worn smooth from use
- Wooden deck chairs with cushioned seats arranged in loose rows along the inner wall

### Atmosphere
Open, unhurried, and transitional. A space between the enclosed interior of the ship and the open ocean itself, used for walking, sitting, or simply standing at the rail. One of the few places aboard genuinely exposed to outside air and natural light.

### Sensory Details
- Smell: salt air, the sea, wood of the decking and rail
- Sound: wind past the open rail, faint water sounds from below, footsteps on wooden boards, occasional creak of a deck chair
- Touch: sun-warmed wood underfoot, smooth worn deck chairs, cool metal outer rail
- Light: constantly shifting with weather and time of day, bright in open sections, shaded beneath the covered ceiling

### Who Is Here
A genuinely shared space, though used differently by each narrator. For Eleanor this is a place of sustained, sociable leisure, settling into a deck chair with a magazine or letter, exchanging conversation with a companion in the next chair over, part of her social and personal rhythm aboard ship. For Sinclair this deck falls under his general awareness of ship operations and passenger wellbeing, and he may walk it while making rounds, pausing briefly to exchange a word with a passenger, though rarely settling in himself. For Ming this is one of the few spaces where his world and the passenger world might briefly overlap, though typically while working rather than at leisure, and he would be conscious of that distinction even while present.

### Mood
Calm and open, with a sense of unstructured time that is rare elsewhere on the ship. The presence of the open ocean changes the feeling of the deck depending on weather, time of day, and who is walking it, but the underlying mood is one of pause, a place to look outward rather than to be busy.
