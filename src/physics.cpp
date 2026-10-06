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
double altitude(const State& s) {return length(add(s.position,{0,orbit_radius,0}))-6371000;}
double air_density(double h) {
    const double heights[]={0,10000,20000,30000,40000,50000,60000,70000,80000,90000,100000,110000,120000,150000,200000,300000,400000};
    const double densities[]={1.225,.41351,.088910,.018410,.0039957,.0010269,.00030968,8.2829e-5,1.8458e-5,3.44e-6,5.6044e-7,9.6734e-8,2.2199e-8,2.0752e-9,2.5407e-10,1.9159e-11,2.8028e-12};
    if(h<=0)return densities[0];
    for(int i=1;i<17;++i)if(h<=heights[i])return densities[i-1]*__builtin_exp(__builtin_log(densities[i]/densities[i-1])*(h-heights[i-1])/(heights[i]-heights[i-1]));
    return densities[16]*__builtin_exp(-(h-400000)/60000);
}
Vec air_velocity(const State& s) {
    const double rate=mean_motion()-7.2921159e-5;
    return add(s.velocity,{0,-rate*s.position.z,rate*(orbit_radius+s.position.y)});
}
double heat_flux(const State& s) {
    const double speed=length(air_velocity(s));
    return 1.74153e-4*__builtin_sqrt(air_density(altitude(s))/1.35)*speed*speed*speed;
}
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
double absolute(double x) { return x < 0 ? -x : x; }
double maximum(double a,double b) { return a>b?a:b; }
double minimum(double a,double b) { return a<b?a:b; }
double box_distance(Vec p,Vec center,Vec half) {
    const Vec d={absolute(p.x-center.x)-half.x,absolute(p.y-center.y)-half.y,absolute(p.z-center.z)-half.z};
    return length({maximum(d.x,0),maximum(d.y,0),maximum(d.z,0)})+minimum(maximum(d.x,maximum(d.y,d.z)),0);
}
double cylinder_distance(Vec p,double x,double radius,double front,double back) {
    const double a=__builtin_sqrt((p.x-x)*(p.x-x)+p.y*p.y)-radius;
    const double b=absolute(p.z-(front+back)*0.5)-(back-front)*0.5;
    return __builtin_sqrt(maximum(a,0)*maximum(a,0)+maximum(b,0)*maximum(b,0))+minimum(maximum(a,b),0);
}
double station_distance(Vec p,int broken=0,int ruptured=0) {
    double d=cylinder_distance(p,0,3.6,8,22);
    d=minimum(d,box_distance(p,{0,0,13},{33,0.9,1.1}));
    for(int port=0;port<2;++port) {
        const double x=port?18.0:-18.0;
        d=minimum(d,cylinder_distance(p,x,2.8,3,15));
        if(!(ruptured&(1<<port)))for(int side=-1;side<=1;side+=2)d=minimum(d,length(add(p,{-x-side*0.9,3.1,-13}))-0.6);
        const double radial=__builtin_sqrt((p.x-x)*(p.x-x)+p.y*p.y);
        const double cone=(radial-0.9-0.95*(p.z-1))/__builtin_sqrt(1+0.95*0.95);
        d=minimum(d,maximum(cone,maximum(1-p.z,p.z-3)));
        d=minimum(d,cylinder_distance(p,x,0.9,0.2,1));
        d=minimum(d,cylinder_distance(p,x,0.65,0.305,0.33));
        d=minimum(d,__builtin_sqrt((radial-0.72)*(radial-0.72)+(p.z-0.07)*(p.z-0.07))-0.07);
        for(int side=-1;side<=1;side+=2) for(int vertical=-1;vertical<=1;vertical+=2) {
            const int panel=port*4+(side>0?2:0)+(vertical>0?1:0);
            if(!(broken&(1<<panel)))d=minimum(d,box_distance(p,{x+side*8.5,vertical*8.0,13},{3.8,7,0.06}));
        }
        d=minimum(d,box_distance(p,{x,6,19},{2.5,3,0.075}));
    }
    return d;
}
Vec inertia(double fuel);
const Vec station_inertia={2e7,1.5e8,1.5e8};
Vec inverse_inertia(Quat q,Vec inert,Vec v) {
    v=rotate(conjugate(q),v);
    return rotate(q,{v.x/inert.x,v.y/inert.y,v.z/inert.z});
}
bool station_contact(State& s,int slot,const Station& station) {
    const Vec center=add(s.position,{slot?18.0:-18.0,0,-3.2});
    const Vec relative=add(s.omega,scale(rotate(conjugate(s.attitude),{mean_motion(),0,0}),-1));
    if(length(center)>80+length(s.velocity)*step_seconds)return false;
    double earliest=2;Vec hit_point{},hit_normal{},hit_arm{};int contacts=0;
    auto distance_to_station=[&](Vec p) {return station_distance(add(rotate(conjugate(station.attitude),add(p,{0,0,-13})),{0,0,13}),station.broken_panels,station.ruptured_tanks);};
    auto contact=[&](Vec local,double radius) {
        const Vec arm=rotate(s.attitude,local), end=add(center,arm);
        const Vec velocity=add(s.velocity,rotate(s.attitude,cross(relative,local)));
        const Vec delta=scale(velocity,step_seconds), start=add(end,scale(delta,-1));
        const double distance=length(delta);
        double t=0;
        for(int i=0;i<12;++i) {
            const Vec p=add(start,scale(delta,t));
            const double gap=distance_to_station(p)-radius;
            if(gap<=0.00001) {
                constexpr double h=0.0001;
                Vec normal={distance_to_station(add(p,{h,0,0}))-distance_to_station(add(p,{-h,0,0})),
                    distance_to_station(add(p,{0,h,0}))-distance_to_station(add(p,{0,-h,0})),
                    distance_to_station(add(p,{0,0,h}))-distance_to_station(add(p,{0,0,-h}))};
                const double n=length(normal);
                normal=n>1e-12?scale(normal,1/n):Vec{0,0,-1};
                if(t<earliest-0.0001) {earliest=t;contacts=0;hit_point={};hit_normal={};hit_arm={};}
                if(t<=earliest+0.0001) {
                    hit_point=add(hit_point,add(p,scale(normal,-radius)));hit_normal=add(hit_normal,normal);
                    hit_arm=add(hit_arm,add(arm,scale(normal,-radius)));++contacts;
                }
                return;
            }
            if(t>=1 || distance<1e-12) break;
            t=minimum(1,t+maximum(gap/distance,0.0001));
        }
    };
    for(int ring=0;ring<7;++ring) {
        const double z[]={-1.7,-0.7,0.5,1.4,2.1,2.65,3.145};
        const double r[]={1.29,1.30,1.30,1.30,0.96,0.64,0.72};
        for(int a=0;a<24;++a) {
            const double angle=a*6.283185307179586/24;
            contact({r[ring]*__builtin_cos(angle),r[ring]*__builtin_sin(angle),z[ring]},ring==6?0.055:0.045);
        }
    }
    contact({0,0,-0.4},1.3);contact({0,0,0.7},1.25);
    if(!contacts)return false;
    s.impact_point=scale(hit_point,1.0/contacts);s.impact_arm=scale(hit_arm,1.0/contacts);
    s.impact_normal=scale(hit_normal,1/maximum(length(hit_normal),1e-12));
    const Vec station_arm=add(s.impact_point,{0,0,-13});
    const Vec contact_velocity=add(add(s.velocity,cross(rotate(s.attitude,relative),s.impact_arm)),
        scale(cross(rotate(station.attitude,station.omega),station_arm),-1));
    s.impact_speed=maximum(0,-dot(contact_velocity,s.impact_normal));
    s.position=add(s.position,scale(s.velocity,step_seconds*(earliest-1)));
    const Vec p=add(rotate(conjugate(station.attitude),station_arm),{0,0,13});
    const bool panel=absolute(p.y)>1 && absolute(p.z-13)<0.2;
    const bool collar=p.z<1.2;
    s.crush_force=panel?2000:collar?80000:20000;
    s.station_share=panel?0.95:collar?0.15:0.55;
    s.impact_part=-1;
    if(panel)for(int port=0;port<2;++port)for(int side=-1;side<=1;side+=2) {
        const double x=(port?18:-18)+side*8.5;
        if(absolute(p.x-x)<=3.85)s.impact_part=port*4+(side>0?2:0)+(p.y>0?1:0);
    }
    s.impact_age=0;s.impact_mass=0;s.burned_fuel=0;s.station_burned_fuel=0;++s.impact_sequence;
    return true;
}
State port_relative(const State& s,int slot,const Station& station) {
    State relative=s;
    const Vec com=add(s.position,{slot?18.0:-18.0,0,-3.2});
    const Vec nose_arm=rotate(s.attitude,{0,0,3.2});
    const Vec port_arm=rotate(station.attitude,{slot?18.0:-18.0,0,-13});
    const Vec port=add(port_arm,{0,0,13});
    relative.position=rotate(conjugate(station.attitude),add(add(com,nose_arm),scale(port,-1)));
    const Vec spin=add(rotate(s.attitude,s.omega),{-mean_motion(),0,0});
    relative.velocity=rotate(conjugate(station.attitude),add(add(s.velocity,cross(spin,nose_arm)),scale(cross(rotate(station.attitude,station.omega),port_arm),-1)));
    relative.attitude=mul(conjugate(station.attitude),s.attitude);
    const Vec body_relative=rotate(conjugate(s.attitude),add(spin,scale(rotate(station.attitude,station.omega),-1)));
    relative.omega=add(body_relative,rotate(conjugate(relative.attitude),{mean_motion(),0,0}));
    return relative;
}
void judge(State& s,int slot,const Station& station) {

    if(altitude(s)<=0) {
        s.position=add(scale(add(s.position,{0,orbit_radius,0}),6371001.8/length(add(s.position,{0,orbit_radius,0}))),{0,-orbit_radius,0});
        s.velocity={};s.omega={};s.status=4;return;
    }
    if(s.status) {
        if(s.status==2 && s.impact_age>0) {
            State candidate=s;
            if(station_contact(candidate,slot,station) && candidate.impact_speed>0.05)s=candidate;
        }
        return;
    }
    const State capture=port_relative(s,slot,station);
    if (dockable(capture)) {
        const double lateral=__builtin_sqrt(capture.position.x*capture.position.x+capture.position.y*capture.position.y);
        const double precision=clamp(1-(lateral/0.25+alignment(capture)/3+length(capture.velocity)/0.16+relative_spin(capture)/0.5)/4,0,1);
        s.status=1;
        s.score=600*precision+300*s.fuel/80+100*clamp(1-s.elapsed/900,0,1);
    } else if (station_contact(s,slot,station)) {
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
        const Vec airflow=air_velocity(s);
        acc=add(acc,scale(airflow,-0.5*air_density(altitude(s))*1.5*3.141592653589793*1.35*1.35*length(airflow)/mass));
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
void integrate_attitude(Quat& q,Vec& omega,Vec inert,double dt,bool orbit) {
    const Vec momentum={inert.x*omega.x,inert.y*omega.y,inert.z*omega.z};
    const Vec gyro=scale(cross(omega,momentum),-1);
    Vec half=add(omega,{gyro.x/inert.x*dt/2,gyro.y/inert.y*dt/2,gyro.z/inert.z*dt/2});
    Vec relative=half;
    if(orbit)relative=add(relative,scale(rotate(conjugate(q),{mean_motion(),0,0}),-1));
    const double angle=length(relative)*dt;
    if(angle>1e-14) {
        const Vec axis=scale(relative,__builtin_sin(angle/2)/length(relative));
        q=mul(q,{__builtin_cos(angle/2),axis.x,axis.y,axis.z});
        const double norm=__builtin_sqrt(q.w*q.w+q.x*q.x+q.y*q.y+q.z*q.z);
        q={q.w/norm,q.x/norm,q.y/norm,q.z/norm};
    }
    const Vec middle=cross(half,{inert.x*half.x,inert.y*half.y,inert.z*half.z});
    omega=add(omega,{-middle.x/inert.x*dt,-middle.y/inert.y*dt,-middle.z/inert.z*dt});
}
void advance(State& s, const Controls& controls, double dt, bool orbit) {
    if (!(dt > 0 && dt <= 0.05)) return;
    if(s.status && (s.status!=2 || length(s.impact_normal)<0.5))return;
    if(s.status==2) {
        const double age=s.impact_age;
        s.status=0;advance(s,{},dt,orbit);s.status=2;s.impact_age=age+dt;
        return;
    }
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
            const Vec f = scale(axes[i],880*sign);
            force = add(force,scale(f,2));
            torque = add(torque,add(cross(arms[i],f),cross(scale(arms[i],-1),f)));
        } else {
            const int axis=i-3;
            const Vec direction=axis==0 ? Vec{0,0,1} : arms[axis];
            const Vec arm=scale(direction,1.5);
            const Vec f=scale(cross(axes[axis],direction),55*sign);
            torque=add(torque,scale(cross(arm,f),2));
        }
        total_thrust += i < 3 ? 1760 : 110;
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
void advance_system(State* states,const Controls* controls,int count,Station& station,double dt,bool orbit,int first_slot) {
    if(!(dt>0 && dt<=0.05) || count<1 || count>2)return;
    Vec impulse{};
    for(int i=0;i<count;++i) {
        auto& s=states[i];
        if(s.status!=2 || length(s.impact_normal)<0.5 || s.impact_age>0)continue;
        const Vec n=s.impact_normal,arm=s.impact_arm,station_arm=add(s.impact_point,{0,0,-13});
        const Vec ship_response=inverse_inertia(s.attitude,inertia(s.fuel),cross(arm,n));
        const Vec station_response=inverse_inertia(station.attitude,station_inertia,cross(station_arm,n));
        s.impact_mass=1/(1/(2120+s.fuel)+1/420000.0+dot(n,cross(ship_response,arm))+dot(n,cross(station_response,station_arm)));
        double j=1.08*s.impact_mass*s.impact_speed;
        if(s.impact_part>=0) {
            const double energy=0.5*s.impact_mass*s.impact_speed*s.impact_speed;
            if(energy>700) {
                j=s.impact_mass*(s.impact_speed-__builtin_sqrt(s.impact_speed*s.impact_speed-1400/s.impact_mass));
                station.broken_panels|=1<<static_cast<int>(s.impact_part);
            }
        }
        s.velocity=add(s.velocity,scale(n,j/(2120+s.fuel)));
        s.omega=add(s.omega,rotate(conjugate(s.attitude),scale(ship_response,j)));
        station.omega=add(station.omega,rotate(conjugate(station.attitude),scale(station_response,-j)));
        impulse=add(impulse,scale(n,-j/420000));
        const double energy=0.5*s.impact_mass*s.impact_speed*s.impact_speed;
        const Vec local=rotate(conjugate(s.attitude),arm);
        if(energy>2000 && local.z<0 && local.z>-1.7 && absolute(local.x)>0.8) {
            s.burned_fuel=s.fuel;s.fuel=0;
        }
        const Vec point=add(rotate(conjugate(station.attitude),station_arm),{0,0,13});
        for(int tank=0;tank<2;++tank)if(!(station.ruptured_tanks&(1<<tank)) && energy>2000
            && length(add(point,{tank?-18.0:18.0,3.1,-13}))<1.8) {
            station.ruptured_tanks|=1<<tank;s.station_burned_fuel=60;
        }
    }
    station.velocity=add(station.velocity,impulse);
    station.position=add(station.position,scale(station.velocity,dt));
    integrate_attitude(station.attitude,station.omega,station_inertia,dt,false);
    for(int i=0;i<count;++i) {
        if(states[i].status==1) {
            const double x=i+first_slot?18.0:-18.0;
            const Vec arm=rotate(station.attitude,{x,0,-16.2});
            states[i].position=add(add(arm,{0,0,13}),{-x,0,3.2});
            states[i].attitude=station.attitude;
            states[i].velocity=cross(rotate(station.attitude,station.omega),arm);
            states[i].omega=add(station.omega,rotate(conjugate(station.attitude),{mean_motion(),0,0}));
        } else states[i].velocity=add(states[i].velocity,scale(impulse,-1));
        advance(states[i],controls[i],dt,orbit);
    }
}

}
