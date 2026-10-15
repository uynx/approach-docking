import * as THREE from '/vendor/three.module.js';
import {powers} from './combat-view.js';

export function createCombatEffects(scene,ships) {
  const group=new THREE.Group();group.name='combat-effects';group.userData.nonSolid=true;scene.add(group);
  const point=values=>new THREE.Vector3(values[0],values[1],-values[2]);
  const line=color=>{
    const object=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]),new THREE.LineBasicMaterial({color,transparent:true,depthWrite:false,toneMapped:false}));
    object.frustumCulled=false;group.add(object);return object;
  };
  const lasers=[line(0x8fffe1),line(0xffa289)],cables=[line(0x8dc9ff),line(0xffd79b)];
  const pods=Array.from({length:6},(_,i)=>{
    const pod=new THREE.Group();pod.name=`supply-pod-${i}`;
    const frame=new THREE.Mesh(new THREE.IcosahedronGeometry(0.8,0),new THREE.MeshStandardMaterial({color:0x9ee6d4,metalness:0.5,roughness:0.35,emissive:0x8ff9da,emissiveIntensity:0.3}));
    const ring=new THREE.Mesh(new THREE.TorusGeometry(1.2,0.035,8,32),new THREE.MeshBasicMaterial({color:0x8ff9da,toneMapped:false}));
    pod.add(frame,ring);group.add(pod);return pod;
  });
  const shields=ships.map(()=>{
    const mesh=new THREE.Mesh(new THREE.SphereGeometry(1,20,16),new THREE.MeshBasicMaterial({color:0x8fcfff,wireframe:true,transparent:true,opacity:0.18,depthWrite:false}));
    mesh.scale.set(1.9,1.9,3.6);group.add(mesh);return mesh;
  });
  const decoys=ships.map(ship=>{
    const mesh=new THREE.Group();mesh.name='decoy-capsule';
    const material=new THREE.MeshBasicMaterial({color:0xbfa5ff,wireframe:true,transparent:true,opacity:0.28,depthWrite:false});
    for(const part of ship.group.children)if(part.name==='render-batch')mesh.add(new THREE.Mesh(part.geometry,material));
    group.add(mesh);return mesh;
  });
  function segment(object,a,b,offset) {
    const positions=object.geometry.attributes.position;
    for(const [i,v] of [a,b].entries())positions.setXYZ(i,v.x+offset.x,v.y+offset.y,v.z+offset.z);
    positions.needsUpdate=true;
  }
  return {
    update(battle,slot,offset,now) {
      group.visible=!!battle;if(!battle)return;
      battle.pickups.forEach((pickup,i)=>{
        const pod=pods[i];pod.visible=pickup.cooldown===0;pod.position.copy(point(pickup.position)).add(offset);
        pod.rotation.set(now/2200+i,now/1700,now/3100);pod.children.forEach(part=>{part.material.color.setHex(powers[pickup.power].color);});
      });
      for(let local=0;local<2;local++) {
        const pilot=local^slot,fighter=battle.fighters[pilot],ship=ships[local];
        const laser=lasers[local];laser.visible=fighter.shotAge<12;laser.material.opacity=Math.max(0,1-fighter.shotAge/12);
        segment(laser,point(fighter.shotFrom),point(fighter.shotTo),offset);
        const cable=cables[local];cable.visible=fighter.tether>0;
        const target=ships[1-local].group.localToWorld(point(fighter.tetherPoint));
        segment(cable,ship.group.localToWorld(new THREE.Vector3(0,0,-3)),target,new THREE.Vector3());
        shields[local].visible=fighter.shield>0;shields[local].position.copy(ship.group.position);shields[local].quaternion.copy(ship.group.quaternion);
        decoys[local].visible=fighter.decoy>0;decoys[local].position.copy(point(fighter.decoyPosition)).add(offset);decoys[local].quaternion.copy(ship.group.quaternion);
      }
    },
  };
}
