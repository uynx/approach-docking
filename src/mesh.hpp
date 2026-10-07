#pragma once
#include "physics.hpp"

namespace collision {
struct Hit { bool hit=false;double distance=0;flight::Vec point,normal;int part=-1; };
Hit ray(int model,flight::Vec origin,flight::Vec direction,double length,int broken=0,int ruptured=0);
struct Body {int model=0;flight::Vec position;flight::Quat attitude;flight::Vec velocity,spin;int broken=0,ruptured=0;};
struct Contact {bool hit=false;double fraction=1;flight::Vec point,normal;int partA=-1,partB=-1;};
Contact sweep(const Body&,const Body&,double seconds);
}
