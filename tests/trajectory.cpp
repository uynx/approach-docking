#include "physics.hpp"
#include <iomanip>
#include <iostream>
int main() {
    auto s=flight::initial();
    for (int i=0;i<7200;++i) {
        flight::Controls c;
        c.axis[2]=i<1200?1:0;
        c.axis[3]=i>=1200 && i<1260 ? 0.2 : 0;
        c.axis[0]=i>=1800 && i<2100 ? -0.2 : 0;
        flight::advance(s,c,flight::step_seconds);
    }
    std::cout << std::setprecision(17);
    for (double v : {s.position.x,s.position.y,s.position.z,s.velocity.x,s.velocity.y,s.velocity.z,
        s.attitude.w,s.attitude.x,s.attitude.y,s.attitude.z,s.omega.x,s.omega.y,s.omega.z,s.fuel,s.elapsed})
        std::cout << v << '\n';
}
