---
id: dining_saloon
name: First-Class Dining Saloon
ship: Empress of Japan
era: 1930–1950s
deck: upper
version: 1.0
---

# First-Class Dining Saloon — Scene File

## Scene Context Prompt

Append this after the persona system prompt in the `system` parameter.

```
The current location is the first-class dining saloon aboard the Empress of Japan.

The room is grand and double-height, with a mezzanine level running around the upper walls, edged in gold railing. Dark polished wood panelling covers every surface, inlaid with ornate gold detailing in sweeping circular patterns across the ceiling. Long curved light fixtures run the length of the ceiling, casting a warm glow across the entire room. At the centre of the room stands a raised floral display, tiered and lit, surrounded by a circular service counter.

Round tables are set throughout the room, each dressed in crisp white linen, fine glassware, folded napkins, and small arrangements of fresh flowers. The chairs are upholstered in deep burgundy, with dark wood frames. The floor is polished marble, patterned in interlocking bands of cream, deep red, and black, reflecting the light from above.

The room is full of first-class passengers, seated in groups of four to six at the round tables, dressed in formal daywear and tailored suits, hats still worn by some of the women. Conversation moves quietly between tables. Stewards in white dinner jackets move between the tables, serving and clearing with practiced efficiency, while other staff in black and white uniforms attend to specific tables. Service here is constant but unobtrusive.

The atmosphere is refined and socially alive. This is one of the most active social spaces on the ship, particularly at mealtimes. The room hums with quiet conversation, the clink of cutlery and glassware, footsteps on marble, the occasional laugh carrying briefly above the general murmur.

The smell is fresh flowers, polished wood, and the food being served. The sound is layered conversation across many tables, the soft clink of glass and silver, footsteps crossing the marble floor, occasional bursts of laughter. Touch is smooth linen, polished wood armrests, cool marble underfoot near the edges of the room. The light is warm and even, filling the entire space without harsh shadow, reflected brightly off the gold detailing and marble floor.

This is a space built for display as much as for dining. Manners, dress, and conversation all matter here. Respond from this space in a way that reflects your character and your relationship to this kind of formal social environment.
```

---

## Usage Example

```python
import anthropic

client = anthropic.Anthropic()

# Swap persona based on visitor's current narrator selection
PERSONA_PROMPT = """You are Ms. Eleanor Whitmore..."""  # or sinclair.md / ming.md
DINING_SALOON_PROMPT = """The current location is the first-class dining saloon..."""  # full prompt above

response = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=1024,
    system=f"{PERSONA_PROMPT}\n\n{DINING_SALOON_PROMPT}",
    messages=[
        {"role": "user", "content": "What is mealtime like in here?"}
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
    system=f"{PERSONA_PROMPT}\n\n{DINING_SALOON_PROMPT}",
    messages=[
        {"role": "user", "content": "What is mealtime like in here?"},
        {"role": "assistant", "content": "..."},
        {"role": "user", "content": "Who do people usually sit with?"}
    ]
)
```

When the visitor moves to a new scene, swap out the scene prompt while keeping the persona prompt the same. The persona is persistent. The scene changes with the visitor's location.

---

## Scene Reference

### Overview
The grand social centre of first-class life aboard the Empress of Japan. A double-height dining room with a mezzanine level, finished in dark polished wood and gold ornamentation. The most socially active space connected to the first-class experience, built as much for seeing and being seen as for dining itself.

### What's Visible
- Double-height room with a mezzanine level edged in gold railing
- Dark polished wood panelling throughout, inlaid with ornate gold circular patterns
- Long curved ceiling light fixtures running the length of the room
- Raised tiered floral display at the centre of the room, with a circular service counter around it
- Round tables dressed in white linen, fine glassware, folded napkins, fresh flowers
- Burgundy upholstered chairs with dark wood frames
- Polished marble floor patterned in cream, deep red, and black bands
- Numerous first-class passengers seated in groups, in formal daywear, some women in hats
- Stewards in white dinner jackets serving tables
- Additional staff in black and white uniforms attending specific tables

### Atmosphere
Refined, socially alive, and visually rich. One of the busiest and most active social spaces on the ship at mealtimes. Conversation, light, and movement fill the room evenly, with constant but unobtrusive service moving between tables.

### Sensory Details
- Smell: fresh flowers, polished wood, food being served
- Sound: layered conversation across many tables, clinking glass and silver, footsteps on marble, occasional laughter
- Touch: smooth linen, polished wood armrests, cool marble near the room's edges
- Light: warm and even, reflecting off gold detailing and marble flooring, no harsh shadow

### Who Is Here
First-class passengers, the social centre of Eleanor Whitmore's world aboard ship. Stewards and dining staff are constantly present but operate at a deliberate social distance. For Sinclair this is a space he may visit briefly to greet passengers, a duty of hospitality rather than a place he lingers. For Ming this is a space entirely outside his world, one he might glimpse only from a service corridor or hear about secondhand, never as a place he belongs.

### Mood
Lively, formal, and performative in the genteel sense. Manners and appearance matter visibly here. The mood is warm rather than stiff, but every detail, from table setting to dress to posture, is part of a shared, unspoken code that everyone in the room is expected to know.
