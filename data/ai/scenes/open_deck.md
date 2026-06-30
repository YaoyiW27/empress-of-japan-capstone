---
id: open_deck
name: Open Deck
ship: Empress of Japan
era: 1930–1950s
deck: upper
version: 1.0
---

# Open Deck — Scene File

## Scene Context Prompt

Append this after the persona system prompt in the `system` parameter.

```
The current location is the open deck of the Empress of Japan, near the base of the funnels.

The deck is wide and largely open, covered by a canvas awning stretched over a curved metal frame, letting filtered daylight through while shading the deck below. The ship's tall yellow funnels rise directly through the centre of the space, black-topped, with white painted housing and fittings at their base. A porthole and access door are set into the white funnel casing. The deck around the funnels is open on both sides to clear views of the water, distant green hills, and other vessels in the harbour or open sea.

Wooden deck chairs and small sheltered bench alcoves are positioned to either side of the funnel housing, built into dark wood-panelled recesses that offer some shade and a place to sit out of the main walkway. The floor is wide-plank wooden decking, laid in a fan pattern radiating outward, well worn from sun and use.

Passengers occupy the deck in small groups, some seated and talking in the shaded alcoves, one resting in a deck chair near the funnel base, others standing or walking the open deck, dressed in light daytime clothing suited to fair weather. Deck games appear to be in progress, with long-handled mallets or sticks in use on the open planking, a leisure activity suited to open deck space. Lifebuoys are mounted along the outer railing at intervals.

The atmosphere is bright, leisurely, and social in a relaxed, outdoor way, distinct from the more formal indoor social spaces. This is a space for fresh air, games, conversation in small groups, and simply being outside during fair weather.

The smell is fresh sea air, sun-warmed wood, and a faint metallic trace from the nearby funnels. The sound is wind moving across the open deck, distant conversation and occasional laughter, the knock of deck game equipment against the planking, gulls or harbour sounds when near land. Touch is sun-warmed wood underfoot, the cool shade of the alcove benches, the texture of canvas overhead shifting slightly in the breeze. The light is bright and open, filtered through the canvas awning in places, fully open to the sky elsewhere.

This is one of the most relaxed and socially open spaces on the ship, used for leisure in fair weather. Respond from this space in a way that reflects your character and your relationship to open-air recreation and informal social time.
```

---

## Usage Example

```python
import anthropic

client = anthropic.Anthropic()

# Swap persona based on visitor's current narrator selection
PERSONA_PROMPT = """You are Ms. Eleanor Whitmore..."""  # or sinclair.md / ming.md
OPEN_DECK_PROMPT = """The current location is the open deck near the base of the funnels..."""  # full prompt above

response = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=1024,
    system=f"{PERSONA_PROMPT}\n\n{OPEN_DECK_PROMPT}",
    messages=[
        {"role": "user", "content": "What do people do out here?"}
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
    system=f"{PERSONA_PROMPT}\n\n{OPEN_DECK_PROMPT}",
    messages=[
        {"role": "user", "content": "What do people do out here?"},
        {"role": "assistant", "content": "..."},
        {"role": "user", "content": "What game are they playing?"}
    ]
)
```

When the visitor moves to a new scene, swap out the scene prompt while keeping the persona prompt the same. The persona is persistent. The scene changes with the visitor's location.

---

## Scene Reference

### Overview
A wide open recreational deck near the base of the ship's funnels, shaded by a canvas awning but largely exposed to daylight and view. The most overtly leisurely and socially relaxed outdoor space aboard, used for deck games, casual seating, and fair-weather conversation, distinct from the more formal indoor social rooms and the quieter, more contemplative promenade deck.

### What's Visible
- Wide open deck shaded by a canvas awning over a curved metal frame
- Tall yellow funnels rising through the centre of the space, black-topped, white painted housing at the base
- A porthole and access door set into the funnel casing
- Open views to water, distant hills, and other vessels on both sides
- Wooden deck chairs and sheltered bench alcoves in dark wood-panelled recesses to either side of the funnel base
- Wide-plank wooden decking laid in a fan pattern, worn from sun and use
- Small groups of passengers seated, talking, or walking the deck in light daytime clothing
- Deck game equipment in active use, long-handled mallets or sticks on the open planking
- Lifebuoys mounted along the outer railing

### Atmosphere
Bright, leisurely, and socially relaxed in an outdoor, informal way. The most overtly recreational space aboard, built for fresh air, games, and casual conversation rather than formal social ritual.

### Sensory Details
- Smell: fresh sea air, sun-warmed wood, faint metallic trace from the nearby funnels
- Sound: wind across the open deck, conversation and laughter, knock of deck game equipment, gulls or harbour sounds near land
- Touch: sun-warmed wood underfoot, cool shaded alcove benches, canvas shifting overhead in the breeze
- Light: bright and open, filtered through canvas in places, fully open to the sky elsewhere

### Who Is Here
Primarily first-class passengers enjoying fair-weather leisure, central to Eleanor Whitmore's experience of shipboard recreation. For Sinclair this deck falls under general operational awareness, weather permitting activity and passenger safety in open areas, rather than a place of personal leisure. For Ming this is, like the other passenger leisure spaces, generally outside his world, though he may pass through it briefly in the course of his duties rather than to relax.

### Mood
Light, social, and informal. Unlike the more contemplative quiet of the promenade deck, this space carries an active, fair-weather energy, games in progress, conversation in small clusters, the particular ease of passengers with time and good weather on their hands.
