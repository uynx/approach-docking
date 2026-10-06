#include "physics.hpp"

static flight::State state;
static flight::Station station;
extern "C" {
void reset_flight() { state=flight::initial();station={}; }
double component(int index) {
    const double values[]={state.position.x,state.position.y,state.position.z,
        state.velocity.x,state.velocity.y,state.velocity.z,
        state.attitude.w,state.attitude.x,state.attitude.y,state.attitude.z,
        state.omega.x,state.omega.y,state.omega.z,state.fuel,state.elapsed,
        static_cast<double>(state.status),state.score,state.impact_normal.x,state.impact_normal.y,state.impact_normal.z,
        state.impact_speed,state.impact_point.x,state.impact_point.y,state.impact_point.z,state.impact_age,state.impact_arm.x,state.impact_arm.y,state.impact_arm.z,
        state.impact_mass,state.crush_force,state.station_share,state.impact_sequence,state.impact_part,state.burned_fuel,state.station_burned_fuel};
    return index>=0 && index<35 ? values[index] : 0;
}
void restore(int index, double value) {
    if (!__builtin_isfinite(value)) return;
    double* values[]={&state.position.x,&state.position.y,&state.position.z,
        &state.velocity.x,&state.velocity.y,&state.velocity.z,
        &state.attitude.w,&state.attitude.x,&state.attitude.y,&state.attitude.z,
        &state.omega.x,&state.omega.y,&state.omega.z,&state.fuel,&state.elapsed};
    if (index>=0 && index<15) *values[index]=value;
    if (index==15) state.status=static_cast<int>(value);
    if (index==16) state.score=value;
    double* impact[]={&state.impact_normal.x,&state.impact_normal.y,&state.impact_normal.z,&state.impact_speed,
        &state.impact_point.x,&state.impact_point.y,&state.impact_point.z,&state.impact_age,
        &state.impact_arm.x,&state.impact_arm.y,&state.impact_arm.z,&state.impact_mass,&state.crush_force,&state.station_share,&state.impact_sequence,&state.impact_part,&state.burned_fuel,&state.station_burned_fuel};
    if(index>=17 && index<35) *impact[index-17]=value;
}
void step_flight(double x,double y,double z,double pitch,double yaw,double roll,int slot) {
    const flight::Controls controls={{x,y,z,pitch,yaw,roll}};
    flight::advance_system(&state,&controls,1,station,flight::step_seconds,true,slot);
}
double station_component(int index) {
    const double values[]={station.position.x,station.position.y,station.position.z,station.velocity.x,station.velocity.y,station.velocity.z,
        station.attitude.w,station.attitude.x,station.attitude.y,station.attitude.z,station.omega.x,station.omega.y,station.omega.z,static_cast<double>(station.broken_panels),static_cast<double>(station.ruptured_tanks)};
    return index>=0&&index<15?values[index]:0;
}
void restore_station(int index,double value) {
    double* values[]={&station.position.x,&station.position.y,&station.position.z,&station.velocity.x,&station.velocity.y,&station.velocity.z,
        &station.attitude.w,&station.attitude.x,&station.attitude.y,&station.attitude.z,&station.omega.x,&station.omega.y,&station.omega.z};
    if(!__builtin_isfinite(value))return;
    if(index>=0&&index<13)*values[index]=value;
    if(index==13)station.broken_panels=static_cast<int>(value);
    if(index==14)station.ruptured_tanks=static_cast<int>(value);
}
double guidance_component(int index,int slot) {
    const auto s=flight::port_relative(state,slot,station);
    const double values[]={s.position.x,s.position.y,s.position.z,s.velocity.x,s.velocity.y,s.velocity.z,
        s.attitude.w,s.attitude.x,s.attitude.y,s.attitude.z,s.omega.x,s.omega.y,s.omega.z};
    return index>=0&&index<13?values[index]:0;
}
double flight_altitude() { return flight::altitude(state); }
double flight_heat() { return flight::heat_flux(state); }
double flight_airspeed() { return flight::length(flight::air_velocity(state)); }
double flight_alignment() { return flight::alignment(state); }
double flight_spin() { return flight::relative_spin(state); }
void judge_flight(int slot) { flight::judge(state,slot,station); }
}
