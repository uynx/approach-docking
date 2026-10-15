# Approach

Two players dock spacecraft at separate ports on a station. Each player joins
from a browser using a room code. The game includes solo practice and an in-game
guide. Desktop keyboard controls come first; touch controls are not implemented.

Ships start 18 metres ahead, offset sideways and tilted 8–16 degrees in a random direction. Translation jets provide 0.8 m/s² at the starting mass. Ships keep coasting and turning after
the pilot releases the controls. Opposite thrust slows them down. A successful dock beats a failed attempt. Successful docks
score up to 1,000 points for precision, remaining fuel, and remaining time.

Hold the right mouse button and drag over the flight view to look around.
The docking view turns the camera; the chase view orbits around your ship.
Press V or click Center view to recenter. Press C to switch views.

## Run locally

The pinned development environment requires Nix and devenv.

```sh
npm ci
devenv shell -- cmake -S . -B build -G Ninja -DCMAKE_BUILD_TYPE=Release
devenv shell -- cmake --build build -j2
flock -n /tmp/approach-preview-8080.lock build/approach --port 8080 --web build/web
```

Open <http://localhost:8080>. Stop the server with Ctrl+C. To join from another
computer on your network, use the host computer's LAN address and allow its port
8080 through the firewall. Localhost always refers to the device opening the link.

Brave's strict fingerprinting protection blocks WebGL. Set fingerprinting
protection to Standard for this site and reload. WASM works in the tested strict
profile; the failure occurs while initializing graphics. Chromium also works.

## Test

```sh
devenv shell -- ctest --test-dir build --output-on-failure
node --test tests/damage.test.mjs tests/flight-view.test.mjs tests/models.test.mjs tests/tutorial.test.mjs
CHROMIUM_PATH=/path/to/chromium npm run test:browser
```

Native tests cover flight dynamics, complete two-pilot docking and rematches,
reconnection, input validation, and room departures. The network test uses real
WebSockets. The WASM test compares a flight trajectory against the native build.
Browser tests cover rendering, controls, room joins, and blocked graphics.

## Performance

Station and capsule parts share material batches. Original meshes still own
damage and collision queries; render copies add no colliders. Changed vertices
upload only when geometry changes, and detached parts leave holes in the batches.
Camera and nose rays use refitted triangle trees. Shared collision sweeps cache
triangle motion, use spatial splits and skip removed hardware.

The scene caps its drawing buffer at 2,073,600 pixels, including after resize,
and uses 2,048-pixel shadows. Earth retains its 16,384 × 8,192 texture.
One packed WASM read supplies each displayed frame. HTTP assets stream from disk
and revalidate with ETags, so unchanged textures remain cached across reloads.

```sh
CHROMIUM_PATH=/path/to/chromium node tools/benchmark.mjs /tmp/approach-performance.json
REALTIME=1 GPU_BACKEND=hardware CHROMIUM_PATH=/path/to/chromium node tools/benchmark.mjs
```

The benchmark reports its graphics backend, draw counts, frame callback costs
and collision tick timings. Default Chromium uses SwiftShader software graphics.
Controlled callback timings measure CPU and command submission, not sustained
hardware FPS. `REALTIME=1` samples actual animation frame intervals in a fresh page.
`GPU_BACKEND=hardware` requests OpenGL; check the reported backend for fallback.
`PROBE=no-shadows` or `PROBE=no-render` isolates rendering costs.
`PHYSICS_BUDGET_MS` optionally fails if a scenario's 95th-percentile tick exceeds
the supplied budget. Dense wing strikes can still exceed the 8.33 ms physics interval.

The October 7 Asahi software-rendering comparison reduced intact draw calls
from 610 to 48. A collar-impact tick fell from 26.4 ms to 6.7 ms; the maximum
wing-strike tick fell from 28.3 ms to 10.7 ms. These are local samples, not FPS guarantees.
An accelerated Asahi AGX sample at 1280 × 720 averaged approximately 43 FPS on
approach and 36 FPS through a wing strike. The strike's worst frame callback
was 192 ms, so severe impact hitches remain measurable.

## Deploy on Render

The Docker image includes both the native server and browser assets. It listens
on `PORT`, serves `/health`, and upgrades `/ws` to WebSockets. TLS is handled by
Render. No database, API keys, or frontend environment variables are needed.

```sh
docker build -t approach-docking:local .
docker run --rm --name approach-docking -p 8080:8080 approach-docking:local
```

Connect the GitHub repository to Render and create a Blueprint from `render.yaml`.
The configuration selects the free plan and disables automatic deploys. Check
the plan before creating the service. After deployment, open its public HTTPS
URL on two devices and play a round together.

Rooms are held in memory in one server process. Restarts and deployments clear
them. Use one instance. The free service can sleep when idle, so the first visit
can take time to load. See [Render's free-service limits](https://render.com/docs/free).

## Physics and validation

C++17 physics is compiled both natively and to freestanding WebAssembly. It uses
120 Hz RK4 integration, quaternion attitude, rigid-body inertia, finite fuel,
paired thrusters, differential Earth gravity, and rotating-frame terms. A
geometric capture envelope determines docking. Missing it allows continued flight;
contact with station hardware causes a crash. The target, guidance and captured
ship follow the station as it translates and rotates.

The server accepts bounded control inputs with increasing sequence numbers. It
computes positions, fuel, outcomes, and scores itself. Client-submitted positions
and scores are not accepted. This prevents fabricated flight states, but does
not prevent someone automating valid control inputs.


## Controls and views

W/S translate forward/back, A/D left/right, R/F up/down. Arrow keys pitch and yaw;
comma/period or Q/E roll. Opposite thrust stops a turn. Shift selects 20% pulse
duty. Visible thrusters use the same force pairs and 50 ms pulse timing as the
C++ dynamics. Right mouse drag moves the camera, C switches docking/chase view,
and V recenters. T resets practice. The game opens directly into a full-screen
chase view with a compact HUD. Multiplayer and help open on demand.
A ray from the capsule nose stops at the first visible solid surface. Its
marker disappears when the ray misses. It indicates the nose direction, not
a predicted ballistic trajectory. Docking plays a collar-light sequence, a
surface capture pulse and an animated score award.

Help → Watch flight tutorial runs an autopilot through legal thruster commands,
then shows missed braking, an off-centre impact and a solar-wing strike.
Captions explain each maneuver and show the active keys. Pause stops the flight
and effects; Next example skips ahead; Take control starts a fresh practice flight.
The clean approach runs at twice normal speed and earns its score from the shared
physics. Completed examples remain visible for six seconds before advancing.

## Collision and damage model

The build exports the displayed station, capsule and satellite triangles into
the shared native/WASM collision engine. Swept triangle tests find the earliest
contact, including rails, nozzles, dishes and collar lights. Empty truss bays
stay empty. Broad-phase boxes accelerate the search; they never cause contact.
The earliest contact determines the normal and lever arms. An inelastic
impulse includes inverse mass and rotational inertia for both bodies. The capsule
has a 2,120 kg dry mass plus remaining propellant; the station mass is 420,000 kg.
Two capsules can collide with each other. The three 180 kg satellites have
shared positions, attitudes and velocities, and recoil when a capsule hits them.
Each satellite starts with a different tumble axis and angular speed.
Browser prediction processes both pilots in the server's slot order.
Camera clearance and the nose ray query the current visible meshes, including
detached hardware. Exhaust, plasma, flashes, guidance and hidden parts are excluded.

J = (1 + e) vₙ / k. The impulse equals one plus restitution, times incoming normal
contact speed, divided by effective inverse mass. Here k includes both bodies'
rotational response at the contact. Δp = ±Jn and ΔL = r × Δp: linear momentum
changes by opposing impulses, and angular momentum changes by the lever arm
cross the impulse. Restitution e is 0.08. Off-center strikes can tumble both
bodies; the station's larger inertia produces slower rotation.

Permanent visual crushing uses dissipated contact energy and bounded compression.
The combined crush distance is capped at 1.5 m, with material-dependent sharing
between the two objects. Earlier dents persist across subsequent impacts.
Centered loads use axial folds; contact location weights the asymmetric damage.
The fold profile does not impose triangular lobes around the circumference.
Assumed yield forces are 80 kN for docking collars, 20 kN for module shells and
2 kN for solar panels. A solar-wing fracture consumes at most 700 J, including
350 J reserved for fragment motion. A fast capsule can therefore tear through a
panel. Torn panels are removed from collision geometry. Actual mesh sections
leave the solar wings, capsule skin, structural frame and damaged tanks. Metal
rings and stringers buckle with the skin. Severe compression can tear individual
ring arcs and stringers away. The hatch, docking collar, windows and
thruster assemblies move and tilt with their mounts while retaining their shape.
At peak compression, skin tears above 25% tensile edge strain and frame sections
above 15%. These provisional limits select locally stretched sections rather
than removing an entire hemisphere, and do not depend on rendering frame rate.
Fragments inherit parent
translation and rotational velocity. Skin and frame fracture reserve 4% of the
contact deformation energy. Mass-weighted debris velocities add zero net linear
momentum and share their assigned translation/spin energy budget. Fragment spins
vary by piece, inherit parent rotation and balance the angular momentum added by
separation velocities. Their scalar inertia estimate uses a bounding sphere.
These fracture thresholds are game model
parameters, not measurements of a particular spacecraft.

Cabin rupture spends stored ideal-gas energy on opposing hatch panels and venting.
Vacuum does not crush a pressurized cabin inward. Structural impacts produce dents;
internal pressure ejects broken panels outward.

## Propellant bursts

Only sufficiently energetic hits in the capsule's aft propellant bay or the
station's paired tanks can trigger combustion. Capsule fuel is consumed once;
each station tank pair has a persistent rupture flag and an assumed 60 kg load.
The hypothetical propellants are hydrazine and nitrogen tetroxide. Ideal reaction
energy is approximately 6.72 MJ per kilogram of stoichiometric mixture, computed
from NIST formation enthalpies. There is no combustion without both reactants.

2 N₂H₄ + N₂O₄ → 3 N₂ + 4 H₂O. Two hydrazine molecules react with one nitrogen
tetroxide molecule to form three nitrogen molecules and four water molecules.
The model partitions energy into expanding gas, heat and fragments. The hot cloud
expands and fades rapidly in vacuum. A rendered flash approximates camera exposure.
Tank shells and nearby capsule structure break away. A brief bright flash and
expanding luminous ejecta fade within a second. There is no air shockwave in space.

Sources: [NIST hydrazine](https://webbook.nist.gov/cgi/cbook.cgi?ID=C302012&Mask=2),
[NIST nitrogen tetroxide](https://webbook.nist.gov/cgi/cbook.cgi?ID=C10544726&Mask=2),
[NIST water vapor](https://webbook.nist.gov/cgi/cbook.cgi?ID=C7732185&Mask=1).

## Earth and orbit

Earth has its actual radius of 6,371 km and a nominal 400 km reference orbit.
The orbital period follows Earth's gravitational parameter, approximately
92.4 minutes. Each flight starts over a random longitude. The surface moves with
the orbital frame and sidereal Earth rotation, including after docking. This
equatorial orbit changes the longitude in view; it does not pass over the poles.
Earth renders in a separate kilometer-scale pass to preserve nearby depth precision.
The old 2 km flight boundary is removed. Ocean highlights, an illuminated
atmosphere limb, the Moon, solar glare and distant satellites add scene depth.

The shared flight engine retains central gravity, atmospheric drag and ground
contact, but atmospheric entry is no longer a selectable practice mode.

## Imagery credits

- Earth: NASA Earth Observatory, Reto Stöckli,
  [Blue Marble Next Generation](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-map/),
  October base map resized from 21,600 × 10,800 to 16,384 × 8,192.
  Three.js reduces it on GPUs with a smaller texture-size limit.
- Stars: NASA/Goddard SVS, Ernie Wright and Tom Bridgman,
  [Deep Star Maps](https://svs.gsfc.nasa.gov/3895/), 8,192 × 4,096. The map uses
  observed Bright Star, Tycho-2 and UCAC3 catalog positions, brightness and color.
- Moon: NASA Scientific Visualization Studio, Ernie Wright,
  [CGI Moon Kit](https://svs.gsfc.nasa.gov/4720/), LROC color map at 2,048 × 1,024.
- Solar cells use a mipmapped anisotropic texture to filter fine busbar detail
  at distance. Small geometric grid strips have been removed.

## Limits

This is a simplified interactive physics model, not a validated structural or
combustion simulation. Shared physics meshes retain their original shape except for
removed solar panels and ruptured station tanks. Deformation is analytic, not a
finite-element solution. Visual debris does not change parent inertia or perform
secondary collisions, orbital propagation or aerodynamic interaction. Fuel mass
loss, fragment recoil and explosion coupling are approximations. Gas mixing,
blast propagation through structures, ablation, thermal failure, fuel slosh and
flexible docking mechanisms are not resolved. The Moon is background imagery.
Earth contact uses its spherical surface. Satellite dynamics currently handle
capsule impacts; satellite-to-station and satellite-to-satellite impacts are
not resolved. Station recoil is integrated around the original reference orbit.

## Code ownership

| File | Responsibility |
| --- | --- |
| `src/physics.cpp` | Flight integration, contact impulses, station dynamics, capture and atmosphere |
| `src/mesh.cpp` | Swept triangle contacts and mesh ray queries through a BVH |
| `tools/export-meshes.mjs` | Exports collision triangles from the same factories used by the browser |
| `src/state_io.hpp` | Ordered state fields shared by native JSON and WASM reads/restores |
| `src/game.cpp` | Rooms, authoritative ticks, input validation, scoring and round lifecycle |
| `src/wasm.cpp` | Browser interface to the shared physics |
| `web/state.js` | Named browser indices for the state format |
| `web/app.js` | Input, network reconciliation, practice lifecycle and instruments |
| `web/scene.js` | Cameras, lighting, Earth, views and placement |
| `web/models.js` | Geometry, materials, detachable sections and deformation |
| `web/damage.js` | Pure crush, pressure and fragment-energy calculations |
| `web/damage-effects.js` | Impact history, detached meshes, bursts and round resets |
| `web/flight-view.js` | Camera clearance, docking cues and thruster layout |
| `web/tutorial.js` | Legal docking autopilot and crash lesson scenarios |

Add state fields at the end of the native visitor and browser index map. Update
state sizes and the protocol tests together. Browser startup checks the format
size, and the WASM suite round-trips every field. Native/WASM trajectory tests
also check collision metadata and station motion against an independent native
serialization fixture.

A new round calls `resetSimulation()` explicitly. Damage effects own all debris,
flashes, visibility and dent history, including damage caused only by the other
pilot. Add browser modules to the server's static-asset allowlist. Keep physics
changes in the shared C++ core so multiplayer authority and local practice agree.
