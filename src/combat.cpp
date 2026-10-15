#include "combat.hpp"
#include "mesh.hpp"

namespace combat {
namespace {
using flight::Vec;
using flight::Quat;
Vec sub(Vec a,Vec b){return flight::add(a,flight::scale(b,-1));}
double limit(double value,double low,double high){return value<low?low:value>high?high:value;}
Quat inverse(Quat q){return {q.w,-q.x,-q.y,-q.z};}
Vec center(const flight::State& state,int slot){return flight::add(state.position,{slot?18.0:-18.0,0,-3.2});}
struct Target {double distance=240;int body=-1;Vec point;};
Target target(const Round& round,const flight::State* states,const flight::Station& station,int shooter) {
    const auto& state=states[shooter];
    const auto direction=flight::rotate(state.attitude,{0,0,1});
    const auto origin=flight::add(center(state,shooter),flight::scale(direction,3.45));
    Target result;result.point=flight::add(origin,flight::scale(direction,result.distance));
    auto trace=[&](int model,Vec position,Quat attitude,int body,int broken=0,int ruptured=0){
        const auto q=inverse(attitude);
        const auto hit=collision::ray(model,flight::rotate(q,sub(origin,position)),flight::rotate(q,direction),result.distance,broken,ruptured);
        if(hit.hit)result={hit.distance,body,flight::add(origin,flight::scale(direction,hit.distance))};
    };
    const int enemy=1-shooter;
    if(round.fighters[enemy].health>0)trace(1,center(states[enemy],enemy),states[enemy].attitude,enemy);
    if(round.map==0) {
        const auto origin= sub(Vec{0,0,13},flight::rotate(station.attitude,{0,0,13}));
        trace(0,origin,station.attitude,2,station.broken_panels,station.ruptured_tanks);
    }
    for(int i=0;i<3;i++)trace(2,station.satellites[i].position,station.satellites[i].attitude,3+i);
    return result;
}
void damage(Fighter& fighter,Vec local,double amount) {
    const double absorbed=amount<fighter.shield?amount:fighter.shield;
    fighter.shield-=absorbed;amount-=absorbed;
    fighter.health=limit(fighter.health-amount,0,100);
    const int group=local.z<0?0:6;
    const int side=(local.x+local.y)>=0?0:1;
    for(int i=group;i<group+6;i++)fighter.thrusters[i]=limit(fighter.thrusters[i]-amount*(i%2==side?0.012:0.003),0.1,1);
}
void resolve_round(Round& round) {
    if(round.training)return;
    if(round.fighters[0].health>0&&round.fighters[1].health>0&&round.remaining>0)return;
    const double a=round.fighters[0].health,b=round.fighters[1].health;
    round.result=a==b?-1:a>b?0:1;
    if(round.result>=0)++round.wins[round.result];
}
}
double propulsion(const Fighter& fighter){double sum=0;for(int i=0;i<6;i++)sum+=fighter.thrusters[i];return sum/6;}
double steering(const Fighter& fighter){double sum=0;for(int i=6;i<12;i++)sum+=fighter.thrusters[i];return sum/6;}
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
        const double motion=__builtin_sqrt(flight::earth_mu/(flight::orbit_radius*flight::orbit_radius*flight::orbit_radius));
        states[i].omega=flight::rotate({states[i].attitude.w,0,-states[i].attitude.y,0},{motion,0,0});
        round.fighters[i]={};
    }
    for(int i=0;i<6;i++)round.pickups[i]={flight::Vec{(i%3-1)*16.0,i<3?12.0:-12.0,-40.0-(i%2)*20},i+1,0};
}
void advance(Round& round,flight::State* states,const Command* commands,flight::Station& station,bool resolve) {
    if(round.result!=-2)return;
    ++round.tick;if(round.remaining>0)--round.remaining;
    flight::Controls controls[2];
    for(int i=0;i<2;i++) {
        auto& fighter=round.fighters[i];auto& state=states[i];
        if(state.status==2&&state.impact_age>0)state.status=0;
        if(fighter.health<=0)continue;
        controls[i]=commands[i].flight;
        controls[i].translation=4;controls[i].rotation=24;controls[i].specific_impulse=1100;
        for(int j=0;j<12;j++)controls[i].efficiency[j]=fighter.thrusters[j];
        if(fighter.reload>0)--fighter.reload;
        ++fighter.shot_age;
    }
    flight::advance_system(states,controls,2,station,flight::step_seconds);
    for(int i=0;i<2;i++) {
        auto& state=states[i];auto& fighter=round.fighters[i];
        if(round.map==0)flight::judge(state,i,station);
        if(state.status==1||state.status==3)state.status=0;
        if(state.impact_sequence!=fighter.last_impact) {
            fighter.last_impact=state.impact_sequence;
            const double energy=0.5*(state.impact_mass>0?state.impact_mass:2200)*state.impact_speed*state.impact_speed;
            damage(fighter,flight::rotate(inverse(state.attitude),state.impact_arm),limit(energy/1600,0,100));
        }
        if(state.status==4)fighter.health=0;
        if(flight::length(center(state,i))>180)damage(fighter,{},12*flight::step_seconds);
    }
    if(!resolve)return;
    bool shots[2];
    for(int i=0;i<2;i++)shots[i]=commands[i].fire&&round.fighters[i].reload==0&&round.fighters[i].health>0;
    Target hits[2];
    for(int i=0;i<2;i++)if(shots[i])hits[i]=target(round,states,station,i);
    for(int i=0;i<2;i++)if(shots[i]) {
        auto& fighter=round.fighters[i];const auto& state=states[i];
        fighter.reload=30;++fighter.shot_sequence;fighter.shot_age=0;fighter.shot_hit=hits[i].body;
        fighter.shot_from=flight::add(center(state,i),flight::rotate(state.attitude,{0,0,3.45}));
        fighter.shot_to=hits[i].point;
        if(hits[i].body==1-i) {
            auto& enemy=states[1-i];
            damage(round.fighters[1-i],flight::rotate(inverse(enemy.attitude),sub(hits[i].point,center(enemy,1-i))),25);
        }
    }
    resolve_round(round);
}
}
