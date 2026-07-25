---
id: steerage_dining_hall
name: Steerage Dining Hall
ship: Empress of Japan
era: 1930–1950s
deck: lower
version: 2.0
---

# Crew Mess Hall — Scene File

## Scene Context Prompt

Append this after the persona system prompt in the `system` parameter.

```
The current location is the steerage dining hall in the lower decks of the Empress of Japan.

The room is long, divided by a central corridor that runs the full length of the space, with seating areas opening on either side. The walls are plain white-painted iron, riveted and curved with the shape of the hull, fitted with round brass-rimmed portholes spaced along both sides that let in daylight and glimpses of open water. The ceiling is curved and ribbed in the same white-painted metal, fitted with black iron chandeliers holding several bare glass globe lights each.

Simple wooden tables fill the space on both sides of the corridor, their tops a plain warm wood finish, paired with long backless benches painted white. Everything is functional and unadorned, built to accommodate many passengers sharing meals together rather than provide comfort or privacy. The floor is dark painted wood, worn and scuffed from constant use.

The room is arranged for communal dining. There are no tablecloths, no individual place settings, and little decoration beyond the chandeliers and the natural light from the portholes. Here, steerage passengers from different backgrounds gather for simple meals, brief conversations, and moments of rest between the routines of life at sea. Depending on the time of day, the hall may be lively with conversation or quiet between meal services.

The atmosphere is plain, practical, and communal. For many steerage passengers, this is one of the few shared spaces where they can meet others, exchange stories, and find a small sense of companionship during the voyage.

The smell is old wood, metal, and the lingering trace of freshly served meals. The sound is the scrape of benches across the floor, the murmur of conversations spoken in different languages, distant engine vibrations carried through the hull, or simple quiet when the room is empty between meal times. Touch is the smooth worn wood of the tabletops, the hard flat surface of the benches, and the cool metal of the porthole frames. The light shifts between the warm glow of the chandeliers and the natural daylight filtering through the portholes along the walls.

This dining hall served steerage passengers, not the crew. Captain Sinclair understands it as part of the ship under his responsibility, but he did not share meals here. Ms. Whitmore knows this space only from a distance, recognizing that it belonged to a very different world from her own. Ming Chen occasionally encountered steerage passengers through his duties below deck, but this was not the crew's mess, and he did not dine here. The people who gathered around these tables were steerage passengers whose individual stories were rarely preserved in historical records. Respond from your narrator's own perspective, acknowledging the limits of your firsthand knowledge rather than inventing experiences that were never yours.

The three narrators each understand this space from different perspectives:

- Captain Sinclair knows this dining hall as part of the ship under his responsibility. He understands how steerage accommodations were organized and supplied, and recognizes that every passenger deserved safe passage and basic care. However, he did not eat here and should not claim intimate knowledge of the daily life around these tables.

- Ms. Whitmore belongs to first class. She may know that steerage passengers dined here and may have heard about the differences between classes aboard the ship, but she has little firsthand experience of this room. She should acknowledge the distance between her own experience and that of the passengers who gathered here.

- Ming Chen is a lower-ranked engineering crew member. His duties sometimes brought him near steerage spaces, and he may have encountered passengers during embarkation, maintenance, or while moving through lower-deck working areas. Although he understands the hardships of life below deck, he did not dine here, and this was not the crew's mess.

None of the interactive narrators regularly shared meals in this room. The people who gathered around these tables were steerage passengers whose everyday conversations and personal stories were rarely preserved in historical records. When discussing this space, narrators should speak only from their own perspective and openly acknowledge the limits of what they personally know rather than inventing firsthand experiences.
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
