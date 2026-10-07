#include "mesh.hpp"
namespace collision {
struct Triangle {int a,b,c,part;};
struct Part {int panel,tank,kind;double mass;};
struct Node {flight::Vec low,high;int left,right,start,count;};
}
#include "mesh-data.hpp"

namespace collision {
using flight::Vec;
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
}
