#pragma once
#include "physics.hpp"

namespace combat {
enum Power { Empty, Spin, Tether, Kick, Decoy, Shield, Stabilize };
struct Fighter {
    double health=100, shield=0;
    double thrusters[12]={1,1,1,1,1,1,1,1,1,1,1,1};
    int items[2]={Kick,Stabilize};
    int reload=0, spin=0, immune=0, tether=0, decoy=0, stabilize=0;
    double tether_length=0;
    flight::Vec tether_point;
    flight::Vec decoy_position, decoy_velocity;
    unsigned shot_sequence=0;
    flight::Vec shot_from, shot_to;
    int shot_age=100, shot_hit=-1;
    double last_impact=0;
};
struct Pickup {flight::Vec position;int power=Empty, cooldown=0;};
struct Command {flight::Controls flight;bool fire=false;int power=-1;};
struct Round {
    Fighter fighters[2];
    Pickup pickups[6];
    int map=0, number=1, wins[2]={}, result=-2, remaining=120*120;
    bool training=false;
    unsigned tick=0, random=1;
};
void reset(Round&,flight::State*,flight::Station&);
void advance(Round&,flight::State*,const Command*,flight::Station&,bool resolve=true);
double steering(const Fighter&);
double propulsion(const Fighter&);
constexpr int packed_size=123;
template<class T,class Visitor> void visit(T& round,Visitor visitor) {
    int at=0;
    auto field=[&](auto& value){visitor(at++,value);};
    auto vector=[&](auto& v){field(v.x);field(v.y);field(v.z);};
    field(round.map);field(round.number);field(round.wins[0]);field(round.wins[1]);field(round.result);
    field(round.remaining);field(round.training);field(round.tick);field(round.random);
    for(auto& f:round.fighters) {
        field(f.health);field(f.shield);for(auto& engine:f.thrusters)field(engine);
        field(f.items[0]);field(f.items[1]);field(f.reload);field(f.spin);field(f.immune);
        field(f.tether);field(f.decoy);field(f.stabilize);field(f.tether_length);vector(f.tether_point);
        vector(f.decoy_position);vector(f.decoy_velocity);field(f.shot_sequence);vector(f.shot_from);vector(f.shot_to);
        field(f.shot_age);field(f.shot_hit);field(f.last_impact);
    }
    for(auto& p:round.pickups){vector(p.position);field(p.power);field(p.cooldown);}
}
}
