#pragma once
#include "physics.hpp"

namespace collision {
struct Hit { bool hit=false;double distance=0;flight::Vec point,normal;int part=-1; };
Hit ray(int model,flight::Vec origin,flight::Vec direction,double length,int broken=0,int ruptured=0);
}
