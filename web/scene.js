import { Flight, Station } from './state.js';
import * as THREE from '/vendor/three.module.js';
import { shipPosition, clipCamera, dockingIndicators, thrusters, firing, meanMotion } from './flight-view.js';
import { createDamageEffects } from './damage-effects.js';
import { stationModel, spacecraftModel } from './models.js';

export function createScene(canvas) {
  const context = canvas.getContext('webgl2', { antialias: true, powerPreference: 'high-performance' });
  if (!context || context.isContextLost() || !context.getParameter(context.VERSION)) {
    throw new Error('WebGL is blocked or unavailable. In Brave, try Standard fingerprinting protection for this site, then reload. Chromium also works.');
  }
  const renderer = new THREE.WebGLRenderer({ canvas, context, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x020306);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.autoClear = false;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(), sky = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(48, 1, 0.05, 4000);
  const skyCamera = new THREE.PerspectiveCamera(48, 1, 0.1, 30000);
  const sunDirection = new THREE.Vector3(-0.7,0.5,0.65).normalize();
  for (const world of [scene,sky]) {
    const sun = new THREE.DirectionalLight(0xfff6e8, 3.1);
    sun.position.copy(sunDirection).multiplyScalar(160);
    if(world===scene){sun.castShadow=true;sun.shadow.mapSize.set(4096,4096);Object.assign(sun.shadow.camera,{left:-40,right:40,top:40,bottom:-40,near:1,far:260});sun.shadow.camera.updateProjectionMatrix();sun.shadow.bias=-0.00004;sun.shadow.normalBias=0.015;}
    world.add(sun);
  }
  scene.add(new THREE.HemisphereLight(0x171c22,0x719eb4,1.3));
  sky.add(new THREE.AmbientLight(0xb2c6dc,0.75));
  const station = stationModel(renderer.capabilities.getMaxAnisotropy());scene.add(station.group);
  const own = spacecraftModel(0x6daaa7), other = spacecraftModel(0xc6a06c);
  scene.add(own.group,other.group);
  for(const model of [station,own,other])model.group.traverse(part=>{if(part.isMesh&&part.material.isMeshStandardMaterial){part.castShadow=true;part.receiveShadow=true;}});
  const plasma=new THREE.Mesh(new THREE.SphereGeometry(1,48,32),new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
    uniforms:{strength:{value:0}},
    vertexShader:'varying vec3 n;varying vec3 v;varying vec3 local;void main(){local=position;vec4 p=modelViewMatrix*vec4(position,1.0);n=normalize(normalMatrix*normal);v=normalize(-p.xyz);gl_Position=projectionMatrix*p;}',
    fragmentShader:'uniform float strength;varying vec3 n;varying vec3 v;varying vec3 local;void main(){float rim=pow(1.0-abs(dot(normalize(n),normalize(v))),1.6);float head=smoothstep(-1.0,0.7,local.z);gl_FragColor=vec4(mix(vec3(1.0,0.18,0.025),vec3(0.6,0.7,1.0),head),strength*rim*(0.08+0.65*head));}'
  }));
  plasma.name='entry-plasma';plasma.visible=false;scene.add(plasma);
  const loader = new THREE.TextureLoader();
  let earth;
  const reflectionSky=new THREE.Scene();reflectionSky.background=new THREE.Color(0x8bbce3);
  const reflectionFilter=new THREE.PMREMGenerator(renderer),skyReflection=reflectionFilter.fromScene(reflectionSky).texture;reflectionFilter.dispose();
  const glowCanvas=document.createElement('canvas');glowCanvas.width=256;glowCanvas.height=256;
  const glowContext=glowCanvas.getContext('2d'),glow=glowContext.createRadialGradient(128,128,0,128,128,128);
  glow.addColorStop(0,'#fffdf2');glow.addColorStop(0.045,'#fff6dd');glow.addColorStop(0.09,'#fff0c466');glow.addColorStop(0.3,'#ffa95f12');glow.addColorStop(1,'#ffa95f00');
  glowContext.fillStyle=glow;glowContext.fillRect(0,0,256,256);
  const sunGlow=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(glowCanvas),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}));
  sunGlow.name='sun-corona';sunGlow.position.copy(sunDirection).multiplyScalar(20000);sunGlow.scale.set(3600,3600,1);sky.add(sunGlow);
  const moon=new THREE.Mesh(new THREE.SphereGeometry(92,64,48),new THREE.MeshStandardMaterial({roughness:1}));
  moon.name='moon';moon.position.set(2800,1200,-19500);moon.rotation.y=1.7;sky.add(moon);
  const satellites=new THREE.Group();satellites.name='orbital-satellites';scene.add(satellites);
  for(let i=0;i<3;i++) {
    const satellite=new THREE.Group();satellite.position.set([-140,180,65][i],[32,90,-38][i],[-380,-600,-270][i]);
    satellite.rotation.set(0.2+i*0.7,i,0.4+i);
    const hull=new THREE.Mesh(new THREE.BoxGeometry(2,2,3),new THREE.MeshStandardMaterial({color:0xc4b47b,metalness:0.7,roughness:0.45}));satellite.add(hull);
    for(const side of [-1,1]) {
      const wing=new THREE.Mesh(new THREE.BoxGeometry(7,3,0.07),new THREE.MeshStandardMaterial({color:0x294264,metalness:0.55,roughness:0.4}));wing.position.x=side*4.7;satellite.add(wing);
    }
    satellites.add(satellite);
  }
  const ready = Promise.all([
    loader.loadAsync('/assets/earth.jpg').then(texture=>{
      texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=renderer.capabilities.getMaxAnisotropy();
      const material=new THREE.MeshStandardMaterial({map:texture,roughness:0.85,envMap:skyReflection,envMapIntensity:0.8});
      material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nfloat ocean=smoothstep(1.15,1.8,diffuseColor.b/max(0.0001,max(diffuseColor.r,diffuseColor.g)));roughnessFactor=mix(0.85,0.23,ocean);');};
      earth = new THREE.Mesh(new THREE.SphereGeometry(6371,256,192),material);earth.name='earth';
      earth.position.set(0,-6771,0);earth.rotation.z=-Math.PI/2;sky.add(earth);
    }),
    loader.loadAsync('/assets/stars.jpg').then(texture=>{
      texture.colorSpace=THREE.SRGBColorSpace;texture.mapping=THREE.EquirectangularReflectionMapping;
      sky.background=texture;sky.backgroundIntensity=0.24;sky.backgroundBlurriness=0;
    }),
    loader.loadAsync('/assets/moon.jpg').then(texture=>{texture.colorSpace=THREE.SRGBColorSpace;moon.material.map=texture;moon.material.needsUpdate=true;}),
  ]);
  const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(6415,256,192),new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,side:THREE.BackSide,
    uniforms:{sun:{value:sunDirection}},
    vertexShader:'varying vec3 n;varying vec3 view;varying float light;uniform vec3 sun;void main(){vec4 p=modelViewMatrix*vec4(position,1.0);n=normalize(normalMatrix*normal);view=normalize(-p.xyz);light=max(0.0,dot(normalize(mat3(modelMatrix)*normal),sun));gl_Position=projectionMatrix*p;}',
    fragmentShader:'varying vec3 n;varying vec3 view;varying float light;void main(){float limb=pow(1.0-abs(dot(normalize(n),normalize(view))),4.0);gl_FragColor=vec4(0.16,0.42,0.95,limb*0.55*light);}'
  }));
  atmosphere.position.set(0,-6771,0);sky.add(atmosphere);
  const indicatorMaterial = new THREE.LineBasicMaterial({color:0x96e4e2,transparent:true,opacity:0.6});
  const noseRay=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]),indicatorMaterial);
  noseRay.name='nose-ray';noseRay.frustumCulled=false;
  const noseHit=new THREE.Mesh(new THREE.RingGeometry(0.13,0.17,48),new THREE.MeshBasicMaterial({color:0x96e4e2,transparent:true,opacity:0.9,depthWrite:false,side:THREE.DoubleSide}));
  noseHit.name='nose-hit';scene.add(noseRay,noseHit);
  const raycaster=new THREE.Raycaster();
  const capturePulse=new THREE.Mesh(new THREE.RingGeometry(0.84,0.94,64),new THREE.MeshBasicMaterial({color:0x8ff9da,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending}));
  capturePulse.name='capture-pulse';capturePulse.visible=false;scene.add(capturePulse);
  const collarLights=new THREE.Group();collarLights.name='collar-lights';
  for(const port of [-18,18])for(let i=0;i<12;i++) {
    const angle=i*Math.PI/6;
    const light=new THREE.Mesh(new THREE.SphereGeometry(0.065,8,6),new THREE.MeshBasicMaterial({color:0x78c7ff}));
    light.position.set(port+Math.cos(angle)*1.04,Math.sin(angle)*1.04,-0.09);light.userData.port=port;light.userData.index=i;collarLights.add(light);
  }
  station.group.add(collarLights);
  let lastStatus=0,capturedAt=-Infinity;
  let dockingCamera=false,lookYaw=0,lookPitch=0,lastNow;
  const damageEffects=createDamageEffects(scene,station,[own,other]);
  const look=new THREE.Quaternion();
  const marker=document.getElementById('port-marker');
  const quaternion=s=>new THREE.Quaternion(-s[Flight.qx],-s[Flight.qy],s[Flight.qz],s[Flight.qw]);
  function place(ship,s,slot) {ship.group.position.set(...shipPosition(s,slot));ship.group.quaternion.copy(quaternion(s));}
  function resize() {
    renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
    skyCamera.aspect=camera.aspect;skyCamera.updateProjectionMatrix();
  }
  addEventListener('resize',resize);resize();
  function project(element,point) {
    const p=point.clone().project(camera);
    element.hidden=p.z>1||p.z< -1||Math.abs(p.x)>0.92||Math.abs(p.y)>0.86;
    element.style.left=`${(p.x+1)*innerWidth/2}px`;element.style.top=`${(1-p.y)*innerHeight/2}px`;
  }
  return {
    ready,
    resetSimulation() {damageEffects.reset();lastStatus=0;capturedAt=-Infinity;capturePulse.visible=false;},
    resetCamera() {lookYaw=0;lookPitch=0;look.identity();return dockingCamera;},
    impactView() {dockingCamera=false;lookYaw=-0.65;lookPitch=0.15;look.setFromEuler(new THREE.Euler(lookPitch,lookYaw,0,'YXZ'));},
    moveCamera(dx,dy) {
      lookYaw-=dx*0.004;lookPitch=THREE.MathUtils.clamp(lookPitch-dy*0.004,-1.2,1.2);
      look.setFromEuler(new THREE.Euler(lookPitch,lookYaw,0,'YXZ'));
      return lookYaw!==0||lookPitch!==0;
    },
    toggleCamera() {dockingCamera=!dockingCamera;this.resetCamera();return dockingCamera;},
    render(state,opponent,slot,active,commands,now,stationState=[0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],thermal={altitude:400000,heat:0,airspeed:0}) {
      const dt=lastNow===undefined?0:Math.max(0,Math.min(0.1,(now-lastNow)/1000));lastNow=now;
      const stationOffset=new THREE.Vector3(stationState[Station.x],stationState[Station.y],-stationState[Station.z]);
      const stationQ=new THREE.Quaternion(-stationState[Station.qx],-stationState[Station.qy],stationState[Station.qz],stationState[Station.qw]);
      const stationPivot=new THREE.Vector3(0,0,-13);
      station.group.quaternion.copy(stationQ);
      station.group.position.copy(stationOffset).add(stationPivot).sub(stationPivot.clone().applyQuaternion(stationQ));
      station.group.updateMatrixWorld(true);
      station.angularVelocity=new THREE.Vector3(-stationState[Station.wx],-stationState[Station.wy],stationState[Station.wz]).applyQuaternion(stationQ);station.centerOfMass=stationOffset.clone().add(stationPivot);station.offset=stationOffset;station.velocity=new THREE.Vector3(stationState[Station.vx],stationState[Station.vy],-stationState[Station.vz]);
      document.getElementById('station-motion').textContent=`STATION SPIN ${(Math.hypot(...stationState.slice(10,13))*180/Math.PI).toFixed(5)} deg/s · RECOIL ${Math.hypot(...stationState.slice(3,6)).toFixed(4)} m/s`;
      const portX=slot?18:-18;
      noseRay.visible=false;noseHit.visible=false;
      if(active&&state[Flight.status]===1&&lastStatus!==1)capturedAt=now;
      lastStatus=active?state[Flight.status]:0;
      const captureTime=(now-capturedAt)/1000;
      capturePulse.visible=captureTime>=0&&captureTime<1.8;
      if(capturePulse.visible) {
        capturePulse.position.copy(station.group.localToWorld(new THREE.Vector3(portX,0,0.02)));capturePulse.quaternion.copy(stationQ);
        capturePulse.scale.setScalar(1+captureTime*0.9);capturePulse.material.opacity=(1-captureTime/1.8)*0.8;
      }
      for(const light of collarLights.children) {
        const captured=active&&state[Flight.status]===1&&light.userData.port===portX;
        light.material.color.setHex(captured?0x8ff9da:0x78c7ff);
        light.visible=captured||Math.sin(now/900-light.userData.index*Math.PI/6)>-0.35;
      }
      plasma.visible=active&&thermal.altitude<120000&&thermal.heat>20000&&state[Flight.status]!==4;
      canvas.dataset.plasma=String(plasma.visible);
      if (active&&state) {
        place(own,state,slot);own.group.position.add(stationOffset);own.group.visible=!dockingCamera;own.group.updateMatrixWorld(true);
        own.velocity=new THREE.Vector3(state[Flight.vx],state[Flight.vy],-state[Flight.vz]).add(station.velocity);own.angularVelocity=new THREE.Vector3(-state[Flight.wx],-state[Flight.wy],state[Flight.wz]).applyQuaternion(quaternion(state)).add(new THREE.Vector3(meanMotion,0,0));
        const rate=meanMotion-7.2921159e-5;
        const airflow=new THREE.Vector3(state[Flight.vx],state[Flight.vy]-rate*state[Flight.z],-state[Flight.vz]-rate*(6771000+state[Flight.y])).normalize();
        plasma.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),airflow);
        plasma.position.copy(own.group.position).addScaledVector(airflow,-1);
        plasma.scale.set(1.8,1.8,3.5);
        plasma.material.uniforms.strength.value=THREE.MathUtils.clamp(Math.log10(Math.max(1,thermal.heat/20000))/2,0,1);
        own.plumes.forEach((plume,i)=>{plume.visible=firing(thrusters[i],commands,state);});
        if(opponent) {place(other,opponent,1-slot);other.group.position.add(stationOffset);other.group.visible=true;other.angularVelocity=new THREE.Vector3(-opponent[Flight.wx],-opponent[Flight.wy],opponent[Flight.wz]).applyQuaternion(quaternion(opponent)).add(new THREE.Vector3(meanMotion,0,0));other.velocity=new THREE.Vector3(opponent[Flight.vx],opponent[Flight.vy],-opponent[Flight.vz]).add(station.velocity);} else other.group.visible=false;
        damageEffects.update([state,opponent],stationState,dt);
        const body=own.body;
        const q=quaternion(state), origin=own.group.position.clone();
        const offset=new THREE.Vector3(0,dockingCamera?0:4,dockingCamera?-2.65:13);
        if(dockingCamera) offset.applyQuaternion(q); else offset.applyQuaternion(look);
        camera.position.set(...clipCamera(station.group.worldToLocal(origin.clone()).toArray(),station.group.worldToLocal(origin.clone().add(offset)).toArray(),station.colliders.filter(box=>box.panel===undefined||!(stationState[Station.brokenPanels]&(1<<box.panel)))));
        station.group.localToWorld(camera.position);
        camera.up.set(0,1,0);
        if(dockingCamera) camera.up.applyQuaternion(q);
        const aim=dockingCamera?camera.position.clone().add(new THREE.Vector3(0,0,-20).applyQuaternion(look).applyQuaternion(q)):origin;
        camera.lookAt(aim);camera.updateMatrixWorld();
        const guide=thermal.guidance||state;
        const indicators=dockingIndicators(guide), color=indicators.ready?0x96e4b2:!indicators.speed?0xf28b74:0xedb879;
        indicatorMaterial.color.setHex(color);noseHit.material.color.setHex(color);
        project(marker,station.group.localToWorld(new THREE.Vector3(portX,0,0)));marker.dataset.state=indicators.ready?'ready':!indicators.speed?'brake':'correct';
        if(!state[Flight.status]&&thermal.altitude>150000) {
          const nose=new THREE.Vector3(0,0,-3.2).applyQuaternion(q).add(origin);
          raycaster.set(nose,new THREE.Vector3(0,0,-1).applyQuaternion(q));
          const hit=raycaster.intersectObjects(station.group.children.filter(part=>part.isMesh&&part.visible),false)[0];
          if(hit) {
            const normal=hit.face.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)).normalize();
            noseRay.geometry.attributes.position.setXYZ(0,nose.x,nose.y,nose.z);
            noseRay.geometry.attributes.position.setXYZ(1,hit.point.x,hit.point.y,hit.point.z);
            noseRay.geometry.attributes.position.needsUpdate=true;
            noseHit.position.copy(hit.point).addScaledVector(normal,0.008);
            noseHit.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),normal);
            noseRay.visible=true;noseHit.visible=true;
          }
        }
        canvas.dataset.damage=body?'crushing':'none';
        if(body) document.getElementById('impact').textContent=`IMPACT ${(body.initialEnergy/1000).toFixed(2)} kJ · CRUSH ${(body.permanentCrush*100).toFixed(1)} cm · PORT ${(body.stationCrush*100).toFixed(1)} cm${own.burst?' · HULL RUPTURE '+(own.burst.pressure/1000).toFixed(1)+' kPa':''}`;
        else document.getElementById('impact').textContent='';
      } else {
        own.group.visible=true;other.group.visible=false;own.plumes.forEach(p=>{p.visible=false;});
        own.group.position.set(-18,0,28);own.group.quaternion.identity();
        camera.position.set(65+Math.sin(now/12000)*4,25,90);camera.up.set(0,1,0);camera.lookAt(-10,0,-8);
        marker.hidden=true;
      }
      const counts=damageEffects.advance(dt);
      canvas.dataset.fragments=String(counts.fragments);
      canvas.dataset.explosions=String(counts.explosions);
      renderer.setScissorTest(false);renderer.setViewport(0,0,innerWidth,innerHeight);renderer.clear();
      skyCamera.position.copy(camera.position).multiplyScalar(0.001);skyCamera.quaternion.copy(camera.quaternion);
      const orbitTime=state?.[Flight.elapsed]||0;
      satellites.rotation.y=orbitTime*0.0007;
      satellites.children.forEach((satellite,i)=>{satellite.rotation.z=0.4+i+orbitTime*0.012;});
      sky.backgroundRotation.x=orbitTime*meanMotion;
      const sunlight=sunDirection.clone().applyAxisAngle(new THREE.Vector3(1,0,0),orbitTime*meanMotion);
      sunGlow.position.copy(sunlight).multiplyScalar(20000);
      for(const world of [scene,sky])for(const light of world.children)if(light.isDirectionalLight)light.position.copy(sunlight).multiplyScalar(160);
      atmosphere.material.uniforms.sun.value=sunlight;
      if(earth)earth.quaternion.setFromAxisAngle(new THREE.Vector3(1,0,0),orbitTime*(meanMotion-7.2921159e-5)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),-Math.PI/2)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),-1.4));
      renderer.render(sky,skyCamera);renderer.clearDepth();renderer.render(scene,camera);
      canvas.dataset.rendered='true';
    },
  };
}
