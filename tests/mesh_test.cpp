#include "mesh.hpp"
#include <cmath>
#include <stdexcept>
#include <iostream>

void require(bool ok,const char* message){if(!ok)throw std::runtime_error(message);}
int main() {
    const auto empty=collision::ray(0,{-27.5,0,11},{0,0,1},4);
    require(!empty.hit,"a ray through an empty truss bay must not hit a solid proxy");
    const auto rail=collision::ray(0,{-30,0.8,11},{0,0,1},4);
    require(rail.hit,"the physical truss rail has a mesh collider");
    const auto port=collision::ray(0,{-18,0,-2},{0,0,1},5);
    require(port.hit&&std::abs(port.distance-2.2)<0.0001,"the ray hits the first real collar face");
    const auto nose=collision::ray(1,{0,0,4},{0,0,-1},5);
    require(nose.hit&&nose.distance>0.7&&nose.distance<1.1,"the capsule has actual nose geometry");
    require(!collision::ray(1,{3,3,4},{0,0,-1},10).hit,"empty space beside the capsule stays empty");
    std::cout<<"PASS physical mesh coverage and empty space\n";
}
