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
    collision::Body station{0,{0,0,13}},capsule{1,{-18,0,-2.7},{},{0,0,100}};
    const auto contact=collision::sweep(capsule,station,1.0/120);
    require(contact.hit&&contact.fraction>0.2&&contact.fraction<0.8,"swept mesh contact catches the collar before tunneling");
    require(contact.normal.z<-0.5,"the contact normal opposes the approach");
    collision::Body one{1,{}},two{1,{4,0,0}};
    require(!collision::sweep(one,two,1.0/120).hit,"separate capsules do not collide");
    two.position.x=2.5;two.velocity.x=-100;
    require(collision::sweep(one,two,1.0/120).hit,"capsule meshes collide with each other");
    std::cout<<"PASS physical mesh coverage and empty space\n";
}
