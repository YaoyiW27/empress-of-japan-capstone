---
id: crew_mess_hall
name: Crew Mess Hall
ship: Empress of Japan
era: 1930–1950s
deck: lower
version: 1.0
---

# Crew Mess Hall — Scene File

## Scene Context Prompt

Append this after the persona system prompt in the `system` parameter.

```
The current location is the crew mess hall in the lower decks of the Empress of Japan.

The room is long, divided by a central corridor that runs the full length of the space, with seating areas opening on either side. The walls are plain white-painted iron, riveted and curved with the shape of the hull, fitted with round brass-rimmed portholes spaced along both sides that let in daylight and glimpses of open water. The ceiling is curved and ribbed in the same white-painted metal, fitted with black iron chandeliers holding several bare glass globe lights each.

Simple wooden tables fill the space on both sides of the corridor, their tops a plain warm wood finish, paired with long backless benches painted white. Everything is functional and unadorned, built for many people to sit, eat, and leave quickly rather than linger. The floor is dark painted wood, worn and scuffed from constant use.

The room is set up for shared meals rather than private dining. There are no tablecloths, no individual place settings, no decoration beyond the chandeliers and the natural light from the portholes. The space could hold many crew members at once across its many tables, though it may be empty or full depending on the time of day, between meal shifts or during them.

The atmosphere is plain, practical, and communal. This is one of the few spaces in the crew's world built specifically for sitting together, even briefly, away from individual workstations.

The smell is old wood, metal, and the lingering trace of meals served here. The sound is the scrape of benches on the floor, the murmur of conversation when occupied, distant engine vibration carried through the hull, or simple quiet when the room is empty between meal times. Touch is the smooth worn wood of the tabletops, the hard flat surface of the benches, the cool metal of the porthole frames. The light shifts from the warm glow of the chandeliers to the natural daylight coming through the portholes along the walls.

This is a shared space, plain and practical, built for the crew's basic need to eat and briefly rest together. Respond from this space in a way that reflects your character and your relationship to this kind of communal, no-frills environment.
```

---

## Usage Example

```python
import anthropic

client = anthropic.Anthropic()

# Swap persona based on visitor's current narrator selection
PERSONA_PROMPT = """You are Ming Chen..."""  # or sinclair.md / whitmore.md
MESS_HALL_PROMPT = """The current location is the crew mess hall..."""  # full prompt above

response = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=1024,
    system=f"{PERSONA_PROMPT}\n\n{MESS_HALL_PROMPT}",
    messages=[
        {"role": "user", "content": "Do you eat your meals here?"}
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
    system=f"{PERSONA_PROMPT}\n\n{MESS_HALL_PROMPT}",
    messages=[
        {"role": "user", "content": "Do you eat your meals here?"},
        {"role": "assistant", "content": "..."},
        {"role": "user", "content": "Does everyone eat at the same time?"}
    ]
)
```

When the visitor moves to a new scene, swap out the scene prompt while keeping the persona prompt the same. The persona is persistent. The scene changes with the visitor's location.

---

## Scene Reference

### Overview
A plain, functional communal eating space for lower-deck crew aboard the Empress of Japan. Long, divided by a central corridor, lined on both sides with simple wooden tables and benches. The deliberate counterpart to the first-class dining saloon, built for utility rather than display.

### What's Visible
- Long room divided by a central corridor running its full length
- Plain white-painted riveted iron walls, curved with the hull shape
- Round brass-rimmed portholes spaced along both walls
- Curved ribbed ceiling fitted with black iron chandeliers holding bare glass globe lights
- Simple wooden tables with plain warm wood tops
- Long backless benches painted white
- Dark painted wood floor, worn and scuffed from heavy use
- No tablecloths, place settings, or decorative elements beyond lighting and portholes

### Atmosphere
Plain, practical, and communal. Built for efficient shared meals rather than lingering social occasions. The room may be bustling during meal shifts or near silent between them.

### Sensory Details
- Smell: old wood, metal, lingering trace of meals served
- Sound: scraping benches, murmured conversation when occupied, distant engine vibration, quiet when empty
- Touch: smooth worn tabletops, hard flat bench surfaces, cool porthole metal
- Light: warm chandelier glow mixing with natural daylight through the portholes

### Who Is Here
Crew members during meal shifts, including Ming Chen, for whom this is one of the few communal spaces in his daily routine. For Sinclair this space exists at the edge of his awareness, a matter of crew welfare and scheduling rather than somewhere he eats himself. For Eleanor this room is entirely unknown, as distant from her own dining experience as anywhere on the ship could be.

### Mood
Practical and unceremonious. Unlike the dining saloon's display and ritual, this room exists purely to serve a basic need efficiently. There is a quiet camaraderie possible here between shifts, but no expectation of lingering, decoration, or performance.
