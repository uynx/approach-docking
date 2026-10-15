#pragma once
#include "physics.hpp"

namespace combat {
enum Power { Empty, Spin, Tether, Kick, Decoy, Shield, Stabilize };
struct Fighter {
    double health=100, shield=0;
    int items[2]={Kick,Stabilize};
    int reload=0, spin=0, immune=0, tether=0, decoy=0, stabilize=0;
    flight::Vec decoy_position, decoy_velocity;
    unsigned shot_sequence=0;
    flight::Vec shot_from, shot_to;
    int shot_age=100, shot_hit=-1;
    double last_impact=0;
};
struct Pickup {flight::Vec position;int power=Empty, cooldown=0;};
struct Round {
    Fighter fighters[2];
    Pickup pickups[6];
    int map=0, number=1, wins[2]={}, result=-2, remaining=120*120;
    bool training=false;
    unsigned tick=0, random=1;
};
void reset(Round&,flight::State*,flight::Station&);
}
