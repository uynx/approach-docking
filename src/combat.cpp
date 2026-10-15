#include "combat.hpp"

namespace combat {
void reset(Round& round,flight::State* states,flight::Station& station) {
    round.result=-2;round.remaining=120*120;round.tick=0;
    station={};
    const flight::Vec cover[2][3]={{{-28,12,-35},{28,-12,-65},{0,18,-50}},{{0,0,-50},{20,12,-35},{-20,-12,-65}}};
    for(int i=0;i<3;i++) {
        station.satellites[i]=flight::initial_satellite(i);
        station.satellites[i].position=cover[round.map][i];
        station.satellites[i].velocity={};
    }
    for(int i=0;i<2;i++) {
        states[i]={};
        states[i].position={i?10.0:-10.0,0,-50};
        states[i].attitude={0.7071067811865476,0,i?-0.7071067811865476:0.7071067811865476,0};
        states[i].omega=flight::rotate({states[i].attitude.w,0,-states[i].attitude.y,0},{0.0011331559,0,0});
        round.fighters[i]={};
    }
    for(int i=0;i<6;i++)round.pickups[i]={flight::Vec{(i%3-1)*16.0,i<3?12.0:-12.0,-40.0-(i%2)*20},i+1,0};
}
}
