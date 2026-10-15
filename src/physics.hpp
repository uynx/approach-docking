#pragma once

namespace flight {
struct Vec { double x = 0, y = 0, z = 0; };
struct Quat { double w = 1, x = 0, y = 0, z = 0; };
struct State {
    Vec position, velocity;
    Quat attitude;
    Vec omega;
    double fuel = 80;
    double elapsed = 0;
    int status = 0;
    double score = 0;
    Vec impact_normal, impact_point, impact_arm;
    double impact_mass = 0, crush_force = 80000, station_share = 0.15;
    double impact_speed = 0, impact_age = 0;
    double impact_sequence = 0, impact_part = -1, burned_fuel = 0, station_burned_fuel = 0;
    int impact_body = 0;
};
struct Satellite {Vec position,velocity,omega;Quat attitude;};
Satellite initial_satellite(int);
struct Station {
    Vec position, velocity, omega; Quat attitude; int broken_panels = 0, ruptured_tanks = 0;
    Satellite satellites[3]={initial_satellite(0),initial_satellite(1),initial_satellite(2)};
};
struct Controls {
    double axis[6] = {};
    double efficiency[12]={1,1,1,1,1,1,1,1,1,1,1,1};
    double translation=1, rotation=1, specific_impulse=220;
};
constexpr double step_seconds = 1.0 / 120.0;
constexpr double orbit_radius = 6771000;
constexpr double earth_mu = 3.986004418e14;
Vec add(Vec, Vec);
Vec scale(Vec, double);
double length(Vec);
Vec rotate(Quat, Vec);
State initial(unsigned seed = 0);
double air_density(double altitude);
double altitude(const State&);
double heat_flux(const State&);
Vec air_velocity(const State&);
double alignment(const State&);
double relative_spin(const State&);
bool dockable(const State&);
State port_relative(const State&, int slot, const Station&);
void judge(State&, int slot = 0, const Station& station = {});
void advance(State&, const Controls&, double dt, bool orbit = true);
void advance_system(State*, const Controls*, int count, Station&, double dt, bool orbit = true, int first_slot = 0);
}
