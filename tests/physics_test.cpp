#include "physics.hpp"
#include <cmath>
#include <iostream>
#include <stdexcept>

void near(double value, double expected, double tolerance, const char* message) {
    if (!std::isfinite(value) || std::abs(value - expected) > tolerance)
        throw std::runtime_error(message);
}
flight::State aligned() {
    flight::State s;
    s.position={0,0,-18};
    s.omega={std::sqrt(flight::earth_mu/std::pow(flight::orbit_radius,3)),0,0};
    return s;
}
int main() {
    const auto start=flight::initial();
    near(start.position.z,-18,1e-9,"start close enough for a short approach");
    if(std::hypot(start.position.x,start.position.y)<2 || flight::alignment(start)<8 || flight::alignment(start)>16)
        throw std::runtime_error("new approaches require translation and attitude correction");
    near(flight::relative_spin(start),0,1e-9,"off-axis start has no uncommanded spin");
    flight::State s;
    s.position = {10, 20, 30};
    s.velocity = {2, -1, 0.5};
    for (int i = 0; i < 120; ++i) flight::advance(s, {}, 1.0 / 120, false);
    near(s.position.x, 12, 1e-10, "coasting must preserve momentum and advance position");
    near(s.position.y, 19, 1e-10, "coasting y");
    near(s.fuel, 80, 1e-12, "coasting consumes no propellant");
    std::cout << "PASS inertial coasting\n";
    s = {};
    flight::Controls c;
    c.axis[2] = 1;
    for (int i = 0; i < 120; ++i) flight::advance(s, c, 1.0 / 120, false);
    if (s.velocity.z < 0.79 || s.velocity.z > 0.81) throw std::runtime_error("paired 880 N jets accelerate a 2200 kg ship promptly");
    near(s.fuel, 80 - 1760.0 / (220 * 9.80665), 1e-9, "propellant follows specific impulse");
    std::cout << "PASS thrust and fuel\n";
    s = {};
    c = {};
    c.axis[5] = 1;
    for (int i=0;i<120;++i) flight::advance(s,c,1.0/120,false);
    near(flight::length(s.velocity),0,1e-12,"rotational couple has zero resultant force");
    if (s.omega.z < 0.06 || s.omega.z > 0.08) throw std::runtime_error("roll thrusters produce torque");
    const double spin = s.omega.z;
    for (int i=0;i<120;++i) flight::advance(s,{},1.0/120,false);
    near(s.omega.z,spin,1e-10,"rotation persists without torque");
    std::cout << "PASS rotational inertia\n";
    for (int axis=3;axis<5;++axis) {
        s={}; c={}; c.axis[axis]=1;
        for(int i=0;i<1200;++i) flight::advance(s,c,1.0/120,false);
        near(flight::length(s.velocity),0,1e-12,"front and rear attitude jets cancel translation");
        if(flight::alignment(s)<120) throw std::runtime_error("pitch and yaw allow large unrestricted turns");
        const auto before=flight::length(s.omega);
        c.axis[axis]=-1;
        for(int i=0;i<120;++i) flight::advance(s,c,1.0/120,false);
        if(flight::length(s.omega)>=before) throw std::runtime_error("opposite attitude jets brake the turn");
    }
    std::cout << "PASS large pitch and yaw maneuvers\n";
    s = {};
    s.fuel = 0;
    flight::advance(s,c,1.0/120,false);
    near(flight::length(s.omega),0,1e-12,"empty tanks cannot turn the spacecraft");
    s = aligned();
    s.position={0,0,0};
    s.velocity={0,0,0};
    if (!flight::dockable(s)) throw std::runtime_error("aligned stationary ship can dock");
    s.velocity.z=1;
    if (flight::dockable(s)) throw std::runtime_error("fast impact cannot dock");
    s.velocity={}; s.omega.z=0.1;
    if (flight::dockable(s)) throw std::runtime_error("spinning spacecraft cannot dock");
    s=aligned(); s.position={0,0,-0.05}; s.velocity={0,0,0.05};
    flight::judge(s);
    if (s.status != 1 || s.score <= 0) throw std::runtime_error("valid capture earns a score");
    s=aligned(); s.position={0,0,-0.05}; s.velocity={0,0,3};
    flight::judge(s);
    if(s.status) throw std::runtime_error("the old docking plane must not stop a fast approach before contact");
    s.position.z=0.005;
    flight::judge(s);
    if (s.status != 2 || s.score != 0) throw std::runtime_error("hard impact ends the attempt");
    std::cout << "PASS docking envelope\n";
    s=aligned();s.position={8,4,1};s.velocity={0,0,3};
    flight::judge(s);
    if(s.status) throw std::runtime_error("missing the port permits continued flight past the docking plane");
    s.position={8,4,13.01};
    flight::judge(s);
    if(s.status!=2) throw std::runtime_error("solar panel contact causes a crash beyond the docking plane");
    s=aligned();s.position={10,20,15};
    flight::judge(s);
    if(s.status) throw std::runtime_error("open space behind the station stays flyable");
    std::cout << "PASS physical station contact without a stopping plane\n";
    flight::Station station;
    flight::State pair[2];flight::Controls inputs[2];
    pair[0].status=2;pair[0].impact_normal={0,0,-1};pair[0].impact_speed=3;pair[0].velocity={0,0,3};
    for(int i=0;i<120;++i) flight::advance_system(pair,inputs,2,station,1.0/120,false);
    const double capsule_world_velocity=pair[0].velocity.z+station.velocity.z;
    near(2200*capsule_world_velocity+420000*station.velocity.z,6600,1e-8,"collision conserves total momentum");
    if(capsule_world_velocity>=0||station.velocity.z<=0) throw std::runtime_error("capsule rebounds and station recoils");
    near(pair[1].velocity.z+station.velocity.z,0,1e-10,"station recoil changes the second pilot's relative velocity without accelerating their ship");
    std::cout << "PASS shared station recoil and inelastic rebound\n";
    station={}; pair[0]={};pair[1]={};
    pair[0].status=2;pair[0].impact_normal={0,0,-1};pair[0].impact_speed=3;
    pair[0].impact_point={-17,0,0};pair[0].impact_arm={1,0,3.2};pair[0].velocity={0,0,3};
    const double initial_energy=9900;
    for(int i=0;i<120;++i) flight::advance_system(pair,inputs,2,station,1.0/120,false);
    if(pair[0].omega.y<0.1 || station.omega.y<=0) throw std::runtime_error("off-centre collision torques both rigid bodies");
    const double spin_energy=0.5*3332*pair[0].omega.y*pair[0].omega.y+0.5*1.5e8*station.omega.y*station.omega.y;
    const double translation_energy=1100*std::pow(pair[0].velocity.z+station.velocity.z,2)+210000*station.velocity.z*station.velocity.z;
    if(spin_energy+translation_energy>initial_energy) throw std::runtime_error("collision torque cannot create kinetic energy");
    if(flight::alignment(pair[0])<1) throw std::runtime_error("crashed capsule continues rotating");
    near(3332*pair[0].omega.y+1.5e8*station.omega.y-18*420000*station.velocity.z,0,1e-5,"contact conserves angular momentum about capsule centre");
    for(double speed:{10.0,50.0,100.0}) {
        s=aligned();s.position.z=-0.3;s.velocity.z=speed;
        flight::advance(s,{},flight::step_seconds,false);flight::judge(s);
        if(speed>=50 && (s.status!=2 || s.position.z>0.01)) throw std::runtime_error("swept contact catches the first surface at high speed");
    }
    std::cout << "PASS off-centre angular momentum, energy, and high-speed contact\n";
    station={};pair[0]=aligned();pair[0].position={8,4,8};pair[0].velocity={0,0,50};
    for(int i=0;i<30;++i) {flight::advance_system(pair,inputs,1,station,flight::step_seconds,false);flight::judge(pair[0],0,station);}
    if(!station.broken_panels) throw std::runtime_error("high-speed impact tears a solar panel instead of silently passing through");
    if(pair[0].velocity.z<40) throw std::runtime_error("a thin torn panel cannot stop a 2200 kg capsule at 50 m/s");
    if(pair[0].impact_sequence<1) throw std::runtime_error("fracture produces an observable impact event");
    std::cout << "PASS weak solar panel fracture\n";
    station={};pair[0]={};pair[0].status=2;pair[0].impact_normal={-1,0,0};
    pair[0].impact_speed=10;pair[0].impact_arm={-1.3,-0.4,-0.7};pair[0].impact_point={-17.1,-3.5,13};
    flight::advance_system(pair,inputs,1,station,flight::step_seconds,false);
    if(pair[0].fuel!=0 || pair[0].burned_fuel!=80 || pair[0].station_burned_fuel<=0)
        throw std::runtime_error("ruptured propellant bays on either vehicle release their available fuel once");
    if(!station.ruptured_tanks)throw std::runtime_error("station tanks stay ruptured after the explosion");
    std::cout << "PASS tank-specific fuel release\n";
    near(flight::air_density(0),1.225,1e-6,"sea-level standard density");
    near(flight::air_density(100000),5.6044e-7,1e-11,"100 km standard density");
    s=aligned();s.position.y=-320000;s.velocity.y=-300;s.velocity.z=-600;
    const double initial_altitude=flight::altitude(s);
    if(flight::heat_flux(s)<100000)throw std::runtime_error("orbital entry produces convective heating");
    for(int i=0;i<1200;++i){flight::advance(s,{},flight::step_seconds);flight::judge(s);}
    if(s.status || flight::altitude(s)>=initial_altitude)throw std::runtime_error("a descending entry trajectory falls without the old range limit");
    s=aligned();s.position.y=-400010;flight::judge(s);
    if(s.status!=4 || flight::altitude(s)<0)throw std::runtime_error("ground contact prevents passage through Earth");
    std::cout << "PASS atmospheric entry and Earth contact\n";
    station={};station.attitude={std::sqrt(0.5),0,std::sqrt(0.5),0};
    s=aligned();s.position={};flight::judge(s,0,station);
    if(s.status==1)throw std::runtime_error("rotated station cannot capture a capsule at its old port location");
    s=aligned();s.position={1.8,0,34.2};s.attitude=station.attitude;s.omega={0,0,std::sqrt(flight::earth_mu/std::pow(flight::orbit_radius,3))};
    flight::judge(s,0,station);
    if(s.status!=1)throw std::runtime_error("capture follows the rotated port location and orientation");
    std::cout << "PASS capture follows station rotation\n";
    s=aligned(); s.position={};
    for (int i=0;i<12000;++i) flight::advance(s,{},flight::step_seconds);
    near(flight::length(s.position),0,0.02,"400 km orbital drift from atmospheric drag stays small over 100 seconds");
    near(flight::alignment(s),0,1e-6,"inertial spin follows the station frame");
    auto coarse=aligned(), fine=coarse;
    coarse.position={50,25,-150}; fine=coarse;
    for(int i=0;i<1200;++i) flight::advance(coarse,{},1.0/60);
    for(int i=0;i<4800;++i) flight::advance(fine,{},1.0/240);
    near(flight::length(flight::add(coarse.position,flight::scale(fine.position,-1))),0,1e-7,"orbital integration converges with a smaller timestep");
    s={}; s.fuel=0.00001; c={}; c.axis[0]=1;
    flight::advance(s,c,flight::step_seconds,false);
    near(s.fuel,0,1e-12,"last propellant cannot go negative");
    if(s.velocity.x<=0 || s.velocity.x>0.00002) throw std::runtime_error("partial fuel gives only a partial impulse");
    s={}; c={}; c.axis[2]=0.2;
    for(int i=0;i<30;++i) flight::advance(s,c,flight::step_seconds,false);
    near(s.fuel,80-1760*0.05/(220*9.80665),1e-9,"fine control uses one 50 ms pulse per 250 ms");
    std::cout << "PASS orbit, fuel exhaustion, and pulse control\n";
}
