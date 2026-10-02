import * as THREE from '/vendor/three.module.js';

export function createScene(canvas) {
  const context = canvas.getContext('webgl2', { antialias: true, powerPreference: 'high-performance' });
  if (!context || context.isContextLost() || !context.getParameter(context.VERSION)) {
    throw new Error('WebGL is blocked or unavailable. In Brave, try Standard fingerprinting protection for this site, then reload. Chromium also works.');
  }
  const renderer = new THREE.WebGLRenderer({ canvas, context, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.setClearColor(0x04080e);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.5;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 160000);
  scene.add(new THREE.AmbientLight(0x7499b6, 1.2));
  const sun = new THREE.DirectionalLight(0xffe0b4, 3.5);
  sun.position.set(-90, 110, 160); scene.add(sun);
  const bounce = new THREE.DirectionalLight(0x73bbd9, 1.2);
  bounce.position.set(10, -60, 30); scene.add(bounce);
  const metal = new THREE.MeshStandardMaterial({ color: 0xabb7be, metalness: 0.55, roughness: 0.52 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b2938, metalness: 0.5, roughness: 0.55 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xb48448, metalness: 0.65, roughness: 0.4 });
  const solar = new THREE.MeshStandardMaterial({ color: 0x173456, metalness: 0.55, roughness: 0.4, side: THREE.DoubleSide });
  const cyan = new THREE.MeshBasicMaterial({ color: 0x98f3e2 });
  const amber = new THREE.MeshBasicMaterial({ color: 0xffbd79 });
  const mesh = (geometry, material, parent, x = 0, y = 0, z = 0) => {
    const object = new THREE.Mesh(geometry, material); object.position.set(x, y, z); parent.add(object); return object;
  };
  const box = (parent, size, pos, material) => mesh(new THREE.BoxGeometry(...size), material, parent, ...pos);
  const cylinder = (parent, radius, length, pos, material) => {
    const object = mesh(new THREE.CylinderGeometry(radius, radius, length, 24), material, parent, ...pos);
    object.rotation.x = Math.PI / 2; return object;
  };
  const station = new THREE.Group(); scene.add(station);
  box(station, [49, 1.8, 2], [0, 0, -13], dark);
  cylinder(station, 3.6, 14, [0, 0, -15], metal);
  for (const x of [-18, 18]) {
    cylinder(station, 2.8, 12, [x, 0, -10], metal);
    cylinder(station, 1.9, 1.5, [x, 0, -3.5], dark);
    mesh(new THREE.TorusGeometry(1.5, 0.12, 8, 48), cyan, station, x, 0, -2.7);
    mesh(new THREE.CircleGeometry(1.4, 48), dark, station, x, 0, -2.8);
    for (const z of [-6, -10, -14]) mesh(new THREE.TorusGeometry(2.82, 0.08, 6, 32), dark, station, x, 0, z);
    box(station, [0.08, 1.8, 0.1], [x, 0, -2.6], cyan);
    box(station, [1.8, 0.08, 0.1], [x, 0, -2.6], cyan);
    for (const side of [-1, 1]) {
      const sx = x + side * 10;
      box(station, [17, 0.25, 0.35], [sx, 0, -19], gold);
      for (const dy of [-1, 1]) {
        box(station, [9, 15, 0.12], [sx, dy * 9, -19], solar);
        for (let j = -4; j <= 4; j++) box(station, [0.035, 15, 0.15], [sx + j, dy * 9, -18.9], gold);
        for (let j = -7; j <= 7; j++) box(station, [9, 0.025, 0.15], [sx, dy * 9 + j, -18.9], metal);
      }
    }
  }
  const dish = mesh(new THREE.SphereGeometry(2, 20, 12, 0, Math.PI * 2, 0, Math.PI / 3), metal, station, 0, 5, -14);
  dish.rotation.z = -0.4;
  box(station, [0.2, 5, 0.2], [0, 4, -14], gold);
  const guidance = new THREE.Group(); scene.add(guidance);
  for (const x of [-18, 18]) for (const z of [15, 35, 65, 105]) {
    const ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-3, -3, 0), new THREE.Vector3(3, -3, 0),
      new THREE.Vector3(3, 3, 0), new THREE.Vector3(-3, 3, 0),
    ]), new THREE.LineBasicMaterial({ color: 0x79b9b9, transparent: true, opacity: 0.14 }));
    ring.position.set(x, 0, z); guidance.add(ring);
  }
  function spacecraft(color) {
    const group = new THREE.Group();
    cylinder(group, 1.35, 3.6, [0, 0, 0], metal);
    const nose = mesh(new THREE.CylinderGeometry(0.7, 1.35, 1.2, 20), metal, group, 0, 0, -2.1);
    nose.rotation.x = -Math.PI / 2;
    cylinder(group, 0.55, 0.5, [0, 0, -2.95], dark);
    box(group, [1, 0.65, 0.1], [0, 0.6, -2.65], new THREE.MeshStandardMaterial({ color: 0x142d42, metalness: 0.8, roughness: 0.1 }));
    mesh(new THREE.TorusGeometry(1.36, 0.06, 6, 24), color, group, 0, 0, 0.8);
    const plume = new THREE.Group(); group.add(plume);
    for (const x of [-1, 1]) for (const y of [-1, 1]) {
      box(group, [0.4, 0.4, 0.8], [x * 1.1, y * 1.1, 0.5], dark);
      const fire = mesh(new THREE.ConeGeometry(0.12, 1.7, 8), new THREE.MeshBasicMaterial({ color: 0x9fe4ff, transparent: true, opacity: 0.45 }), plume, x, y, 2.5);
      fire.rotation.x = Math.PI / 2;
    }
    scene.add(group); return { group, plume };
  }
  const own = spacecraft(cyan), other = spacecraft(amber);
  const stars = new Float32Array(1800 * 3);
  let seed = 42;
  const random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < stars.length; i += 3) {
    const az = random() * Math.PI * 2, y = random() * 2 - 1, radius = Math.sqrt(1 - y * y);
    stars[i] = 55000 * radius * Math.cos(az); stars[i + 1] = 55000 * y; stars[i + 2] = 55000 * radius * Math.sin(az);
  }
  const starGeometry = new THREE.BufferGeometry(); starGeometry.setAttribute('position', new THREE.BufferAttribute(stars, 3));
  scene.add(new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: 0xbfd8ee, size: 1.2, sizeAttenuation: false })));
  const earth = mesh(new THREE.SphereGeometry(63710, 80, 48), new THREE.MeshStandardMaterial({ color: 0x153958, roughness: 1, metalness: 0 }), scene, 0, -67710, 0);
  const atmosphere = mesh(new THREE.SphereGeometry(63830, 80, 48), new THREE.MeshBasicMaterial({ color: 0x54b8e9, transparent: true, opacity: 0.16, side: THREE.BackSide }), scene, 0, -67710, 0);
  const groundLight = new THREE.HemisphereLight(0x70a9cb, 0x091523, 0.5); scene.add(groundLight);
  let dockingCamera = false;
  function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
  addEventListener('resize', resize); resize();
  const quaternion = s => new THREE.Quaternion(-s[7], -s[8], s[9], s[6]);
  function place(ship, s, slot) {
    ship.group.position.set(s[0] + (slot ? 18 : -18), s[1], -s[2]);
    ship.group.quaternion.copy(quaternion(s));
  }
  return {
    toggleCamera() { dockingCamera = !dockingCamera; return dockingCamera; },
    render(state, opponent, slot, active, thrust, now) {
      if (active && state) {
        place(own, state, slot); own.group.visible = !dockingCamera;
        own.plume.visible = thrust[2] > 0 && state[13] > 0 && !state[15];
        if (opponent) { place(other, opponent, 1 - slot); other.group.visible = true; } else other.group.visible = false;
        const q = quaternion(state);
        const offset = new THREE.Vector3(0, dockingCamera ? 0 : 4, dockingCamera ? -3.1 : 13).applyQuaternion(q);
        camera.position.copy(own.group.position).add(offset);
        camera.up.set(0, 1, 0).applyQuaternion(q);
        camera.lookAt(own.group.position.clone().add(new THREE.Vector3(0, dockingCamera ? 0 : 0.8, -20).applyQuaternion(q)));
        guidance.visible = true;
      } else {
        own.group.visible = true; other.group.visible = false; own.plume.visible = false;
        own.group.position.set(-18, 0, 35); own.group.quaternion.identity();
        camera.position.set(70 + Math.sin(now / 12000) * 4, 26, 115);
        camera.up.set(0, 1, 0); camera.lookAt(-24, 0, -12); guidance.visible = false;
      }
      earth.visible = true; atmosphere.visible = true;
      renderer.render(scene, camera); canvas.dataset.rendered = 'true';
    },
  };
}
