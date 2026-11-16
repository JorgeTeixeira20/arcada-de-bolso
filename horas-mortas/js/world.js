/* Mapa "Subúrbio": armazém, bairro, contentores, ruínas, bunker, oficina. Colisões, raycasts e navegação. */
(function(){
'use strict';
const T=THREE,W=window.W={};
const clamp=(v,a,b)=>v<a?a:v>b?b:v;W.clamp=clamp;
let seed=7;
function rng(){seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;}
const rr=(a,b)=>a+rng()*(b-a);
W.C=hex=>new T.Color(hex).convertSRGBToLinear();
const C=W.C;
W.H=60;                 // meia largura do mapa
const CELL=8,OFF=100,NC=.5,NW=Math.round(W.H*2/NC);

/* ambiente (céu, sol, chão): criado uma vez */
W.initEnv=function(scene,renderer,M){
  W.scene=scene;W.M=M;
  /* ---------- céu, sol, ambiente ---------- */
  const sunDir=W.sunDir=new T.Vector3().setFromSphericalCoords(1,T.MathUtils.degToRad(90-27),T.MathUtils.degToRad(128));
  let sky=null;
  if(T.Sky){
    sky=new T.Sky();sky.scale.setScalar(6000);const u=sky.material.uniforms;u.turbidity.value=7;u.rayleigh.value=1.7;u.mieCoefficient.value=.006;u.mieDirectionalG.value=.82;u.sunPosition.value.copy(sunDir);
    try{const pm=new T.PMREMGenerator(renderer),sc=new T.Scene();sc.add(sky);scene.environment=pm.fromScene(sc,.02).texture;pm.dispose();}catch(e){}
    scene.add(sky);
  }else scene.background=C(0x9cc0e0);
  scene.fog=new T.FogExp2(C(0xc4bfb4),.0064);
  scene.add(new T.HemisphereLight(C(0xcfe0ff),C(0x8a7f68),.55));
  const sun=W.sun=new T.DirectionalLight(C(0xffe2b8),3.1);sun.position.copy(sunDir).multiplyScalar(140);sun.castShadow=true;
  const sm=renderer.capabilities.maxTextureSize>=4096&&!W.lowSpec?4096:2048;sun.shadow.mapSize.set(sm,sm);
  const sc=sun.shadow.camera;sc.left=-92;sc.right=92;sc.top=92;sc.bottom=-92;sc.near=10;sc.far=320;sun.shadow.bias=-.0003;sun.shadow.normalBias=.05;
  scene.add(sun);scene.add(sun.target);

  const gnd=new T.Mesh(new T.PlaneGeometry(400,400),M.ground);gnd.rotation.x=-Math.PI/2;gnd.receiveShadow=true;scene.add(gnd);
};
/* constrói um mapa: 'suburbio' (deathmatch) ou 'complexo' (incursão por salas). Devolve false se o mapa gerado não for todo percorrível. */
function buildOnce(kind,seedVal){
  if(W.root){W.scene.remove(W.root);W.root.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.isInstancedMesh&&o.dispose)o.dispose();});}
  const scene=W.root=new T.Group(),M=W.M;W.scene.add(scene);W.kind=kind;seed=seedVal||7;W.rooms=[];W.gates=[];W.glass=[];W.glassMesh=null;
  W.boxes=[];W.circles=[];W.rects=[];W.spawns=[];W.pois=[];
  const inst={};
  function add(mat,x0,x1,y0,y1,z0,z1,col,solid){
    (inst[mat]||(inst[mat]=[])).push({x:(x0+x1)/2,y:(y0+y1)/2,z:(z0+z1)/2,sx:x1-x0,sy:y1-y0,sz:z1-z0,c:col===undefined?0xffffff:col});
    if(solid!==false)W.boxes.push({x0,x1,y0,y1,z0,z1,m:mat});
  }
  /* ---------- construtores ---------- */
  const door=(c,w)=>({c,w:w||2,y0:0,y1:2.35}),win=(c,w)=>({c,w:w||1.6,y0:1.05,y1:2.15});
  function wall(mat,col,axis,fixed,t,a0,a1,h,ops,yb){
    yb=yb||0;ops=(ops||[]).slice().sort((p,q)=>p.c-q.c);let cur=a0;
    const put=(s,e,ya,yt)=>{if(e-s<.02||yt-ya<.02)return;if(axis==='x')add(mat,s,e,yb+ya,yb+yt,fixed-t/2,fixed+t/2,col);else add(mat,fixed-t/2,fixed+t/2,yb+ya,yb+yt,s,e,col);};
    for(const o of ops){put(cur,o.c-o.w/2,0,h);if(o.y0>0)put(o.c-o.w/2,o.c+o.w/2,0,o.y0);if(o.y1<h)put(o.c-o.w/2,o.c+o.w/2,o.y1,h);cur=o.c+o.w/2;
      const a0=o.c-o.w/2,a1=o.c+o.w/2,X=axis==='x',bx=(u0,u1,v0,v1,dp,mat2,col2)=>{if(X)add(mat2,u0,u1,yb+v0,yb+v1,fixed-dp,fixed+dp,col2,false);else add(mat2,fixed-dp,fixed+dp,yb+v0,yb+v1,u0,u1,col2,false);};
      if(o.y0>0&&o.y1-o.y0>.8){const f=t/2+.05;bx(a0-.06,a1+.06,o.y0-.07,o.y0,f,'dark',0x4a4038);bx(a0-.06,a1+.06,o.y1,o.y1+.06,f,'dark',0x4a4038);bx(a0-.06,a0,o.y0,o.y1,f,'dark',0x4a4038);bx(a1,a1+.06,o.y0,o.y1,f,'dark',0x4a4038);
        bx(o.c-.025,o.c+.025,o.y0,o.y1,.03,'dark',0x3a3430);bx(a0,a1,(o.y0+o.y1)/2-.02,(o.y0+o.y1)/2+.02,.03,'dark',0x3a3430);bx(a0,a1,o.y0,o.y1,.012,'glass',0xffffff);}
      else if(o.y0===0&&o.y1>=2.2&&o.y1<3&&o.w<=2.4){const f=t/2+.04;bx(a0-.09,a0,0,o.y1+.09,f,'wood',0x5a4634);bx(a1,a1+.09,0,o.y1+.09,f,'wood',0x5a4634);bx(a0,a1,o.y1,o.y1+.09,f,'wood',0x5a4634);}}
    put(cur,a1,0,h);
  }
  const roofs=[];
  function room(mat,col,x0,z0,x1,z1,h,o){
    const t=.3;
    wall(mat,col,'x',z0+t/2,t,x0,x1,h,o.n);wall(mat,col,'x',z1-t/2,t,x0,x1,h,o.s);wall(mat,col,'z',x0+t/2,t,z0+t,z1-t,h,o.w);wall(mat,col,'z',x1-t/2,t,z0+t,z1-t,h,o.e);
    add(o.floor||'concrete',x0-.5,x1+.5,-.4,.04,z0-.5,z1+.5,o.floorCol||0xb0aea6,false);
    if(o.roof==='pitch'){add('wood',x0,x1,h,h+.12,z0,z1,0x8a7a66);roofs.push({x0:x0-.5,x1:x1+.5,z0:z0-.5,z1:z1+.5,y:h+.12,col:o.roofCol||0x8a4030});}
    else if(o.roof!=='none'){add(o.roofMat||'concrete',x0-.35,x1+.35,h,h+.3,z0-.35,z1+.35,o.roofCol||0x9a978e);
      if((x1-x0)*(z1-z0)>40){const ax2=rr(x0+1.5,x1-2.5),az2=rr(z0+1.5,z1-2);add('metal',ax2,ax2+1.3,h+.3,h+1.1,az2,az2+.8,0x9aa3a8,false);add('dark',ax2+.15,ax2+1.15,h+1.1,h+1.14,az2+.1,az2+.7,0x444444,false);const vx=rr(x0+1,x1-1.5),vz=rr(z0+1,z1-1.5);add('metal',vx,vx+.35,h+.3,h+.9,vz,vz+.35,0x7d868b,false);}add(o.roofMat||'concrete',x0-.35,x1+.35,h+.3,h+.6,z0-.35,x0-.35===x0-.35?z0-.05:z0,o.roofCol||0x9a978e,false);
      add(o.roofMat||'concrete',x0-.35,x1+.35,h+.3,h+.6,z1+.05,z1+.35,o.roofCol||0x9a978e,false);add(o.roofMat||'concrete',x0-.35,x0-.05,h+.3,h+.6,z0-.35,z1+.35,o.roofCol||0x9a978e,false);add(o.roofMat||'concrete',x1+.05,x1+.35,h+.3,h+.6,z0-.35,z1+.35,o.roofCol||0x9a978e,false);}
    W.rects.push({x0,z0,x1,z1,k:o.k||'casa'});W.pois.push({x:(x0+x1)/2,z:(z0+z1)/2});
  }
  function crate(x,z,s,y){y=y||0;add('crate',x-s/2,x+s/2,y,y+s,z-s/2,z+s/2,0xffffff);}
  function container(x,z,axis,col,open,y){
    y=y||0;const L=6.1,Wd=2.5,Hh=2.6,hx=axis==='x'?L/2:Wd/2,hz=axis==='x'?Wd/2:L/2,x0=x-hx,x1=x+hx,z0=z-hz,z1=z+hz;
    if(!open){add('container',x0,x1,y+.1,y+Hh,z0,z1,col);add('dark',x0+.05,x1-.05,y,y+.1,z0+.05,z1-.05,0x222222,false);}
    else{const t=.12;add('container',x0,x1,y+Hh-t,y+Hh,z0,z1,col);add('wood',x0,x1,y,y+.06,z0,z1,0x6a5a48,false);
      if(axis==='x'){add('container',x0,x1,y,y+Hh,z0,z0+t,col);add('container',x0,x1,y,y+Hh,z1-t,z1,col);}else{add('container',x0,x0+t,y,y+Hh,z0,z1,col);add('container',x1-t,x1,y,y+Hh,z0,z1,col);}}
    if(!y)W.rects.push({x0,z0,x1,z1,k:'cont'});
  }
  const decor=[];
  function car(x,z,axis,col,wreck){
    const hl=2.15,hw=.9,X=axis==='x',hx=X?hl:hw,hz=X?hw:hl,cl=1.05,cw=hw-.1,ox=X?-.25:0,oz=X?0:-.25,chx=X?cl:cw,chz=X?cw:cl;
    add('paint',x-hx,x+hx,.32,1.02,z-hz,z+hz,col);
    add('paint',x+ox-chx,x+ox+chx,1.02,1.52,z+oz-chz,z+oz+chz,wreck?0x2a2622:col);
    if(X)add('dark',x+ox-chx+.12,x+ox+chx-.12,1.1,1.45,z-chz-.01,z+chz+.01,0x1a2630,false);else add('dark',x-chx-.01,x+chx+.01,1.1,1.45,z+oz-chz+.12,z+oz+chz-.12,0x1a2630,false);
    for(const sa of [-1,1])for(const sb of [-1,1])decor.push({k:'wheel',x:x+(X?sa*hl*.62:sb*hw),z:z+(X?sb*hw:sa*hl*.62),axis});
    W.rects.push({x0:x-hx,z0:z-hz,x1:x+hx,z1:z+hz,k:'car'});
  }
  function barrier(x,z,axis){if(axis==='x'){add('concrete',x-1.1,x+1.1,0,.55,z-.3,z+.3,0xb5b2a8);add('concrete',x-1.1,x+1.1,.55,.95,z-.16,z+.16,0xb5b2a8);}else{add('concrete',x-.3,x+.3,0,.55,z-1.1,z+1.1,0xb5b2a8);add('concrete',x-.16,x+.16,.55,.95,z-1.1,z+1.1,0xb5b2a8);}}
  function sandbags(x0,z0,x1,z1,h){add('sandbag',Math.min(x0,x1),Math.max(x0,x1),0,h||1.1,Math.min(z0,z1),Math.max(z0,z1),0xffffff);}
  function barrel(x,z,col){decor.push({k:'barrel',x,z,col});W.circles.push({x,z,r:.33,y0:0,y1:.95});}
  function tree(x,z,s){decor.push({k:'tree',x,z,s});W.circles.push({x,z,r:.3*s,y0:0,y1:3*s});}
  function lamp(x,z){decor.push({k:'lamp',x,z});W.circles.push({x,z,r:.12,y0:0,y1:5});}


  /* ---------- mapa "Complexo": 12 salas em serpentina, ligadas por portões ---------- */
  function genComplex(){
    const COLS=3,ROWS=4,RW=38,RD=28.5,X0=-57,Z0=-57,WH=5,order=[];
    for(let r=0;r<ROWS;r++)for(let k=0;k<COLS;k++)order.push({c:r%2?COLS-1-k:k,r});
    add('dirt',-58,58,-.4,.012,-58,58,0xb0a690,false);
    add('concrete',-58.5,58.5,0,WH+.6,-58.5,-57,0x9a978e);add('concrete',-58.5,58.5,0,WH+.6,57,58.5,0x9a978e);add('concrete',-58.5,-57,0,WH+.6,-57,57,0x9a978e);add('concrete',57,58.5,0,WH+.6,-57,57,0x9a978e);
    const themes=['armazem','patio','contentores','ruinas','bunker','casa','oficina','praca','armazem','contentores','patio','ruinas'];
    for(let i=themes.length-1;i>1;i--){const j=1+Math.floor(rng()*i);const t=themes[i];themes[i]=themes[j];themes[j]=t;}
    order.forEach((o,i)=>{const x0=X0+o.c*RW,z0=Z0+o.r*RD;W.rooms.push({i,c:o.c,r:o.r,x0:x0+.4,x1:x0+RW-.4,z0:z0+.4,z1:z0+RD-.4,cx:x0+RW/2,cz:z0+RD/2,theme:themes[i],doors:[],fp:[]});});
    const idx=(c,r)=>W.rooms.findIndex(q=>q.c===c&&q.r===r);
    function gate(a,b,axis,fixed,c){
      const w=3.2,h=3.2,t=.7,lo=Math.min(a,b),R0=W.rooms[lo];
      const bx=axis==='z'?{x0:fixed-t/2+.12,x1:fixed+t/2-.12,z0:c-w/2,z1:c+w/2}:{x0:c-w/2,x1:c+w/2,z0:fixed-t/2+.12,z1:fixed+t/2-.12};
      const box={x0:bx.x0,x1:bx.x1,y0:0,y1:h,z0:bx.z0,z1:bx.z1,m:'metal',gate:true,h};W.boxes.push(box);
      const px=axis==='z'?fixed:c,pz=axis==='z'?c:fixed;
      W.gates.push({from:lo,box,axis,x:px,z:pz,open:false,k:0});
      W.rooms[a].doors.push({x:px,z:pz});W.rooms[b].doors.push({x:px,z:pz});
      R0.exit={x:px,z:pz};W.rooms[lo+1].entry={x:px,z:pz};
    }
    for(let r=0;r<ROWS;r++)for(let c=0;c<COLS-1;c++){ // paredes verticais
      const x=X0+RW*(c+1),za=Z0+r*RD,zb=za+RD,a=idx(c,r),b=idx(c+1,r);
      if(Math.abs(a-b)===1){const cz=Math.round(rr(za+5,zb-5)*2)/2;wall('concrete',0xa9a59a,'z',x,.7,za,zb,WH,[{c:cz,w:3.2,y0:0,y1:3.2}]);gate(a,b,'z',x,cz);}
      else wall('concrete',0xa9a59a,'z',x,.7,za,zb,WH);
      W.rects.push({x0:x-.35,z0:za,x1:x+.35,z1:zb,k:'wall'});
    }
    for(let r=0;r<ROWS-1;r++)for(let c=0;c<COLS;c++){ // paredes horizontais
      const z=Z0+RD*(r+1),xa=X0+c*RW,xb=xa+RW,a=idx(c,r),b=idx(c,r+1);
      if(Math.abs(a-b)===1){const cx2=Math.round(rr(xa+6,xb-6)*2)/2;wall('concrete',0xa9a59a,'x',z,.7,xa,xb,WH,[{c:cx2,w:3.2,y0:0,y1:3.2}]);gate(a,b,'x',z,cx2);}
      else wall('concrete',0xa9a59a,'x',z,.7,xa,xb,WH);
      W.rects.push({x0:xa,z0:z-.35,x1:xb,z1:z+.35,k:'wall'});
    }
    W.gates.sort((p,q)=>p.from-q.from);
    const cover=(R,x,z,alongX,len,hgt,bag)=>{x=Math.round(x*2)/2;z=Math.round(z*2)/2;const w=alongX?len:.8,d=alongX?.8:len;R.fp.push({x,z,w,d});
      if(bag)sandbags(x-w/2,z-d/2,x+w/2,z+d/2,hgt);else add('concrete',x-w/2+.1,x+w/2-.1,0,hgt,z-d/2+.1,z+d/2-.1,0xb0aca2);};
    for(const R of W.rooms){
      for(const q of R.doors){const vert=Math.abs(q.x-R.x0)<1.2||Math.abs(q.x-R.x1)<1.2,nx=vert?Math.sign(R.cx-q.x):0,nz=vert?0:Math.sign(R.cz-q.z),tx=-nz,tz=nx,o1=rr(-.6,.6);
        cover(R,q.x+nx*5.4+tx*o1,q.z+nz*5.4+tz*o1,!vert,3.6,1.3,rng()<.5);
        const sd=rng()<.5?-1:1;cover(R,q.x+nx*3.2+tx*sd*4.2,q.z+nz*3.2+tz*sd*4.2,vert,2.6,2.3,false);}
    }
    {const R=W.rooms[0],ex=R.exit;let best=null,bd=-1;for(const c of [[R.x0+4.5,R.z0+4.5],[R.x1-4.5,R.z0+4.5],[R.x0+4.5,R.z1-4.5],[R.x1-4.5,R.z1-4.5]]){const d=Math.hypot(c[0]-ex.x,c[1]-ex.z);if(d>bd){bd=d;best=c;}}
      R.start={x:best[0],z:best[1]};const dx=R.cx-best[0],dz=R.cz-best[1];R.fp.push({x:best[0],z:best[1],w:2.4,d:2.4});
      cover(R,best[0]+Math.sign(dx)*3,best[1],false,4.2,1.35,true);cover(R,best[0],best[1]+Math.sign(dz)*3,true,4.2,1.35,false);}
    // tenta colocar um objeto de pegada w×d dentro da sala, longe das portas e dos outros
    function place(R,w,d,cb,tries){
      for(let t=0;t<(tries||30);t++){
        const x=Math.round(rr(R.x0+1.6+w/2,R.x1-1.6-w/2)*2)/2,z=Math.round(rr(R.z0+1.6+d/2,R.z1-1.6-d/2)*2)/2;
        if(R.doors.some(q=>Math.abs(q.x-x)<w/2+4.2&&Math.abs(q.z-z)<d/2+4.2))continue;
        if(R.fp.some(f=>Math.abs(f.x-x)<(f.w+w)/2+1.8&&Math.abs(f.z-z)<(f.d+d)/2+1.8))continue;
        R.fp.push({x,z,w,d});cb(x,z);return true;
      }
      return false;
    }
    const CC=[0xb5442f,0x2f6fb5,0x3c8c4a,0xd9a521,0xe4e4e0,0x8a4a2a],CAR=[0x8a2a22,0x3a5a7a,0x5a5a52,0x2a4a3a,0xc9c4b4,0x2f3f5a];
    const crates=(R,n)=>{for(let k=0;k<n;k++)place(R,1.4,1.4,(x,z)=>{const s=rr(1.1,1.45);crate(x,z,s);if(rng()<.35)crate(x+rr(-.1,.1),z,s*.8,s);if(rng()<.3)crate(x+s,z,s*.9);});};
    const conts=(R,n)=>{for(let k=0;k<n;k++){const ax=rng()<.5?'x':'z';place(R,ax==='x'?6.1:2.5,ax==='x'?2.5:6.1,(x,z)=>{container(x,z,ax,CC[Math.floor(rng()*6)],rng()<.25);if(rng()<.3)container(x,z,ax,CC[Math.floor(rng()*6)],false,2.6);});}};
    const cars=(R,n)=>{for(let k=0;k<n;k++){const ax=rng()<.5?'x':'z';place(R,ax==='x'?4.3:1.8,ax==='x'?1.8:4.3,(x,z)=>car(x,z,ax,CAR[Math.floor(rng()*6)],rng()<.4));}};
    const bars=(R,n)=>{for(let k=0;k<n;k++){const ax=rng()<.5?'x':'z';place(R,ax==='x'?2.2:.6,ax==='x'?.6:2.2,(x,z)=>barrier(x,z,ax));}};
    const bags=(R,n)=>{for(let k=0;k<n;k++){const ax=rng()<.5,len=rr(3,6);place(R,ax?len:.8,ax?.8:len,(x,z)=>{if(ax)sandbags(x-len/2,z-.4,x+len/2,z+.4,rng()<.3?1.5:1.1);else sandbags(x-.4,z-len/2,x+.4,z+len/2,rng()<.3?1.5:1.1);});}};
    const trees2=(R,n)=>{for(let k=0;k<n;k++)place(R,.8,.8,(x,z)=>tree(x,z,rr(1,1.3)));};
    const barrels=(R,n)=>{for(let k=0;k<n;k++)place(R,1.2,1.2,(x,z)=>{barrel(x,z,rng()<.5);if(rng()<.5)barrel(x+.7,z+.3,rng()<.5);});};
    const walls=(R,n,mat,col)=>{for(let k=0;k<n;k++){const ax=rng()<.5,len=Math.round(rr(3,8)),hgt=[.9,1.3,2.4,3.2,3.2][Math.floor(rng()*5)];place(R,ax?len:.4,ax?.4:len,(x,z)=>{
      const ops=hgt>3&&len>=5?[win(ax?x:z)]:[];if(ax)wall(mat,col,'x',z,.35,x-len/2,x+len/2,hgt,ops);else wall(mat,col,'z',x,.35,z-len/2,z+len/2,hgt,ops);});}};
    for(const R of W.rooms){
      const th=R.theme;W.pois.push({x:R.cx,z:R.cz});
      if(th==='armazem'){add('concrete',R.x0,R.x1,-.4,.03,R.z0,R.z1,0x9a988f,false);
        for(let k=0;k<2;k++)place(R,9,1.2,(x,z)=>{add('metal',x-4.5,x+4.5,1.15,1.27,z-.5,z+.5,0x596066);add('metal',x-4.5,x+4.5,2.3,2.42,z-.5,z+.5,0x596066);for(const q of [-4.5,0,4.4])add('metal',x+q,x+q+.1,0,2.42,z-.5,z+.5,0x3d4347);
          for(let q=-4;q<4;q+=1.2)if(rng()<.7){crate(x+q+.4,z,rr(.7,.95),0);if(rng()<.5)crate(x+q+.4,z,rr(.6,.8),1.27);}});
        conts(R,1);crates(R,9);barrels(R,2);}
      else if(th==='contentores'){conts(R,6);barrels(R,3);crates(R,3);}
      else if(th==='patio'){add('asphalt',R.x0,R.x1,-.4,.025,R.z0,R.z1,0xdddddd,false);cars(R,3);bars(R,5);trees2(R,3);walls(R,2,'brick',0xffffff);crates(R,2);}
      else if(th==='ruinas'){walls(R,8,'plaster',0xc4b8a4);crates(R,2);barrels(R,2);for(let k=0;k<26;k++){const x=rr(R.x0+1,R.x1-2),z=rr(R.z0+1,R.z1-2),s=rr(.25,.8);add(rng()<.5?'concrete':'plaster',x,x+s,0,rr(.12,.38),z,z+s*rr(.6,1.4),0xa8a294,false);}}
      else if(th==='bunker'){place(R,10,8,(x,z)=>{room('concrete',0x9b998f,x-4.5,z-3.5,x+4.5,z+3.5,2.7,{k:'bunker',roofCol:0x8c8a80,w:[door(z)],e:[door(z-1)],n:[{c:x,w:5,y0:1.15,y1:1.65}],s:[{c:x,w:5,y0:1.15,y1:1.65}]});});bags(R,6);crates(R,3);barrels(R,2);}
      else if(th==='casa'){place(R,13,10,(x,z)=>{room(rng()<.5?'brick':'plaster',rng()<.5?0xffffff:0xe9dcc0,x-6,z-4.5,x+6,z+4.5,3.2,{roof:'pitch',roofCol:rng()<.5?0x7d3a2c:0x4a5560,n:[win(x-3),door(x+2.5)],s:[door(x-3),win(x+2.5)],w:[win(z)],e:[win(z)]});
          add('wood',x-1.5,x+1.5,0,.85,z-.6,z+.6,0x9a7a58);});
        cars(R,1);walls(R,3,'brick',0xffffff);trees2(R,3);crates(R,2);}
      else if(th==='oficina'){add('asphalt',R.x0,R.x1,-.4,.025,R.z0,R.z1,0xcfcfcf,false);
        place(R,12,8,(x,z)=>{wall('concrete',0xb0aca0,'x',z-3.85,.3,x-6,x+6,3.6);wall('concrete',0xb0aca0,'x',z+3.85,.3,x-6,x+6,3.6);wall('concrete',0xb0aca0,'z',x+5.85,.3,z-3.7,z+3.7,3.6,[win(z)]);add('metal',x-6.4,x+6.3,3.6,3.9,z-4.3,z+4.3,0x7d8a90);
          car(x+1,z+1.2,'x',CAR[Math.floor(rng()*6)]);add('wood',x+2,x+5,0,.9,z-3.5,z-2.6,0x8a6a48);W.rects.push({x0:x-6,z0:z-4,x1:x+6,z1:z+4,k:'oficina'});});
        cars(R,2);crates(R,4);barrels(R,3);bars(R,2);}
      else{add('concrete',R.cx-9,R.cx+9,-.4,.03,R.cz-9,R.cz+9,0xb5b2a8,false);
        place(R,5,5,(x,z)=>{add('concrete',x-2.4,x+2.4,0,.5,z-2.4,z+2.4,0xb2aea2);add('concrete',x-1.6,x+1.6,.5,1.15,z-1.6,z+1.6,0xa8a498);add('concrete',x-.55,x+.55,1.15,5.2,z-.55,z+.55,0x9c988c);});
        bars(R,6);trees2(R,4);cars(R,1);bags(R,2);for(let k=0;k<2;k++)place(R,.6,.6,(x,z)=>lamp(x,z));}
      bags(R,3);walls(R,2,'concrete',0xa9a59a);bars(R,2);
    }
  }

  if(kind==='complexo')genComplex();
  else{
  add('asphalt',-60,60,-.4,.025,-4,4,0xffffff,false);add('asphalt',-4,4,-.4,.026,-60,60,0xffffff,false);
  for(let i=-56;i<58;i+=6){if(Math.abs(i+1.5)<6)continue;add('plaster',i,i+3,0,.032,-.1,.1,0xe8e2c8,false);add('plaster',-.1,.1,0,.033,i,i+3,0xe8e2c8,false);}
  [[-60,-4.9,-4.9,-4],[4,60,-4.9,-4],[-60,-4.9,4,4.9],[4,60,4,4.9]].forEach(q=>{add('concrete',q[0],q[1],-.3,.11,q[2],q[3],0xb8b8b0,false);});
  [[-4.9,-4,-60,-4.9],[-4.9,-4,4.9,60],[4,4.9,-60,-4.9],[4,4.9,4.9,60]].forEach(q=>{add('concrete',q[0],q[1],-.3,.11,q[2],q[3],0xb8b8b0,false);});
  add('dirt',-59.5,-5,-.4,.012,5,59.5,0xb0a690,false);add('dirt',9,36,-.4,.012,9,33,0xa89c84,false);add('dirt',-24,-5,-.4,.012,-27.5,-5,0xa89c84,false);add('asphalt',42,58,-.4,.012,-40,-18,0xcfcfcf,false);
  for(let k=-3.4;k<3.5;k+=.9){add('plaster',k,k+.5,0,.034,-8,-5.4,0xe8e2c8,false);add('plaster',k,k+.5,0,.034,5.4,8,0xe8e2c8,false);add('plaster',-8,-5.4,0,.034,k,k+.5,0xe8e2c8,false);add('plaster',5.4,8,0,.034,k,k+.5,0xe8e2c8,false);}
  for(let i=0;i<70;i++){const e=Math.floor(rng()*4),u=rr(-57,57);if(Math.abs(u)<7)continue;const x=e===0?-58.6:e===1?58.6:u,z=e===2?-58.6:e===3?58.6:u;decor.push({k:'bush',x,z,s:rr(.7,1.3)});}
  // muro exterior
  add('concrete',-61,61,0,3.4,-61,-60,0xa8a59c);add('concrete',-61,61,0,3.4,60,61,0xa8a59c);add('concrete',-61,-60,0,3.4,-60,60,0xa8a59c);add('concrete',60,61,0,3.4,-60,60,0xa8a59c);
  for(let i=-58;i<=58;i+=8){add('concrete',i-.3,i+.3,0,3.8,-61.2,-59.8,0x8f8c84,false);add('concrete',i-.3,i+.3,0,3.8,59.8,61.2,0x8f8c84,false);add('concrete',-61.2,-59.8,0,3.8,i-.3,i+.3,0x8f8c84,false);add('concrete',59.8,61.2,0,3.8,i-.3,i+.3,0x8f8c84,false);}

  /* ---------- NW: armazém ---------- */
  room('metal',0xa9b6bc,-52,-50,-22,-28,6.4,{k:'armazem',roofMat:'metal',roofCol:0x8b989e,floorCol:0x9a9890,
    n:[{c:-46,w:3,y0:3.6,y1:4.9},{c:-37,w:3,y0:3.6,y1:4.9},{c:-28,w:3,y0:3.6,y1:4.9}],
    s:[door(-47),{c:-32,w:5,y0:0,y1:4.2}],w:[door(-39)],e:[{c:-39,w:5,y0:0,y1:4.2}]});
  for(const z of [-46.5,-42,-37.5]){add('metal',-49,-40,0,.12,z-.5,z+.5,0x596066,false);add('metal',-49,-40,1.15,1.27,z-.5,z+.5,0x596066);add('metal',-49,-40,2.3,2.42,z-.5,z+.5,0x596066);
    for(const x of [-49,-44.5,-40.1])add('metal',x,x+.1,0,2.42,z-.5,z+.5,0x3d4347);
    for(let x=-48.6;x<-40.6;x+=1.15)if(rng()<.75){const s=rr(.7,.95);crate(x+.4,z,s,.12);if(rng()<.5)crate(x+.4,z,rr(.6,.8),1.27);}}
  crate(-27,-45,1.4);crate(-25.5,-45,1.4);crate(-26.2,-45,1.2,1.4);crate(-34,-33,1.4);crate(-35.5,-33.2,1.2);crate(-30,-41,1.5);crate(-30,-39.5,1.2);crate(-24.5,-33,1.3);
  add('paint',-36.5,-34.3,.2,1.3,-45.5,-44.3,0xd9a521);add('paint',-35.6,-34.3,1.3,2.2,-45.5,-44.3,0xd9a521);add('dark',-34.3,-33.3,.1,.2,-45.4,-44.4,0x222222,false);
  /* ---------- NE: bairro ---------- */
  room('brick',0xffffff,10,-52,22,-42,3.2,{roof:'pitch',roofCol:0x7d3a2c,n:[win(13),win(19)],s:[door(13.5),win(18.5)],w:[win(-47)],e:[door(-47)]});
  room('plaster',0xe9dcc0,30,-53,42,-43,3.2,{roof:'pitch',roofCol:0x4a5560,n:[win(36)],s:[win(33),win(39)],w:[door(-48)],e:[win(-48)]});
  room('plaster',0xd3c0a8,12,-33,24,-23,3.3,{k:'casaL',n:[win(18)],s:[win(15.5),win(20.5)],w:[door(-28)],e:[door(-28)]});
  room('plaster',0xd3c0a8,24,-33,34,-13,3.3,{k:'casaL',n:[win(29)],s:[win(29)],w:[door(-28),win(-18)],e:[win(-28),door(-18)]});
  add('wood',15,18,0,.85,-48.6,-47.4,0x9a7a58);add('wood',31,32.2,0,.9,-46.5,-44,0x8a6a48);add('wood',26.5,29.5,0,.85,-21.6,-20.4,0x9a7a58);add('wood',13,13.9,0,1.9,-31.7,-29.5,0x7a5a3a);
  wall('brick',0xffffff,'x',-38.5,.3,8,26,1.15,[{c:16,w:2.4,y0:0,y1:1.15}]);wall('brick',0xffffff,'z',26,.3,-52,-38.4,1.15,[{c:-46,w:2.4,y0:0,y1:1.15}]);
  wall('brick',0xffffff,'z',8,.3,-33,-12,1.15,[{c:-20,w:2.4,y0:0,y1:1.15}]);wall('brick',0xffffff,'x',-12,.3,8,24,1.15,[{c:14,w:2.2,y0:0,y1:1.15}]);
  // oficina de frente aberta
  wall('concrete',0xb0aca0,'x',-34.85,.3,44,56,3.6);wall('concrete',0xb0aca0,'x',-21.15,.3,44,56,3.6);wall('concrete',0xb0aca0,'z',55.85,.3,-34.7,-21.3,3.6,[win(-28)]);
  add('concrete',44,44.4,0,3.6,-28.3,-27.7,0xa09c90);add('metal',43.6,56.3,3.6,3.9,-35.3,-20.7,0x7d8a90);add('concrete',43.5,56.5,-.4,.04,-35.5,-20.5,0x9a988f,false);
  W.rects.push({x0:44,z0:-35,x1:56,z1:-21,k:'oficina'});W.pois.push({x:50,z:-28});
  car(50.5,-31.2,'x',0x8a2a22);add('wood',52,55.4,0,.9,-22.6,-21.6,0x8a6a48);add('metal',45,45.8,0,2,-22.4,-21.5,0x6a7378);
  car(34,-38.5,'x',0x3a5a7a);car(46,-45,'z',0x5a5a52,true);
  /* ---------- SW: contentores ---------- */
  container(-46,13,'x',0xb5442f);container(-39,13,'x',0x2f6fb5,true);container(-32,13,'x',0x3c8c4a);container(-46,13,'x',0xd9a521,false,2.6);
  container(-20,20,'z',0xe4e4e0);container(-20,27.5,'z',0xb5442f,true);container(-17.2,20,'z',0x2f6fb5);container(-18.6,20,'z',0x3c8c4a,false,2.6);
  container(-45,29,'x',0x8a4a2a);container(-37.5,29,'x',0xd9a521);container(-45,32,'x',0x2f6fb5);container(-41,30.5,'x',0xb5442f,false,2.6);
  container(-29,42,'z',0x3c8c4a,true);container(-49,45,'x',0xe4e4e0);container(-39,50,'x',0xb5442f);container(-13,43,'x',0x2f6fb5);container(-13,46,'x',0xd9a521);container(-13,44.5,'x',0x8a4a2a,false,2.6);
  container(-54,22,'z',0x3c8c4a);container(-28,53,'x',0x2f6fb5,true);container(-10,30,'z',0xe4e4e0);container(-30,22,'z',0x8a4a2a);
  room('container',0xdfe3e6,-55,34,-49,39,2.7,{k:'cabine',roofMat:'container',roofCol:0xcfd3d6,e:[door(36.5)],s:[win(-52)],n:[win(-52)]});
  barrel(-25,14);barrel(-24.2,14.5,1);barrel(-24.8,15.2);barrel(-34,36);barrel(-33.3,36.6,1);barrel(-43,22);barrel(-8.5,50);barrel(-9.3,50.4,1);barrel(-50,52);
  crate(-36,21,1.3);crate(-36,22.4,1.3);crate(-36,21.6,1.1,1.3);crate(-24,34,1.4);crate(-47,38,1.2);crate(-22,48,1.4);crate(-20.5,48.3,1.2);
  /* ---------- SE: ruínas, bunker, torre ---------- */
  const RU=0xc4b8a4;
  wall('plaster',RU,'x',14.15,.35,14,18,3.2,[win(16)]);wall('plaster',RU,'x',14.15,.35,18,20,1.3);wall('plaster',RU,'x',14.15,.35,22,27,2.6,[win(24.5)]);wall('plaster',RU,'x',14.15,.35,27,32,.9);
  wall('plaster',RU,'x',27.85,.35,14,17,.8);wall('plaster',RU,'x',27.85,.35,19,25,3.2,[win(22)]);wall('plaster',RU,'x',27.85,.35,25,32,1.9);
  wall('plaster',RU,'z',14.15,.35,14.3,20,3.2,[win(17)]);wall('plaster',RU,'z',14.15,.35,20,23,1.5);wall('plaster',RU,'z',14.15,.35,23,27.7,2.8);
  wall('plaster',RU,'z',31.85,.35,14.3,18,1.0);wall('plaster',RU,'z',31.85,.35,24,27.7,3.0);
  wall('plaster',RU,'z',23,.3,14.3,19.5,2.4);wall('plaster',RU,'z',23,.3,21.5,24,3.2);wall('plaster',RU,'x',21,.3,14.3,17,2.2);
  add('concrete',13.5,32.5,-.4,.04,13.5,28.5,0x9c988c,false);add('wood',23.2,31.7,3.2,3.4,24,27.7,0x6a5a48);add('wood',27,27.3,0,3.2,24.2,24.5,0x5a4a3a);
  for(let i=0;i<46;i++){const x=rr(11,35),z=rr(11,31),s=rr(.25,.8);add(rng()<.5?'concrete':'plaster',x,x+s,0,rr(.12,.38),z,z+s*rr(.6,1.4),0xa8a294,false);}
  W.rects.push({x0:14,z0:14,x1:32,z1:28,k:'ruina'});W.pois.push({x:19,z:18},{x:27,z:21});
  room('concrete',0x9b998f,40,36,51,45,2.7,{k:'bunker',roofCol:0x8c8a80,w:[door(40.5)],n:[{c:45.5,w:6,y0:1.15,y1:1.65}],s:[{c:45.5,w:6,y0:1.15,y1:1.65}],e:[{c:40.5,w:4,y0:1.15,y1:1.65}]});
  add('concrete',39.6,51.4,3.3,3.9,35.6,45.4,0x8c8a80,false);crate(48.5,43,1.1);add('wood',42,44.5,0,.85,42.6,43.6,0x7a6a50);
  sandbags(34,33.4,39.5,34.2);sandbags(34,34.2,34.8,39);sandbags(42,24,48,24.8);sandbags(47.2,24.8,48,29);sandbags(20,36,26,36.8,1.2);sandbags(14,44,14.8,50);sandbags(14.8,49.2,20,50);
  sandbags(26,46,31,46.8);sandbags(52,50,56,50.8);
  for(const q of [[44,12],[47.4,12],[44,15.4],[47.4,15.4]])add('wood',q[0],q[0]+.3,0,5.2,q[1],q[1]+.3,0x6a5540);
  add('wood',43.6,48.1,5.2,5.4,11.6,16.1,0x7a6348);add('wood',43.6,48.1,7.4,7.55,11.6,16.1,0x5a4a3a,false);
  add('wood',43.6,48.1,5.4,6.3,11.6,11.75,0x6a5540,false);add('wood',43.6,48.1,5.4,6.3,15.95,16.1,0x6a5540,false);add('wood',43.6,43.75,5.4,6.3,11.6,16.1,0x6a5540,false);add('wood',47.95,48.1,5.4,6.3,11.6,16.1,0x6a5540,false);
  for(const q of [[43.7,11.7],[47.8,11.7],[43.7,15.9],[47.8,15.9]])add('wood',q[0],q[0]+.14,6.3,7.4,q[1],q[1]+.14,0x5a4a3a,false);
  car(38,52,'x',0x4a4a44,true);crate(30,38,1.4);crate(31.5,38,1.2);crate(54,30,1.4);crate(10,40,1.3);crate(10,41.4,1.3);barrel(36,44);barrel(36.8,44.4,1);barrel(22,52);
  /* ---------- centro e estradas ---------- */
  add('concrete',-2.4,2.4,0,.5,-2.4,2.4,0xb2aea2);add('concrete',-1.6,1.6,.5,1.15,-1.6,1.6,0xa8a498);add('concrete',-.55,.55,1.15,5.2,-.55,.55,0x9c988c);add('concrete',-.9,.9,5.2,5.5,-.9,.9,0xa8a498,false);
  barrier(-12,-2.2,'x');barrier(-9.6,-2.2,'x');barrier(11,2.2,'x');barrier(13.4,2.2,'x');barrier(2.2,-14,'z');barrier(2.2,-16.4,'z');barrier(-2.2,15,'z');barrier(-2.2,17.4,'z');
  barrier(-22,1.5,'z');barrier(24,-1.5,'z');barrier(-1.5,-30,'x');barrier(1.5,34,'x');
  car(-16,2,'x',0x7a7a72,true);car(18,-1.8,'x',0x2a4a3a);car(1.9,-24,'z',0x6a2a22,true);car(-1.9,26,'z',0xc9c4b4);car(-8,-9,'z',0x2f3f5a);
  // camião na estrada oeste
  add('paint',-40,-37.6,.5,2.9,-3.2,-.8,0x3a5a3a);add('container',-37.4,-30.4,.9,3.6,-3.3,-.7,0xcfd3d6);add('dark',-37.6,-30.4,.45,.9,-3,-1,0x1a1a1a);
  for(const x of [-39,-35.5,-32])for(const z of [-3.2,-.8])decor.push({k:'wheel',x,z,axis:'x',r:.5});
  W.rects.push({x0:-40,z0:-3.3,x1:-30.4,z1:-.7,k:'car'});
  add('paint',36,45,.6,3.1,.9,3.4,0xc9a23a);add('dark',36.3,44.7,1.7,2.6,.86,3.44,0x1a2630,false);add('dark',36.2,44.8,.3,.6,1.1,3.2,0x1a1a1a);
  for(const x of [38,43])for(const z of [.9,3.4])decor.push({k:'wheel',x,z,axis:'x',r:.5});
  W.rects.push({x0:36,z0:.9,x1:45,z1:3.4,k:'car'});
  for(const q of [[-6,-6],[6,-6],[-6,6],[6,6],[-30,-6],[30,6],[-6,30],[6,-30],[-48,6],[48,-6],[6,48],[-6,-48]])lamp(q[0],q[1]);
  for(const q of [[-12,-14,1.1],[-16,-22,1.3],[-9,-40,1],[9,10,1.2],[8,22,1],[10,56,1.2],[-8,8,1.1],[-56,-8,1.3],[-56,56,1.2],[56,-56,1.2],[56,8,1],[56,56,1.3],[-56,-56,1.2],[38,-10,1.1],[52,-12,1.3],[-10,56,1],[-56,4,1.1],[28,8,1.2],[-8,-56,1.1],[40,-56,1]])tree(q[0],q[1],q[2]);

  }
  /* ---------- pano de fundo: cidade, árvores, colinas ---------- */
  seed=11;
  for(let i=0;i<64;i++){const a=i/64*6.283+rr(-.04,.04),r=rr(82,150),w=rr(10,24),d=rr(10,22),h=rr(9,34)+(r>115?10:0),x=Math.cos(a)*r,z=Math.sin(a)*r;
    add('facade',x-w/2,x+w/2,0,h,z-d/2,z+d/2,[0xd8cdb8,0xc9b9a0,0xb8b0a4,0xd9c7b0,0xa9a39a][i%5],false);add('concrete',x-w/2-.3,x+w/2+.3,h,h+.5,z-d/2-.3,z+d/2+.3,0x8a857c,false);}
  for(let i=0;i<90;i++){const a=rr(0,6.283),r=rr(64,80);decor.push({k:'tree',x:Math.cos(a)*r,z:Math.sin(a)*r,s:rr(1.2,2.1)});}
  const hillM=new T.MeshStandardMaterial({color:C(0x69705c),roughness:1});
  for(let i=0;i<14;i++){const a=i/14*6.283+rr(-.1,.1),r=rr(260,380),m=new T.Mesh(new T.ConeGeometry(rr(120,200),rr(30,70),18),hillM);m.position.set(Math.cos(a)*r,6,Math.sin(a)*r);m.rotation.y=rr(0,6);scene.add(m);}

  /* ---------- malhas instanciadas ---------- */
  const dummy=new T.Object3D(),unit=new T.BoxGeometry(1,1,1),WHITE=new T.Color(1,1,1);
  function instanced(geo,mat,list,fn,noShadow){
    const m=new T.InstancedMesh(geo,mat,list.length);list.forEach((o,i)=>{dummy.rotation.set(0,0,0);dummy.scale.set(1,1,1);m.setColorAt(i,WHITE);fn(o,i,m);dummy.updateMatrix();m.setMatrixAt(i,dummy.matrix);});
    m.frustumCulled=false;m.castShadow=!noShadow;m.receiveShadow=true;m.instanceMatrix.needsUpdate=true;if(m.instanceColor)m.instanceColor.needsUpdate=true;scene.add(m);return m;}
  for(const k in inst){const im=instanced(unit,M[k],inst[k],(o,i,m)=>{dummy.position.set(o.x,o.y,o.z);dummy.scale.set(o.sx,o.sy,o.sz);m.setColorAt(i,C(o.c));});if(k==='glass'){im.castShadow=false;im.renderOrder=2;W.glassMesh=im;W.glass=inst.glass.map((o,i)=>({x:o.x,y:o.y,z:o.z,hx:o.sx/2+.4,hy:o.sy/2,hz:o.sz/2+.4,i,broken:false}));}}
  // sombra de contacto na base de paredes e objetos
  const strips=[];for(const b of W.boxes){if(b.y0>.15||b.y1<.6||b.gate)continue;const w=b.x1-b.x0,d=b.z1-b.z0,cx2=(b.x0+b.x1)/2,cz2=(b.z0+b.z1)/2,g2=Math.min(.9,.35+b.y1*.12);
    strips.push({x:cx2,z:b.z0-g2/2,l:w,g:g2,r:0},{x:cx2,z:b.z1+g2/2,l:w,g:g2,r:Math.PI},{x:b.x0-g2/2,z:cz2,l:d,g:g2,r:Math.PI/2},{x:b.x1+g2/2,z:cz2,l:d,g:g2,r:-Math.PI/2});}
  const sg=new T.PlaneGeometry(1,1);sg.rotateX(-Math.PI/2);
  const sm=new T.MeshBasicMaterial({map:TX.aoStrip(),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,toneMapped:false});
  const sI=instanced(sg,sm,strips,(o,i)=>{dummy.position.set(o.x,.048+(i%7)*.0006,o.z);dummy.rotation.set(0,o.r,0);dummy.scale.set(o.l,1,o.g);},true);sI.receiveShadow=false;sI.renderOrder=1;
  // tufos de erva
  const tufts=[],inRect=(x,z,m)=>W.rects.some(q=>x>q.x0-m&&x<q.x1+m&&z>q.z0-m&&z<q.z1+m);
  if(kind==='complexo'){for(let i=0;i<5200&&tufts.length<900;i++){const R2=W.rooms[Math.floor(rng()*W.rooms.length)];if(R2.theme==='armazem'||R2.theme==='patio'||R2.theme==='oficina')continue;
      const e=Math.floor(rng()*4),u=rng(),dd=rr(.3,2.2),x=e<2?R2.x0+u*(R2.x1-R2.x0):(e===2?R2.x0+dd:R2.x1-dd),z=e<2?(e===0?R2.z0+dd:R2.z1-dd):R2.z0+u*(R2.z1-R2.z0);
      if(R2.doors.some(q=>Math.hypot(q.x-x,q.z-z)<3)||inRect(x,z,.3))continue;tufts.push({x,z,s:rr(.6,1.3)});}}
  else{for(let i=0;i<14000&&tufts.length<3200;i++){const x=rr(-59,59),z=rr(-59,59);if(Math.abs(x)<5.2||Math.abs(z)<5.2)continue;
      if((x<-5&&z>5)||(x>9&&x<36&&z>9&&z<33)||(x>-24&&x<-5&&z>-27.5&&z<-5)||(x>42&&z>-40&&z<-18))continue;if(inRect(x,z,.6))continue;tufts.push({x,z,s:rr(.6,1.4)});}
    for(let i=0;i<500;i++){const a=rr(0,6.283),r=rr(62,74);tufts.push({x:Math.cos(a)*r,z:Math.sin(a)*r,s:rr(1,1.8)});}}
  const tp=[],tu=[],quad=(a)=>{const c=Math.cos(a)*.5,s2=Math.sin(a)*.5;tp.push(-c,0,-s2, c,0,s2, c,1,s2, -c,0,-s2, c,1,s2, -c,1,-s2);tu.push(0,0,1,0,1,1,0,0,1,1,0,1);};quad(0);quad(Math.PI/2);
  const tg2=new T.BufferGeometry();tg2.setAttribute('position',new T.Float32BufferAttribute(tp,3));tg2.setAttribute('uv',new T.Float32BufferAttribute(tu,2));tg2.computeVertexNormals();
  const tm=new T.MeshStandardMaterial({map:TX.grassTuft(),alphaTest:.45,side:T.DoubleSide,roughness:1});tm.envMapIntensity=.3;const tcol=[C(0xb8b890),C(0x9aa878),C(0xc8c098),C(0x8a9868)];
  if(tufts.length){const tI=instanced(tg2,tm,tufts,(o,i,m)=>{dummy.position.set(o.x,0,o.z);dummy.rotation.set(0,i*1.7,0);dummy.scale.set(o.s*.75,o.s*.5,o.s*.75);m.setColorAt(i,tcol[i%4]);},true);}
  const bushes=decor.filter(d=>d.k==='bush');if(bushes.length)instanced(new T.IcosahedronGeometry(1,1),new T.MeshStandardMaterial({color:0xffffff,roughness:.95,flatShading:true}),bushes,(o,i,m)=>{dummy.position.set(o.x,.45*o.s,o.z);dummy.rotation.set(i,i*3,0);dummy.scale.set(o.s,o.s*.62,o.s*.9);m.setColorAt(i,C([0x3c4f26,0x4a5a2c,0x36481f][i%3]));});
  const leafM0=()=>new T.MeshStandardMaterial({color:0xffffff,roughness:.95,flatShading:true});
  const by=k=>decor.filter(d=>d.k===k),trees=by('tree'),barrels=by('barrel'),wheels=by('wheel'),lamps=by('lamp');
  const bark=new T.MeshStandardMaterial({color:C(0x5a4632),roughness:1}),leafM=new T.MeshStandardMaterial({color:0xffffff,roughness:.95,flatShading:true});
  const lc=[C(0x3c4f26),C(0x48592a),C(0x55602e),C(0x354824)];
  instanced(new T.CylinderGeometry(.16,.26,1,7),bark,trees,o=>{dummy.position.set(o.x,1.5*o.s,o.z);dummy.scale.set(o.s,3*o.s,o.s);});
  instanced(new T.IcosahedronGeometry(1,1),leafM,trees,(o,i,m)=>{dummy.position.set(o.x,3.9*o.s,o.z);dummy.rotation.set(i,i*2,0);dummy.scale.set(1.5*o.s,1.35*o.s,1.5*o.s);m.setColorAt(i,lc[i%4]);});
  instanced(new T.IcosahedronGeometry(1,1),leafM,trees,(o,i,m)=>{dummy.position.set(o.x+.7*o.s,3.2*o.s,o.z-.5*o.s);dummy.rotation.set(i*3,i,0);dummy.scale.set(1.3*o.s,1.1*o.s,1.3*o.s);m.setColorAt(i,lc[(i+2)%4]);});
  instanced(new T.IcosahedronGeometry(1,1),leafM,trees,(o,i,m)=>{dummy.position.set(o.x-.8*o.s,3.4*o.s,o.z+.6*o.s);dummy.rotation.set(i*2,i*5,1);dummy.scale.set(1.2*o.s,1.0*o.s,1.25*o.s);m.setColorAt(i,lc[(i+1)%4]);});
  instanced(new T.IcosahedronGeometry(1,1),leafM,trees,(o,i,m)=>{dummy.position.set(o.x+.2*o.s,4.9*o.s,o.z+.3*o.s);dummy.rotation.set(i,i*7,2);dummy.scale.set(1.15*o.s,.95*o.s,1.1*o.s);m.setColorAt(i,lc[(i+3)%4]);});
  instanced(new T.IcosahedronGeometry(1,1),leafM,trees,(o,i,m)=>{dummy.position.set(o.x-.3*o.s,3.0*o.s,o.z-.9*o.s);dummy.rotation.set(i*4,i*3,3);dummy.scale.set(1.05*o.s,.9*o.s,1.1*o.s);m.setColorAt(i,lc[i%4]);});
  const bm=new T.MeshStandardMaterial({color:0xffffff,roughness:.5,metalness:.6});
  instanced(new T.CylinderGeometry(.3,.3,.95,14),bm,barrels,(o,i,m)=>{dummy.position.set(o.x,.475,o.z);m.setColorAt(i,C(o.col?0x8a2a22:0x2f4a6a));});
  instanced(new T.CylinderGeometry(.34,.34,.24,14),M.dark,wheels,o=>{const r=(o.r||.34)/.34;dummy.position.set(o.x,o.r||.34,o.z);dummy.rotation.set(o.axis==='x'?Math.PI/2:0,0,o.axis==='x'?0:Math.PI/2);dummy.scale.set(r,1,r);});
  instanced(new T.CylinderGeometry(.06,.09,5,8),M.dark,lamps,o=>{dummy.position.set(o.x,2.5,o.z);});
  instanced(new T.BoxGeometry(.9,.12,.3),M.dark,lamps,o=>{dummy.position.set(o.x+(o.x>0?-.4:.4),5,o.z);});
  // telhados inclinados
  const rm=new T.MeshStandardMaterial({map:M.metal.map,bumpMap:M.metal.bumpMap,bumpScale:.04,roughness:.7,metalness:.2,side:T.DoubleSide});rm.envMapIntensity=.5;
  for(const r of roofs){
    const w=r.x1-r.x0,d=r.z1-r.z0,alongX=w>=d,hh=(alongX?d:w)*.32,cx=(r.x0+r.x1)/2,cz=(r.z0+r.z1)/2,y=r.y;
    const P=alongX?[[r.x0,y,r.z0],[r.x1,y,r.z0],[r.x1,y,r.z1],[r.x0,y,r.z1],[r.x0,y+hh,cz],[r.x1,y+hh,cz]]:[[r.x0,y,r.z0],[r.x0,y,r.z1],[r.x1,y,r.z1],[r.x1,y,r.z0],[cx,y+hh,r.z0],[cx,y+hh,r.z1]];
    const tri=[[0,1,5],[0,5,4],[2,3,4],[2,4,5],[0,4,3],[1,2,5]],pos=[],uv=[],L=alongX?w:d,S=Math.hypot(hh,(alongX?d:w)/2);
    const uvOf=[[0,0],[L/2,0],[L/2,0],[0,0],[0,S/2],[L/2,S/2]];
    tri.forEach(t=>t.forEach(i=>{pos.push(P[i][0],P[i][1],P[i][2]);uv.push(uvOf[i][0],uvOf[i][1]);}));
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.computeVertexNormals();
    const mm=rm.clone();mm.color=C(r.col);const m=new T.Mesh(g,mm);m.castShadow=true;m.receiveShadow=true;scene.add(m);
  }

  // portões (malhas próprias, para poderem abrir)
  const gateM=new T.MeshStandardMaterial({color:C(0xa63a2a),roughness:.5,metalness:.5});gateM.envMapIntensity=.5;
  for(const gt of W.gates){const b=gt.box,m=new T.Mesh(new T.BoxGeometry(b.x1-b.x0,b.h,b.z1-b.z0),gateM);m.position.set((b.x0+b.x1)/2,b.h/2,(b.z0+b.z1)/2);m.castShadow=true;m.receiveShadow=true;scene.add(m);gt.mesh=m;
    const s2=new T.Mesh(new T.BoxGeometry(b.x1-b.x0+.04,.35,b.z1-b.z0+.04),M.dark);s2.position.set(0,.3,0);m.add(s2);}
  /* ---------- colisão ---------- */
  const A=new Float32Array((W.boxes.length+W.circles.length)*6);let k=0;
  for(const b of W.boxes){A[k++]=b.x0;A[k++]=b.x1;A[k++]=b.y0;A[k++]=b.y1;A[k++]=b.z0;A[k++]=b.z1;}
  for(const c of W.circles){const r=c.r*.8;A[k++]=c.x-r;A[k++]=c.x+r;A[k++]=c.y0;A[k++]=c.y1;A[k++]=c.z-r;A[k++]=c.z+r;}
  W.aabb=A;
  const grid=W.grid=new Map();
  function put(x0,x1,z0,z1,o){for(let i=Math.floor((x0+OFF)/CELL);i<=Math.floor((x1+OFF)/CELL);i++)for(let j=Math.floor((z0+OFF)/CELL);j<=Math.floor((z1+OFF)/CELL);j++){const key=i*1000+j;let l=grid.get(key);if(!l){l=[];grid.set(key,l);}l.push(o);}}
  for(const b of W.boxes)put(b.x0-1,b.x1+1,b.z0-1,b.z1+1,b);
  for(const c of W.circles){c.c=true;put(c.x-c.r-1,c.x+c.r+1,c.z-c.r-1,c.z+c.r+1,c);}

  W.gates.forEach(gt=>{gt.bi=W.boxes.indexOf(gt.box);gt.box.y1=-1;});   // navegação calculada com os portões abertos
  /* ---------- grelha de navegação ---------- */
  const walk=W.walk=new Uint8Array(NW*NW),p={x:0,z:0};
  for(let j=0;j<NW;j++)for(let i=0;i<NW;i++){const x=-W.H+(i+.5)*NC,z=-W.H+(j+.5)*NC;p.x=x;p.z=z;W.collide(p,.4,0);walk[j*NW+i]=(Math.abs(p.x-x)<1e-4&&Math.abs(p.z-z)<1e-4&&Math.abs(x)<59.4&&Math.abs(z)<59.4)?1:0;}
  // remover bolsas isoladas: só fica a maior região ligada
  const comp=new Int32Array(NW*NW);let best=0,bestN=0,id=0;const st=[];
  for(let s=0;s<NW*NW;s++){if(!walk[s]||comp[s])continue;id++;let n=0;st.push(s);comp[s]=id;
    while(st.length){const c=st.pop();n++;const ci=c%NW,cj=(c/NW)|0;
      if(ci>0&&walk[c-1]&&!comp[c-1]){comp[c-1]=id;st.push(c-1);}if(ci<NW-1&&walk[c+1]&&!comp[c+1]){comp[c+1]=id;st.push(c+1);}
      if(cj>0&&walk[c-NW]&&!comp[c-NW]){comp[c-NW]=id;st.push(c-NW);}if(cj<NW-1&&walk[c+NW]&&!comp[c+NW]){comp[c+NW]=id;st.push(c+NW);}}
    if(n>bestN){bestN=n;best=id;}}
  for(let s=0;s<NW*NW;s++)if(comp[s]!==best)walk[s]=0;
  W.walkN=bestN;
  let ok=true;
  if(kind==='complexo'){
    for(const R of W.rooms){const c=W.nearWalk(R.cx,R.cz);if(!c||c.x<R.x0||c.x>R.x1||c.z<R.z0||c.z>R.z1){ok=false;break;}R.wc=c;}
    for(let i=0;ok&&i<W.rooms.length-1;i++){if(!W.path(W.rooms[i].wc.x,W.rooms[i].wc.z,W.rooms[i+1].wc.x,W.rooms[i+1].wc.z))ok=false;}
    for(const gt of W.gates){gt.cells=[];const b=gt.box;for(let j=ci(b.z0-.6);j<=ci(b.z1+.6);j++)for(let i=ci(b.x0-.6);i<=ci(b.x1+.6);i++)if(W.walk[j*NW+i]){gt.cells.push(j*NW+i);W.walk[j*NW+i]=0;}gt.box.y1=gt.box.h;}
    W.pois=W.rooms.map(R=>R.wc).filter(Boolean);W.spawns=W.pois.slice();
  }else{
  for(const q of [[-56,-56],[56,-56],[-56,56],[56,56],[0,-56],[0,56],[-56,0],[56,0],[-20,-18],[20,18],[-22,10],[22,-8],[-38,-56],[38,56],[-56,-24],[56,24],[4,-38],[-4,40],[36,-16],[-36,40]]){const w=W.nearWalk(q[0],q[1]);if(w)W.spawns.push(w);}
  W.pois=W.pois.map(q=>W.nearWalk(q.x,q.z)).filter(Boolean);
  for(const q of [[0,-8],[8,0],[-8,0],[0,8],[-30,0],[30,0],[0,-30],[0,30],[-40,22],[-30,36],[-20,40],[40,20],[30,44],[20,-38],[38,-28],[-37,-26],[-56,-40],[50,-50]]){const w=W.nearWalk(q[0],q[1]);if(w)W.pois.push(w);}
  }
  return ok;
}
W.buildMap=function(kind,seedVal){for(let t=0;t<10;t++){if(buildOnce(kind,(seedVal||7)+t*101))return true;}return false;};
const _zm=new T.Matrix4().makeScale(0,0,0);
W.breakGlass=function(g){if(g.broken||!W.glassMesh)return;g.broken=true;W.glassMesh.setMatrixAt(g.i,_zm);W.glassMesh.instanceMatrix.needsUpdate=true;};
W.setGate=function(gt,open){
  if(gt.open===open)return;gt.open=open;const b=gt.box,A=W.aabb,k=gt.bi*6;
  if(open){b.y1=-1;A[k]=1e9;A[k+1]=-1e9;for(const c of gt.cells)W.walk[c]=1;}
  else{b.y1=b.h;A[k]=b.x0;A[k+1]=b.x1;for(const c of gt.cells)W.walk[c]=0;}
};
W.randWalkIn=function(R,m){m=m||1.5;for(let k=0;k<80;k++){const x=R.x0+m+Math.random()*(R.x1-R.x0-2*m),z=R.z0+m+Math.random()*(R.z1-R.z0-2*m);if(W.isWalk(x,z))return{x,z};}return R.wc||{x:R.cx,z:R.cz};};

/* ============ colisão e raios ============ */
W.collide=function(p,r,feet,top){top=top||1.7;
  for(let it=0;it<2;it++){
    const l=W.grid.get(Math.floor((p.x+OFF)/CELL)*1000+Math.floor((p.z+OFF)/CELL));
    if(l)for(const o of l){
      if(o.c){if(o.y1<feet+.3)continue;const dx=p.x-o.x,dz=p.z-o.z,d=Math.hypot(dx,dz),m=r+o.r;if(d<m){if(d>1e-5){p.x=o.x+dx/d*m;p.z=o.z+dz/d*m;}else p.x+=m;}}
      else{
        if(o.y1<feet+.45||o.y0>feet+top)continue;
        const cx=clamp(p.x,o.x0,o.x1),cz=clamp(p.z,o.z0,o.z1),dx=p.x-cx,dz=p.z-cz,d2=dx*dx+dz*dz;
        if(d2<r*r){
          if(d2>1e-8){const d=Math.sqrt(d2);p.x=cx+dx/d*r;p.z=cz+dz/d*r;}
          else{const a=p.x-o.x0,b=o.x1-p.x,c=p.z-o.z0,e=o.z1-p.z,m=Math.min(a,b,c,e);if(m===a)p.x=o.x0-r;else if(m===b)p.x=o.x1+r;else if(m===c)p.z=o.z0-r;else p.z=o.z1+r;}
        }
      }
    }
  }
  const L=W.H-.6;p.x=clamp(p.x,-L,L);p.z=clamp(p.z,-L,L);
};
/* altura do chão por baixo de um ponto (para saltar para cima de caixas baixas) */
W.floorAt=function(x,z,feet){
  let y=0;const l=W.grid.get(Math.floor((x+OFF)/CELL)*1000+Math.floor((z+OFF)/CELL));
  if(l)for(const o of l){if(o.c)continue;if(x>o.x0-.2&&x<o.x1+.2&&z>o.z0-.2&&z<o.z1+.2&&o.y1<=feet+.45&&o.y1>y)y=o.y1;}
  return y;
};
W.hit={nx:0,ny:1,nz:0,m:null};
W.ray=function(o,d,maxT){
  let t=maxT,hi=-1,hax=1;const A=W.aabb,n=A.length,ox=o.x,oy=o.y,oz=o.z,dx=d.x||1e-9,dy=d.y||1e-9,dz=d.z||1e-9,ix=1/dx,iy=1/dy,iz=1/dz;
  for(let i=0;i<n;i+=6){
    let a=(A[i]-ox)*ix,b=(A[i+1]-ox)*ix,mn=a<b?a:b,mx=a<b?b:a,ax=0;
    a=(A[i+2]-oy)*iy;b=(A[i+3]-oy)*iy;if(a>b){const s=a;a=b;b=s;}if(a>mn){mn=a;ax=1;}if(b<mx)mx=b;
    a=(A[i+4]-oz)*iz;b=(A[i+5]-oz)*iz;if(a>b){const s=a;a=b;b=s;}if(a>mn){mn=a;ax=2;}if(b<mx)mx=b;
    if(mx>=mn&&mx>=0&&mn<t){t=mn>0?mn:0;hi=i;hax=ax;}
  }
  const h=W.hit;
  if(dy<0){const tg=-oy/dy;if(tg<t){t=tg;h.nx=0;h.ny=1;h.nz=0;h.m='ground';return t;}}
  if(hi>=0){h.nx=hax===0?(dx>0?-1:1):0;h.ny=hax===1?(dy>0?-1:1):0;h.nz=hax===2?(dz>0?-1:1):0;const bi=hi/6;h.m=bi<W.boxes.length?W.boxes[bi].m:'wood';}else h.m=null;
  return t;
};
const _o={x:0,y:0,z:0},_d={x:0,y:0,z:0};
W.los=function(ax,ay,az,bx,by,bz){const dx=bx-ax,dy=by-ay,dz=bz-az,l=Math.hypot(dx,dy,dz)||1;_o.x=ax;_o.y=ay;_o.z=az;_d.x=dx/l;_d.y=dy/l;_d.z=dz/l;return W.ray(_o,_d,l)>=l-.05;};

/* ============ navegação (A* numa grelha de 0,5 m) ============ */
const ci=x=>clamp(Math.floor((x+W.H)/NC),0,NW-1),cx=i=>-W.H+(i+.5)*NC;
W.isWalk=(x,z)=>W.walk[ci(z)*NW+ci(x)]===1;
W.nearWalk=function(x,z){
  const i0=ci(x),j0=ci(z);if(W.walk[j0*NW+i0])return{x:cx(i0),z:cx(j0)};
  for(let r=1;r<40;r++)for(let dj=-r;dj<=r;dj++)for(let di=-r;di<=r;di++){if(Math.max(Math.abs(di),Math.abs(dj))!==r)continue;const i=i0+di,j=j0+dj;if(i<0||j<0||i>=NW||j>=NW)continue;if(W.walk[j*NW+i])return{x:cx(i),z:cx(j)};}
  return null;
};
W.randWalk=function(){for(let k=0;k<200;k++){const i=Math.floor(Math.random()*NW),j=Math.floor(Math.random()*NW);if(W.walk[j*NW+i])return{x:cx(i),z:cx(j)};}return{x:0,z:-6};};
W.walkLine=function(ax,az,bx,bz){const d=Math.hypot(bx-ax,bz-az),n=Math.ceil(d/.25);for(let k=0;k<=n;k++){const t=n?k/n:0;if(!W.walk[ci(az+(bz-az)*t)*NW+ci(ax+(bx-ax)*t)])return false;}return true;};
const gS=new Float32Array(NW*NW),from=new Int32Array(NW*NW),stamp=new Uint32Array(NW*NW),closed=new Uint32Array(NW*NW);let runId=0;
W.path=function(ax,az,bx,bz){
  const s0=W.nearWalk(ax,az),g0=W.nearWalk(bx,bz);if(!s0||!g0)return null;
  if(W.walkLine(s0.x,s0.z,g0.x,g0.z))return[{x:g0.x,z:g0.z}];
  const si=ci(s0.x),sj=ci(s0.z),gi=ci(g0.x),gj=ci(g0.z),S=sj*NW+si,G=gj*NW+gi;runId++;
  const heap=[],hf=[];
  const push=(n,f)=>{let i=heap.length;heap.push(n);hf.push(f);while(i>0){const p=(i-1)>>1;if(hf[p]<=f)break;heap[i]=heap[p];hf[i]=hf[p];i=p;}heap[i]=n;hf[i]=f;};
  const pop=()=>{const top=heap[0],n=heap.pop(),f=hf.pop();const L=heap.length;if(L){let i=0;for(;;){let c=i*2+1;if(c>=L)break;if(c+1<L&&hf[c+1]<hf[c])c++;if(hf[c]>=f)break;heap[i]=heap[c];hf[i]=hf[c];i=c;}heap[i]=n;hf[i]=f;}return top;};
  const hE=(i,j)=>{const dx=Math.abs(i-gi),dz=Math.abs(j-gj);return(dx+dz)+(1.4142-2)*Math.min(dx,dz);};
  gS[S]=0;stamp[S]=runId;from[S]=-1;push(S,hE(si,sj));let found=false,iter=0;const wk=W.walk;
  while(heap.length&&iter++<60000){
    const c=pop();if(closed[c]===runId)continue;closed[c]=runId;if(c===G){found=true;break;}
    const i=c%NW,j=(c/NW)|0,g=gS[c];
    for(let dj=-1;dj<=1;dj++)for(let di=-1;di<=1;di++){
      if(!di&&!dj)continue;const ni=i+di,nj=j+dj;if(ni<0||nj<0||ni>=NW||nj>=NW)continue;const n=nj*NW+ni;if(!wk[n]||closed[n]===runId)continue;
      if(di&&dj&&(!wk[j*NW+ni]||!wk[nj*NW+i]))continue;
      const ng=g+(di&&dj?1.4142:1);if(stamp[n]!==runId||ng<gS[n]){gS[n]=ng;stamp[n]=runId;from[n]=c;push(n,ng+hE(ni,nj));}
    }
  }
  if(!found)return null;
  const raw=[];for(let c=G;c!==-1;c=from[c])raw.push({x:cx(c%NW),z:cx((c/NW)|0)});raw.reverse();
  const out=[];let a=0;
  while(a<raw.length-1){let b=Math.min(raw.length-1,a+60);while(b>a+1&&!W.walkLine(raw[a].x,raw[a].z,raw[b].x,raw[b].z))b--;out.push(raw[b]);a=b;}
  return out;
};
/* ponto perto de (x,z) sem linha de vista para a ameaça */
W.cover=function(x,z,tx,tz,rad){
  let best=null,bs=1e9;
  for(let k=0;k<26;k++){const a=Math.random()*6.283,r=2+Math.random()*rad,px=x+Math.cos(a)*r,pz=z+Math.sin(a)*r;if(Math.abs(px)>58||Math.abs(pz)>58||!W.isWalk(px,pz))continue;
    if(W.los(px,1.5,pz,tx,1.5,tz)||W.los(px,.9,pz,tx,1.5,tz))continue;const s=r+Math.hypot(px-tx,pz-tz)*-.15;if(s<bs){bs=s;best={x:px,z:pz};}}
  return best;
};
})();
