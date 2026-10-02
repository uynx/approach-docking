#include "physics.hpp"

static flight::State state;
extern "C" {
void reset_flight() { state=flight::initial(); }
double component(int index) {
    const double values[]={state.position.x,state.position.y,state.position.z,
        state.velocity.x,state.velocity.y,state.velocity.z,
        state.attitude.w,state.attitude.x,state.attitude.y,state.attitude.z,
        state.omega.x,state.omega.y,state.omega.z,state.fuel,state.elapsed,
        static_cast<double>(state.status),state.score};
    return index>=0 && index<17 ? values[index] : 0;
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
}
void step_flight(double x,double y,double z,double pitch,double yaw,double roll) {
    flight::advance(state,{{x,y,z,pitch,yaw,roll}},flight::step_seconds);
}
double flight_alignment() { return flight::alignment(state); }
double flight_spin() { return flight::relative_spin(state); }
}
