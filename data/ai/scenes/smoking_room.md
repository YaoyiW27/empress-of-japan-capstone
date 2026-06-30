---
id: smoking_room
name: First-Class Smoking Room
ship: Empress of Japan
era: 1930–1950s
deck: upper
version: 1.0
---

# First-Class Smoking Room — Scene File

## Scene Context Prompt

Append this after the persona system prompt in the `system` parameter.

```
The current location is the first-class smoking room aboard the Empress of Japan.

The room is divided into a lounge area and a shop, connected by a wide open passage. The lounge sits beneath a domed stained glass ceiling, leaded in warm amber, green, and cream tones, with a single pendant light hanging at its centre. Dark wood panelling lines the walls beneath the dome, and a white marble fireplace sits at the far end of the lounge, flanked by dark wood cabinetry and small decorative urns. A mirror is set into the wall above the mantel.

Wing-backed armchairs upholstered in muted green floral fabric are arranged in small groupings around low wooden tables, set on a richly patterned red and navy carpet. Tables hold open books, small lamps, and other personal items left by passengers in passing. The floor beyond the carpet is herringbone parquet.

The passage leads toward a brighter, more functional space lined with tall wooden pillars trimmed in brass, leading to a glass-fronted shop. Glass display cases line the shop walls, filled with curios, carved figures, jewellery, and small souvenirs, lit warmly from within. A small round table with cane-backed chairs sits near the shop entrance, with a vase of fresh hydrangeas at its centre. Patterned rugs are placed at intervals along the polished floor leading toward the shop and further corridors beyond.

The atmosphere shifts within this space. Near the dome and fireplace it is hushed, comfortable, suited to quiet reading or low conversation. Near the shop it becomes brighter and more active, a place for browsing and brief exchanges rather than settling in.

The smell is old leather, polished wood, and a faint trace of tobacco smoke worked into the furnishings over time. The sound is quiet murmured conversation, the occasional creak of a leather chair, footsteps changing tone between carpet and parquet, faint sounds of activity from the shop. Touch is the give of an upholstered armchair, the cool of polished wood tabletops, the texture of the patterned rugs underfoot. The light shifts from the soft coloured glow beneath the stained glass dome to the warmer, brighter light near the shop displays.

This is a space for leisure, conversation, and quiet retreat, distinct from the social display of the dining saloon. Respond from this space in a way that reflects your character and your relationship to this kind of unhurried, comfortable environment.
```

---

## Usage Example

```python
import anthropic

client = anthropic.Anthropic()

# Swap persona based on visitor's current narrator selection
PERSONA_PROMPT = """You are Ms. Eleanor Whitmore..."""  # or sinclair.md / ming.md
SMOKING_ROOM_PROMPT = """The current location is the first-class smoking room..."""  # full prompt above

response = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=1024,
    system=f"{PERSONA_PROMPT}\n\n{SMOKING_ROOM_PROMPT}",
    messages=[
        {"role": "user", "content": "What do people do in this room?"}
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
    system=f"{PERSONA_PROMPT}\n\n{SMOKING_ROOM_PROMPT}",
    messages=[
        {"role": "user", "content": "What do people do in this room?"},
        {"role": "assistant", "content": "..."},
        {"role": "user", "content": "Is the shop part of this room?"}
    ]
)
```

When the visitor moves to a new scene, swap out the scene prompt while keeping the persona prompt the same. The persona is persistent. The scene changes with the visitor's location.

---

## Scene Reference

### Overview
A first-class leisure space combining a quiet lounge beneath a stained glass dome with an adjoining shop. Less socially performative than the dining saloon, this room is built for retreat, reading, conversation, and browsing rather than display.

### What's Visible
- Domed stained glass ceiling in amber, green, and cream tones, with a central pendant light
- Dark wood panelling beneath the dome
- White marble fireplace flanked by dark wood cabinetry and decorative urns
- Mirror set above the fireplace mantel
- Wing-backed armchairs in muted green floral upholstery, arranged around low wooden tables
- Richly patterned red and navy carpet beneath the lounge seating
- Herringbone parquet floor beyond the carpet
- A connecting passage lined with brass-trimmed wooden pillars
- A glass-fronted shop with display cases of curios, carved figures, jewellery, and souvenirs
- A small round table with cane-backed chairs near the shop entrance, with fresh hydrangeas
- Patterned runner rugs leading toward the shop and further corridors

### Atmosphere
Quiet and comfortable near the dome and fireplace, brighter and more active near the shop. A space of contrasts within a single room, suited to both settling in and brief browsing.

### Sensory Details
- Smell: old leather, polished wood, faint tobacco worked into the furnishings
- Sound: quiet conversation, the creak of leather chairs, footsteps shifting between carpet and parquet, faint shop activity
- Touch: upholstered armchair give, cool polished wood, textured rugs underfoot
- Light: soft coloured glow beneath the dome, brighter warm light near the shop

### Who Is Here
First-class passengers reading, conversing, or browsing, generally alone or in small groups rather than the larger social gatherings of the dining saloon. Staff may attend the shop counter but are otherwise less visibly present than in the dining saloon. For Sinclair this is a space he might pass through but rarely lingers in, since it falls outside operational concerns. For Ming this is entirely outside his world, both physically and socially, a part of the ship he would have no occasion to enter.

### Mood
Unhurried and personal. Unlike the dining saloon's shared performance, this room allows for solitude or quiet company. The light and materials, stained glass, leather, polished wood, all suggest retreat rather than spectacle.
