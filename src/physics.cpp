#include "physics.hpp"
namespace flight {
Vec add(Vec a, Vec b) { return {a.x+b.x, a.y+b.y, a.z+b.z}; }
Vec scale(Vec a, double b) { return {a.x*b, a.y*b, a.z*b}; }
double dot(Vec a, Vec b) { return a.x*b.x + a.y*b.y + a.z*b.z; }
Vec cross(Vec a, Vec b) { return {a.y*b.z-a.z*b.y, a.z*b.x-a.x*b.z, a.x*b.y-a.y*b.x}; }
double length(Vec a) { return __builtin_sqrt(dot(a,a)); }
double clamp(double v, double lo, double hi) { return v < lo ? lo : v > hi ? hi : v; }
Quat mul(Quat a, Quat b) {
    return {a.w*b.w-a.x*b.x-a.y*b.y-a.z*b.z,
        a.w*b.x+a.x*b.w+a.y*b.z-a.z*b.y,
        a.w*b.y-a.x*b.z+a.y*b.w+a.z*b.x,
        a.w*b.z+a.x*b.y-a.y*b.x+a.z*b.w};
}
Quat conjugate(Quat a) { return {a.w,-a.x,-a.y,-a.z}; }
Vec rotate(Quat q, Vec a) {
    const auto r = mul(mul(q,{0,a.x,a.y,a.z}),conjugate(q));
    return {r.x,r.y,r.z};
}
double mean_motion() { return __builtin_sqrt(earth_mu/(orbit_radius*orbit_radius*orbit_radius)); }
State initial() {
    State s;
    s.position={0,0,-25};
    s.omega={mean_motion(),0,0};
    return s;
}
double alignment(const State& s) {
    const double w=clamp(s.attitude.w < 0 ? -s.attitude.w : s.attitude.w,0,1);
    return 2*__builtin_acos(w)*180/3.141592653589793;
}
double relative_spin(const State& s) {
    return length(add(s.omega,scale(rotate(conjugate(s.attitude),{mean_motion(),0,0}),-1)))*180/3.141592653589793;
}
bool dockable(const State& s) {
    return __builtin_sqrt(s.position.x*s.position.x+s.position.y*s.position.y) <= 0.25
        && s.position.z >= -0.1 && s.position.z <= 0.1 && alignment(s) <= 3
        && s.velocity.z >= 0 && s.velocity.z <= 0.15
        && __builtin_sqrt(s.velocity.x*s.velocity.x+s.velocity.y*s.velocity.y) <= 0.05
        && relative_spin(s) <= 0.5;
}
void judge(State& s) {
    if (s.status) return;
    if (dockable(s)) {
        const double lateral=__builtin_sqrt(s.position.x*s.position.x+s.position.y*s.position.y);
        const double precision=clamp(1-(lateral/0.25+alignment(s)/3+length(s.velocity)/0.16+relative_spin(s)/0.5)/4,0,1);
        s.status=1;
        s.score=600*precision+300*s.fuel/80+100*clamp(1-s.elapsed/900,0,1);
    } else if (s.position.z >= -0.1 || length(s.position)>2000) {
        s.status=2;
    } else if (s.elapsed >= 900) {
        s.status=3;
    }
}
Vec inertia(double fuel) { return {3300+fuel*0.4, 3300+fuel*0.4, 2400+fuel*0.6}; }
struct Derivative { Vec position, velocity; Quat attitude; Vec omega; double fuel; };
Derivative derivative(const State& s, Vec force, Vec torque, double fuel_rate, bool orbit) {
    const double mass = 2120+s.fuel;
    Vec acc = scale(rotate(s.attitude,force),1/mass);
    const Vec inert = inertia(s.fuel);
    if (orbit) {
        const Vec radius = add(s.position,{0,orbit_radius,0});
        const double r = length(radius), n = mean_motion();
        const double g = earth_mu/(r*r*r);
        acc = add(acc,{-g*radius.x,
            -g*radius.y+earth_mu/(orbit_radius*orbit_radius)+n*n*s.position.y+2*n*s.velocity.z,
            -g*radius.z+n*n*s.position.z-2*n*s.velocity.y});
        const Vec radial = rotate(conjugate(s.attitude),scale(radius,1/r));
        torque = add(torque,scale(cross(radial,{inert.x*radial.x,inert.y*radial.y,inert.z*radial.z}),3*g));
    }
    const Vec angular_momentum{inert.x*s.omega.x,inert.y*s.omega.y,inert.z*s.omega.z};
    const Vec net = add(torque,scale(cross(s.omega,angular_momentum),-1));
    Vec relative = s.omega;
    if (orbit) relative = add(relative,scale(rotate(conjugate(s.attitude),{mean_motion(),0,0}),-1));
    auto dq = mul(s.attitude,{0,relative.x,relative.y,relative.z});
    return {s.velocity,acc,{dq.w*0.5,dq.x*0.5,dq.y*0.5,dq.z*0.5},
        {net.x/inert.x,net.y/inert.y,net.z/inert.z},-fuel_rate};
}
State offset(State s, const Derivative& d, double dt) {
    s.position = add(s.position,scale(d.position,dt));
    s.velocity = add(s.velocity,scale(d.velocity,dt));
    s.omega = add(s.omega,scale(d.omega,dt));
    s.attitude = {s.attitude.w+d.attitude.w*dt,s.attitude.x+d.attitude.x*dt,
        s.attitude.y+d.attitude.y*dt,s.attitude.z+d.attitude.z*dt};
    s.fuel += d.fuel*dt;
    return s;
}
void advance(State& s, const Controls& controls, double dt, bool orbit) {
    if (!(dt > 0 && dt <= 0.05) || s.status != 0) return;
    Vec force{}, torque{};
    double total_thrust = 0;
    const Vec axes[] = {{1,0,0},{0,1,0},{0,0,1}};
    const Vec arms[] = {{0,1,0},{0,0,1},{1,0,0}};
    const double phase = (static_cast<int>((s.elapsed+1e-8)/0.05)%5)/5.0;
    for (int i=0;i<6;++i) {
        const double value = __builtin_isfinite(controls.axis[i]) ? clamp(controls.axis[i],-1,1) : 0;
        const double magnitude = value < 0 ? -value : value;
        if (magnitude <= phase || s.fuel <= 0) continue;
        const double sign = value < 0 ? -1 : 1;
        if (i < 3) {
            const Vec f = scale(axes[i],220*sign);
            force = add(force,scale(f,2));
            torque = add(torque,add(cross(arms[i],f),cross(scale(arms[i],-1),f)));
        } else {
            const int axis=i-3;
            const Vec arm=scale(arms[axis],1.5);
            const Vec f=scale(cross(axes[axis],arms[axis]),55*sign);
            torque=add(torque,scale(cross(arm,f),2));
        }
        total_thrust += i < 3 ? 440 : 110;
    }
    const double wanted = total_thrust/(220*9.80665);
    const double fuel_rate = wanted > s.fuel/dt ? s.fuel/dt : wanted;
    const double fraction = wanted > 0 ? fuel_rate/wanted : 0;
    force=scale(force,fraction); torque=scale(torque,fraction);
    const auto a=derivative(s,force,torque,fuel_rate,orbit);
    const auto b=derivative(offset(s,a,dt/2),force,torque,fuel_rate,orbit);
    const auto c=derivative(offset(s,b,dt/2),force,torque,fuel_rate,orbit);
    const auto d=derivative(offset(s,c,dt),force,torque,fuel_rate,orbit);
    s=offset(offset(offset(offset(s,a,dt/6),b,dt/3),c,dt/3),d,dt/6);
    const double norm=__builtin_sqrt(s.attitude.w*s.attitude.w+s.attitude.x*s.attitude.x+s.attitude.y*s.attitude.y+s.attitude.z*s.attitude.z);
    s.attitude={s.attitude.w/norm,s.attitude.x/norm,s.attitude.y/norm,s.attitude.z/norm};
    s.fuel=clamp(s.fuel,0,80);
    s.elapsed+=dt;
}
}
