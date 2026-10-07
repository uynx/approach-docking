import { Flight, Station } from './state.js';
import * as THREE from '/vendor/three.module.js';
import { CrushBody, PressureBurst, fractureVelocities, FuelExplosion } from './damage.js';

export function createDamageEffects(scene,station,[own,other]) {
  const quaternion=s=>new THREE.Quaternion(-s[Flight.qx],-s[Flight.qy],s[Flight.qz],s[Flight.qw]);
  const debris=[], explosions=[], dents=[];
  function reset() {
    for(const item of [...debris,...explosions]) {
      for(const mesh of [item.mesh,item.cloud].filter(Boolean)) {scene.remove(mesh);mesh.geometry.dispose();if(item.effect)mesh.material.dispose();}
    }
    debris.length=0;explosions.length=0;dents.length=0;
    for(const owner of [own,other,station])for(const part of [...owner.fragments,...(owner.pressurePanels||[])])part.visible=true;
    station.deform([]);
    for(const ship of [own,other]) {
      ship.body=undefined;ship.burst=undefined;ship.crashKey='';ship.dent=undefined;ship.fractured=false;ship.frameFractured=false;
      ship.deform(null);
    }
  }
  function detach(owner,parts,energy,velocity) {
    parts=parts.filter(part=>part.visible);
    if(!parts.length)return;
    owner.group.updateMatrixWorld(true);
    const masses=parts.map(part=>part.userData.mass||2),velocities=fractureVelocities(parts.length,masses,energy*0.8);
    parts.forEach((part,i)=>{
      const geometry=part.geometry.clone();geometry.computeBoundingBox();geometry.computeBoundingSphere();
      const center=geometry.boundingBox.getCenter(new THREE.Vector3());geometry.translate(-center.x,-center.y,-center.z);
      const fragment=new THREE.Mesh(geometry,part.material);fragment.name=part.name+'-fragment';
      fragment.userData.solid=true;
      fragment.castShadow=true;fragment.receiveShadow=true;
      fragment.position.copy(part.localToWorld(center));part.getWorldQuaternion(fragment.quaternion);scene.add(fragment);part.visible=false;
      const v=new THREE.Vector3(...velocities[i]).add(velocity).add(new THREE.Vector3().crossVectors(owner.angularVelocity||new THREE.Vector3(),fragment.position.clone().sub(owner.centerOfMass||owner.group.position)));
      debris.push({mesh:fragment,velocity:v,spin:new THREE.Vector3(0.3,0.5,-0.2).normalize().multiplyScalar(Math.sqrt(0.4*energy/(parts.length*masses[i]*Math.max(0.1,geometry.boundingSphere?.radius**2||1))))});
    });
  }
  function explode(owner,mass,point,velocity) {
    if(!(mass>0))return;
    const effect=new FuelExplosion(mass/2.43564,mass*1.43564/2.43564);
    const parts=owner.fragments.filter(part=>{
      part.geometry.computeBoundingSphere();
      return (part.userData.tank!==undefined||owner!==station)&&owner.group.localToWorld(part.geometry.boundingSphere.center.clone()).distanceTo(point)<3;
    });
    detach(owner,parts,effect.fragmentEnergy,velocity);
    const material=new THREE.MeshBasicMaterial({color:0xffc984,transparent:true,opacity:0.8,depthWrite:false,blending:THREE.AdditiveBlending});
    const mesh=new THREE.Mesh(new THREE.SphereGeometry(1,24,16),material);mesh.name='propellant-flash';mesh.position.copy(point);scene.add(mesh);
    const directions=fractureVelocities(96,1,48),geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(directions.flatMap((v,i)=>v.map(x=>x*(0.55+(i%7)*0.06))),3));
    const glow=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
      uniforms:{brightness:{value:1}},
      vertexShader:'void main(){vec4 p=modelViewMatrix*vec4(position,1.0);gl_PointSize=clamp(800.0/max(1.0,-p.z),1.0,22.0);gl_Position=projectionMatrix*p;}',
      fragmentShader:'uniform float brightness;void main(){float r=length(gl_PointCoord-0.5)*2.0;gl_FragColor=vec4(1.0,0.62,0.28,brightness*exp(-5.0*r*r));}'});
    const cloud=new THREE.Points(geometry,glow);cloud.name='propellant-ejecta';cloud.position.copy(point);scene.add(cloud);
    explosions.push({mesh,cloud,effect,age:0,velocity:velocity.clone()});
  }
  function damage(ship,state,dt) {
    const key=`${state[Flight.impactSequence]}:${state[Flight.status]}`;
    if(state[Flight.status]===2&&state[Flight.impactAge]>0&&key!==ship.crashKey&&Math.hypot(...state.slice(17,20))>0.5) {
      if(ship.body) {ship.body.time=Infinity;ship.deform(ship.body,ship.burst);ship.dent.crush=ship.body.stationCrush;ship.commitDamage();}
      const damageSpeed=state[Flight.impactPart]>=0?Math.min(state[Flight.impactSpeed],Math.sqrt(700/Math.max(1,state[Flight.impactMass]))):state[Flight.impactSpeed];
      const stationImpact=(state[Flight.impactBody]||0)===0;
      ship.body=new CrushBody(2120+state[Flight.fuel]+state[Flight.burnedFuel],damageSpeed,stationImpact?420000:state[Flight.impactBody]===2?180:2200,state[Flight.impactMass],state[Flight.crushForce],state[Flight.stationShare]);ship.crashKey=key;ship.fractured=false;ship.frameFractured=false;
      ship.normal=new THREE.Vector3(state[Flight.normalX],state[Flight.normalY],-state[Flight.normalZ]);
      ship.point=new THREE.Vector3(state[Flight.impactX],state[Flight.impactY],-state[Flight.impactZ]);
      ship.localNormal=ship.normal.clone().applyQuaternion(quaternion(state).invert());
      ship.damageDirection(ship.localNormal);
      const point=station.group.worldToLocal(ship.point.clone().add(station.offset));
      const normal=ship.normal.clone().applyQuaternion(station.group.quaternion.clone().invert());
      const hit={point,normal,crush:0};if(stationImpact)dents.push(hit);ship.dent=hit;
      explode(ship,state[Flight.burnedFuel],ship.group.position,ship.velocity);
      if(stationImpact)explode(station,state[Flight.stationBurnedFuel],ship.point.clone().add(station.offset),station.velocity);
    }
    if(ship.body) {
      ship.body.time=state[Flight.impactAge];
      if(ship.body.permanentCrush>0.25&&!ship.burst) ship.burst=new PressureBurst();
      if(ship.burst) ship.burst.advance(dt);
      ship.deform(ship.body,ship.burst);
      if(ship.burst?.distance>=0.12 && ship.pressurePanels.some(part=>part.visible)) {
        const start=debris.length;
        detach(ship,ship.pressurePanels,0,ship.velocity);
        debris.slice(start).forEach((item,i)=>item.velocity.add(new THREE.Vector3((i?1:-1)*ship.burst.panelSpeed,0,0).applyQuaternion(ship.group.quaternion)));
      }
      ship.dent.crush=ship.body.stationCrush;
      if(ship.body.capsuleCrush>0.2&&!ship.fractured) {
        ship.fractured=true;
        const eligible=ship.fragments.filter(part=>{
          part.geometry.computeBoundingSphere();return part.name!=='capsule-frame'&&part.geometry.boundingSphere.center.dot(ship.localNormal)<0;
        });
        detach(ship,eligible,ship.body.deformationEnergy*0.025,ship.velocity);
      }
      if(ship.body.capsuleCrush>0.65&&!ship.frameFractured) {
        ship.frameFractured=true;
        const frame=ship.fragments.filter(part=>{
          part.geometry.computeBoundingSphere();return part.name==='capsule-frame'&&part.geometry.boundingSphere.center.dot(ship.localNormal)<0;
        });
        detach(ship,frame,ship.body.deformationEnergy*0.015,ship.velocity);
      }
    }
  }
  return {
    reset,
    update(states,stationState,dt) {
      for(const [i,ship] of [own,other].entries())if(states[i])damage(ship,states[i],dt);
      station.deform(dents);
      for(let panel=0;panel<8;panel++)if(stationState[Station.brokenPanels]&(1<<panel))
        detach(station,station.fragments.filter(part=>part.userData.panel===panel),350,station.velocity);
    },
    advance(dt) {
      for(const item of debris) {item.mesh.position.addScaledVector(item.velocity,dt);item.mesh.rotateOnWorldAxis(item.spin.clone().normalize(),item.spin.length()*dt);}
      for(const item of explosions) {
        item.age+=dt;item.mesh.position.addScaledVector(item.velocity,dt);
        item.mesh.scale.setScalar(item.effect.radius(item.age));
        item.mesh.material.opacity=Math.min(0.85,item.effect.energy/2e6)*Math.exp(-item.age/0.07)/(1+item.effect.radius(item.age)/20);
        item.mesh.visible=item.age<0.5;
        item.cloud.position.copy(item.mesh.position);item.cloud.scale.copy(item.mesh.scale);
        item.cloud.material.uniforms.brightness.value=Math.exp(-item.age/0.14);
        item.cloud.visible=item.age<0.8;
      }
      return {fragments:debris.length,explosions:explosions.length};
    },
  };
}
