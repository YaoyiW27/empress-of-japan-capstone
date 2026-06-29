---
id: loading_dock
name: Loading Dock
ship: Empress of Japan
era: 1930–1950s
deck: dockside
version: 1.0
---

# Loading Dock — Scene File

## Scene Context Prompt

Append this after the persona system prompt in the `system` parameter.

```
The current location is the loading dock at Dock 3, alongside the Empress of Japan.

The Empress of Japan is berthed directly to the left. Standing on the dock, the full scale of the ship is immediately felt. Her white hull rises out of the water like a wall, the green waterline sitting at eye level. Four yellow funnels with black tops stand above the upper decks far overhead. From inside the ship she is a place of corridors and rooms. From down here on the dock she is simply enormous. She fills the entire left side of the view and makes everything else on the dock feel small.

The dock itself is a wide, open timber wharf. Wooden planking runs underfoot, worn and splintered from years of heavy use. Rail tracks are embedded in the dock floor and run toward the ship. Cargo trolleys loaded with wooden crates and steamer trunks sit on the tracks, some moving, some waiting. Dozens of dock workers and crew move across the space. Some carry loads on their backs or between two men. Some operate the trolleys. Some direct others. Some wait for the next instruction. The dock is crowded and continuously in motion.

Directly ahead stands a large steel lattice crane tower, rust-streaked and industrial, rising high above everything on the dock. Its rigging lines and cargo hooks hang overhead. A second crane is visible further along. When the crane swings a load, the hook carries real weight, and a mistake in the coordination between the crane operator and the men below is serious. To the right stands a brick warehouse building and a corrugated iron shed used for staging goods before loading. The shed is marked Dock 3. A small steam tugboat is moored to the left of the ship, smoke rising steadily from its stack.

The cargo being handled includes wooden crates of varying sizes, steamer trunks, metal drums, barrels, and equipment on flat trolleys. The volume is considerable. This is a full port turnaround and everything must be aboard before the tide and the schedule allow the ship to sail.

There is a clear social order on this dock. Senior officers and port officials move through with purpose, checking manifests, giving direction, rarely touching the cargo themselves. Dock foremen and senior crew stand at key points and coordinate the work. The men doing the physical loading follow instructions and keep moving. Everyone knows their position. The hierarchy is not spoken about. It is simply visible in who stands still and who does not.

The sky is open and bright. White clouds move overhead. The smell is salt air, coal smoke from the tug, raw timber, metal, and the sweat of physical work in open daylight. The noise is constant. The crane groans under load. Crates knock and scrape against each other and against the dock. Workers call out to coordinate lifts. There is the deep idle of the ship's engines felt more than heard. It is never quiet here and the pace does not ease until the work is finished.

This is not a passenger space. It is not a place of comfort or social formality. It is a place where the ship's departure depends entirely on the physical effort of the people on this dock. Respond from this space in a way that reflects your character and your relationship to that kind of work.
```

---

## Usage Example

```python
import anthropic

client = anthropic.Anthropic()

# Swap persona based on visitor's current narrator selection
PERSONA_PROMPT = """You are Ming Chen..."""  # or sinclair.md / whitmore.md
LOADING_DOCK_PROMPT = """The current location is the loading dock at Dock 3..."""  # full prompt above

response = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=1024,
    system=f"{PERSONA_PROMPT}\n\n{LOADING_DOCK_PROMPT}",
    messages=[
        {"role": "user", "content": "What is happening out here on the dock?"}
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
    system=f"{PERSONA_PROMPT}\n\n{LOADING_DOCK_PROMPT}",
    messages=[
        {"role": "user", "content": "What is happening out here on the dock?"},
        {"role": "assistant", "content": "..."},
        {"role": "user", "content": "How long does it take to load the ship?"}
    ]
)
```

When the visitor moves to a new scene, swap out the scene prompt while keeping the persona prompt the same. The persona is persistent. The scene changes with the visitor's location.

---

## Scene Reference

### Overview
A working commercial dock alongside the Empress of Japan during a port turnaround. Open, loud, physically demanding, and crowded. The ship dominates the left side of the scene. Cranes, cargo, workers, and warehouse buildings occupy the rest. This is where the ship's cargo operation is most visible and most raw.

### What's Visible
- Empress of Japan berthed to the left, white hull and green waterline, four yellow funnels with black tops
- Wide timber wharf underfoot, worn planking with embedded rail tracks
- Cargo trolleys on the tracks loaded with wooden crates and steamer trunks
- Dozens of dock workers and crew in motion across the space
- Large steel lattice crane tower directly ahead, rust-streaked, rigging and hooks hanging from the arm
- Second crane visible further along the dock
- Brick warehouse building to the right
- Corrugated iron shed to the right marked Dock 3
- Wooden crates, steamer trunks, metal drums, barrels, flat-bed trolleys with equipment
- Small steam tugboat moored to the left of the ship, smoke rising from its stack
- Open sky, bright daylight, white clouds moving overhead
- Hills and water visible in the background beyond the dock

### Atmosphere
Loud, open, and pressured. This is the least formal space connected to the ship. There is no comfort here, no social code beyond the work. The physical scale of the ship seen from dock level is striking. Everything is in motion or waiting to be moved.

### Sensory Details
- Smell: salt air, diesel or coal smoke from the tug, raw timber, metal, sweat
- Sound: crane machinery groaning under load, crates knocking and scraping against each other, workers calling out to coordinate lifts, general crowd noise, the deep idle of the ship's engines
- Touch: rough timber underfoot, splintered crate edges, rope and chain, the vibration of crane movement through the dock floor
- Light: full daylight, open sky, no shade unless under the crane or warehouse eaves

### Who Is Here
Dock workers, loading crew, junior officers overseeing cargo operations, and the occasional senior officer or port official moving through. Passengers may pass through briefly on embarkation or disembarkation but do not linger. Each narrator's relationship to this space is distinct. For Ming it is a primary workplace, physically familiar and exhausting. For Sinclair it is a supervisory space, concerned with schedule, manifest, and safe loading. For Eleanor it is the threshold of the voyage, passed through once with luggage in hand, observed from a distance rather than experienced directly.

### Mood
Urgent and physical. Port turnarounds run on tight schedules. The work is hard, the coordination is constant, and the consequences of a mistake with a crane or a shifting load are serious. The dock does not carry the gravity of the bridge, but it carries the weight of real labour and real risk. The era adds further context. During the 1930s, dock work was hard to come by and poorly paid. During the war years, what was being loaded and where it was going carried consequences that extended far beyond a commercial voyage.
