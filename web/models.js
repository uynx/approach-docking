import * as THREE from '/vendor/three.module.js';
import { thrusters } from './flight-view.js';

const metal = new THREE.MeshStandardMaterial({ color: 0xa9afb1, metalness: 0.72, roughness: 0.39 });
const white = new THREE.MeshStandardMaterial({ color: 0xd8d6cb, roughness: 0.8 });
const dark = new THREE.MeshStandardMaterial({ color: 0x24272b, metalness: 0.55, roughness: 0.55 });
const gold = new THREE.MeshStandardMaterial({ color: 0xb39a57, metalness: 0.8, roughness: 0.45 });
const glass = new THREE.MeshStandardMaterial({ color: 0x152c36, metalness: 0.8, roughness: 0.12 });
const solar = new THREE.MeshStandardMaterial({ color: 0x18263e, metalness: 0.5, roughness: 0.32, side: THREE.DoubleSide });
const radiator = new THREE.MeshStandardMaterial({ color: 0xdedfdc, roughness: 0.9, side: THREE.DoubleSide });
const boltGeometry = new THREE.CylinderGeometry(0.025, 0.025, 0.024, 6).rotateX(Math.PI / 2);

function mesh(parent, geometry, material, pos = [0, 0, 0]) {
  const object = new THREE.Mesh(geometry, material);
  object.position.set(...pos); parent.add(object); return object;
}
const box = (p, size, pos, mat = metal) => mesh(p, new THREE.BoxGeometry(...size), mat, pos);
const tube = (p, r, length, pos, mat = metal) => mesh(p, new THREE.CylinderGeometry(r, r, length, 48).rotateX(Math.PI / 2), mat, pos);
const ring = (p, r, thickness, pos, mat = metal) => mesh(p, new THREE.TorusGeometry(r, thickness, 8, 64), mat, pos);
function strut(parent, a, b, radius = 0.035, mat = metal) {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), delta = end.clone().sub(start);
  const object = mesh(parent, new THREE.CylinderGeometry(radius, radius, delta.length(), 8), mat);
  object.position.copy(start.add(end).multiplyScalar(0.5));
  object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
}
function bolts(parent, radius, z, n = 24, cx = 0, cy = 0) {
  for (let i = 0; i < n; i++) {
    const angle = i / n * Math.PI * 2;
    mesh(parent, boltGeometry, dark, [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius, z]);
  }
}
function tankParts(parts,name,center,radius,tank) {
  for(let u=0;u<4;u++)for(let v=0;v<2;v++) {
    const geometry=new THREE.SphereGeometry(radius,8,8,u*Math.PI/2,Math.PI/2,v*Math.PI/2,Math.PI/2).translate(...center);
    const part=new THREE.Mesh(geometry,gold);part.name=name;part.userData.tank=tank;parts.push(part);
  }
}
function batch(group) {
  group.updateMatrixWorld(true);
  const parts = new Map();
  group.traverse(object => {
    if (!object.isMesh) return;
    const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
    geometry.applyMatrix4(object.matrixWorld);
    if (!parts.has(object.material)) parts.set(object.material, []);
    parts.get(object.material).push(geometry);
  });
  group.clear();
  for (const [material, geometries] of parts) {
    const geometry = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'uv']) {
      const count = geometries.reduce((n, g) => n + g.attributes[name].array.length, 0);
      const values = new Float32Array(count);
      let offset = 0;
      for (const g of geometries) { values.set(g.attributes[name].array, offset); offset += g.attributes[name].array.length; }
      geometry.setAttribute(name, new THREE.BufferAttribute(values, name === 'uv' ? 2 : 3));
    }
    mesh(group, geometry, material);
    for (const g of geometries) g.dispose();
  }
}

export function stationModel(anisotropy = 1) {
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=1024;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#162842';ctx.fillRect(0,0,512,1024);
  for(let y=0;y<1024;y+=64)for(let x=0;x<512;x+=64) {
    ctx.fillStyle='#0c1729';ctx.fillRect(x,y,2,64);ctx.fillRect(x,y,64,2);
    ctx.fillStyle='#718091';ctx.fillRect(x+19,y+3,1,58);ctx.fillRect(x+43,y+3,1,58);
    ctx.fillStyle='#93815c';ctx.fillRect(x+3,y+31,58,2);
  }
  const cellTexture=new THREE.CanvasTexture(canvas);cellTexture.colorSpace=THREE.SRGBColorSpace;
  cellTexture.anisotropy=anisotropy;cellTexture.minFilter=THREE.LinearMipmapLinearFilter;
  solar.map=cellTexture;solar.color.setHex(0xffffff);solar.roughness=0.55;

  const group = new THREE.Group(), colliders = [], fragments=[];group.name='station';
  const module = (x, y, z, radius, length) => {
    tube(group, radius, length, [x, y, z], white);
    colliders.push([x-radius, y-radius, z-length/2, x+radius, y+radius, z+length/2]);
    for (let dz = -length / 2 + 0.3; dz < length / 2; dz += 1.2) {
      ring(group, radius + 0.015, 0.04, [x, y, z+dz], metal);
      for (const angle of [0.5, 2.6, 3.65, 5.75]) {
        const px = x + Math.cos(angle) * (radius+0.13), py = y + Math.sin(angle) * (radius+0.13);
        strut(group, [px, py, z+dz], [px, py, z+dz+0.75], 0.025, gold);
        strut(group, [px, py, z+dz], [x+Math.cos(angle)*radius, y+Math.sin(angle)*radius, z+dz], 0.025);
      }
    }
    for (let a = 0; a < 8; a++) {
      const angle = a * Math.PI / 4;
      strut(group, [x+radius*Math.cos(angle), y+radius*Math.sin(angle), z-length/2],
        [x+radius*Math.cos(angle), y+radius*Math.sin(angle), z+length/2], 0.016, dark);
    }
  };
  module(0, 0, -15, 3.6, 14);
  for (const y of [-0.8, 0.8]) for (const z of [-12, -14]) strut(group, [-33, y, z], [33, y, z], 0.1);
  for (let x = -33; x < 33; x += 3) {
    for (const z of [-12, -14]) {
      strut(group, [x, -0.8, z], [x+3, 0.8, z], 0.06);
      strut(group, [x, 0.8, z], [x+3, -0.8, z], 0.06);
    }
    strut(group, [x, 0.8, -12], [x+3, 0.8, -14], 0.06);
  }
  colliders.push([-33, -1, -14.2, 33, 1, -11.8]);
  for (const x of [-18, 18]) {
    module(x, 0, -9, 2.8, 12);
    for(const side of [-1,1]) {
      tankParts(fragments,'station-tank',[x+side*0.9,-3.1,-13],0.6,x>0?1:0);
      strut(group,[x+side*0.9,-2.5,-13],[x+side*0.9,-3.1,-13],0.13,dark);
    }
    mesh(group, new THREE.CylinderGeometry(0.9, 2.8, 2, 64,1,true).rotateX(Math.PI/2), white, [x,0,-2]);
    for(let a=0;a<12;a++) {
      const angle=a*Math.PI/6;
      strut(group,[x+0.97*Math.cos(angle),0.97*Math.sin(angle),-1.03],
        [x+2.77*Math.cos(angle),2.77*Math.sin(angle),-2.94],0.012,metal);
    }
    ring(group,1.62,0.02,[x,0,-1.735],metal);
    tube(group, 0.9, 0.8, [x, 0, -0.6], dark);
    ring(group, 0.72, 0.07, [x, 0, -0.07]);
    ring(group, 0.86, 0.035, [x, 0, -0.09], white);
    mesh(group, new THREE.CircleGeometry(0.65, 64), dark, [x, 0, -0.32]);
    colliders.push([x-0.95,-0.95,-3,x+0.95,0.95,0]);
    colliders.push([x-2.8,-2.8,-3,x+2.8,2.8,-1]);
    bolts(group, 0.84, -0.035, 24, x);
    for (let i = 0; i < 6; i++) {
      const angle = i * Math.PI/3;
      const latch = box(group, [0.12,0.2,0.24], [x+Math.cos(angle)*0.99, Math.sin(angle)*0.99,-0.18], metal);
      latch.rotation.z = angle;
    }
    box(group, [0.026,0.78,0.012], [x,0,-0.305], white);
    box(group, [0.78,0.026,0.012], [x,0,-0.305], white);
    for (const side of [-1,1]) {
      box(group, [0.34,0.7,0.12], [x+side*1.45,0,-1.03], dark);
      for (const y of [-0.22,0,0.22]) mesh(group, new THREE.CircleGeometry(0.07, 16), glass, [x+side*1.45,y,-0.96]);
      box(group, [0.2,0.16,0.24], [x+side*0.42,0.73,-0.6], dark);
      tube(group, 0.045,0.09,[x+side*0.42,0.73,-0.44],glass);
    }
    for (const side of [-1,1]) {
      const sx = x + side*8.5;
      strut(group, [x,0,-13],[sx,0,-13],0.14,gold);
      for (const dy of [-1,1]) {
        const panel=(x>0?4:0)+(side>0?2:0)+(dy>0?1:0);
        for(let u=0;u<4;u++)for(let v=0;v<6;v++) {
          const tile=new THREE.Mesh(new THREE.BoxGeometry(1.9,14/6,0.09,4,4,1).translate(sx-2.85+u*1.9,dy*8-7+(v+0.5)*14/6,-13),solar);
          tile.name='station-panel';tile.userData.panel=panel;fragments.push(tile);
        }
        const bounds=[sx-3.85,dy*8-7,-13.15,sx+3.85,dy*8+7,-12.85];bounds.panel=panel;colliders.push(bounds);
        for (const edge of [-1,1]) strut(group,[sx+edge*3.85,dy*1,-13],[sx+edge*3.85,dy*15,-13],0.045);
      }
    }
    box(group, [5,6,0.15], [x,6,-19],radiator);
    for (let j=-9;j<=9;j++) box(group,[0.025,6,0.022],[x+j*0.25,6,-18.91],metal);
    strut(group,[x,2,-12],[x,6,-19],0.14);
    colliders.push([x-2.5,3,-19.2,x+2.5,9,-18.8]);
  }
  const dish = mesh(group,new THREE.SphereGeometry(1.8,40,20,0,Math.PI*2,0,Math.PI/2.8),radiator,[0,5,-15]);
  dish.rotation.z = -0.5;
  strut(group,[0,3,-15],[0,5,-15],0.12);
  for (const x of [-1,1]) strut(group,[x,5.6,-15],[0,7,-15],0.025);
  colliders.push([-2,3.5,-17,2,7.2,-13]);
  batch(group);
  group.add(...fragments);
  const rest=group.children.map(object=>({object,positions:object.geometry.attributes.position.array.slice()}));
  let previous='';
  function deform(impacts) {
    const key=impacts.map(hit=>hit.crush.toFixed(6)).join(':');
    if(key===previous)return; previous=key;
    for(const {object,positions} of rest) {
      const output=object.geometry.attributes.position;
      for(let i=0;i<positions.length;i+=3) {
        let x=positions[i],y=positions[i+1],z=positions[i+2];
        for(const hit of impacts) {
          const dx=positions[i]-hit.point.x,dy=positions[i+1]-hit.point.y,dz=positions[i+2]-hit.point.z;
          const depth=dx*hit.normal.x+dy*hit.normal.y+dz*hit.normal.z;
          const radial=dx*dx+dy*dy+dz*dz-depth*depth;
          const amount=hit.crush*Math.exp(-(Math.max(0,Math.sqrt(Math.max(0,radial))-1.5)**2)/0.5-Math.abs(depth)/1.2);
          x-=hit.normal.x*amount;y-=hit.normal.y*amount;z-=hit.normal.z*amount;
        }
        output.setXYZ(i/3,x,y,z);
      }
      output.needsUpdate=true;object.geometry.computeVertexNormals();object.geometry.computeBoundingSphere();
    }
  }
  return { group, colliders, deform, fragments };
}

export function spacecraftModel(accent) {
  const group = new THREE.Group();group.name='capsule-'+accent;
  const stripe = new THREE.MeshStandardMaterial({color:accent,roughness:0.6});
  const profile = [[0.65,-2.7],[0.7,-2.6],[1.34,-1.5],[1.35,-1.4],[1.35,1.65],[1.3,1.8]];
  const points = [];
  for(let i=0;i<profile.length-1;i++) for(let j=0;j<6;j++) {
    const t=j/6; points.push(new THREE.Vector2(profile[i][0]*(1-t)+profile[i+1][0]*t,profile[i][1]*(1-t)+profile[i+1][1]*t));
  }
  points.push(new THREE.Vector2(...profile.at(-1)));
  const fragments=[];
  for(let band=0;band<2;band++)for(let sector=0;sector<16;sector++) {
    const part=points.slice(band*18,band===0?19:undefined);
    const geometry=new THREE.LatheGeometry(part,4,sector*Math.PI/8,Math.PI/8).rotateX(Math.PI/2);
    const panel=new THREE.Mesh(geometry,white);panel.name='capsule-hull';fragments.push(panel);
  }
  mesh(group,new THREE.CircleGeometry(1.3,64),dark,[0,0,1.801]);
  tube(group,0.72,0.3,[0,0,-2.87],dark);
  ring(group,0.72,0.055,[0,0,-3.145]);
  ring(group,0.64,0.025,[0,0,-3.1],white);
  const hatch=mesh(group,new THREE.CircleGeometry(0.64,64),white,[0,0,-3.075]); hatch.rotation.y=Math.PI;
  box(group,[0.22,0.06,0.06],[0,0,-3.12],metal);
  bolts(group,0.72,-3.19,24);
  for (const z of [-1.45,0.85,1.65]) ring(group,1.355,0.025,[0,0,z],z===0.85?stripe:metal);
  for(let i=0;i<16;i++) {
    const angle=i*Math.PI/8;
    strut(group,[1.355*Math.cos(angle),1.355*Math.sin(angle),-1.4],[1.355*Math.cos(angle),1.355*Math.sin(angle),1.65],0.007,dark);
    for(const z of [-1.3,0.72,1.5]) mesh(group,boltGeometry,metal,[1.36*Math.cos(angle),1.36*Math.sin(angle),z]);
  }
  for (const side of [-1,1]) {
    const windowGroup = new THREE.Group(); group.add(windowGroup);
    windowGroup.position.set(side*0.38,0.98,-2.08); windowGroup.rotation.x=-0.52;
    box(windowGroup,[0.5,0.08,0.48],[0,0,0],dark);
    box(windowGroup,[0.4,0.035,0.37],[0,0.055,0],glass);
    for(const x of [-0.21,0.21]) for(const z of [-0.19,0.19]) {
      const bolt=mesh(windowGroup,boltGeometry,metal,[x,0.055,z]);bolt.rotation.x=Math.PI/2;
    }
    box(group,[0.34,0.2,0.6],[side*1.25,-0.32,0.1],gold);
    strut(group,[side*1.2,0.65,-0.7],[side*1.2,0.65,0.2],0.025,gold);
    strut(group,[side*1.2,0.65,-0.7],[side*1.12,0.6,-0.7],0.025);
    strut(group,[side*1.2,0.65,0.2],[side*1.12,0.6,0.2],0.025);
  }
  for(const side of [-1,1])tankParts(fragments,'capsule-tank',[side*1.2,-0.45,0.7],0.3,0);
  ring(group,1.22,0.09,[0,0,1.85],dark);
  for(let i=0;i<12;i++) {
    const a=i*Math.PI/6;
    box(group,[0.13,0.13,0.3],[Math.cos(a)*1.12,Math.sin(a)*1.12,1.9],gold);
  }
  for(const t of thrusters) {
    const pos=new THREE.Vector3(t.position[0],t.position[1],-t.position[2]);
    const exhaust=new THREE.Vector3(-t.force[0],-t.force[1],t.force[2]).normalize();
    const mount=pos.clone().addScaledVector(exhaust,-0.2);
    const root=mount.clone(); root.z=THREE.MathUtils.clamp(root.z,-1.4,1.5);
    const radial=Math.hypot(root.x,root.y); if(radial>1.25) {root.x*=1.25/radial;root.y*=1.25/radial;}
    strut(group,root.toArray(),mount.toArray(),0.09,dark);
    const bracket=box(group,[0.22,0.2,0.25],mount.toArray(),gold);
    bracket.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),exhaust);
    const nozzle=mesh(group,new THREE.LatheGeometry([new THREE.Vector2(0.055,0),new THREE.Vector2(0.052,0.06),new THREE.Vector2(0.08,0.15),new THREE.Vector2(0.125,0.25)],24),metal,mount.toArray());
    nozzle.material=metal;
    nozzle.quaternion.copy(bracket.quaternion);
    const throat=mesh(group,new THREE.CircleGeometry(0.05,24),dark,mount.clone().addScaledVector(exhaust,0.055).toArray());
    throat.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),exhaust);
  }
  batch(group);
  group.add(...fragments);
  const deformable=group.children.map(object=>({object,original:object.geometry.attributes.position.array.slice(),pristine:object.geometry.attributes.position.array.slice()}));
  const plumeMaterial=new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
    vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:'varying vec2 vUv; void main(){float d=1.0-vUv.y;float a=0.14*exp(-5.0*d)*smoothstep(0.0,0.13,d);gl_FragColor=vec4(0.55,0.72,0.85,a);}'
  });
  const plumes=thrusters.map(t=>{
    const direction=new THREE.Vector3(-t.force[0],-t.force[1],t.force[2]).normalize();
    const start=new THREE.Vector3(t.position[0],t.position[1],-t.position[2]).addScaledVector(direction,0.05);
    const plume=mesh(group,new THREE.CylinderGeometry(0.12,0.75,1.8,20,1,true).translate(0,-0.9,0),plumeMaterial,start.toArray());
    plume.quaternion.setFromUnitVectors(new THREE.Vector3(0,-1,0),direction); plume.visible=false;
    return plume;
  });
  const panels = [-1,1].map(side=>{
    box(group,[0.035,0.42,0.48],[side*1.355,0,0],dark);
    return box(group,[0.04,0.4,0.46],[side*1.395,0,0],white);
  });
  const normal=new THREE.Vector3(0,0,1), across=new THREE.Vector3(1,0,0), up=new THREE.Vector3(0,1,0);
  let low=-3.2,high=2.3,lastCrush=-1;
  function damageDirection(direction) {
    normal.copy(direction).normalize();
    across.set(0,1,0);if(Math.abs(normal.y)>0.9)across.set(1,0,0);
    across.cross(normal).normalize();up.crossVectors(normal,across);
    low=Infinity;high=-Infinity;
    for(const {original} of deformable) for(let i=0;i<original.length;i+=3) {
      const d=original[i]*normal.x+original[i+1]*normal.y+original[i+2]*normal.z;
      low=Math.min(low,d);high=Math.max(high,d);
    }
    lastCrush=-1;
  }
  function deform(body,burst) {
    if(!body)for(const part of deformable)part.original.set(part.pristine);
    panels.forEach((panel,i)=>{
      panel.position.set((i?1:-1)*(1.395+(burst?burst.distance:0)),0,0);
      if(body)panel.position.addScaledVector(normal,body.displacement(-3.2+5*(0-low)/(high-low)));
    });
    const crush=body?body.permanentCrush:0;
    if(Math.abs(crush-lastCrush)<1e-8)return;lastCrush=crush;
    for(const {object,original} of deformable) {
      const positions=object.geometry.attributes.position;
      for(let i=0;i<original.length;i+=3) {
        const point=new THREE.Vector3(original[i],original[i+1],original[i+2]);
        const projection=point.dot(normal), depth=-3.2+5*(projection-low)/(high-low);
        const angle=Math.atan2(point.dot(up),point.dot(across));
        const buckle=body&&object.material===white?body.buckle(depth,angle):0;
        if(body)point.addScaledVector(normal,Math.min(body.displacement(depth),0.4*(high-low)));
        point.addScaledVector(across,buckle*Math.cos(angle)).addScaledVector(up,buckle*Math.sin(angle));
        positions.setXYZ(i/3,point.x,point.y,point.z);
      }
      positions.needsUpdate=true;object.geometry.computeVertexNormals();object.geometry.computeBoundingSphere();
    }
  }
  function commitDamage() {for(const part of deformable)part.original.set(part.object.geometry.attributes.position.array);lastCrush=-1;}
  return {group,plumes,deform,damageDirection,fragments,commitDamage,pressurePanels:panels};
}
