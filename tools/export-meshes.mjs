import {registerHooks} from 'node:module';
import {writeFile} from 'node:fs/promises';
registerHooks({resolve(specifier,context,next){return next(specifier==='/vendor/three.module.js'?'three':specifier,context);}});
const {stationModel,spacecraftModel,satelliteModel}=await import('../web/models.js');

const vertices=[],triangles=[],parts=[],nodes=[],roots=[];
for(const model of [stationModel(1,false),spacecraftModel(0x6daaa7),satelliteModel()]) {
  model.group.updateMatrixWorld(true);
  const faces=[];
  model.group.traverse(object=>{
    if(!object.isMesh||!object.userData.solid)return;
    const geometry=object.geometry.clone().applyMatrix4(object.matrixWorld),position=geometry.attributes.position;
    const indices=[],unique=new Map(),part=parts.length;
    for(let i=0;i<position.count;i++) {
      const point=[position.getX(i),position.getY(i),-position.getZ(i)],key=point.join(',');
      if(!unique.has(key)){unique.set(key,vertices.length);vertices.push(point);}
      indices.push(unique.get(key));
    }
    const count=geometry.index?.count||position.count;
    const faceStart=faces.length;
    for(let i=0;i<count;i+=3) {
      const points=[0,2,1].map(j=>indices[geometry.index?geometry.index.getX(i+j):i+j]);
      const [a,b,c]=points.map(i=>vertices[i]);
      const ab=b.map((v,j)=>v-a[j]),ac=c.map((v,j)=>v-a[j]);
      const cross=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];
      if(Math.hypot(...cross)>1e-12)faces.push({points,part,center:a.map((v,j)=>(v+b[j]+c[j])/3)});
    }
    parts.push([object.userData.panel??-1,object.userData.tank??-1,object.name==='capsule-frame'?2:object.name==='capsule-hull'?1:0,object.userData.mass||2,faceStart,faces.length-faceStart]);
    geometry.dispose();
  });
  function build(faces) {
    const id=nodes.length,low=[Infinity,Infinity,Infinity],high=[-Infinity,-Infinity,-Infinity];
    for(const face of faces)for(const index of face.points)vertices[index].forEach((v,j)=>{low[j]=Math.min(low[j],v);high[j]=Math.max(high[j],v);});
    const node={low,high,left:-1,right:-1,start:triangles.length,count:faces.length};nodes.push(node);
    if(faces.length<=8){triangles.push(...faces);return id;}
    const spans=high.map((v,j)=>v-low[j]),axis=spans.indexOf(Math.max(...spans));
    faces.sort((a,b)=>a.center[axis]-b.center[axis]);const middle=Math.floor(faces.length/2);
    node.left=build(faces.slice(0,middle));node.right=build(faces.slice(middle));node.count=0;
    return id;
  }
  roots.push(build(faces));
}
const scalar=value=>`${Object.is(value,-0)?0:value}`;
const vec=point=>'{'+point.map(scalar).join(',')+'}';
const output=`#pragma once\nnamespace collision {\nstatic const flight::Vec vertices[]={${vertices.map(vec).join(',')}};\nstatic const Triangle triangles[]={${triangles.map(f=>'{'+[...f.points,f.part].join(',')+'}').join(',')}};\nstatic const Part parts[]={${parts.map(p=>'{'+p.slice(0,4).join(',')+'}').join(',')}};\nstatic const Node nodes[]={${nodes.map(n=>'{'+[vec(n.low),vec(n.high),n.left,n.right,n.start,n.count].join(',')+'}').join(',')}};\nstatic const int roots[]={${roots.join(',')}};\n}\n`;
await writeFile(process.argv[2],output);
process.stdout.write(`Exported ${vertices.length} mesh vertices, ${triangles.length} triangles and ${parts.length} solid parts\n`);
