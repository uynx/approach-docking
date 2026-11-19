# Approach

This is a spacecraft game I'm building where two players fight duels at `/arena`, joining from separate browsers with a room code. There's also solo recovery training that teaches how to control a ship that's drifting and spinning, and the original docking flight and a twelve-scene crash lab are still available at `/` and `/?lab=1`. Desktop keyboard controls come first, and touch controls aren't implemented yet.

## Combat

To fight, both players choose Station shipyard or Orbital scrapyard, one of them creates a room and shares the code, and both press Ready. The first player to win three rounds takes the match, and each round lasts two minutes, so a round is won by destroying the other hull or by having more hull left when time runs out. Equal hull at the timeout draws the round. Leaving a match forfeits it, though a pilot who disconnects has ten seconds to reconnect, and leaving the 180 m arena damages the hull.

Mouse movement aims the weapon independently of the ship, and left click or Space fires. WASD translates, R and F rise and descend, the arrow keys pitch and yaw, and Q and E roll. B applies opposing translation thrust to brake, and C toggles between a stable camera and one that follows the ship's rotation. Dragging with the right mouse button looks around and V resets the view, while clicking the flight view captures the mouse and Esc releases it.

Lasers deal 25 hull damage with a quarter-second cooldown and a 240 m range, and station hardware and intact ship surfaces block shots. Hull hits detach sections and remove their colliders, and damage weakens individual thruster pairs, so a damaged ship accelerates and turns differently than a healthy one. Destroyed ships break apart.

There are two power slots, used with 1 and 2 or the HUD buttons, and pickups refill empty slots and add propellant. The powers are Spin bug, Tow cable, Emergency kick, Decoy capsule, Scrap armor and Recovery override, which can disrupt rotation, pull both craft, add a thrust impulse, display a false ship, absorb damage or damp rotation. The in-game rules explain when and how to use each one.

The native server owns hits, cooldowns, damage, inventory, pickup proximity and round scores, and clients only submit bounded flight axes, unit aim directions and action requests. Generated callsigns are public labels, and persistent identity and Elo aren't implemented.

## Docking

Ships start 18 meters ahead, offset sideways and tilted 8 to 16 degrees in a random direction, and the translation jets provide 0.8 m/s² at the starting mass. Ships keep coasting and turning after the pilot lets go of the controls, so opposite thrust is what slows them down. A successful dock always beats a failed attempt, and successful docks score up to 1,000 points for precision, remaining fuel and remaining time.

Holding the right mouse button and dragging over the flight view looks around. The docking view turns the camera while the chase view orbits around the ship, and V or the Center view button recenters it while C switches views.

## Running it locally

The pinned development environment needs Nix and devenv.

```sh
npm ci
devenv shell -- cmake -S . -B build -G Ninja -DCMAKE_BUILD_TYPE=Release
devenv shell -- cmake --build build -j2
flock -n /tmp/approach-preview-8080.lock build/approach --port 8080 --web build/web
```

After that, the arena is at <http://localhost:8080/arena> and Ctrl+C stops the server. To join from another computer on the same network, use the host computer's LAN address and allow port 8080 through its firewall, since localhost always refers to the device opening the link.

Brave's strict fingerprinting protection blocks WebGL, so fingerprinting protection has to be set to Standard for this site before reloading. WASM itself works in the tested strict profile, and the failure happens while the graphics initialize. Chromium also works.

## Testing

```sh
devenv shell -- ctest --test-dir build --output-on-failure
node --test tests/combat.test.mjs tests/damage.test.mjs tests/flight-view.test.mjs tests/models.test.mjs tests/tutorial.test.mjs
CHROMIUM_PATH=/path/to/chromium npm run test:browser
```

The native tests cover flight dynamics, complete two-pilot docking and rematches, reconnection, input validation and players leaving rooms. The network test uses real WebSockets, and the WASM test compares a flight trajectory against the native build. The browser tests cover rendering, controls, room joins and blocked graphics, and the combat checks include server-owned hits, cooldowns, damaged steering, armor, destruction and round scoring across two browsers.

## Performance

Station, capsule and detached debris parts share material batches, while the original meshes still own damage and collision queries, so the render copies add no colliders. Changed vertices only upload when the geometry changes, and detached parts leave holes in the batches. Camera and nose rays use refitted triangle trees, and the shared collision sweeps cache triangle motion, use spatial splits and skip removed hardware.

Station collision leaves hold at most four triangles while other models keep up to eight per leaf. Before any triangle pairs are considered, swept node bounds have to overlap both in world coordinates and in a fixed frame aligned with the capsule, which rejects the empty space left by coarse bounds and reduces false overlaps while ships tumble. The exact swept triangle contact and impulse calculations still make the final decision, and WASM reserves a 512 KiB stack for both bound caches.

Static station meshes are grouped by their centers in a grid of 8 m cells inside their material batches, so a local dent only updates the groups near it. Because of this, the sampled collar dent uploads 30.4% of the station's position data instead of 88.2%, with seven station material batches in both cases, and the collision export still keeps all 103,312 triangles.

The graphics selector works in combat, docking and the crash lab. Balanced caps the drawing buffer at 1280 × 720 pixels, Smoothest at 960 × 540 and Sharpest at 1920 × 1080, including after a resize, while the HUD stays at the screen's resolution. Shadows use 2,048 pixels and Earth keeps its 16,384 × 8,192 texture. Each displayed frame comes from one packed WASM read, and HTTP assets stream from disk and revalidate with ETags, so unchanged textures stay cached across reloads. Combat instruments update ten times per second.

Local simulation yields after eight milliseconds of finished physics work per frame and keeps its queued ticks, though a single expensive tick can still go over that budget. A severe collision can slow local simulation for a moment before it catches up, while the server keeps its fixed simulation ticks. Station dents cache their local influence weights and leave unaffected geometry alone.

```sh
CHROMIUM_PATH=/path/to/chromium node tools/benchmark.mjs /tmp/approach-performance.json
REALTIME=1 GPU_BACKEND=hardware CHROMIUM_PATH=/path/to/chromium node tools/benchmark.mjs
```

The benchmark reports its graphics backend, draw counts, frame callback costs and collision tick timings. Default Chromium uses SwiftShader software graphics, so the controlled callback timings measure CPU work and command submission and not sustained hardware FPS, while `REALTIME=1` samples actual animation frame intervals in a fresh page. `GPU_BACKEND=hardware` requests OpenGL, but the reported backend is worth checking in case it fell back. `PROBE=no-shadows` or `PROBE=no-render` isolates rendering costs, `ARENA=1` profiles combat training, `WIDTH` and `HEIGHT` set the viewport, and `QUALITY=performance`, `balanced` or `sharp` picks the graphics preset. `PHYSICS_BUDGET_MS` makes the run fail if a scenario's 95th-percentile tick goes over the given budget. Dense wing strikes can still go over the 8.33 ms physics interval.

The October 7 software-rendering comparison on Asahi cut intact draw calls from 610 to 48. A collar-impact tick fell from 26.4 ms to 6.7 ms and the worst wing-strike tick fell from 28.3 ms to 10.7 ms, though these are local samples and not FPS guarantees. An accelerated sample on Asahi's AGX GPU at 1280 × 720 averaged about 43 FPS on approach and 36 FPS through a wing strike, but the strike's worst frame callback was 192 ms, so severe impact hitches are still measurable.

The October 15 algorithm comparison ran each crash scenario five times, interleaved with the previous WASM build. Median peak physics ticks fell from 11.7 to 2.8 ms for the wing strike and from 20.0 to 5.3 ms for tumbling contact. A separate AGX browser sample on Smoothest at 960 × 540 cut the 95th-percentile wing-strike callback cost from 42.7 to 12.8 ms, with a maximum of 70.2 ms before and 38.1 ms after. These are local timings that don't guarantee a frame rate on other devices, and occasional impact stalls are still possible.

## Deploying on Render

The Docker image includes both the native server and the browser assets. It listens on `PORT`, serves `/health` and upgrades `/ws` to WebSockets, while Render handles TLS, so no database, API keys or frontend environment variables are needed.

```sh
docker build -t approach-docking:local .
docker run --rm --name approach-docking -p 8080:8080 approach-docking:local
```

To deploy, I connect the GitHub repository to Render and create a Blueprint from `render.yaml`, which selects the free plan and turns off automatic deploys, though the plan is worth checking before creating the service. After it deploys, opening its public HTTPS URL on two devices and playing a round together shows that it works.

Rooms are held in memory in one server process, so restarts and deployments clear them and only one instance should run. The free service can sleep when idle, which means the first visit can take a while to load, and [Render's free-service limits](https://render.com/docs/free) has the details.

## Physics and validation

The C++17 physics is compiled both natively and to freestanding WebAssembly. It uses 120 Hz RK4 integration, quaternion attitude, rigid-body inertia, finite fuel, paired thrusters, differential Earth gravity and rotating-frame terms. A geometric capture envelope decides docking, so missing it lets the flight continue while touching station hardware causes a crash. The target, the guidance and a captured ship all follow the station as it translates and rotates.

The server accepts bounded control inputs with increasing sequence numbers and computes positions, fuel, outcomes and scores itself, without accepting positions or scores from clients. This prevents fabricated flight states, but it doesn't stop someone from automating valid control inputs.

## Controls and views

W and S translate forward and back, A and D left and right, and R and F up and down. The arrow keys pitch and yaw, comma and period or Q and E roll, and opposite thrust stops a turn. Shift selects a 20% pulse duty, and the visible thrusters use the same force pairs and 50 ms pulse timing as the C++ dynamics. Dragging with the right mouse button moves the camera, C switches between the docking and chase views, V recenters and T resets practice.

The game opens straight into a full-screen chase view with a compact HUD, and multiplayer and help only open when asked for. A ray from the capsule's nose stops at the first visible solid surface, and its marker disappears when the ray misses. It shows where the nose points, not a predicted ballistic path. Docking plays a collar-light sequence, a surface capture pulse and an animated score award.

Help → Watch flight tutorial runs an autopilot through legal thruster commands and then shows missed braking, an off-center impact and a solar-wing strike. Captions explain each maneuver and show the active keys, while Pause stops the flight and effects, Next example skips ahead and Take control starts a fresh practice flight. The clean approach runs at twice normal speed and earns its score from the shared physics, and each finished example stays visible for six seconds before the next one starts.

## Collision and damage model

The build exports the displayed station, capsule and satellite triangles into the collision engine shared by the native and WASM builds. Swept triangle tests find the earliest contact, including rails, nozzles, dishes and collar lights, while empty truss bays stay empty. Broad-phase boxes speed up the search but never cause contact on their own, and the earliest contact decides the normal and the lever arms. The inelastic impulse includes the inverse mass and rotational inertia of both bodies. The capsule has a 2,120 kg dry mass plus whatever propellant is left, and the station's mass is 420,000 kg.

Two capsules can collide with each other. The three 180 kg satellites have shared positions, attitudes and velocities and recoil when a capsule hits them, and each one starts with a different tumble axis and angular speed. Browser prediction processes both pilots in the server's slot order. Camera clearance and the nose ray query the meshes that are currently visible, including detached hardware, and leave out exhaust, plasma, flashes, guidance and hidden parts.

J = (1 + e) vₙ / k, which means the impulse equals one plus the restitution, times the incoming normal contact speed, divided by the effective inverse mass. Here k includes both bodies' rotational response at the contact point. Δp = ±Jn and ΔL = r × Δp, which means linear momentum changes by opposing impulses and angular momentum changes by the lever arm crossed with the impulse. The restitution e is 0.08. Off-center strikes can make both bodies tumble, and the station's larger inertia makes it rotate more slowly.

Permanent visual crushing uses the dissipated contact energy and a bounded compression. The combined crush distance is capped at 1.5 m and is split between the two objects depending on their materials, and earlier dents stay through later impacts. Centered loads make axial folds while the contact location weights asymmetric damage, and the fold profile doesn't force triangular lobes around the circumference. The assumed yield forces are 80 kN for docking collars, 20 kN for module shells and 2 kN for solar panels. A solar-wing fracture uses at most 700 J, including 350 J reserved for fragment motion, so a fast capsule can tear right through a panel, and torn panels are removed from the collision geometry.

Actual mesh sections break off the solar wings, the capsule skin, the structural frame and damaged tanks. Metal rings and stringers buckle with the skin, and severe compression can tear individual ring arcs and stringers away, while the hatch, docking collar, windows and thruster assemblies move and tilt with their mounts without changing shape. At peak compression, skin tears above 25% tensile edge strain and frame sections tear above 15%. These limits are provisional, and they pick out locally stretched sections instead of removing an entire hemisphere, without depending on the rendering frame rate.

Fragments inherit their parent's translation and rotational velocity, and skin and frame fracture reserve 4% of the contact deformation energy. The mass-weighted debris velocities add zero net linear momentum and share their assigned budget of translation and spin energy. Fragment spins vary by piece, inherit the parent's rotation and balance the angular momentum added by the separation velocities, and their scalar inertia estimate uses a bounding sphere. These fracture thresholds are parameters of the game model and not measurements of any particular spacecraft.

A cabin rupture spends the stored ideal-gas energy on opposing hatch panels and venting. Vacuum doesn't crush a pressurized cabin inward, so structural impacts make dents while internal pressure blows broken panels outward.

## Propellant bursts

Only hits with enough energy in the capsule's aft propellant bay or the station's paired tanks can set off combustion. The capsule's fuel can only burn once, while each station tank pair has a persistent rupture flag and an assumed 60 kg load. The hypothetical propellants are hydrazine and nitrogen tetroxide, and the ideal reaction energy is about 6.72 MJ per kilogram of stoichiometric mixture, computed from NIST formation enthalpies. Without both reactants there's no combustion.

2 N₂H₄ + N₂O₄ → 3 N₂ + 4 H₂O, which means two hydrazine molecules react with one nitrogen tetroxide molecule to form three nitrogen molecules and four water molecules. The model splits the energy into expanding gas, heat and fragments. The hot cloud expands and fades quickly in vacuum, and a rendered flash approximates camera exposure. Tank shells and nearby capsule structure break away, and a brief bright flash and expanding glowing ejecta fade within a second. There's no air shockwave in space.

Sources: [NIST hydrazine](https://webbook.nist.gov/cgi/cbook.cgi?ID=C302012&Mask=2),
[NIST nitrogen tetroxide](https://webbook.nist.gov/cgi/cbook.cgi?ID=C10544726&Mask=2),
[NIST water vapor](https://webbook.nist.gov/cgi/cbook.cgi?ID=C7732185&Mask=1).

## Earth and orbit

Earth has its actual radius of 6,371 km with a nominal 400 km reference orbit, and the orbital period follows from Earth's gravitational parameter, at about 92.4 minutes. Each flight starts over a random longitude, and the surface moves with the orbital frame and Earth's sidereal rotation, including after docking. The orbit is equatorial, so it changes which longitude is in view but never passes over the poles. Earth renders in a separate kilometer-scale pass to keep the depth precision of nearby objects. The old 2 km flight boundary is gone, and ocean highlights, a lit atmosphere limb, the Moon, solar glare and distant satellites add depth to the scene.

The shared flight engine still has central gravity, atmospheric drag and ground contact, but atmospheric entry isn't a practice mode anymore.

## Imagery credits

- Earth: NASA Earth Observatory, Reto Stöckli,
  [Blue Marble Next Generation](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-map/),
  October base map resized from 21,600 × 10,800 to 16,384 × 8,192. Three.js reduces it on GPUs with a smaller texture-size limit.
- Stars: NASA/Goddard SVS, Ernie Wright and Tom Bridgman,
  [Deep Star Maps](https://svs.gsfc.nasa.gov/3895/), 8,192 × 4,096. The map uses observed Bright Star, Tycho-2 and UCAC3 catalog positions, brightness and color.
- Moon: NASA Scientific Visualization Studio, Ernie Wright,
  [CGI Moon Kit](https://svs.gsfc.nasa.gov/4720/), LROC color map at 2,048 × 1,024.

The solar cells use a mipmapped anisotropic texture to filter out fine busbar detail at a distance, and the small geometric grid strips that used to be there are gone.

## Limits

This is a simplified interactive physics model and not a validated structural or combustion simulation. The shared physics meshes keep their original shape except for removed solar panels, ruptured station tanks and capsule sections detached by lasers. Deformation is analytic and not a finite-element solution, and visual debris doesn't change its parent's inertia or do secondary collisions, orbital propagation or aerodynamic interaction. Fuel mass loss, fragment recoil and the coupling of explosions are approximations, while gas mixing, blast propagation through structures, ablation, thermal failure, fuel slosh and flexible docking mechanisms aren't modeled at all. The Moon is background imagery and Earth contact uses its spherical surface. Satellite dynamics currently handle capsule impacts, but satellite-to-station and satellite-to-satellite impacts aren't resolved, and station recoil is integrated around the original reference orbit.

## Code ownership

| File | Responsibility |
| --- | --- |
| `src/physics.cpp` | Flight integration, contact impulses, station dynamics, capture and atmosphere |
| `src/mesh.cpp` | Swept triangle contacts and mesh ray queries through a BVH |
| `tools/export-meshes.mjs` | Exports collision triangles from the same factories used by the browser |
| `src/state_io.hpp` | Ordered state fields shared by native JSON and WASM reads/restores |
| `src/game.cpp` | Rooms, authoritative ticks, input validation, scoring and round lifecycle |
| `src/combat.cpp` | Duel rules, map setup, weapon hits, damaged thrusters, powers and round scoring |
| `src/wasm.cpp` | Browser interface to the shared physics |
| `web/state.js` | Named browser indices for the state format |
| `web/app.js` | Input, network reconciliation, practice lifecycle and instruments |
| `web/arena.js` | Combat controls, rooms, recovery training and HUD |
| `web/combat-view.js` | Independent aim, manual flight axes and packed combat reads |
| `web/combat-effects.js` | Laser pulses, impacts, tethers, armor and visual decoys |
| `web/scene.js` | Cameras, lighting, Earth, views and placement |
| `web/models.js` | Geometry, materials, detachable sections and deformation |
| `web/damage.js` | Pure crush, pressure and fragment-energy calculations |
| `web/damage-effects.js` | Impact history, detached meshes, bursts and round resets |
| `web/flight-view.js` | Camera clearance, docking cues and thruster layout |
| `web/tutorial.js` | Legal docking autopilot and crash lesson scenarios |

New state fields go at the end of the native visitor and the browser index map, and the state sizes and protocol tests get updated together. Browser startup checks the format size and the WASM suite round-trips every field, while the native and WASM trajectory tests also check collision metadata and station motion against an independent native serialization fixture. Flight state currently has 40 fields, including four 32-bit masks for missing fragments, and combat rounds have a separate packed representation of 129 values. That independent trajectory fixture has to be updated alongside the shared visitors whenever fields change.

A new round calls `resetSimulation()` explicitly. Damage effects own all debris, flashes, visibility and dent history, including damage caused only by the other pilot. New browser modules have to be added to the server's static-asset allowlist, and physics changes stay in the shared C++ core so multiplayer authority and local practice agree.
