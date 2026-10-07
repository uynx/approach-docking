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
    require(collision::ray(2,{0,0,-4},{0,0,1},8).hit,"the satellite hull has a mesh collider");
    require(collision::ray(2,{4.7,0,-4},{0,0,1},8).hit,"the satellite solar wing has a mesh collider");
    require(!collision::ray(2,{1.1,0,-4},{0,0,1},8).hit,"the satellite's gap between hull and wing stays empty");
    collision::Body station{0,{0,0,13}},capsule{1,{-18,0,-2.7},{},{0,0,100}};
    const auto contact=collision::sweep(capsule,station,1.0/120);
    require(contact.hit&&contact.fraction>0.2&&contact.fraction<0.8,"swept mesh contact catches the collar before tunneling");
    require(contact.normal.z<-0.5,"the contact normal opposes the approach");
    collision::Body panelShip{1,{-26.5,8,10.5},{},{0,0,100}},brokenStation=station;
    require(collision::sweep(panelShip,station,1.0/120).hit,"intact solar tiles stop a swept capsule");
    brokenStation.broken=255;
    require(!collision::sweep(panelShip,brokenStation,1.0/120).hit,"removed solar tiles leave open space for the whole sweep");
    collision::Body one{1,{}},two{1,{4,0,0}};
    require(!collision::sweep(one,two,1.0/120).hit,"separate capsules do not collide");
    two.position.x=2.5;two.velocity.x=-100;
    require(collision::sweep(one,two,1.0/120).hit,"capsule meshes collide with each other");
    flight::State crash;flight::Station target;flight::Controls controls;
    crash.position.z=-0.2;crash.velocity.z=30;
    crash.omega.x=std::sqrt(flight::earth_mu/std::pow(flight::orbit_radius,3));
    for(int i=0;i<120;i++){flight::advance_system(&crash,&controls,1,target,flight::step_seconds);flight::judge(crash,0,target);}
    require(crash.impact_speed>25&&crash.impact_mass>2000,"rebounding out of contact must preserve the main impact event");
    require(crash.impact_sequence<=2,"a receding capsule must not collide again with the surface it just left");
    std::cout<<"PASS physical mesh coverage and empty space\n";
}
