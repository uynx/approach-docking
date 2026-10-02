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
};
struct Controls { double axis[6] = {}; };
constexpr double step_seconds = 1.0 / 120.0;
constexpr double orbit_radius = 6771000;
constexpr double earth_mu = 3.986004418e14;
Vec add(Vec, Vec);
Vec scale(Vec, double);
double length(Vec);
Vec rotate(Quat, Vec);
State initial();
double alignment(const State&);
double relative_spin(const State&);
bool dockable(const State&);
void judge(State&);
void advance(State&, const Controls&, double dt, bool orbit = true);
}
