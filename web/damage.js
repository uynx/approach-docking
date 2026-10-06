const step = 1 / 1200;

export class CrushBody {
  constructor(mass, speed, stationMass = 420000, effectiveMass, strength = 80000, stationShare = 0.15) {
    this.mass = mass; this.stationMass = stationMass; this.speed = Math.max(0, speed);
    this.reducedMass = effectiveMass || mass * stationMass / (mass + stationMass);
    this.stationShare = stationShare;
    this.initialEnergy = 0.5 * mass * this.speed ** 2;
    this.deformationEnergy = 0.5 * this.reducedMass * this.speed ** 2;
    this.restitution = 0.08;
    this.force = Math.max(strength, 0.5 * this.reducedMass * this.speed ** 2 / 1.5);
    this.compressionTime = this.reducedMass * this.speed / this.force;
    this.contactTime = this.compressionTime * (1 + this.restitution);
    this.time = 0;
  }
  advance(dt) { this.time += Math.max(0, dt); }
  get impulse() { return this.force * Math.min(this.time, this.contactTime); }
  get impulseTravel() {
    const t = Math.min(this.time, this.contactTime);
    return this.force * (0.5 * t * t + t * Math.max(0, this.time - this.contactTime));
  }
  get capsuleVelocity() { return this.speed - this.impulse / this.mass; }
  get stationVelocity() { return this.impulse / this.stationMass; }
  get capsuleTravel() { return this.speed * this.time - this.impulseTravel / this.mass; }
  get stationTravel() { return this.impulseTravel / this.stationMass; }
  get permanentCrush() {
    const t = Math.min(this.time, this.compressionTime);
    return (this.speed * t - 0.5 * this.force / this.reducedMass * t * t) * (1 - this.restitution ** 2) * 0.99;
  }
  get capsuleCrush() { return (1-this.stationShare) * this.permanentCrush; }
  get stationCrush() { return this.stationShare * this.permanentCrush; }
  displacement(z) { return this.capsuleCrush * Math.max(0, Math.min(1, (1.8 - z) / 5)) ** 2; }
  buckle(z, angle) {
    const t = Math.max(0, Math.min(1, (z + 3.2) / 5));
    return Math.min(0.1, Math.sqrt(this.capsuleCrush * 0.2) / Math.PI) * Math.sin(t * Math.PI * 12) * (1-t) * Math.cos(4*angle);
  }
  energy() { return 0.5 * this.mass * this.capsuleVelocity ** 2 + 0.5 * this.stationMass * this.stationVelocity ** 2; }
}

export class PressureBurst {
  constructor() {
    this.gasMass = 101325 * 9 / (287.05 * 293);
    this.internalEnergy = 101325 * 9 / 0.4;
    this.volume = 9;
    this.distance = 0;
    this.panelSpeed = 0;
    this.escapedEnergy = 0;
    this.remainder = 0;
    this.netMomentum = 0;
  }
  get pressure() { return 0.4 * this.internalEnergy / this.volume; }
  energy() { return this.internalEnergy + 2 * this.panelSpeed ** 2 + this.escapedEnergy; }
  advance(dt) {
    this.remainder += Math.max(0, dt);
    while (this.remainder + 1e-12 >= step) {
      if (this.distance < 0.12) {
        const speed = this.panelSpeed;
        this.panelSpeed += this.pressure * 0.08 / 2 * step;
        this.internalEnergy -= 2 * (this.panelSpeed ** 2 - speed ** 2);
        this.distance += (speed + this.panelSpeed) * 0.5 * step;
        this.volume = 9 + 0.16 * this.distance;
      } else if(this.gasMass<1e-12||this.internalEnergy<1e-8) {
        this.escapedEnergy+=this.internalEnergy;this.internalEnergy=0;this.gasMass=0;
        this.distance+=this.panelSpeed*step;
      } else {
        const temperature = this.internalEnergy * 0.4 / (this.gasMass * 287.05);
        const flow = 0.7 * 0.16 * this.pressure * Math.sqrt(1.4 / (287.05 * temperature)) * (2 / 2.4) ** 3;
        const remaining = Math.max(this.gasMass * 0.001, this.gasMass - flow * step);
        const energy = this.internalEnergy * (remaining / this.gasMass) ** 1.4;
        this.escapedEnergy += this.internalEnergy - energy;
        this.internalEnergy = energy; this.gasMass = remaining;
        this.distance += this.panelSpeed * step;
      }
      this.remainder -= step;
    }
  }
}

export function fractureVelocities(count, mass, energy) {
  const speed=Math.sqrt(2*Math.max(0,energy)/(count*mass)), result=[];
  for(let i=0;i<Math.floor(count/2);i++) {
    const z=(i+0.5)/Math.floor(count/2)*2-1, angle=i*2.399963229728653;
    const r=Math.sqrt(1-z*z), v=[r*Math.cos(angle)*speed,r*Math.sin(angle)*speed,z*speed];
    result.push(v,v.map(x=>-x));
  }
  if(count%2)result.push([0,0,0]);
  return result;
}

export class FuelExplosion {
  constructor(fuel, oxidizer) {
    this.mass=Math.min(Math.max(0,fuel),Math.max(0,oxidizer)*64.0904/92.011)*156.1014/64.0904;
    this.energy=this.mass*(4*241.826+2*50.63-19.56)*1000/0.1561014;
    this.kineticEnergy=this.energy*0.149;this.thermalEnergy=this.energy*0.85;this.fragmentEnergy=this.energy*0.001;
    this.expansion=this.mass?Math.sqrt(2*this.kineticEnergy/this.mass):0;
  }
  radius(time) {return 0.4+this.expansion*Math.max(0,time);}
  temperature(time) {return 3000*(0.4/this.radius(time))**0.6;}
}
