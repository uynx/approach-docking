#include "physics.hpp"
#include <cmath>
#include <iostream>
#include <stdexcept>

void near(double value, double expected, double tolerance, const char* message) {
    if (!std::isfinite(value) || std::abs(value - expected) > tolerance)
        throw std::runtime_error(message);
}
int main() {
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
    if (s.velocity.z < 0.19 || s.velocity.z > 0.21) throw std::runtime_error("paired 220 N jets accelerate a 2200 kg ship");
    near(s.fuel, 80 - 440.0 / (220 * 9.80665), 1e-9, "propellant follows specific impulse");
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
    s = {};
    s.fuel = 0;
    flight::advance(s,c,1.0/120,false);
    near(flight::length(s.omega),0,1e-12,"empty tanks cannot turn the spacecraft");
    s = flight::initial();
    s.position={0,0,0};
    s.velocity={0,0,0};
    if (!flight::dockable(s)) throw std::runtime_error("aligned stationary ship can dock");
    s.velocity.z=1;
    if (flight::dockable(s)) throw std::runtime_error("fast impact cannot dock");
    s.velocity={}; s.omega.z=0.1;
    if (flight::dockable(s)) throw std::runtime_error("spinning spacecraft cannot dock");
    s=flight::initial(); s.position={0,0,-0.05}; s.velocity={0,0,0.05};
    flight::judge(s);
    if (s.status != 1 || s.score <= 0) throw std::runtime_error("valid capture earns a score");
    s=flight::initial(); s.position={0,0,-0.05}; s.velocity={0,0,3};
    flight::judge(s);
    if (s.status != 2 || s.score != 0) throw std::runtime_error("hard impact ends the attempt");
    std::cout << "PASS docking envelope\n";
    s=flight::initial(); s.position={};
    for (int i=0;i<12000;++i) flight::advance(s,{},flight::step_seconds);
    near(flight::length(s.position),0,1e-9,"station reference orbit remains stationary in its own frame");
    near(flight::alignment(s),0,1e-6,"inertial spin follows the station frame");
    auto coarse=flight::initial(), fine=coarse;
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
    near(s.fuel,80-440*0.05/(220*9.80665),1e-9,"fine control uses one 50 ms pulse per 250 ms");
    std::cout << "PASS orbit, fuel exhaustion, and pulse control\n";
}
