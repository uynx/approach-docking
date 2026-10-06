#include "physics.hpp"
#include <iomanip>
#include <iostream>
int main(int argc,char**) {
    auto s=flight::initial();
    if(argc>1) {
        flight::Station station;s.position={0.35,0.2,-1};s.velocity.z=50;
        for(int i=0;i<120;++i){const flight::Controls c;flight::advance_system(&s,&c,1,station,flight::step_seconds);flight::judge(s,0,station);}
        std::cout<<std::setprecision(17);
        for(double value:{s.position.x,s.position.y,s.position.z,s.velocity.x,s.velocity.y,s.velocity.z,
            s.attitude.w,s.attitude.x,s.attitude.y,s.attitude.z,s.omega.x,s.omega.y,s.omega.z,s.fuel,s.elapsed,
            static_cast<double>(s.status),s.score,s.impact_normal.x,s.impact_normal.y,s.impact_normal.z,
            s.impact_speed,s.impact_point.x,s.impact_point.y,s.impact_point.z,s.impact_age,s.impact_arm.x,s.impact_arm.y,s.impact_arm.z,
            s.impact_mass,s.crush_force,s.station_share,s.impact_sequence,s.impact_part,s.burned_fuel,s.station_burned_fuel,
            station.position.x,station.position.y,station.position.z,station.velocity.x,station.velocity.y,station.velocity.z,
            station.attitude.w,station.attitude.x,station.attitude.y,station.attitude.z,station.omega.x,station.omega.y,station.omega.z,
            static_cast<double>(station.broken_panels),static_cast<double>(station.ruptured_tanks)})std::cout<<value<<'\n';
        return 0;
    }
    for (int i=0;i<7200;++i) {
        flight::Controls c;
        c.axis[2]=i<1200?1:0;
        c.axis[3]=i>=1200 && i<1260 ? 0.2 : 0;
        c.axis[0]=i>=1800 && i<2100 ? -0.2 : 0;
        flight::advance(s,c,flight::step_seconds);
    }
    std::cout << std::setprecision(17);
    for (double v : {s.position.x,s.position.y,s.position.z,s.velocity.x,s.velocity.y,s.velocity.z,
        s.attitude.w,s.attitude.x,s.attitude.y,s.attitude.z,s.omega.x,s.omega.y,s.omega.z,s.fuel,s.elapsed})
        std::cout << v << '\n';
}
