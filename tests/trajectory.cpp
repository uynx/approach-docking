#include "state_io.hpp"
#include <iomanip>
#include <iostream>
int main(int argc,char** argv) {
    auto s=flight::initial();
    if(argc>1&&argv[1][0]=='p') {
        flight::State states[]={flight::initial(),flight::initial()};flight::Station station;
        states[0].position={16,0,-30};states[1].position={-16,0,-30};
        const double orbit_rate=__builtin_sqrt(flight::earth_mu/(flight::orbit_radius*flight::orbit_radius*flight::orbit_radius));
        for(auto& body:states){body.attitude={};body.omega={orbit_rate,0,0};body.velocity={};}
        states[0].velocity.x=50;states[1].velocity.x=-50;
        const flight::Controls controls[2]={};
        for(int i=0;i<24;i++)flight::advance_system(states,controls,2,station,flight::step_seconds);
        std::cout<<std::setprecision(17);
        for(const auto& body:states)flight::visit_state(body,[](int,double value){std::cout<<value<<'\n';});
        flight::visit_station(station,[](int,double value){std::cout<<value<<'\n';});return 0;
    }
    if(argc>1) {
        flight::Station station;const bool satellite=argv[1][0]=='s';
        if(satellite) {
            s.position={14,0,-30};s.velocity={50,0,0};s.attitude={};
            s.omega={__builtin_sqrt(flight::earth_mu/(flight::orbit_radius*flight::orbit_radius*flight::orbit_radius)),0,0};
            station.satellites[0]={{0,0,-33.2},{},{},{}};
        } else {s.position={0.35,0.2,-1};s.velocity.z=50;}
        for(int i=0;i<(satellite?12:120);++i){const flight::Controls c;flight::advance_system(&s,&c,1,station,flight::step_seconds);flight::judge(s,0,station);}
        std::cout<<std::setprecision(17);
        for(double value:{s.position.x,s.position.y,s.position.z,s.velocity.x,s.velocity.y,s.velocity.z,
            s.attitude.w,s.attitude.x,s.attitude.y,s.attitude.z,s.omega.x,s.omega.y,s.omega.z,s.fuel,s.elapsed,
            static_cast<double>(s.status),s.score,s.impact_normal.x,s.impact_normal.y,s.impact_normal.z,
            s.impact_speed,s.impact_point.x,s.impact_point.y,s.impact_point.z,s.impact_age,s.impact_arm.x,s.impact_arm.y,s.impact_arm.z,
            s.impact_mass,s.crush_force,s.station_share,s.impact_sequence,s.impact_part,s.burned_fuel,s.station_burned_fuel,static_cast<double>(s.impact_body)})std::cout<<value<<'\n';
        flight::visit_station(station,[](int,double value){std::cout<<value<<'\n';});
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
