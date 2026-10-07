#pragma once
#include "physics.hpp"

namespace flight {
constexpr int state_size = 36, station_size = 15;

template<class T, class Visitor>
void visit_state(T& s, Visitor visit) {
    visit(0, s.position.x);
    visit(1, s.position.y);
    visit(2, s.position.z);
    visit(3, s.velocity.x);
    visit(4, s.velocity.y);
    visit(5, s.velocity.z);
    visit(6, s.attitude.w);
    visit(7, s.attitude.x);
    visit(8, s.attitude.y);
    visit(9, s.attitude.z);
    visit(10, s.omega.x);
    visit(11, s.omega.y);
    visit(12, s.omega.z);
    visit(13, s.fuel);
    visit(14, s.elapsed);
    visit(15, s.status);
    visit(16, s.score);
    visit(17, s.impact_normal.x);
    visit(18, s.impact_normal.y);
    visit(19, s.impact_normal.z);
    visit(20, s.impact_speed);
    visit(21, s.impact_point.x);
    visit(22, s.impact_point.y);
    visit(23, s.impact_point.z);
    visit(24, s.impact_age);
    visit(25, s.impact_arm.x);
    visit(26, s.impact_arm.y);
    visit(27, s.impact_arm.z);
    visit(28, s.impact_mass);
    visit(29, s.crush_force);
    visit(30, s.station_share);
    visit(31, s.impact_sequence);
    visit(32, s.impact_part);
    visit(33, s.burned_fuel);
    visit(34, s.station_burned_fuel);
    visit(35, s.impact_body);
}

template<class T, class Visitor>
void visit_station(T& s, Visitor visit) {
    visit(0, s.position.x);
    visit(1, s.position.y);
    visit(2, s.position.z);
    visit(3, s.velocity.x);
    visit(4, s.velocity.y);
    visit(5, s.velocity.z);
    visit(6, s.attitude.w);
    visit(7, s.attitude.x);
    visit(8, s.attitude.y);
    visit(9, s.attitude.z);
    visit(10, s.omega.x);
    visit(11, s.omega.y);
    visit(12, s.omega.z);
    visit(13, s.broken_panels);
    visit(14, s.ruptured_tanks);
}

template<class T>
void restore_field(T& field, double value) { field = static_cast<T>(value); }

inline double component(const State& s, int index) {
    double result = 0;
    visit_state(s, [&](int i, double value) { if(i == index) result = value; });
    return result;
}
inline double component(const Station& s, int index) {
    double result = 0;
    visit_station(s, [&](int i, double value) { if(i == index) result = value; });
    return result;
}
inline void restore(State& s, int index, double value) {
    if(!__builtin_isfinite(value)) return;
    visit_state(s, [&](int i, auto& field) { if(i == index) restore_field(field, value); });
}
inline void restore(Station& s, int index, double value) {
    if(!__builtin_isfinite(value)) return;
    visit_station(s, [&](int i, auto& field) { if(i == index) restore_field(field, value); });
}
}
