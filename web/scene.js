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
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setClearColor(0x020306);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.autoClear = false;
  const scene = new THREE.Scene(), sky = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(48, 1, 0.05, 4000);
  const skyCamera = new THREE.PerspectiveCamera(48, 1, 0.1, 30000);
  const sideCamera = new THREE.OrthographicCamera(-10,10,10,-10,0.1,500);
  const sunDirection = new THREE.Vector3(-0.7,0.5,0.65).normalize();
  for (const world of [scene,sky]) {
    const sun = new THREE.DirectionalLight(0xfff6e8, 3.1);
    sun.position.copy(sunDirection);world.add(sun);
  }
  scene.add(new THREE.HemisphereLight(0x171c22,0x719eb4,1.3));
  const station = stationModel(renderer.capabilities.getMaxAnisotropy());scene.add(station.group);
  const own = spacecraftModel(0x6daaa7), other = spacecraftModel(0xc6a06c);
  scene.add(own.group,other.group);
  const plasma=new THREE.Mesh(new THREE.SphereGeometry(1,48,32),new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
    uniforms:{strength:{value:0}},
    vertexShader:'varying vec3 n;varying vec3 v;varying vec3 local;void main(){local=position;vec4 p=modelViewMatrix*vec4(position,1.0);n=normalize(normalMatrix*normal);v=normalize(-p.xyz);gl_Position=projectionMatrix*p;}',
    fragmentShader:'uniform float strength;varying vec3 n;varying vec3 v;varying vec3 local;void main(){float rim=pow(1.0-abs(dot(normalize(n),normalize(v))),1.6);float head=smoothstep(-1.0,0.7,local.z);gl_FragColor=vec4(mix(vec3(1.0,0.18,0.025),vec3(0.6,0.7,1.0),head),strength*rim*(0.08+0.65*head));}'
  }));
  plasma.name='entry-plasma';plasma.visible=false;scene.add(plasma);
  const loader = new THREE.TextureLoader();
  let earth;
  const ready = Promise.all([
    loader.loadAsync('/assets/earth.jpg').then(texture=>{
      texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=renderer.capabilities.getMaxAnisotropy();
      earth = new THREE.Mesh(new THREE.SphereGeometry(6371,128,96),new THREE.MeshStandardMaterial({map:texture,roughness:1}));
      earth.position.set(0,-6771,0);earth.rotation.z=-Math.PI/2;sky.add(earth);
    }),
    loader.loadAsync('/assets/stars.jpg').then(texture=>{
      texture.colorSpace=THREE.SRGBColorSpace;texture.mapping=THREE.EquirectangularReflectionMapping;
      sky.background=texture;sky.backgroundIntensity=0.08;
    }),
  ]);
  const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(6385,128,96),new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,side:THREE.BackSide,
    uniforms:{sun:{value:sunDirection}},
    vertexShader:'varying vec3 n;varying vec3 view;varying float light;uniform vec3 sun;void main(){vec4 p=modelViewMatrix*vec4(position,1.0);n=normalize(normalMatrix*normal);view=normalize(-p.xyz);light=max(0.0,dot(normalize(mat3(modelMatrix)*normal),sun));gl_Position=projectionMatrix*p;}',
    fragmentShader:'varying vec3 n;varying vec3 view;varying float light;void main(){float limb=pow(1.0-abs(dot(normalize(n),normalize(view))),5.0);gl_FragColor=vec4(0.20,0.48,0.85,limb*0.25*light);}'
  }));
  atmosphere.position.set(0,-6771,0);sky.add(atmosphere);
  const indicatorMaterial = new THREE.LineBasicMaterial({color:0x96e4e2,transparent:true,opacity:0.8,depthTest:false});
  const target = new THREE.Group();
  for(const a of [0,Math.PI/2,Math.PI,Math.PI*1.5]) {
    const points=[new THREE.Vector3(1.1,-0.2,0),new THREE.Vector3(1.1,0.2,0),new THREE.Vector3(1.35,0.2,0)];
    const mark=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),indicatorMaterial);mark.rotation.z=a;target.add(mark);
  }
  scene.add(target);
  let dockingCamera=true,lookYaw=0,lookPitch=0,lastNow;
  const damageEffects=createDamageEffects(scene,station,[own,other]);
  const look=new THREE.Quaternion();
  const inset=document.getElementById('side-view');
  const marker=document.getElementById('port-marker');
  const velocityMarker=document.getElementById('velocity-marker');
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
    resetSimulation() {damageEffects.reset();},
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
      target.visible=false;
      plasma.visible=active&&thermal.altitude<120000&&thermal.heat>20000&&state[Flight.status]!==4;
      canvas.dataset.plasma=String(plasma.visible);
      if (active&&state) {
        place(own,state,slot);own.group.position.add(stationOffset);own.group.visible=!dockingCamera;
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
        target.position.copy(station.group.localToWorld(new THREE.Vector3(portX,0,0.12)));target.quaternion.copy(stationQ);indicatorMaterial.color.setHex(color);
        project(marker,station.group.localToWorld(new THREE.Vector3(portX,0,0)));marker.dataset.state=indicators.ready?'ready':!indicators.speed?'brake':'correct';
        if(guide[Flight.vz]>0.005) {
          const time=Math.min(60,Math.max(0,-guide[Flight.z])/guide[Flight.vz]);
          project(velocityMarker,station.group.localToWorld(new THREE.Vector3(portX+guide[Flight.x]+guide[Flight.vx]*time,guide[Flight.y]+guide[Flight.vy]*time,0.15)));
        } else velocityMarker.hidden=true;
        canvas.dataset.damage=body?'crushing':'none';
        if(body) document.getElementById('impact').textContent=`IMPACT ${(body.initialEnergy/1000).toFixed(2)} kJ · CRUSH ${(body.permanentCrush*100).toFixed(1)} cm · PORT ${(body.stationCrush*100).toFixed(1)} cm${own.burst?' · HULL RUPTURE '+(own.burst.pressure/1000).toFixed(1)+' kPa':''}`;
        else document.getElementById('impact').textContent='';
      } else {
        own.group.visible=true;other.group.visible=false;own.plumes.forEach(p=>{p.visible=false;});
        own.group.position.set(-18,0,28);own.group.quaternion.identity();
        camera.position.set(65+Math.sin(now/12000)*4,25,90);camera.up.set(0,1,0);camera.lookAt(-10,0,-8);
        marker.hidden=true;velocityMarker.hidden=true;
      }
      const counts=damageEffects.advance(dt);
      canvas.dataset.fragments=String(counts.fragments);
      canvas.dataset.explosions=String(counts.explosions);
      renderer.setScissorTest(false);renderer.setViewport(0,0,innerWidth,innerHeight);renderer.clear();
      skyCamera.position.copy(camera.position).multiplyScalar(0.001);skyCamera.quaternion.copy(camera.quaternion);
      const orbitTime=state?.[Flight.elapsed]||0;
      sky.backgroundRotation.x=orbitTime*meanMotion;
      const sunlight=sunDirection.clone().applyAxisAngle(new THREE.Vector3(1,0,0),orbitTime*meanMotion);
      for(const world of [scene,sky])for(const light of world.children)if(light.isDirectionalLight)light.position.copy(sunlight);
      atmosphere.material.uniforms.sun.value=sunlight;
      if(earth)earth.quaternion.setFromAxisAngle(new THREE.Vector3(1,0,0),orbitTime*(meanMotion-7.2921159e-5)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),-Math.PI/2));
      renderer.render(sky,skyCamera);renderer.clearDepth();renderer.render(scene,camera);
      if(active&&inset&&inset.getBoundingClientRect().width>0) {
        const rect=inset.getBoundingClientRect(), range=thermal.altitude<150000?16:Math.max(12,Math.abs(state[Flight.z])+11), aspect=rect.width/rect.height;
        sideCamera.left=-range/2;sideCamera.right=range/2;sideCamera.top=range/(2*aspect);sideCamera.bottom=-range/(2*aspect);sideCamera.updateProjectionMatrix();
        const center=thermal.altitude<150000?own.group.position.clone():own.group.position.clone().add(station.group.localToWorld(new THREE.Vector3(portX,0,0))).multiplyScalar(0.5);
        sideCamera.position.copy(center).add(new THREE.Vector3(-80,12,0));sideCamera.up.set(0,1,0);sideCamera.lookAt(center);
        renderer.setViewport(rect.left,innerHeight-rect.bottom,rect.width,rect.height);
        renderer.setScissor(rect.left,innerHeight-rect.bottom,rect.width,rect.height);renderer.setScissorTest(true);renderer.clear();
        own.group.visible=true;other.group.visible=false;target.visible=true;renderer.render(scene,sideCamera);
        target.visible=false;renderer.setScissorTest(false);
      }
      canvas.dataset.rendered='true';
    },
  };
}
