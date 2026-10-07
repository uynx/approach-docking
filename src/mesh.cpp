#include "mesh.hpp"
namespace collision {
struct Triangle {int a,b,c,part;};
struct Part {int panel,tank,kind;double mass;};
struct Node {flight::Vec low,high;int left,right,start,count;};
}
#include "mesh-data.hpp"

namespace collision {
using flight::Vec;
int panel(int part){return part>=0&&part<static_cast<int>(sizeof(parts)/sizeof(parts[0]))?parts[part].panel:-1;}
Vec sub(Vec a,Vec b){return flight::add(a,flight::scale(b,-1));}
Vec cross(Vec a,Vec b){return {a.y*b.z-a.z*b.y,a.z*b.x-a.x*b.z,a.x*b.y-a.y*b.x};}
double dot(Vec a,Vec b){return a.x*b.x+a.y*b.y+a.z*b.z;}
double axis(Vec a,int i){return i==0?a.x:i==1?a.y:a.z;}
bool bounds(const Node& node,Vec origin,Vec direction,double limit) {
    double near=0,far=limit;
    for(int i=0;i<3;i++) {
        const double d=axis(direction,i),o=axis(origin,i),lo=axis(node.low,i),hi=axis(node.high,i);
        if(__builtin_fabs(d)<1e-14){if(o<lo||o>hi)return false;continue;}
        double a=(lo-o)/d,b=(hi-o)/d;if(a>b){const double t=a;a=b;b=t;}
        near=near>a?near:a;far=far<b?far:b;if(near>far)return false;
    }
    return true;
}
Hit ray(int model,Vec origin,Vec direction,double limit,int broken,int ruptured) {
    Hit hit;hit.distance=limit;
    if(model<0||model>1||limit<0)return hit;
    int stack[64],count=1;stack[0]=roots[model];
    while(count) {
        const auto& node=nodes[stack[--count]];
        if(!bounds(node,origin,direction,hit.distance))continue;
        if(node.count==0){stack[count++]=node.left;stack[count++]=node.right;continue;}
        for(int i=node.start;i<node.start+node.count;i++) {
            const auto& triangle=triangles[i];const auto& part=parts[triangle.part];
            if((part.panel>=0&&(broken&(1<<part.panel)))||(model==0&&part.tank>=0&&(ruptured&(1<<part.tank))))continue;
            const auto a=vertices[triangle.a],ab=sub(vertices[triangle.b],a),ac=sub(vertices[triangle.c],a);
            const auto p=cross(direction,ac);const double determinant=dot(ab,p);
            if(__builtin_fabs(determinant)<1e-14)continue;
            const double inverse=1/determinant;const auto offset=sub(origin,a);
            const double u=dot(offset,p)*inverse;if(u<0||u>1)continue;
            const auto q=cross(offset,ab);const double v=dot(direction,q)*inverse;if(v<0||u+v>1)continue;
            const double distance=dot(ac,q)*inverse;if(distance<0||distance>hit.distance)continue;
            const auto normal=cross(ab,ac);hit={true,distance,flight::add(origin,flight::scale(direction,distance)),flight::scale(normal,1/flight::length(normal)),triangle.part};
        }
    }
    return hit;
}

double clamp(double value,double low,double high){return value<low?low:value>high?high:value;}
Vec blend(Vec a,Vec b,double t){return flight::add(a,flight::scale(sub(b,a),t));}
Vec closest(Vec p,Vec a,Vec b,Vec c) {
    const auto ab=sub(b,a),ac=sub(c,a),ap=sub(p,a);
    const double d1=dot(ab,ap),d2=dot(ac,ap);
    if(d1<=0&&d2<=0)return a;
    const auto bp=sub(p,b);const double d3=dot(ab,bp),d4=dot(ac,bp);
    if(d3>=0&&d4<=d3)return b;
    const double vc=d1*d4-d3*d2;
    if(vc<=0&&d1>=0&&d3<=0)return flight::add(a,flight::scale(ab,d1/(d1-d3)));
    const auto cp=sub(p,c);const double d5=dot(ab,cp),d6=dot(ac,cp);
    if(d6>=0&&d5<=d6)return c;
    const double vb=d5*d2-d1*d6;
    if(vb<=0&&d2>=0&&d6<=0)return flight::add(a,flight::scale(ac,d2/(d2-d6)));
    const double va=d3*d6-d5*d4;
    if(va<=0&&d4-d3>=0&&d5-d6>=0)return blend(b,c,(d4-d3)/(d4-d3+d5-d6));
    const double inverse=1/(va+vb+vc);
    return flight::add(a,flight::add(flight::scale(ab,vb*inverse),flight::scale(ac,vc*inverse)));
}
bool pierce(Vec start,Vec end,const Vec* triangle,Vec& point) {
    const auto direction=sub(end,start),ab=sub(triangle[1],triangle[0]),ac=sub(triangle[2],triangle[0]);
    const auto p=cross(direction,ac);const double determinant=dot(ab,p);
    if(__builtin_fabs(determinant)<1e-14)return false;
    const double inverse=1/determinant;const auto offset=sub(start,triangle[0]);
    const double u=dot(offset,p)*inverse;if(u<0||u>1)return false;
    const auto q=cross(offset,ab);const double v=dot(direction,q)*inverse;if(v<0||u+v>1)return false;
    const double t=dot(ac,q)*inverse;if(t<0||t>1)return false;
    point=blend(start,end,t);return true;
}
struct Nearest {double squared=1e100;Vec a,b;};
void consider(Nearest& result,Vec a,Vec b) {
    const double squared=dot(sub(a,b),sub(a,b));
    if(squared<result.squared)result={squared,a,b};
}
void segments(Nearest& result,Vec p,Vec q,Vec r,Vec s) {
    const auto d1=sub(q,p),d2=sub(s,r),offset=sub(p,r);
    const double a=dot(d1,d1),e=dot(d2,d2),b=dot(d1,d2),c=dot(d1,offset),f=dot(d2,offset);
    double u=0,v=0;
    if(a<=1e-20&&e<=1e-20){consider(result,p,r);return;}
    if(a<=1e-20)v=clamp(f/e,0,1);
    else if(e<=1e-20)u=clamp(-c/a,0,1);
    else {
        const double denominator=a*e-b*b;
        if(denominator>1e-20)u=clamp((b*f-c*e)/denominator,0,1);
        v=(b*u+f)/e;
        if(v<0){v=0;u=clamp(-c/a,0,1);}else if(v>1){v=1;u=clamp((b-c)/a,0,1);}
    }
    consider(result,blend(p,q,u),blend(r,s,v));
}
Nearest nearest(const Vec* a,const Vec* b) {
    Nearest result;
    for(int i=0;i<3;i++) {
        Vec point;
        if(pierce(a[i],a[(i+1)%3],b,point)||pierce(b[i],b[(i+1)%3],a,point))return {0,point,point};
        consider(result,a[i],closest(a[i],b[0],b[1],b[2]));
        consider(result,closest(b[i],a[0],a[1],a[2]),b[i]);
        for(int j=0;j<3;j++)segments(result,a[i],a[(i+1)%3],b[j],b[(j+1)%3]);
    }
    return result;
}
struct Motion {Body body;Vec translation,pivot,start[3],end[3];};
flight::Quat multiply(flight::Quat a,flight::Quat b) {
    return {a.w*b.w-a.x*b.x-a.y*b.y-a.z*b.z,a.w*b.x+a.x*b.w+a.y*b.z-a.z*b.y,
        a.w*b.y-a.x*b.z+a.y*b.w+a.z*b.x,a.w*b.z+a.x*b.y-a.y*b.x+a.z*b.w};
}
Motion motion(const Body& body,double dt) {
    const double spin=flight::length(body.spin),angle=spin*dt/2;
    const auto axis=flight::scale(body.spin,spin>0?-__builtin_sin(angle)/spin:0);
    const auto previous=multiply(body.attitude,{__builtin_cos(angle),axis.x,axis.y,axis.z});
    Motion result{body,flight::scale(body.velocity,dt),body.model==0?Vec{0,0,13}:Vec{}, {}, {}};
    for(int i=0;i<3;i++){const Vec axis{i==0?1.0:0,i==1?1.0:0,i==2?1.0:0};result.start[i]=flight::rotate(previous,axis);result.end[i]=flight::rotate(body.attitude,axis);}
    return result;
}
Vec transform(const Vec* basis,Vec p){return flight::add(flight::add(flight::scale(basis[0],p.x),flight::scale(basis[1],p.y)),flight::scale(basis[2],p.z));}
struct Path {Vec start,end;};
Path path(const Motion& body,Vec vertex) {
    vertex=sub(vertex,body.pivot);
    return {flight::add(sub(body.body.position,body.translation),transform(body.start,vertex)),
        flight::add(body.body.position,transform(body.end,vertex))};
}
struct Bounds {Vec low{1e100,1e100,1e100},high{-1e100,-1e100,-1e100};};
void include(Bounds& box,Vec p) {
    box.low={box.low.x<p.x?box.low.x:p.x,box.low.y<p.y?box.low.y:p.y,box.low.z<p.z?box.low.z:p.z};
    box.high={box.high.x>p.x?box.high.x:p.x,box.high.y>p.y?box.high.y:p.y,box.high.z>p.z?box.high.z:p.z};
}
Bounds swept_bounds(const Motion& body,const Node& node,double limit) {
    Bounds box;const auto center=path(body,flight::scale(flight::add(node.low,node.high),0.5));
    const auto half=flight::scale(sub(node.high,node.low),0.5);
    Vec basis[3];for(int i=0;i<3;i++)basis[i]=blend(body.start[i],body.end[i],limit);
    auto extent=[&](const Vec* basis){return Vec{__builtin_fabs(basis[0].x)*half.x+__builtin_fabs(basis[1].x)*half.y+__builtin_fabs(basis[2].x)*half.z,
        __builtin_fabs(basis[0].y)*half.x+__builtin_fabs(basis[1].y)*half.y+__builtin_fabs(basis[2].y)*half.z,
        __builtin_fabs(basis[0].z)*half.x+__builtin_fabs(basis[1].z)*half.y+__builtin_fabs(basis[2].z)*half.z};};
    const auto startHalf=extent(body.start),endHalf=extent(basis),end=blend(center.start,center.end,limit);
    include(box,sub(center.start,startHalf));include(box,flight::add(center.start,startHalf));include(box,sub(end,endHalf));include(box,flight::add(end,endHalf));
    return box;
}
bool overlaps(const Bounds& a,const Bounds& b) {
    constexpr double tolerance=0.000002;
    return a.high.x+tolerance>=b.low.x&&b.high.x+tolerance>=a.low.x&&a.high.y+tolerance>=b.low.y&&b.high.y+tolerance>=a.low.y&&a.high.z+tolerance>=b.low.z&&b.high.z+tolerance>=a.low.z;
}
bool active(const Motion& body,const Triangle& triangle) {
    const auto& part=parts[triangle.part];
    return !(part.panel>=0&&(body.body.broken&(1<<part.panel)))&&!(body.body.model==0&&part.tank>=0&&(body.body.ruptured&(1<<part.tank)));
}
bool interval(const Path* a,const Path* b,Vec axis,double& enter,double& exit,Vec& normal) {
    const double length=flight::length(axis);if(length<1e-14)return true;
    axis=flight::scale(axis,1/length);
    double minA=1e100,maxA=-1e100,minB=1e100,maxB=-1e100,minVA=1e100,maxVA=-1e100,minVB=1e100,maxVB=-1e100;
    for(int i=0;i<3;i++) {
        const double pa=dot(a[i].start,axis),pb=dot(b[i].start,axis),va=dot(sub(a[i].end,a[i].start),axis),vb=dot(sub(b[i].end,b[i].start),axis);
        minA=minA<pa?minA:pa;maxA=maxA>pa?maxA:pa;minB=minB<pb?minB:pb;maxB=maxB>pb?maxB:pb;
        minVA=minVA<va?minVA:va;maxVA=maxVA>va?maxVA:va;minVB=minVB<vb?minVB:vb;maxVB=maxVB>vb?maxVB:vb;
    }
    const double gaps[]={maxA-minB+1e-6,maxB-minA+1e-6},rates[]={maxVA-minVB,maxVB-minVA};
    for(int i=0;i<2;i++) {
        if(__builtin_fabs(rates[i])<1e-14){if(gaps[i]<0)return false;continue;}
        const double crossing=-gaps[i]/rates[i];
        if(rates[i]>0&&crossing>enter){enter=crossing;normal=flight::scale(axis,i?1:-1);}
        else if(rates[i]<0&&crossing<exit)exit=crossing;
        if(enter>exit)return false;
    }
    return true;
}
bool triangle_contact(const Motion& a,const Motion& b,const Triangle& ta,const Triangle& tb,double limit,Contact& hit) {
    const int ia[]={ta.a,ta.b,ta.c},ib[]={tb.a,tb.b,tb.c};Path pa[3],pb[3];
    double va=0,vb=0;
    for(int i=0;i<3;i++) {
        pa[i]=path(a,vertices[ia[i]]);pb[i]=path(b,vertices[ib[i]]);
        const double da=flight::length(sub(pa[i].end,pa[i].start)),db=flight::length(sub(pb[i].end,pb[i].start));
        va=va>da?va:da;vb=vb>db?vb:db;
    }
    Bounds ba,bb;
    for(int i=0;i<3;i++){include(ba,pa[i].start);include(ba,pa[i].end);include(bb,pb[i].start);include(bb,pb[i].end);}
    if(!overlaps(ba,bb))return false;
    Vec ea[3],eb[3];for(int i=0;i<3;i++){ea[i]=sub(pa[(i+1)%3].start,pa[i].start);eb[i]=sub(pb[(i+1)%3].start,pb[i].start);}
    const Vec na=cross(ea[0],ea[1]),nb=cross(eb[0],eb[1]);double enter=0,exit=limit;Vec axisNormal{};
    if(!interval(pa,pb,na,enter,exit,axisNormal)||!interval(pa,pb,nb,enter,exit,axisNormal))return false;
    for(int i=0;i<3;i++) {
        if(!interval(pa,pb,cross(na,ea[i]),enter,exit,axisNormal)||!interval(pa,pb,cross(nb,eb[i]),enter,exit,axisNormal))return false;
        for(int j=0;j<3;j++)if(!interval(pa,pb,cross(ea[i],eb[j]),enter,exit,axisNormal))return false;
    }
    const double speed=va+vb;double t=enter;
    for(int iteration=0;iteration<96;iteration++) {
        Vec aa[3],bb[3];for(int i=0;i<3;i++){aa[i]=blend(pa[i].start,pa[i].end,t);bb[i]=blend(pb[i].start,pb[i].end,t);}
        const auto gap=nearest(aa,bb);const double distance=__builtin_sqrt(gap.squared);
        if(distance<=0.000001) {
            Vec normal=distance>1e-10?flight::scale(sub(gap.a,gap.b),1/distance):flight::length(axisNormal)>0?axisNormal:cross(sub(bb[1],bb[0]),sub(bb[2],bb[0]));
            normal=flight::scale(normal,1/flight::length(normal));
            if(dot(normal,sub(a.translation,b.translation))>0)normal=flight::scale(normal,-1);
            hit={true,t,flight::scale(flight::add(gap.a,gap.b),0.5),normal,ta.part,tb.part};return true;
        }
        if(speed<1e-14||t>=exit)return false;
        const double next=t+distance/speed;t=next<exit?next:exit;
    }
    return false;
}
Contact sweep(const Body& bodyA,const Body& bodyB,double dt) {
    Contact result;
    if(bodyA.model<0||bodyA.model>1||bodyB.model<0||bodyB.model>1||!(dt>0))return result;
    const auto a=motion(bodyA,dt),b=motion(bodyB,dt);
    struct Pair {int a,b;};Pair stack[128];int count=1,contacts=0;stack[0]={roots[bodyA.model],roots[bodyB.model]};
    while(count) {
        const auto pair=stack[--count];const auto& na=nodes[pair.a];const auto& nb=nodes[pair.b];
        const auto ba=swept_bounds(a,na,result.fraction),bb=swept_bounds(b,nb,result.fraction);if(!overlaps(ba,bb))continue;
        if(na.count&&nb.count) {
            for(int i=na.start;i<na.start+na.count;i++)if(active(a,triangles[i]))for(int j=nb.start;j<nb.start+nb.count;j++)if(active(b,triangles[j])) {
                Contact hit;
                if(!triangle_contact(a,b,triangles[i],triangles[j],result.fraction,hit))continue;
                if(hit.fraction<result.fraction-0.00001){result=hit;result.point={};result.normal={};contacts=0;}
                if(hit.fraction<=result.fraction+0.00001){result.hit=true;result.fraction=hit.fraction;result.partA=hit.partA;result.partB=hit.partB;result.point=flight::add(result.point,hit.point);result.normal=flight::add(result.normal,hit.normal);contacts++;}
            }
        } else {
            const double sa=flight::length(sub(ba.high,ba.low)),sb=flight::length(sub(bb.high,bb.low));
            if(!na.count&&(nb.count||sa>sb)){stack[count++]={na.left,pair.b};stack[count++]={na.right,pair.b};}
            else{stack[count++]={pair.a,nb.left};stack[count++]={pair.a,nb.right};}
        }
    }
    if(contacts){result.point=flight::scale(result.point,1.0/contacts);const double length=flight::length(result.normal);result.normal=length>1e-14?flight::scale(result.normal,1/length):Vec{0,0,-1};}
    return result;
}
}
