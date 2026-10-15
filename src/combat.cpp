#include "combat.hpp"
#include "mesh.hpp"

namespace combat {
namespace {
using flight::Vec;
using flight::Quat;
Vec sub(Vec a,Vec b){return flight::add(a,flight::scale(b,-1));}
double dot(Vec a,Vec b){return a.x*b.x+a.y*b.y+a.z*b.z;}
Vec cross(Vec a,Vec b){return {a.y*b.z-a.z*b.y,a.z*b.x-a.x*b.z,a.x*b.y-a.y*b.x};}
double limit(double value,double low,double high){return value<low?low:value>high?high:value;}
Quat inverse(Quat q){return {q.w,-q.x,-q.y,-q.z};}
Vec center(const flight::State& state,int slot){return flight::add(state.position,{slot?18.0:-18.0,0,-3.2});}
struct Target {double distance=240;int body=-1;Vec point;};
Target target(const Round& round,const flight::State* states,const flight::Station& station,int shooter) {
    const auto& state=states[shooter];
    const auto forward=flight::rotate(state.attitude,{0,0,1});
    const auto direction=flight::length(round.fighters[shooter].aim)>0.5?round.fighters[shooter].aim:forward;
    const auto origin=flight::add(center(state,shooter),flight::scale(forward,3.45));
    Target result;result.point=flight::add(origin,flight::scale(direction,result.distance));
    auto trace=[&](int model,Vec position,Quat attitude,int body,int broken=0,int ruptured=0,const unsigned* missing=nullptr){
        const auto q=inverse(attitude);
        const auto hit=collision::ray(model,flight::rotate(q,sub(origin,position)),flight::rotate(q,direction),result.distance,broken,ruptured,missing);
        if(hit.hit)result={hit.distance,body,flight::add(origin,flight::scale(direction,hit.distance))};
    };
    const int enemy=1-shooter;
    if(round.fighters[enemy].health>0)trace(1,center(states[enemy],enemy),states[enemy].attitude,enemy,0,0,states[enemy].missing);
    trace(1,center(state,shooter),state.attitude,shooter,0,0,state.missing);
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
void impulse(flight::State& state,Vec momentum,Vec arm) {
    state.velocity=flight::add(state.velocity,flight::scale(momentum,1/(2120+state.fuel)));
    const auto torque=flight::rotate(inverse(state.attitude),cross(arm,momentum));
    state.omega=flight::add(state.omega,{torque.x/(3300+state.fuel*0.4),torque.y/(3300+state.fuel*0.4),torque.z/(2400+state.fuel*0.6)});
}
void power(Round& round,flight::State* states,flight::Station& station,int pilot,int slot) {
    if(slot<0||slot>1)return;
    auto& fighter=round.fighters[pilot];auto& state=states[pilot];
    const int item=fighter.items[slot];
    if(item==Empty||fighter.health<=0)return;
    if(item==Spin||item==Tether) {
        const auto hit=target(round,states,station,pilot);
        if(hit.body!=1-pilot||hit.distance>90)return;
        auto& enemy=round.fighters[1-pilot];
        if(item==Spin) {
            if(enemy.immune>0)return;
            enemy.spin=240;enemy.immune=600;
        } else {
            fighter.tether=360;
            fighter.tether_point=flight::rotate(inverse(states[1-pilot].attitude),sub(hit.point,center(states[1-pilot],1-pilot)));
            fighter.tether_length=hit.distance>12?hit.distance-8:4;
        }
    } else if(item==Kick) {
        const auto direction=flight::rotate(state.attitude,{0,0,1});
        impulse(state,flight::scale(direction,6*(2120+state.fuel)),{});
    } else if(item==Decoy) {
        fighter.decoy=720;fighter.decoy_position=center(state,pilot);fighter.decoy_velocity=state.velocity;
    } else if(item==Shield)fighter.shield=50;
    else if(item==Stabilize)fighter.stabilize=600;
    fighter.items[slot]=Empty;
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
    if(round.training) {
        states[0].velocity={3,-2,1};states[0].omega={0.35,-0.45,0.25};
        round.fighters[0].items[0]=Spin;
    }
}
void advance(Round& round,flight::State* states,const Command* commands,flight::Station& station,bool resolve) {
    if(round.result!=-2)return;
    ++round.tick;if(round.remaining>0)--round.remaining;
    flight::Controls controls[2];
    for(int i=0;i<2;i++) {
        auto& fighter=round.fighters[i];auto& state=states[i];
        if(state.status==2&&state.impact_age>0)state.status=0;
        else if(state.status==0&&state.impact_sequence>0)state.impact_age+=flight::step_seconds;
        if(fighter.health<=0)continue;
        fighter.aim=commands[i].aim;
        if(resolve)power(round,states,station,i,commands[i].power);
        controls[i]=commands[i].flight;
        controls[i].translation=4;controls[i].rotation=24;controls[i].specific_impulse=1100;
        for(int j=0;j<12;j++)controls[i].efficiency[j]=fighter.thrusters[j];
        if(fighter.stabilize>0) {
            const double motion=__builtin_sqrt(flight::earth_mu/(flight::orbit_radius*flight::orbit_radius*flight::orbit_radius));
            const auto relative=sub(state.omega,flight::rotate(inverse(state.attitude),{motion,0,0}));
            const double rates[]={relative.x,relative.y,relative.z};
            for(int j=0;j<3;j++)controls[i].axis[j+3]=limit(controls[i].axis[j+3]-rates[j]*3,-1,1);
        }
        if(fighter.spin>0) {
            const Vec thrust=flight::rotate(state.attitude,{0,260,0});
            impulse(state,flight::scale(thrust,flight::step_seconds),flight::rotate(state.attitude,{1,0,-2}));
        }
        if(fighter.tether>0) {
            const auto a=flight::add(center(state,i),flight::rotate(state.attitude,{0,0,3}));
            auto& enemy=states[1-i];
            const auto arm=flight::rotate(enemy.attitude,fighter.tether_point);
            const auto b=flight::add(center(enemy,1-i),arm),delta=sub(b,a);
            const double distance=flight::length(delta);
            if(distance>100||round.fighters[1-i].health<=0)fighter.tether=0;
            else if(distance>0.01) {
                const auto direction=flight::scale(delta,1/distance);
                const double force=limit(500*(distance-fighter.tether_length)+500*dot(sub(enemy.velocity,state.velocity),direction),0,12000);
                const auto pull=flight::scale(direction,force*flight::step_seconds);
                impulse(state,pull,flight::rotate(state.attitude,{0,0,3}));impulse(enemy,flight::scale(pull,-1),arm);
            }
        }
        if(fighter.decoy>0)fighter.decoy_position=flight::add(fighter.decoy_position,flight::scale(fighter.decoy_velocity,flight::step_seconds));
        int* timers[]={&fighter.spin,&fighter.immune,&fighter.tether,&fighter.decoy,&fighter.stabilize};
        for(int* timer:timers)if(*timer>0)--*timer;
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
    for(auto& pickup:round.pickups) {
        if(pickup.cooldown>0) {--pickup.cooldown;continue;}
        for(int i=0;i<2;i++) {
            auto& fighter=round.fighters[i];
            if(fighter.health<=0||flight::length(sub(center(states[i],i),pickup.position))>4)continue;
            int slot=fighter.items[0]==Empty?0:fighter.items[1]==Empty?1:-1;
            if(slot<0)continue;
            fighter.items[slot]=pickup.power;pickup.cooldown=1440;
            states[i].fuel=limit(states[i].fuel+15,0,80);
            round.random^=round.random<<13;round.random^=round.random>>17;round.random^=round.random<<5;
            pickup.power=1+round.random%6;break;
        }
    }
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
            const auto local=flight::rotate(inverse(enemy.attitude),sub(hits[i].point,center(enemy,1-i)));
            const double before=round.fighters[1-i].health;
            damage(round.fighters[1-i],local,25);
            if(round.fighters[1-i].health<before)collision::fracture(local,1.25,enemy.missing);
        }
    }
    for(int i=0;i<2;i++)if(round.fighters[i].health<=0)for(auto& word:states[i].missing)word=~0u;
    resolve_round(round);
}
}
