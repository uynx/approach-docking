import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CrushBody, PressureBurst, fractureVelocities, fractureMotion, FuelExplosion } from '../web/damage.js';

test('a stationary hull remains stationary in vacuum', () => {
  const hull = new CrushBody(2200, 0);
  hull.advance(2);
  assert.equal(hull.energy(), 0);
  assert.equal(hull.displacement(-3.2), 0);
  assert.equal(hull.permanentCrush, 0);
});

test('fracture velocities spend a bounded energy budget without inventing momentum',()=>{
  const velocities=fractureVelocities(12,2,700);
  const momentum=[0,0,0];let energy=0;
  for(const v of velocities) {v.forEach((x,i)=>momentum[i]+=2*x);energy+=Math.hypot(...v)**2;}
  assert.ok(energy<=700.000001);
  assert.ok(energy>0);
  assert.ok(Math.hypot(...momentum)<1e-9);
});

test('heavy frame sections and light skin share a finite fracture energy budget',()=>{
  const masses=[5.5,5.5,1.3,2,2],velocities=fractureVelocities(masses.length,masses,6000);
  const momentum=[0,0,0];let energy=0;
  velocities.forEach((v,i)=>{v.forEach((x,j)=>momentum[j]+=masses[i]*x);energy+=0.5*masses[i]*Math.hypot(...v)**2;});
  assert.ok(velocities.every(v=>v.every(Number.isFinite)));
  assert.ok(Math.hypot(...momentum)<1e-8,'fracture does not propel the combined wreck');
  assert.ok(energy>5900&&energy<=6000.000001);
});

test('breakup distributes finite energy without adding linear or angular momentum',()=>{
  const masses=[2,2,5.5,1.3],inertias=[0.7,0.7,1.2,0.3],centers=[[1,0,0],[0,2,0],[-1,0,1],[0,-2,-1]];
  const {velocities,spins}=fractureMotion(masses,inertias,centers,700),linear=[0,0,0],angular=[0,0,0];let energy=0;
  velocities.forEach((v,i)=>{
    const p=v.map(x=>x*masses[i]),r=centers[i];
    const orbital=[r[1]*p[2]-r[2]*p[1],r[2]*p[0]-r[0]*p[2],r[0]*p[1]-r[1]*p[0]];
    for(let j=0;j<3;j++){linear[j]+=p[j];angular[j]+=orbital[j]+inertias[i]*spins[i][j];}
    energy+=0.5*masses[i]*Math.hypot(...v)**2+0.5*inertias[i]*Math.hypot(...spins[i])**2;
  });
  assert.ok(Math.hypot(...linear)<1e-8);assert.ok(Math.hypot(...angular)<1e-8);
  assert.ok(energy>699&&energy<=700.000001);
  const still=fractureMotion(masses,inertias,centers,0);
  assert.ok([...still.velocities,...still.spins].flat().every(x=>x===0));
});

test('fuel and oxidizer release finite chemical energy and cool while expanding in vacuum',()=>{
  const burst=new FuelExplosion(2,2.8713);
  assert.ok(burst.energy>3.2e7&&burst.energy<3.3e7);
  assert.equal(new FuelExplosion(2,0).energy,0);
  assert.equal(new FuelExplosion(0,2).energy,0);
  assert.ok(burst.temperature(1)<burst.temperature(0));
  assert.ok(burst.radius(1)>burst.radius(0));
  assert.ok(burst.kineticEnergy+burst.thermalEnergy<=burst.energy);
});

test('collision energy starts at one half mass times speed squared and decreases', () => {
  const hull = new CrushBody(2200, 3);
  assert.equal(hull.initialEnergy, 9900);
  for (let i = 0; i < 100; i++) {
    hull.advance(0.01);
    assert.ok(Number.isFinite(hull.energy()));
    assert.ok(hull.energy() <= 9900 * 1.01);
  }
  assert.ok(hull.energy() < 9900 * 0.5);
  assert.ok(hull.permanentCrush > 0);
  assert.ok(hull.displacement(-3.2) > hull.displacement(1.8));
});

test('a faster axial collision produces more permanent crushing', () => {
  const slow = new CrushBody(2200, 0.2), fast = new CrushBody(2200, 5);
  slow.advance(2); fast.advance(2);
  assert.ok(fast.permanentCrush > slow.permanentCrush);
  assert.ok(fast.permanentCrush < 5);
});

test('crash deformation is independent of rendering frame rate', () => {
  const a = new CrushBody(2200, 3), b = new CrushBody(2200, 3);
  for (let i = 0; i < 60; i++) a.advance(1 / 60);
  for (let i = 0; i < 120; i++) b.advance(1 / 120);
  assert.ok(Math.abs(a.displacement(0) - b.displacement(0)) < 1e-8);
});


test('pressure rupture spends stored gas energy and ejects opposing panels without net momentum', () => {
  const burst=new PressureBurst();
  const initial=burst.energy();
  for(let i=0;i<120;i++) {
    burst.advance(1/120);
    assert.ok(burst.pressure>=0&&burst.pressure<=101325);
    assert.ok(Math.abs(burst.energy()-initial)<1e-6*initial);
  }
  assert.ok(burst.distance>1);
  assert.ok(burst.pressure<101325/2);
  assert.ok(burst.panelSpeed>0);
  assert.equal(burst.netMomentum,0);
  const speed=burst.panelSpeed;burst.advance(1);
  assert.equal(burst.panelSpeed,speed);
});

test('pressure burst evolution is independent of render frame rate', () => {
  const a=new PressureBurst(),b=new PressureBurst();
  for(let i=0;i<60;i++)a.advance(1/60);
  for(let i=0;i<120;i++)b.advance(1/120);
  assert.ok(Math.abs(a.pressure-b.pressure)<1e-8);
  assert.ok(Math.abs(a.distance-b.distance)<1e-8);
});

test('a vented cabin remains finite after a long coast',()=>{
  const burst=new PressureBurst();const energy=burst.energy();burst.advance(120);
  assert.ok(Number.isFinite(burst.pressure));assert.ok(Number.isFinite(burst.distance));
  assert.ok(Math.abs(burst.energy()-energy)<1e-5*energy);
});


test('crumpling stays permanent and both bodies receive equal opposing impulses', () => {
  const hit=new CrushBody(2200,3);
  let crush=0;
  for(let i=0;i<120;i++) {
    hit.advance(1/120);
    assert.ok(hit.permanentCrush>=crush);
    crush=hit.permanentCrush;
  }
  assert.ok(hit.stationCrush>0&&hit.stationCrush<hit.capsuleCrush);
  assert.ok(Math.abs(2200*hit.capsuleVelocity+420000*hit.stationVelocity-6600)<1e-8);
  assert.ok(hit.capsuleVelocity<0);
  assert.ok(hit.stationVelocity>0);
  const shape=hit.displacement(-2);
  hit.advance(5);
  assert.equal(hit.displacement(-2),shape);
});
