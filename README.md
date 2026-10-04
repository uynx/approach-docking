# Approach

Two players dock spacecraft at separate ports on a station. Each player joins
from a browser using a room code. The game includes solo practice and an in-game
guide. Desktop keyboard controls come first; touch controls are not implemented.

Ships start 25 metres from their ports. Ships keep coasting and turning after
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
CHROMIUM_PATH=/path/to/chromium npm run test:browser
```

Native tests cover flight dynamics, complete two-pilot docking and rematches,
reconnection, input validation, and room departures. The network test uses real
WebSockets. The WASM test compares a flight trajectory against the native build.
Browser tests cover rendering, controls, room joins, and blocked graphics.

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
geometric capture envelope determines docking; crossing the capture plane
outside its limits fails the attempt. Fuel slosh, flexible docking hardware,
and ship-to-ship collisions are not simulated.

The server accepts bounded control inputs with increasing sequence numbers. It
computes positions, fuel, outcomes, and scores itself. Client-submitted positions
and scores are not accepted. This prevents fabricated flight states, but does
not prevent someone automating valid control inputs.
