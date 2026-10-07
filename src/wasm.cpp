#include "state_io.hpp"

static flight::State state;
static flight::State opponent;
static bool opponent_present=false;
// wasm-ld repeats dynamic global constructors when an export is called.
static flight::Station station{{},{},{},{},0,0,{}};
extern "C" {
void reset_flight(unsigned seed) { state=flight::initial(seed);opponent=flight::initial(seed);station={};opponent_present=false; }
int state_size() { return flight::state_size; }
int station_size() { return flight::station_size; }
double component(int index) { return flight::component(state,index); }
void restore(int index,double value) { flight::restore(state,index,value); }
void restore_opponent(int index,double value) { flight::restore(opponent,index,value); }
void set_opponent(int present) { opponent_present=present!=0; }
double opponent_component(int index) { return flight::component(opponent,index); }
void step_flight(double x,double y,double z,double pitch,double yaw,double roll,int slot) {
    const flight::Controls controls={{x,y,z,pitch,yaw,roll}};
    if(opponent_present) {
        flight::State states[2];flight::Controls inputs[2]={};
        states[slot]=state;states[1-slot]=opponent;inputs[slot]=controls;
        flight::advance_system(states,inputs,2,station,flight::step_seconds);
        state=states[slot];opponent=states[1-slot];
    } else flight::advance_system(&state,&controls,1,station,flight::step_seconds,true,slot);
}
double station_component(int index) { return flight::component(station,index); }
void restore_station(int index,double value) { flight::restore(station,index,value); }
double guidance_component(int index,int slot) {
    return index>=0&&index<13?flight::component(flight::port_relative(state,slot,station),index):0;
}
double flight_altitude() { return flight::altitude(state); }
double flight_heat() { return flight::heat_flux(state); }
double flight_airspeed() { return flight::length(flight::air_velocity(state)); }
double flight_alignment() { return flight::alignment(state); }
double flight_spin() { return flight::relative_spin(state); }
void judge_flight(int slot) { flight::judge(state,slot,station); }
}
