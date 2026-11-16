/* Horas Mortas: Deathmatch — jogador, bots, armas, efeitos, partida, HUD */
(function(){
'use strict';
const $=id=>document.getElementById(id);
if(!window.THREE||!window.W||!window.CH||!window.TX){$('menu').classList.remove('on');$('err').classList.add('on');return;}
const T=THREE,W=window.W,CH=window.CH,TX=window.TX,TAU=Math.PI*2,rnd=(a,b)=>a+Math.random()*(b-a),clamp=W.clamp,C=W.C;
const angDiff=(a,b)=>{let d=(a-b)%TAU;if(d>Math.PI)d-=TAU;if(d<-Math.PI)d+=TAU;return d;};
const fmt=t=>{t=Math.max(0,Math.ceil(t));return Math.floor(t/60)+':'+String(t%60).padStart(2,'0');};
const store={get(k,d){try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v);}catch(e){return d;}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}};
let meta=Object.assign({wins:0,games:0,kills:0,deaths:0,bestLevel:0},store.get('hmd_meta',{}));
const S=Object.assign({dur:300,bots:7,diff:1,primary:'ar',sens:1,gfx:1,mode:'dm',knife:'karambit'},store.get('hmd_set',{}));
const DIFF=[{skill:.3,dmg:.5,react:.8},{skill:.58,dmg:.72,react:.48},{skill:.86,dmg:.92,react:.26}];

/* ================= render ================= */
const cv=$('c'),coarse=!!(window.matchMedia&&window.matchMedia('(pointer:coarse)').matches);
W.lowSpec=coarse;
const renderer=new T.WebGLRenderer({canvas:cv,antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,coarse?1.25:1.5));
renderer.outputEncoding=T.sRGBEncoding;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.62;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
const scene=new T.Scene(),camera=new T.PerspectiveCamera(75,1,.045,9000);camera.rotation.order='YXZ';scene.add(camera);
let composer=null,finalPass=null,bloomPass=null;const _sz=new T.Vector2();
function resize(){const w=window.innerWidth,h=window.innerHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
  if(composer){renderer.getDrawingBufferSize(_sz);composer.setSize(_sz.x,_sz.y);}}
/* pós-processamento: brilho (bloom), curva de filme ACES, correção de cor e grão. Só liga se a placa suportar alvos HDR. */
function initPost(){
  try{
    if(!T.EffectComposer||!T.UnrealBloomPass||!T.ShaderPass||!renderer.capabilities.isWebGL2||!renderer.extensions.get('EXT_color_buffer_float'))return;
    renderer.getDrawingBufferSize(_sz);
    const RT=T.WebGLMultisampleRenderTarget||T.WebGLRenderTarget,rt=new RT(_sz.x,_sz.y,{type:T.HalfFloatType,format:T.RGBAFormat,minFilter:T.LinearFilter,magFilter:T.LinearFilter});
    const c=new T.EffectComposer(renderer,rt);c.addPass(new T.RenderPass(scene,camera));
    bloomPass=new T.UnrealBloomPass(new T.Vector2(_sz.x/2,_sz.y/2),.22,.55,1.9);c.addPass(bloomPass);
    finalPass=new T.ShaderPass({uniforms:{tDiffuse:{value:null},exposure:{value:.8},time:{value:0}},
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader:['uniform sampler2D tDiffuse;uniform float exposure;uniform float time;varying vec2 vUv;',
        'vec3 rrt(vec3 v){vec3 a=v*(v+0.0245786)-0.000090537;vec3 b=v*(0.983729*v+0.4329510)+0.238081;return a/b;}',
        'vec3 aces(vec3 c){const mat3 I=mat3(vec3(0.59719,0.07600,0.02840),vec3(0.35458,0.90834,0.13383),vec3(0.04823,0.01566,0.83777));',
        'const mat3 O=mat3(vec3(1.60475,-0.10208,-0.00327),vec3(-0.53108,1.10813,-0.07276),vec3(-0.07367,-0.00605,1.07602));c*=exposure/0.6;c=I*c;c=rrt(c);c=O*c;return clamp(c,0.0,1.0);}',
        'float rnd(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}',
        'void main(){vec3 c=aces(max(texture2D(tDiffuse,vUv).rgb,vec3(0.0)));float l=dot(c,vec3(0.2126,0.7152,0.0722));',
        'c=mix(vec3(l),c,0.92);c=mix(c,c*c*(3.0-2.0*c),0.18);c*=mix(vec3(0.95,1.0,1.07),vec3(1.05,1.0,0.94),smoothstep(0.0,0.6,l));',
        'c=mix(c*12.92,1.055*pow(max(c,vec3(0.0001)),vec3(1.0/2.4))-0.055,step(vec3(0.0031308),c));',
        'c+=(rnd(vUv*vec2(1387.0,911.0)+time)-0.5)*0.02;gl_FragColor=vec4(c,1.0);}'].join('\n')});
    c.addPass(finalPass);composer=c;
  }catch(e){composer=null;}
}
window.addEventListener('resize',resize);resize();initPost();
const M=TX.materials();
W.initEnv(scene,renderer,M);W.buildMap('suburbio',7);

/* ================= áudio ================= */
let ac=null,muted=false,nbuf=null,master=null;
function initAudio(){if(ac){if(ac.state==='suspended')ac.resume().catch(()=>{});return;}
  try{ac=new (window.AudioContext||window.webkitAudioContext)();master=ac.createGain();master.gain.value=.8;master.connect(ac.destination);
    const n=Math.floor(ac.sampleRate*1.2);nbuf=ac.createBuffer(1,n,ac.sampleRate);const d=nbuf.getChannelData(0);for(let i=0;i<n;i++)d[i]=Math.random()*2-1;
    const s=ac.createBufferSource(),f=ac.createBiquadFilter(),g=ac.createGain();s.buffer=nbuf;s.loop=true;f.type='lowpass';f.frequency.value=380;g.gain.value=.025;s.connect(f);f.connect(g);g.connect(master);s.start();
  }catch(e){ac=null;}}
function tone(f0,f1,dur,type,vol,delay){if(!ac||muted||vol<.003)return;try{const o=ac.createOscillator(),g=ac.createGain(),t=ac.currentTime+(delay||0);
  o.type=type;o.frequency.setValueAtTime(f0,t);o.frequency.exponentialRampToValueAtTime(Math.max(20,f1),t+dur);g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.001,t+dur);o.connect(g);g.connect(master);o.start(t);o.stop(t+dur+.02);}catch(e){}}
function noise(dur,freq,vol,delay,hp){if(!ac||muted||vol<.003)return;try{const s=ac.createBufferSource(),f=ac.createBiquadFilter(),g=ac.createGain(),t=ac.currentTime+(delay||0);
  s.buffer=nbuf;f.type=hp?'highpass':'lowpass';f.frequency.value=freq;g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.001,t+dur);s.connect(f);f.connect(g);g.connect(master);s.start(t,rnd(0,.3),dur+.02);}catch(e){}}
function shotSound(id,dist){
  const v=Math.pow(clamp(1-dist/130,0,1),1.6)*(dist>1?.6:1),lp=dist>35?.4:1;
  if(id==='ar'){noise(.13,2300*lp,.42*v);noise(.05,6000*lp,.2*v,0,true);tone(190,60,.1,'sawtooth',.14*v);}
  else if(id==='smg'){noise(.08,3200*lp,.3*v);noise(.04,7000*lp,.14*v,0,true);tone(280,90,.06,'square',.07*v);}
  else if(id==='shotgun'){noise(.36,1400*lp,.75*v);tone(120,38,.26,'sawtooth',.22*v);noise(.1,5000*lp,.2*v,0,true);}
  else if(id==='sniper'){noise(.6,1700*lp,.85*v);tone(150,34,.45,'sawtooth',.26*v);noise(.12,7000*lp,.25*v,0,true);}
  else{noise(.1,2600*lp,.34*v);tone(330,100,.07,'square',.09*v);}
}
const sfx={hit(){tone(1500,1100,.03,'square',.06);noise(.03,5000,.05,0,true);},head(){tone(2100,1500,.08,'square',.09);},kill(){tone(700,700,.08,'triangle',.16);tone(1050,1050,.14,'triangle',.16,.08);},
  hurt(){tone(130,60,.18,'sawtooth',.2);noise(.1,700,.18);},step(v){noise(.07,rnd(260,420),v);},land(){noise(.16,300,.32);},
  reloadA(){noise(.04,3000,.14,0,true);tone(500,300,.04,'square',.04);},reloadB(){noise(.05,2400,.2,0,true);tone(300,520,.05,'square',.06);},
  empty(){tone(900,700,.03,'square',.05);},swap(){noise(.08,1800,.08);},radar(){tone(600,1800,.5,'sine',.12);tone(900,2400,.4,'sine',.07,.15);},
  boom(d){const v=Math.pow(clamp(1-d/90,0,1),1.5);noise(.9,500,.9*v);tone(90,25,.8,'sine',.7*v);noise(.25,3000,.4*v);},
  pin(){tone(1800,1200,.04,'square',.05);},die(){tone(200,50,.5,'sawtooth',.2);},
  win(){[523,659,784,1047].forEach((f,i)=>tone(f,f,.32,'triangle',.16,i*.14));},lose(){[400,340,280].forEach((f,i)=>tone(f,f*.9,.35,'triangle',.14,i*.2));},
  tick(){tone(1000,1000,.05,'square',.05);}};

/* ================= armas ================= */
const WP={
  ar:{n:'Assalto',dmg:23,rate:10.5,mag:30,rel:2.0,spr:.016,ads:.0022,pel:1,rng:55,zoom:1.35,want:22,kick:.5,rv:.0105,rh:.0042,auto:true,sight:.0905,L:.72},
  smg:{n:'SMG',dmg:17,rate:14.5,mag:32,rel:1.7,spr:.024,ads:.006,pel:1,rng:22,zoom:1.22,want:12,kick:.38,rv:.008,rh:.0052,auto:true,sight:.0685,L:.4},
  shotgun:{n:'Caçadeira',dmg:13,rate:1.25,mag:6,rel:2.4,spr:.07,ads:.055,pel:9,rng:11,zoom:1.15,want:7,kick:2.2,rv:.05,rh:.01,auto:false,sight:.047,L:.9},
  sniper:{n:'Sniper',dmg:110,rate:.85,mag:5,rel:2.7,spr:.07,ads:.0004,pel:1,rng:300,zoom:4.2,want:45,kick:2.4,rv:.06,rh:.008,auto:false,sight:.078,L:1.02},
  pistol:{n:'Pistola',dmg:30,rate:5.5,mag:12,rel:1.3,spr:.014,ads:.004,pel:1,rng:30,zoom:1.2,want:12,kick:.85,rv:.02,rh:.006,auto:false,sight:.048,L:.19},
  knife:{n:'Faca',melee:true,dmg:140,rate:1.7,mag:0,rel:1,spr:0,ads:0,pel:1,rng:2.4,zoom:1,want:2,kick:0,rv:0,rh:0,auto:false,sight:0,L:.2},
  nade:{n:'Granada',thrown:true,dmg:0,rate:1,mag:0,rel:1,spr:0,ads:0,pel:1,rng:0,zoom:1,want:0,kick:0,rv:0,rh:0,auto:false,sight:0,L:.1}
};
/* habilidades/melhorias do jogador (modo Incursão); no deathmatch ficam nos valores base */
function basePK(){return{dmg:1,rate:1,mag:1,rel:1,hp:100,regen:1,speed:1,leech:0,pierce:0,armor:1,head:1,dash:0,focus:0,radar:0,nadeMax:2,revive:0,expl:0};}
let PK=basePK(),runMode=false,RUN=null,perkOpen=false,perkChoices=[],pool=[];
const PM=id=>WP[id].mag?Math.max(1,Math.round(WP[id].mag*PK.mag)):0,RCD=()=>[30,18,10][PK.radar]||30;
const gm={metal:CH.mat(0x202124,{roughness:.5,metalness:.7}),poly:CH.mat(0x151516,{roughness:.8,metalness:.05}),wood:CH.mat(0x5a3a20,{roughness:.6,metalness:0}),
  tan:CH.mat(0x43463a,{roughness:.95,metalness:0}),glove:CH.mat(0x171718,{roughness:.9,metalness:0}),brass:CH.mat(0xb8923a,{roughness:.35,metalness:.9}),steel:CH.mat(0x55595f,{roughness:.3,metalness:.9})};
for(const k in gm)gm[k].envMapIntensity=.45;
const cylG=new T.CylinderGeometry(1,1,1,14);cylG.rotateX(Math.PI/2);
function B(p,m,sx,sy,sz,x,y,z,rx){const q=new T.Mesh(CH.box,m);q.scale.set(sx,sy,sz);q.position.set(x,y,z);if(rx)q.rotation.x=rx;p.add(q);return q;}
function Cy(p,m,r,len,x,y,z){const q=new T.Mesh(cylG,m);q.scale.set(r,r,len);q.position.set(x,y,z);p.add(q);return q;}
function arms(g,gripZ,gripY,foreZ,foreY,pistol){
  const ag=new T.Group();g.add(ag);g.userData.arms=ag;g.userData.grip=[0,gripY,gripZ];g.userData.fore=[0,foreY,foreZ];g.userData.pistol=!!pistol;
  const R=new T.Group();R.position.set(0,gripY,gripZ);ag.add(R);B(R,gm.glove,.058,.085,.07,0,-.02,0,.25);
  const fr=B(R,gm.tan,.064,.064,.34,.045,-.095,.2);fr.rotation.set(.36,-.2,0);
  const L=new T.Group();L.position.set(0,foreY,foreZ);ag.add(L);
  if(pistol){B(L,gm.glove,.06,.07,.065,-.012,-.03,.02,.2);const fl=B(L,gm.tan,.064,.064,.34,-.095,-.105,.19);fl.rotation.set(.36,.42,0);}
  else{B(L,gm.glove,.066,.05,.095,0,-.005,0);const fl=B(L,gm.tan,.064,.064,.36,-.105,-.095,.165);fl.rotation.set(.52,.6,0);}
}
function buildFP(id){
  const g=new T.Group(),o={g,mag:null,pump:null,magY:0};
  if(id==='ar'){
    B(g,gm.metal,.05,.078,.27,0,0,-.03);B(g,gm.metal,.032,.014,.34,0,.046,-.1);B(g,gm.poly,.052,.058,.27,0,.002,-.3);B(g,gm.metal,.044,.012,.26,0,-.032,-.3);
    Cy(g,gm.steel,.0105,.2,0,.008,-.53);Cy(g,gm.metal,.016,.06,0,.008,-.66);B(g,gm.metal,.012,.05,.02,0,.045,-.5);
    B(g,gm.poly,.038,.105,.048,0,-.085,.06,.32);B(g,gm.metal,.02,.02,.05,0,-.045,-.01);
    o.mag=B(g,gm.metal,.032,.17,.058,0,-.115,-.075,-.14);o.magY=-.115;
    B(g,gm.metal,.03,.014,.07,0,.06,-.06);B(g,gm.metal,.004,.042,.055,-.017,.088,-.06);B(g,gm.metal,.004,.042,.055,.017,.088,-.06);B(g,gm.metal,.038,.004,.055,0,.111,-.06);
    const dot=new T.Mesh(new T.SphereGeometry(.0016,8,6),new T.MeshBasicMaterial({color:0xff2a1a,toneMapped:false}));dot.position.set(0,.0905,-.06);g.add(dot);
    arms(g,.06,-.06,-.3,-.04);
  }else if(id==='smg'){
    B(g,gm.metal,.048,.085,.24,0,0,-.02);B(g,gm.poly,.044,.05,.13,0,-.005,-.2);Cy(g,gm.steel,.012,.1,0,.01,-.31);Cy(g,gm.metal,.02,.09,0,.01,-.36);
    B(g,gm.metal,.03,.012,.2,0,.048,-.04);B(g,gm.metal,.004,.02,.012,-.01,.064,.06);B(g,gm.metal,.004,.02,.012,.01,.064,.06);B(g,gm.metal,.004,.022,.008,0,.0625,-.24);
    B(g,gm.poly,.036,.1,.045,0,-.085,.05,.3);
    o.mag=B(g,gm.metal,.028,.2,.04,0,-.13,-.09);o.magY=-.13;
    arms(g,.05,-.06,-.19,-.045);
  }else if(id==='shotgun'){
    B(g,gm.metal,.05,.075,.25,0,0,-.02);Cy(g,gm.steel,.0135,.52,0,.016,-.4);Cy(g,gm.metal,.012,.4,0,-.016,-.34);
    o.pump=B(g,gm.poly,.052,.05,.17,0,-.016,-.3);B(g,gm.wood,.044,.085,.07,0,-.02,.13);
    B(g,gm.wood,.036,.09,.045,0,-.075,.07,.45);B(g,gm.brass,.006,.012,.006,0,.036,-.64);B(g,gm.metal,.03,.008,.2,0,.04,-.03);
    arms(g,.07,-.055,-.3,-.05);
  }else if(id==='sniper'){
    B(g,gm.wood,.052,.07,.4,0,-.02,-.05);B(g,gm.metal,.044,.05,.3,0,.02,-.05);Cy(g,gm.steel,.0125,.62,0,.024,-.5);Cy(g,gm.metal,.018,.07,0,.024,-.83);
    Cy(g,gm.metal,.024,.3,0,.078,-.05);Cy(g,gm.metal,.03,.06,0,.078,-.21);Cy(g,gm.metal,.028,.05,0,.078,.11);B(g,gm.metal,.016,.03,.02,0,.05,-.13);B(g,gm.metal,.016,.03,.02,0,.05,.03);
    o.pump=Cy(g,gm.steel,.008,.05,.04,.03,.08);B(g,gm.steel,.012,.012,.012,.055,.02,.1);
    o.mag=B(g,gm.metal,.03,.06,.07,0,-.07,-.06);o.magY=-.07;B(g,gm.wood,.036,.08,.045,0,-.08,.12,.4);
    arms(g,.12,-.06,-.2,-.06);
  }else if(id==='karambit'){
    const tilt=new T.Group();tilt.rotation.set(1.05,.45,-.25);tilt.position.set(-.005,.03,.0);tilt.scale.setScalar(1.3);g.add(tilt);const sp=new T.Group();tilt.add(sp);o.spin=sp;
    const blue=CH.mat(0x2a5fae,{roughness:.3,metalness:.85}),ring=new T.Mesh(new T.TorusGeometry(.017,.0045,8,20),gm.steel);ring.rotation.y=Math.PI/2;sp.add(ring);
    for(let i=0;i<4;i++)B(sp,i%2?gm.poly:blue,.02,.03,.032,0,-.008-i*i*.0025,-.032-i*.028,-i*.09);
    B(sp,gm.metal,.024,.042,.01,0,-.034,-.138,-.3);
    for(let i=0;i<7;i++){const a2=.3+i*.2,Rr=.09;B(sp,gm.steel,.0045,.036*(1-i*.115),.032,0,-.03-Rr*(1-Math.cos(a2)),-.145-Rr*(Math.sin(a2)-Math.sin(.3)),-a2);}
    g.userData.grip=[0,-.015,-.03];g.userData.fore=null;
  }else if(id==='butterfly'){
    const tilt=new T.Group();tilt.rotation.set(.8,.45,-.25);tilt.position.set(-.005,.03,.0);tilt.scale.setScalar(1.35);g.add(tilt);const pv=new T.Group();pv.position.set(0,0,-.06);tilt.add(pv);o.pivot=pv;
    B(pv,gm.steel,.004,.024,.105,0,0,-.055);B(pv,gm.steel,.004,.017,.03,0,-.0035,-.118,.22);B(pv,gm.metal,.006,.006,.03,0,.006,-.04);
    const gold=CH.mat(0xb8923a,{roughness:.35,metalness:.9});
    const hd=sy=>{const h2=new T.Group();pv.add(h2);B(h2,gm.metal,.011,.011,.125,0,sy*.0085,.062);for(let k=0;k<4;k++)B(h2,gm.poly,.012,.006,.012,0,sy*.0085,.02+k*.027);B(h2,gold,.013,.013,.008,0,sy*.0085,.004);return h2;};
    o.hA=hd(-1);o.hB=hd(1);g.userData.grip=[0,-.01,.02];g.userData.fore=null;
  }else if(id==='nade'){
    const nb=new T.Mesh(new T.SphereGeometry(.036,14,10),CH.mat(0x3a4a2c,{roughness:.6,metalness:.3}));nb.scale.set(1,1.2,1);nb.position.set(0,.03,-.01);g.add(nb);
    B(g,gm.metal,.022,.022,.022,0,.082,-.01);B(g,gm.steel,.008,.05,.03,.02,.06,-.01);
    const ag=new T.Group();g.add(ag);g.userData.arms=ag;g.userData.grip=[0,-.012,0];g.userData.fore=null;
    B(ag,gm.glove,.07,.06,.08,.004,-.012,.0);const fr=B(ag,gm.tan,.064,.064,.34,.05,-.11,.19);fr.rotation.set(.4,-.22,0);
  }else{
    B(g,gm.steel,.03,.038,.19,0,.022,-.055);B(g,gm.poly,.028,.03,.15,0,-.008,-.04);B(g,gm.poly,.03,.11,.05,0,-.07,.03,.22);B(g,gm.metal,.006,.018,.03,0,-.035,-.02);
    B(g,gm.metal,.004,.008,.006,-.008,.045,.03);B(g,gm.metal,.004,.008,.006,.008,.045,.03);B(g,gm.metal,.004,.008,.006,0,.045,-.14);
    o.mag=B(g,gm.metal,.024,.1,.04,0,-.075,.032,.22);o.magY=-.075;
    arms(g,.03,-.045,.03,-.075,true);
  }
  g.traverse(q=>{q.frustumCulled=false;});
  return o;
}
const VS=.8,vmRoot=new T.Group();vmRoot.scale.setScalar(VS);camera.add(vmRoot);
const vm={};Object.keys(WP).filter(k=>k!=='knife').concat(['karambit','butterfly']).forEach(id=>{vm[id]=buildFP(id);vm[id].g.visible=false;vmRoot.add(vm[id].g);});
const VK=id=>id==='knife'?(S.knife==='butterfly'?'butterfly':'karambit'):id;
const flareTex=TX.flare(),softTex=TX.soft(),holeTex=TX.hole();
const flashMat=new T.MeshBasicMaterial({map:flareTex,transparent:true,opacity:0,blending:T.AdditiveBlending,depthWrite:false,toneMapped:false,side:T.DoubleSide});
const flash=new T.Mesh(new T.PlaneGeometry(1,1),flashMat),flash2=new T.Mesh(new T.PlaneGeometry(1,1),flashMat);flash2.rotation.y=Math.PI/2;flash.add(flash2);vmRoot.add(flash);
const muzzle=new T.Object3D(),eject=new T.Object3D();vmRoot.add(muzzle);vmRoot.add(eject);
const shotLight=new T.PointLight(0xffc27a,0,11,2);scene.add(shotLight);

/* ================= efeitos ================= */
const tracers=[],parts=[],puffs=[],decals=[],shells=[],pGeo=new T.BoxGeometry(.045,.045,.045),pMats={};
for(let i=0;i<40;i++){const m=new T.Mesh(CH.box,new T.MeshBasicMaterial({color:0xffe9a8,transparent:true,blending:T.AdditiveBlending,depthWrite:false,toneMapped:false}));m.visible=false;scene.add(m);tracers.push({m,l:0,max:1});}
for(let i=0;i<150;i++){const m=new T.Mesh(pGeo,null);m.visible=false;scene.add(m);parts.push({m,l:0,vx:0,vy:0,vz:0});}
for(let i=0;i<70;i++){const s=new T.Sprite(new T.SpriteMaterial({map:softTex,transparent:true,depthWrite:false,opacity:0}));s.visible=false;scene.add(s);puffs.push({s,l:0,max:1,g:0,vy:0,o:1,sz:1});}
const decalG=new T.PlaneGeometry(1,1),decalM=new T.MeshBasicMaterial({map:holeTex,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4});
for(let i=0;i<110;i++){const m=new T.Mesh(decalG,decalM);m.visible=false;scene.add(m);decals.push(m);}
for(let i=0;i<24;i++){const m=new T.Mesh(CH.box,gm.brass);m.scale.set(.011,.011,.03);m.visible=false;scene.add(m);shells.push({m,l:0,vx:0,vy:0,vz:0,rx:0,rz:0});}
let trI=0,pI=0,puI=0,deI=0,shI=0,shake=0;
const _a=new T.Vector3(),_b=new T.Vector3(),_d=new T.Vector3(),_r=new T.Vector3(),_u=new T.Vector3(),_e=new T.Vector3(),UP=new T.Vector3(0,1,0),_n=new T.Vector3();
function tracer(from,to,thick,life){const t=tracers[trI=(trI+1)%tracers.length],len=from.distanceTo(to);if(len<1)return;t.m.position.copy(from).add(to).multiplyScalar(.5);t.m.lookAt(to);t.m.scale.set(thick,thick,len);t.m.material.opacity=.7;t.m.visible=true;t.l=t.max=life;}
function debris(x,y,z,col,n,sp){const mat=pMats[col]||(pMats[col]=new T.MeshStandardMaterial({color:C(col),roughness:.9}));
  for(let i=0;i<n;i++){const p=parts[pI=(pI+1)%parts.length];p.m.material=mat;p.m.position.set(x,y,z);p.m.visible=true;p.m.scale.setScalar(rnd(.6,1.6));p.vx=rnd(-1,1)*sp;p.vy=rnd(.1,1)*sp;p.vz=rnd(-1,1)*sp;p.l=rnd(.4,.9);}}
function puff(x,y,z,col,sz,life,grow,vy,op,add){const p=puffs[puI=(puI+1)%puffs.length];p.s.position.set(x,y,z);p.s.material.color.copy(C(col));p.s.material.blending=add?T.AdditiveBlending:T.NormalBlending;p.s.material.toneMapped=!add;
  p.s.material.rotation=rnd(0,TAU);p.s.scale.setScalar(sz);p.s.visible=true;p.l=p.max=life;p.g=grow;p.vy=vy;p.o=op;p.sz=sz;}
function decal(x,y,z,nx,ny,nz,size){const m=decals[deI=(deI+1)%decals.length];m.position.set(x+nx*.012,y+ny*.012,z+nz*.012);_n.set(x+nx,y+ny,z+nz);m.lookAt(_n);m.rotateZ(rnd(0,TAU));m.scale.setScalar(size);m.visible=true;}
const MCOL={ground:0x8a7d62,brick:0x9a5a48,concrete:0x9a9890,asphalt:0x55555a,plaster:0xcfc8b8,metal:0x8a9298,container:0x9aa0a6,sandbag:0xb5a379,wood:0x7a6248,crate:0x8a6a48,dirt:0x7b6a50,paint:0x888888,dark:0x333333};
function impact(x,y,z,near){
  const h=W.hit,col=MCOL[h.m]||0x999999;decal(x,y,z,h.nx,h.ny,h.nz,rnd(.09,.15));
  if(!near)return;
  puff(x+h.nx*.05,y+h.ny*.05,z+h.nz*.05,col,.18,.55,1.6,.5,.55);debris(x+h.nx*.03,y+h.ny*.03,z+h.nz*.03,col,3,2.2);
  if(h.m==='metal'||h.m==='container'||h.m==='paint')puff(x,y,z,0xffd27a,.12,.07,0,0,1,true);
}
function explosionFx(x,y,z){
  puff(x,y+.4,z,0xffd9a0,2.5,.16,22,0,1,true);puff(x,y+.5,z,0xff9a3a,1.6,.3,10,1,1,true);
  for(let i=0;i<10;i++)puff(x+rnd(-1,1),y+rnd(.2,1.4),z+rnd(-1,1),i%2?0x3a3632:0x6a645c,rnd(1,1.8),rnd(1.2,2.2),rnd(1.5,3),rnd(.6,1.8),.75);
  debris(x,y+.2,z,0x4a443a,22,8);decal(x,.0,z,0,1,0,rnd(3.4,4.4));
  shotLight.position.set(x,y+1,z);shotLight.intensity=14;shotLight.distance=30;
  const d=Math.hypot(x-P.x,z-P.z);shake=Math.max(shake,clamp(1.1-d/22,0,1));sfx.boom(d);if(d<14)flashT=Math.max(flashT,.25*(1-d/14));
}

/* ================= estado ================= */
let mode='load',bots=[],ents=[],nades=[],time=0,tLeft=0,frameN=0,timeScale=1,ready=false;
const P={isP:true,name:'Tu',x:0,y:0,z:0,vx:0,vz:0,vy:0,yaw:0,pitch:0,hp:100,alive:false,kills:0,deaths:0,streak:0,slots:[null,null],cur:0,fireCd:0,reloadT:0,ads:0,onG:true,
  crouch:0,crouchOn:false,sprint:0,recOff:0,bloom:0,bob:0,stepD:0,hurtT:9,prot:0,deadT:0,killer:null,nades:2,nadeCd:0,radarR:0,radarT:0,pingT:0,trig:false,landK:0,boltT:0,relDur:1,dashT:0,dashCh:1,dashCd:0,ddx:0,ddz:0,focusT:0,focusCd:0,last:1,stabT:0,throwT:0,backT:0,slideT:0,slideCd:0,slideV:0,slideK:0,sdx:0,sdz:0,crouchTog:false};
let kick=0,kickR=0,swapT=0,firing=false,adsHeld=false,sprintHeld=false,blood=0,hitT=0,flashT=0,dmgDirT=0,bigT=0,streakT=0,lagX=0,lagY=0,showBoard=false;
const eye=new T.Vector3();
const hh=e=>e.isP?(P.crouch>.5?1.02:1.5):1.5*(e.sc||1);

/* ================= bots ================= */
const NAMES=['Zé_Tiros','Marreta','xX_Tuga_Xx','Bacalhau','Faísca','Tremoço','Sardinha77','Chouriço','Pastel','Bifana','Nortada','Alheira','Gaivota','Ginjinha','Medronho','Lampreia'];
const markTex=(function(){const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d');g.fillStyle='#ff3b30';g.strokeStyle='#fff';g.lineWidth=5;g.beginPath();g.moveTo(32,8);g.lineTo(54,30);g.lineTo(32,56);g.lineTo(10,30);g.closePath();g.fill();g.stroke();return new T.CanvasTexture(c);})();
const markMat=new T.SpriteMaterial({map:markTex,depthTest:false,sizeAttenuation:false,toneMapped:false,fog:false});
function makeBot(i){
  const d=DIFF[S.diff],h=CH.make(i+1),ids=['ar','ar','smg','smg','shotgun','sniper','ar','smg'],id=ids[(i+Math.floor(Math.random()*8))%8];
  const b={id:i,isP:false,name:NAMES[i%NAMES.length],x:0,y:0,z:0,vx:0,vz:0,yaw:0,pitch:0,hp:100,alive:false,kills:0,deaths:0,streak:0,w:{id,ammo:WP[id].mag},
    skill:clamp(d.skill+rnd(-.12,.12),.1,.98),state:'hunt',path:null,target:null,lastSeen:null,seenT:0,hasLos:false,react:0,burst:3,pauseT:0,fireCd:0,reloadT:0,strafe:1,strafeT:0,
    think:rnd(0,.2),idleT:0,holdT:0,coverCd:0,alert:null,lastHitBy:null,spd:0,pingT:0,respT:0,hurtT:9,prot:0,nades:1,pgT:0,px:0,pz:0,h,back:false,stepT:0};
  scene.add(h.g);h.g.visible=false;
  b.mark=new T.Sprite(markMat);b.mark.scale.set(.026,.026,1);b.mark.position.y=2.15;b.mark.visible=false;b.mark.renderOrder=10;h.g.add(b.mark);
  return b;
}
function pickSpawn(e){let best=W.spawns[0],bs=-1;for(const s of W.spawns){let m=1e9;for(const o of ents){if(o===e||!o.alive)continue;let d=Math.hypot(o.x-s.x,o.z-s.z);if(d<70&&W.los(s.x,1.5,s.z,o.x,o.y+1.4,o.z))d*=.45;if(d<m)m=d;}m+=Math.random()*10;if(m>bs){bs=m;best=s;}}return best;}
function spawnEnt(e){
  const s=pickSpawn(e);e.x=s.x+rnd(-.3,.3);e.z=s.z+rnd(-.3,.3);e.y=0;e.vx=e.vz=0;e.hp=e.isP?PK.hp:(e.maxHp||100);e.alive=true;e.prot=1.6;e.hurtT=9;e.yaw=Math.atan2(-e.x,-e.z)+(e.isP?Math.PI:0);e.pitch=0;
  if(e.isP){P.vy=0;P.slots=[{id:S.primary,ammo:PM(S.primary)},{id:'pistol',ammo:PM('pistol')},{id:'knife',ammo:0},{id:'nade',ammo:0}];P.last=1;P.cur=0;P.slideT=0;P.stabT=0;P.throwT=0;P.backT=0;P.crouchTog=false;P.reloadT=0;P.fireCd=0;P.ads=0;P.recOff=0;P.bloom=0;P.nades=PK.nadeMax;P.dashT=0;P.dashCh=1;P.dashCd=0;P.focusT=0;P.focusCd=0;P.crouchOn=false;P.deadT=0;setWeapon(0,true);firing=false;adsHeld=false;}
  else{e.w.ammo=WP[e.w.id].mag;e.reloadT=0;e.target=null;e.path=null;e.state='hunt';e.alert=null;e.lastHitBy=null;e.idleT=0;e.nades=1;e.coverCd=0;CH.reset(e.h);e.h.g.visible=true;e.h.g.position.set(e.x,0,e.z);e.yaw=Math.atan2(-e.x,-e.z);}
}
function go(b,x,z,kind){const p=W.path(b.x,b.z,x,z);if(p&&p.length){b.path=p;b.state=kind;return true;}b.path=null;return false;}
const THINK=.2;
function botThink(b){
  let best=null,bd=1e9;
  for(const e of ents){
    if(e===b||!e.alive||e.prot>0||(runMode&&!e.isP))continue;const dx=e.x-b.x,dz=e.z-b.z,d=Math.hypot(dx,dz);if(d>80||d>=bd)continue;
    if(d>7&&e!==b.target&&e!==b.lastHitBy&&Math.abs(angDiff(Math.atan2(dx,dz),b.yaw))>1.1)continue;
    if(!W.los(b.x,b.y+1.55,b.z,e.x,e.y+hh(e)*.82,e.z))continue;best=e;bd=d;
  }
  if(best){if(b.target!==best)b.react=(DIFF[S.diff].react+rnd(0,.25))*(bd>35?1.4:1);b.target=best;b.seenT=0;b.lastSeen={x:best.x,z:best.z};b.hasLos=true;}
  else{b.hasLos=false;if(b.target){b.seenT+=THINK;if(!b.target.alive||b.seenT>5){b.target=null;b.lastSeen=null;if(b.state!=='cover'){b.state='hunt';b.path=null;}}}}
  if(b.state==='cover'){
    if(b.path&&b.path.length)return;
    if(b.hp>72||b.holdT<=0){b.state='hunt';}else return;
  }
  if(b.hp<46&&b.target&&b.hasLos&&b.coverCd<=0){const c=W.cover(b.x,b.z,b.target.x,b.target.z,13);b.coverCd=7;if(c&&go(b,c.x,c.z,'cover')){b.holdT=5;return;}}
  if(b.target){
    if(b.hasLos){b.state='fight';b.path=null;return;}
    if(b.state==='hold'){if(b.holdT>0)return;}
    if(b.state!=='search'||!b.path){
      const d=Math.hypot(b.lastSeen.x-b.x,b.lastSeen.z-b.z);
      if(b.state==='fight'&&b.nades>0&&d>8&&d<27&&Math.random()<.4){botNade(b);}
      if(b.state==='fight'&&Math.random()<.32){b.state='hold';b.holdT=rnd(.9,2.2);b.path=null;return;}
      if(!go(b,b.lastSeen.x,b.lastSeen.z,'search')){b.target=null;b.state='hunt';}
    }
    return;
  }
  if(b.alert){const a=b.alert;b.alert=null;if(go(b,a.x+rnd(-4,4),a.z+rnd(-4,4),'search'))return;}
  if(b.path&&b.path.length)return;
  if(b.idleT>0)return;
  let gx,gz;
  if(Math.random()<(runMode?.85:.62)){const al=ents.filter(e=>e!==b&&e.alive&&(!runMode||e.isP));if(al.length){const t=al[Math.floor(Math.random()*al.length)],a=rnd(0,TAU),r=rnd(5,15);gx=t.x+Math.cos(a)*r;gz=t.z+Math.sin(a)*r;}}
  if(gx===undefined){const q=runMode?W.randWalkIn(W.rooms[RUN.room]):W.pois[Math.floor(Math.random()*W.pois.length)];gx=q.x+rnd(-3,3);gz=q.z+rnd(-3,3);}
  if(!go(b,gx,gz,'hunt')){const q=runMode?W.randWalkIn(W.rooms[RUN.room]):W.randWalk();go(b,q.x,q.z,'hunt');}
}
function botNade(b){
  b.nades--;const tx=b.lastSeen.x+rnd(-1.5,1.5),tz=b.lastSeen.z+rnd(-1.5,1.5),dx=tx-b.x,dz=tz-b.z,D=Math.hypot(dx,dz),t=clamp(D/13,.6,1.7);
  throwNade(b,b.x,b.y+1.6,b.z,dx/t,(0-1.5)/t+.5*18*t,dz/t);
}
function botUpdate(b,dt){
  const h=b.h;
  if(!b.alive){CH.update(h,dt,0,0,0,false,-1);b.respT-=dt;if(b.respT<=1&&h.g.visible&&b.respT>0&&b.respT<.2)h.g.visible=false;if(b.respT<=0&&mode==='play'&&!runMode)spawnEnt(b);return;}
  b.think-=dt;if(b.think<=0){b.think=THINK;botThink(b);}
  if(b.hf>0)b.hf-=dt;b.idleT-=dt;b.holdT-=dt;b.coverCd-=dt;b.fireCd-=dt;b.react-=dt;b.prot=Math.max(0,b.prot-dt);b.pingT=Math.max(0,b.pingT-dt);if(b.pauseT>0)b.pauseT-=dt;
  b.hurtT+=dt;if(!runMode&&b.hurtT>5&&b.hp<100)b.hp=Math.min(100,b.hp+22*dt);
  b.mark.visible=P.radarT>0&&P.alive;
  const w=WP[b.w.id];
  if(b.reloadT>0){b.reloadT-=dt;if(b.reloadT<=0)b.w.ammo=w.mag;}else if(b.w.ammo<=0||(!b.target&&b.w.ammo<w.mag*.4))b.reloadT=w.rel;
  let mx=0,mz=0,sp=0,wantYaw=b.yaw,pitch=0,aiming=false;
  if((b.state==='fight'||b.state==='hold')&&b.target&&b.target.alive){
    const t=b.target,tx=b.hasLos?t.x:b.lastSeen.x,tz=b.hasLos?t.z:b.lastSeen.z,dx=tx-b.x,dz=tz-b.z,d=Math.hypot(dx,dz)||1,nx=dx/d,nz=dz/d;aiming=true;
    wantYaw=Math.atan2(dx,dz);pitch=Math.atan2((t.y+hh(t)*.72)-(b.y+1.5),d);
    if(b.state==='fight'){
      b.strafeT-=dt;if(b.strafeT<=0){b.strafeT=rnd(.45,1.5);b.strafe=Math.random()<.5?-1:1;if(Math.random()<.18)b.strafe=0;}
      const f=d>w.want*1.35?1:d<w.want*.5?-.8:0;mx=nx*f-nz*b.strafe*.9;mz=nz*f+nx*b.strafe*.9;sp=3.1;
      if(b.hasLos&&b.react<=0&&b.fireCd<=0&&b.reloadT<=0&&b.w.ammo>0&&b.pauseT<=0&&!(b.hf>0)&&Math.abs(angDiff(wantYaw,b.yaw))<.2){
        b.fireCd=1/(w.rate*(w.auto?.8:.55));b.w.ammo--;b.burst--;
        if(b.burst<=0){b.burst=w.auto?Math.floor(rnd(3,8)):1;b.pauseT=w.auto?rnd(.22,.6):rnd(.15,.5);}
        const tv=Math.hypot(t.vx||0,t.vz||0);let sig=(.012+.05*(1-b.skill))*(1+tv*.1)*(1+b.spd*.06)*(d<6?1.5:1);if(b.w.id==='sniper')sig*=.4;
        const ty=t.y+hh(t)*(Math.random()<.1+b.skill*.1?1.1:.7);
        _e.set(b.x,b.y+1.5,b.z);_b.set(t.x-b.x,ty-(b.y+1.5),t.z-b.z).normalize();_r.crossVectors(_b,UP).normalize();_u.crossVectors(_r,_b);
        _b.addScaledVector(_r,(Math.random()+Math.random()+Math.random()-1.5)*sig*1.5).addScaledVector(_u,(Math.random()+Math.random()+Math.random()-1.5)*sig*1.1).normalize();
        _a.copy(_e).addScaledVector(_b,.85);_a.y-=.08;shoot(b,_e,_b,b.w,_a);
      }
    }
  }else if(b.path&&b.path.length){
    const cw=b.path[0],dx=cw.x-b.x,dz=cw.z-b.z,d=Math.hypot(dx,dz);
    if(d<.45){b.path.shift();if(!b.path.length){b.path=null;if(b.state==='search'){b.idleT=rnd(.4,1.2);b.target=null;b.state='hunt';}else if(b.state==='hunt')b.idleT=rnd(.2,1.4);}}
    else{mx=dx/d;mz=dz/d;sp=b.state==='cover'?5.6:b.state==='search'?4.4:5;wantYaw=Math.atan2(mx,mz);aiming=b.state==='search';}
  }else if(b.idleT>0)wantYaw=b.yaw+dt*1.2;
  const dy=angDiff(wantYaw,b.yaw),tr=(aiming?6+5*b.skill:7)*dt;b.yaw+=clamp(dy,-tr,tr);b.pitch=pitch;
  const ox=b.x,oz=b.z,ml=Math.hypot(mx,mz);
  sp*=b.spdMul||1;
  if(ml>.01&&sp>0){b.x+=mx/ml*sp*dt;b.z+=mz/ml*sp*dt;W.collide(b,.36*(b.sc||1),0);}
  b.vx=(b.x-ox)/dt;b.vz=(b.z-oz)/dt;b.spd=Math.hypot(b.vx,b.vz);
  b.back=b.spd>.5&&(b.vx*Math.sin(b.yaw)+b.vz*Math.cos(b.yaw))<-.4*b.spd;
  b.y+=(W.floorAt(b.x,b.z,.2)-b.y)*Math.min(1,dt*12);
  b.pgT+=dt;
  if(b.pgT>1.3){
    if(ml>.01&&Math.hypot(b.x-b.px,b.z-b.pz)<.5){if(b.state==='fight')b.strafe=-b.strafe||1;else{b.path=null;const q=runMode?W.randWalkIn(W.rooms[RUN.room]):W.randWalk();if(Math.hypot(q.x-b.x,q.z-b.z)<40)go(b,q.x,q.z,'hunt');}}
    b.px=b.x;b.pz=b.z;b.pgT=0;
  }
  h.g.position.set(b.x,b.y,b.z);h.g.rotation.y=b.yaw;
  const far=Math.abs(b.x-P.x)+Math.abs(b.z-P.z)>120;
  const sy=Math.sin(b.yaw),cy=Math.cos(b.yaw);
  if(!far||frameN%3===0)CH.update(h,far?dt*3:dt,b.vx*sy+b.vz*cy,-b.vx*cy+b.vz*sy,b.pitch,aiming,b.reloadT>0?1-b.reloadT/w.rel:-1);
}

/* ================= combate ================= */
function raySphere(o,d,cx,cy,cz,r){const ox=cx-o.x,oy=cy-o.y,oz=cz-o.z,tca=ox*d.x+oy*d.y+oz*d.z;if(tca<0)return Infinity;const d2=ox*ox+oy*oy+oz*oz-tca*tca;if(d2>r*r)return Infinity;return tca-Math.sqrt(r*r-d2);}
function rayBox(o,d,x0,x1,y0,y1,z0,z1){
  let mn=0,mx=1e9,a,b,s;const dx=d.x||1e-9,dy=d.y||1e-9,dz=d.z||1e-9;
  a=(x0-o.x)/dx;b=(x1-o.x)/dx;if(a>b){s=a;a=b;b=s;}if(a>mn)mn=a;if(b<mx)mx=b;if(mn>mx)return Infinity;
  a=(y0-o.y)/dy;b=(y1-o.y)/dy;if(a>b){s=a;a=b;b=s;}if(a>mn)mn=a;if(b<mx)mx=b;if(mn>mx)return Infinity;
  a=(z0-o.z)/dz;b=(z1-o.z)/dz;if(a>b){s=a;a=b;b=s;}if(a>mn)mn=a;if(b<mx)mx=b;if(mn>mx)return Infinity;return mn;
}
const _pd=new T.Vector3(),_end=new T.Vector3(),_hitList=[];
function shoot(s,o,dir,wi,muz){
  const w=WP[wi.id],dP=s.isP?0:Math.hypot(s.x-P.x,s.z-P.z),near=dP<70,passes=s.isP?1+PK.pierce:1;
  if(w.pel>1){_r.crossVectors(dir,UP).normalize();_u.crossVectors(_r,dir);}
  for(let p=0;p<w.pel;p++){
    _pd.copy(dir);
    if(w.pel>1){const a=rnd(0,TAU),r=Math.sqrt(Math.random())*(s.isP?(P.ads>.5?w.ads:w.spr):w.spr);_pd.addScaledVector(_r,Math.cos(a)*r).addScaledVector(_u,Math.sin(a)*r).normalize();}
    const wallT=W.ray(o,_pd,320),hm=W.hit.m,hnx=W.hit.nx,hny=W.hit.ny,hnz=W.hit.nz;_hitList.length=0;let endT=wallT,any=false;
    for(let pass=0;pass<passes;pass++){
      let t=wallT,hit=null,head=false;
      for(const e of ents){
        if(e===s||!e.alive||_hitList.indexOf(e)>=0||(runMode&&!s.isP&&!e.isP))continue;const H=hh(e),br=CH.BODY_R*(e.sc||1);
        const al=(e.x-o.x)*_pd.x+(e.z-o.z)*_pd.z+(e.y+1-o.y)*_pd.y;if(al<-1||al>t+1)continue;
        const th=raySphere(o,_pd,e.x,e.y+H+.15*(e.sc||1),e.z,CH.HEAD_R*(e.sc||1));if(th<t){t=th;hit=e;head=true;}
        const tb=rayBox(o,_pd,e.x-br,e.x+br,e.y,e.y+H,e.z-br,e.z+br);if(tb<t){t=tb;hit=e;head=false;}
      }
      if(!hit)break;
      _hitList.push(hit);any=true;if(pass===passes-1)endT=t;
      const hx=o.x+_pd.x*t,hy=o.y+_pd.y*t,hz=o.z+_pd.z*t,fall=t<=w.rng?1:Math.max(.35,1-(t-w.rng)/w.rng*.7);
      if(near){puff(hx,hy,hz,0x7a0d0d,.22,.35,1.4,.2,.8);debris(hx,hy,hz,0x6a0a0a,head?5:2,2.4);}
      const mult=s.isP?PK.dmg*(head?PK.head:1)*(pass?.75:1):hit.isP?DIFF[S.diff].dmg*(runMode?1+RUN.level*.02:1):.75;
      hurt(hit,w.dmg*fall*(head?(wi.id==='sniper'?2:1.5):1)*mult,s,head,wi);
      if(s.isP&&PK.expl&&p===0&&pass===0){puff(hx,hy,hz,0xffb060,.9,.14,5,0,1,true);
        for(const b of bots.slice()){if(b.alive&&b!==hit&&Math.hypot(b.x-hx,b.y+1-hy,b.z-hz)<2.8)hurt(b,w.dmg*(w.pel>1?1.6:.45)*PK.dmg,s,false,wi);}}
      if(mode!=='play')return;
    }
    _end.copy(o).addScaledVector(_pd,endT);
    if(near||s.isP)tracer(muz,_end,wi.id==='sniper'?.035:.016,wi.id==='sniper'?.16:.05);
    if((!any||endT===wallT)&&wallT<319&&hm){W.hit.m=hm;W.hit.nx=hnx;W.hit.ny=hny;W.hit.nz=hnz;_end.copy(o).addScaledVector(_pd,wallT);impact(_end.x,_end.y,_end.z,near||s.isP);}
  }
  shotSound(wi.id,dP);s.pingT=1.6;
  if(!s.isP&&dP<45){shotLight.position.copy(muz);shotLight.intensity=Math.max(shotLight.intensity,5*(1-dP/45));shotLight.distance=11;puff(muz.x,muz.y,muz.z,0xffc27a,.3,.05,0,0,1,true);}
  for(const b of bots){if(b===s||!b.alive||b.target||b.state==='cover')continue;const d=Math.hypot(b.x-s.x,b.z-s.z);if(d<42&&Math.random()<.5)b.alert={x:s.x,z:s.z};}
}
function hurt(e,amt,src,head,wi){
  if(!e.alive||mode!=='play'||e.prot>0)return;
  if(e.isP)amt*=PK.armor;
  e.hp-=amt;e.hurtT=0;
  if(e.isP){blood=Math.min(1,blood+.35+amt/70);sfx.hurt();P.recOff+=rnd(-.02,.02);kickR+=rnd(-1,1)*.5;
    if(src&&src!==e){dmgDirT=1.3;$('dmgdir').style.transform='rotate('+(-angDiff(Math.atan2(src.x-P.x,src.z-P.z),P.yaw+Math.PI)*180/Math.PI)+'deg)';}}
  else{e.h.flinch=1;if(src&&src!==e){e.lastHitBy=src;if(!e.target){e.alert={x:src.x,z:src.z};e.yaw+=clamp(angDiff(Math.atan2(src.x-e.x,src.z-e.z),e.yaw),-1.3,1.3);e.think=Math.min(e.think,.06);}}}
  if(src&&src.isP&&src!==e){hitT=.13;$('hitm').className='';if(head)sfx.head();else sfx.hit();}
  if(e.hp<=0){
    if(e.isP&&runMode&&PK.revive>0){PK.revive--;e.hp=PK.hp*.6;e.prot=2.5;flashT=.5;big('SEGUNDA VIDA','Tens mais uma oportunidade',2.5);sfx.radar();return;}
    die(e,src,wi,head);
  }
}
function feed(html){const f=$('feed'),d=document.createElement('div');d.innerHTML=html;f.appendChild(d);while(f.children.length>5)f.removeChild(f.firstChild);setTimeout(()=>{if(d.parentNode)d.parentNode.removeChild(d);},6000);}
const nm=e=>e.isP?'<b class="me">Tu</b>':'<b>'+e.name+'</b>';
function pop(html){const p=$('pops'),d=document.createElement('div');d.innerHTML=html;p.appendChild(d);while(p.children.length>4)p.removeChild(p.firstChild);setTimeout(()=>{if(d.parentNode)d.parentNode.removeChild(d);},1600);}
function die(e,src,wi,head){
  e.alive=false;e.hp=0;e.deaths++;e.streak=0;
  if(src&&src!==e){src.kills++;src.streak++;feed(nm(src)+' <span>['+(wi?WP[wi.id].n:'')+(head?' · cabeça':'')+']</span> '+nm(e));}
  else{if(src===e)e.kills=Math.max(0,e.kills-1);feed(nm(e)+' <span>rebentou-se</span>');}
  if(src&&src.isP&&src!==e){hitT=.32;$('hitm').className='kill';sfx.kill();pop('<b>+100</b> Eliminação');if(head)pop('<b>+50</b> Tiro na cabeça');
    if(P.streak===3||P.streak===5||P.streak===7||P.streak===10){$('streak').textContent='SEQUÊNCIA DE '+P.streak+' ABATES';$('streak').style.opacity=1;streakT=2.5;P.radarR=0;P.nades=Math.min(PK.nadeMax+1,P.nades+1);}}
  if(runMode&&src&&src.isP&&!e.isP){P.hp=Math.min(PK.hp,P.hp+PK.leech);RUN.kills++;RUN.xp+=e.xp||1;while(RUN.xp>=RUN.xpNext){RUN.xp-=RUN.xpNext;RUN.xpNext=Math.round(RUN.xpNext*1.3+1);RUN.pending++;pop('<b>NOVA HABILIDADE</b>');}}
  if(runMode&&!e.isP)RUN.check=true;
  if(e.isP){P.deadT=3.2;P.slideT=0;toggleBuy(false);P.killer=src&&src!==e?src:null;firing=false;adsHeld=false;sfx.die();big(P.killer?'ELIMINADO POR '+P.killer.name.toUpperCase():'ELIMINADO','',3.2);}
  else{CH.kill(e.h);e.respT=3.2;e.mark.visible=false;e.path=null;e.target=null;for(const b of bots)if(b.target===e){b.target=null;b.lastSeen=null;if(b.state==='fight'||b.state==='hold'||b.state==='search'){b.state='hunt';b.path=null;}}}
}
/* granadas */
const nadeG=new T.SphereGeometry(.06,10,8),nadeM=CH.mat(0x3a4a2c,{roughness:.6,metalness:.3});
function throwNade(owner,x,y,z,vx,vy,vz){const m=new T.Mesh(nadeG,nadeM);m.castShadow=true;m.position.set(x,y,z);scene.add(m);nades.push({m,x,y,z,vx,vy,vz,t:2.3,owner});sfx.pin();}
function nadeStep(g,dt){
  let bounce=0;g.vy-=18*dt;const nx=g.x+g.vx*dt,ny=g.y+g.vy*dt,nz=g.z+g.vz*dt,dl=Math.hypot(nx-g.x,ny-g.y,nz-g.z);
  if(dl>1e-5){_e.set(g.x,g.y,g.z);_b.set((nx-g.x)/dl,(ny-g.y)/dl,(nz-g.z)/dl);const t=W.ray(_e,_b,dl+.07);
    if(t<dl+.07){const h=W.hit,dot=g.vx*h.nx+g.vy*h.ny+g.vz*h.nz;g.vx=(g.vx-1.55*dot*h.nx)*.62;g.vy=(g.vy-1.45*dot*h.ny)*.62;g.vz=(g.vz-1.55*dot*h.nz)*.62;
      g.x+=_b.x*Math.max(0,t-.07);g.y+=_b.y*Math.max(0,t-.07);g.z+=_b.z*Math.max(0,t-.07);bounce=Math.abs(dot);}
    else{g.x=nx;g.y=ny;g.z=nz;}}
  if(g.y<.07){g.y=.07;g.vy=Math.abs(g.vy)*.3;}
  return bounce;
}
const TRN=64,trajPos=new Float32Array(TRN*3),trajGeo=new T.BufferGeometry();trajGeo.setAttribute('position',new T.BufferAttribute(trajPos,3));
const trajLine=new T.Line(trajGeo,new T.LineBasicMaterial({color:0xffc04a,transparent:true,opacity:.9,toneMapped:false,fog:false}));trajLine.frustumCulled=false;trajLine.visible=false;scene.add(trajLine);
const trajRing=new T.Mesh(new T.RingGeometry(.3,.42,28),new T.MeshBasicMaterial({color:0xffc04a,transparent:true,opacity:.9,side:T.DoubleSide,toneMapped:false,fog:false,depthWrite:false}));trajRing.rotation.x=-Math.PI/2;trajRing.visible=false;scene.add(trajRing);
const trajBlast=new T.Mesh(new T.RingGeometry(7.3,7.5,64),new T.MeshBasicMaterial({color:0xff5a3a,transparent:true,opacity:.35,side:T.DoubleSide,toneMapped:false,fog:false,depthWrite:false}));trajBlast.rotation.x=-Math.PI/2;trajBlast.visible=false;scene.add(trajBlast);
const _tg={};
function trajPreview(show){
  trajLine.visible=trajRing.visible=trajBlast.visible=show;if(!show)return;
  camera.updateMatrixWorld(true);const g=nadeLaunch(_tg);
  for(let i=0;i<TRN;i++){trajPos[i*3]=g.x;trajPos[i*3+1]=g.y;trajPos[i*3+2]=g.z;nadeStep(g,2.3/TRN);}
  trajGeo.attributes.position.needsUpdate=true;trajRing.position.set(g.x,g.y-.03,g.z);trajBlast.position.set(g.x,.06,g.z);
}
function nadeUpdate(dt){
  for(const g of nades){
    g.t-=dt;const bn=nadeStep(g,dt);if(bn>2&&Math.hypot(g.x-P.x,g.z-P.z)<25)noise(.04,1500,.08);
    g.m.position.set(g.x,g.y,g.z);g.m.rotation.x+=dt*8;
    if(g.t<=0){scene.remove(g.m);g.dead=true;explosionFx(g.x,g.y,g.z);
      for(const e of ents.slice()){if(!e.alive||(runMode&&!g.owner.isP&&!e.isP))continue;const d=Math.hypot(e.x-g.x,e.y+1-g.y,e.z-g.z);if(d<7.5&&(W.los(g.x,g.y+.4,g.z,e.x,e.y+1.1,e.z)||W.los(g.x,g.y+.4,g.z,e.x,e.y+.3,e.z)))hurt(e,160*Math.pow(1-d/7.5,.9)*(e.isP&&g.owner!==e?DIFF[S.diff].dmg+.15:1),g.owner,false,{id:'nade'});if(mode!=='play')break;}
      for(const b of bots)if(b.alive&&!b.target&&Math.hypot(b.x-g.x,b.z-g.z)<40)b.alert={x:g.x,z:g.z};}
  }
  if(nades.some(g=>g.dead))nades=nades.filter(g=>!g.dead);
}

/* ================= partida ================= */
function startMatch(){
  bots.forEach(b=>{if(pool.indexOf(b)<0)scene.remove(b.h.g);});bots=[];nades.forEach(g=>scene.remove(g.m));nades=[];decals.forEach(d=>d.visible=false);$('feed').innerHTML='';$('pops').innerHTML='';
  time=0;tLeft=S.dur;P.kills=0;P.deaths=0;P.streak=0;P.radarR=0;P.radarT=0;P.alive=false;blood=0;
  for(let i=0;i<S.bots;i++)bots.push(makeBot(i));ents=[P].concat(bots);
  spawnEnt(P);for(const b of bots)spawnEnt(b);
  big('TODOS CONTRA TODOS','Elimina o máximo que conseguires em '+fmt(S.dur),3);
}
function ranking(){return ents.slice().sort((a,b)=>b.kills-a.kills||a.deaths-b.deaths);}
function boardHTML(){let h='<tr><th>#</th><th>Jogador</th><th>Abates</th><th>Mortes</th><th>K/D</th></tr>';ranking().forEach((e,i)=>{h+='<tr'+(e.isP?' class="me"':'')+'><td>'+(i+1)+'</td><td>'+(e.isP?'Tu':e.name)+'</td><td>'+e.kills+'</td><td>'+e.deaths+'</td><td>'+(e.deaths?(e.kills/e.deaths).toFixed(2):e.kills.toFixed(2))+'</td></tr>';});return h;}
function endMatch(){
  if(mode!=='play')return;mode='over';firing=false;adsHeld=false;showBoard=false;
  const r=ranking(),place=r.indexOf(P)+1,win=place===1&&P.kills>0;meta.games++;meta.kills+=P.kills;meta.deaths+=P.deaths;if(win)meta.wins++;store.set('hmd_meta',meta);
  $('oTitle').textContent=win?'Vitória':'Fim da partida';$('oTitle').style.color=win?'#f0a429':'#fff';
  $('oMsg').textContent=win?'Primeiro lugar com '+P.kills+' abates.':'Ficaste em '+place+'.º de '+ents.length+' com '+P.kills+' abates. Ganhou '+(r[0].isP?'ninguém':r[0].name)+' com '+r[0].kills+'.';
  $('endT').innerHTML=boardHTML();big(win?'VITÓRIA':'TEMPO ESGOTADO','',2);if(win)sfx.win();else sfx.lose();
  setTimeout(()=>{if(mode==='over'){show('over');unlock();}},1800);
}

/* ================= modo Incursão (salas e habilidades) ================= */
const THEME={armazem:'Armazém',patio:'Pátio',contentores:'Contentores',ruinas:'Ruínas',bunker:'Bunker',casa:'Casa',oficina:'Oficina',praca:'Praça'};
const PERKS=[
  {id:'dash',ic:'💨',n:'Dash',max:3,d:k=>['','Dash (E) recarrega muito mais depressa','Dash (E) com 2 cargas'][k.dash],f:k=>k.dash++},
  {id:'focus',ic:'⏳',n:'Foco',max:3,d:k=>['','Foco (V) dura 5 s em vez de 3,5','Foco (V) dura 6,5 s'][k.focus],f:k=>k.focus++},
  {id:'dmg',ic:'💥',n:'Munição pesada',max:6,d:()=>'+15% de dano com todas as armas',f:k=>k.dmg*=1.15},
  {id:'rate',ic:'⚡',n:'Gatilho leve',max:4,d:()=>'+10% de cadência de tiro',f:k=>k.rate*=1.1},
  {id:'mag',ic:'🔋',n:'Carregador alargado',max:3,d:()=>'+30% de munição por carregador',f:k=>k.mag*=1.3},
  {id:'rel',ic:'🔁',n:'Mãos rápidas',max:3,d:()=>'Recarga 20% mais rápida',f:k=>k.rel*=.8},
  {id:'hp',ic:'❤️',n:'Blindagem',max:5,d:()=>'+25 de vida máxima e cura total',f:k=>k.hp+=25},
  {id:'regen',ic:'🩹',n:'Recuperação',max:3,d:()=>'A vida começa a regenerar mais cedo e mais depressa',f:k=>k.regen*=1.4},
  {id:'armor',ic:'🛡️',n:'Colete',max:4,d:()=>'-12% de dano recebido',f:k=>k.armor*=.88},
  {id:'speed',ic:'👟',n:'Pernas',max:3,d:()=>'+7% de velocidade',f:k=>k.speed*=1.07},
  {id:'leech',ic:'🩸',n:'Sanguessuga',max:3,d:()=>'Cada abate cura 12 de vida',f:k=>k.leech+=12},
  {id:'head',ic:'🎯',n:'Atirador',max:3,d:()=>'+30% de dano em tiros na cabeça',f:k=>k.head*=1.3},
  {id:'pierce',ic:'📌',n:'Balas perfurantes',max:2,d:()=>'As balas atravessam mais um inimigo',f:k=>k.pierce++},
  {id:'expl',ic:'🧨',n:'Balas explosivas',max:1,d:()=>'Cada tiro certeiro fere também quem estiver ao lado',f:k=>k.expl=1},
  {id:'nade',ic:'💣',n:'Bolsa de granadas',max:3,d:()=>'+1 granada de capacidade, e recebes uma já',f:k=>k.nadeMax++},
  {id:'radar',ic:'📡',n:'Radar melhorado',max:2,d:()=>'O radar (F) recarrega muito mais depressa',f:k=>k.radar++},
  {id:'revive',ic:'✨',n:'Segunda vida',max:1,d:()=>'Uma vez por incursão, em vez de morreres voltas com 60% de vida',f:k=>k.revive=1}
];
function openPerk(){
  const av=PERKS.filter(q=>(RUN.taken[q.id]||0)<q.max&&!(q.id==='revive'&&PK.revive)),ch=[];
  while(ch.length<3&&av.length)ch.push(av.splice(Math.floor(Math.random()*av.length),1)[0]);
  if(!ch.length){RUN.pending=0;return;}
  perkChoices=ch;perkOpen=true;firing=false;adsHeld=false;const box=$('perkCards');box.innerHTML='';
  ch.forEach((q,i)=>{const d=document.createElement('div'),lv=(RUN.taken[q.id]||0);d.innerHTML='<kbd>'+(i+1)+'</kbd><i>'+q.ic+'</i><span><b>'+q.n+(q.max>1?' <em>'+(lv+1)+'/'+q.max+'</em>':'')+'</b><small>'+q.d(PK)+'</small></span>';
    d.addEventListener('pointerdown',e=>{e.stopPropagation();pickPerk(i);});box.appendChild(d);});
  $('perk').classList.add('on');sfx.radar();
}
function closePerk(){perkOpen=false;perkChoices=[];$('perk').classList.remove('on');}
function pickPerk(i){
  const q=perkChoices[i];if(!perkOpen||!q)return;q.f(PK);RUN.taken[q.id]=(RUN.taken[q.id]||0)+1;RUN.pending=Math.max(0,RUN.pending-1);
  if(q.id==='hp')P.hp=PK.hp;if(q.id==='nade')P.nades=Math.min(PK.nadeMax,P.nades+1);if(q.id==='mag')P.slots.forEach(w=>{if(WP[w.id].mag)w.ammo=PM(w.id);});if(q.id==='radar')P.radarR=0;if(q.id==='dash'){P.dashCh=PK.dash>=3?2:1;P.dashCd=0;}if(q.id==='focus')P.focusCd=0;
  closePerk();sfx.kill();last=performance.now();
}
function configureBot(b,ty,lv){
  const T2={rifle:{w:Math.random()<.6?'ar':'smg',hp:100,sc:1,sp:1,xp:1},rush:{w:'shotgun',hp:80,sc:.95,sp:1.28,xp:1},sniper:{w:'sniper',hp:80,sc:1,sp:.9,xp:1},
    heavy:{w:'ar',hp:240,sc:1.18,sp:.8,xp:2},boss:{w:'ar',hp:480+55*lv,sc:1.38,sp:.85,xp:6}}[ty],k=1+lv*.04;
  b.type=ty;b.w={id:T2.w,ammo:WP[T2.w].mag};b.maxHp=Math.round(T2.hp*(ty==='boss'?1:k));b.sc=T2.sc;b.spdMul=T2.sp;b.xp=T2.xp;b.nades=ty==='boss'?3:lv>=3&&Math.random()<.5?1:0;
  b.skill=clamp(DIFF[S.diff].skill-.1+lv*.018+rnd(-.08,.08),.12,.95);b.h.g.scale.setScalar(T2.sc);
}
function activateRoom(i){
  const R=W.rooms[i],lv=RUN.level,n=Math.min(8,2+Math.floor(lv*.55)),types=[];RUN.state='fight';
  if(lv%5===0)types.push('boss');
  while(types.length<n){const r=Math.random();types.push(lv>=4&&r<.14?'heavy':lv>=2&&r<.36?'rush':lv>=3&&r<.5?'sniper':'rifle');}
  bots=[];
  types.forEach((ty,k)=>{
    const b=pool[k]||(pool[k]=makeBot(k));configureBot(b,ty,lv);let best=R.wc,bs=-1e9;
    for(let t=0;t<16;t++){const q=W.randWalkIn(R,2),d=Math.hypot(q.x-P.x,q.z-P.z);let sc2=Math.min(d,26)+(W.los(q.x,1.5,q.z,P.x,1.5,P.z)?0:10)+Math.random()*4;if(d<9)sc2-=40;
      if(bots.some(o=>Math.hypot(o.x-q.x,o.z-q.z)<1.5))sc2-=20;if(sc2>bs){bs=sc2;best=q;}}
    Object.assign(b,{x:best.x,z:best.z,y:0,vx:0,vz:0,hp:b.maxHp,alive:true,prot:.9,hurtT:9,pitch:0,reloadT:0,target:null,path:null,state:'hunt',lastHitBy:null,idleT:rnd(.3,1.4),coverCd:0,kills:0,deaths:0,streak:0,respT:0,
      yaw:Math.atan2(P.x-best.x,P.z-best.z),alert:{x:P.x,z:P.z},hf:rnd(1.6,2.6)});
    CH.reset(b.h);b.h.g.visible=true;b.h.g.position.set(b.x,0,b.z);b.mark.visible=false;bots.push(b);
  });
  for(let k=types.length;k<pool.length;k++){pool[k].alive=false;pool[k].h.g.visible=false;}
  ents=[P].concat(bots);
  big('NÍVEL '+lv+(lv%5===0?' · CHEFE':''),(THEME[R.theme]||'Sala')+' · '+n+(n===1?' inimigo':' inimigos'),2.6);
}
function buildSector(){
  W.buildMap('complexo',(Math.random()*1e6)|0);decals.forEach(d=>d.visible=false);nades.forEach(g=>scene.remove(g.m));nades=[];RUN.room=0;
  const R=W.rooms[0],ex=R.exit;let best=R.wc,bd=-1;for(let t=0;t<40;t++){const q=W.randWalkIn(R,2),d=Math.hypot(q.x-ex.x,q.z-ex.z);if(d>bd){bd=d;best=q;}}
  if(R.start){const q=W.nearWalk(R.start.x,R.start.z);if(q)best=q;}
  Object.assign(P,{x:best.x,z:best.z,y:0,vx:0,vz:0,vy:0,pitch:0,yaw:Math.atan2(best.x-ex.x,best.z-ex.z),prot:2});
  for(const gt of W.gates){gt.k=0;}
  activateRoom(0);
}
function startRun(){
  runMode=true;PK=basePK();PK.dash=1;PK.focus=1;RUN={level:1,room:0,sector:1,xp:0,xpNext:3,pending:0,kills:0,taken:{dash:1,focus:1},state:'fight',check:false,t:0};
  bots.forEach(b=>{if(pool.indexOf(b)<0)scene.remove(b.h.g);});bots=[];$('feed').innerHTML='';$('pops').innerHTML='';time=0;blood=0;P.kills=0;P.deaths=0;P.streak=0;P.radarR=0;P.radarT=0;
  ents=[P];P.alive=false;
  Object.assign(P,{hp:PK.hp,alive:true,hurtT:9,vy:0,reloadT:0,fireCd:0,ads:0,recOff:0,bloom:0,nades:PK.nadeMax,crouchTog:false,deadT:0,slideT:0,stabT:0,throwT:0,backT:0,dashT:0,dashCh:1,dashCd:0,focusT:0,focusCd:0,last:1,cur:0});
  P.slots=[{id:S.primary,ammo:PM(S.primary)},{id:'pistol',ammo:PM('pistol')},{id:'knife',ammo:0},{id:'nade',ammo:0}];setWeapon(0,true);firing=false;adsHeld=false;
  buildSector();
}
function roomClear(){
  RUN.state='clear';const last=RUN.room>=W.rooms.length-1;if(!last)W.setGate(W.gates[RUN.room],true);
  P.hp=Math.min(PK.hp,P.hp+35);P.nades=Math.min(PK.nadeMax,P.nades+1);RUN.pending++;
  big('SALA LIMPA',last?'Setor concluído. A avançar para o próximo…':'Segue pelo portão que abriu',3.2);sfx.win();
  if(last){RUN.state='sector';RUN.t=3.5;}
}
const gateMark=new T.Sprite(new T.SpriteMaterial({map:markTex,color:0xffc04a,depthTest:false,sizeAttenuation:false,toneMapped:false,fog:false}));gateMark.scale.set(.03,.03,1);gateMark.visible=false;gateMark.renderOrder=11;scene.add(gateMark);
function runStep(dt){
  const og=RUN.state==='clear'&&W.gates[RUN.room];gateMark.visible=!!og;if(og)gateMark.position.set(og.x,2.2+Math.sin(time*4)*.15,og.z);
  if(RUN.check){RUN.check=false;if(RUN.state==='fight'&&bots.every(b=>!b.alive))roomClear();}
  for(const gt of W.gates){const k=gt.open?1:0;if(gt.k!==k){gt.k+=clamp(k-gt.k,-dt*1.6,dt*1.6);gt.mesh.position.y=gt.box.h/2-gt.k*(gt.box.h+.15);}}
  if(RUN.state==='clear'){const N=W.rooms[RUN.room+1];
    if(N&&P.x>N.x0+1.3&&P.x<N.x1-1.3&&P.z>N.z0+1.3&&P.z<N.z1-1.3){W.setGate(W.gates[RUN.room],false);RUN.room++;RUN.level++;activateRoom(RUN.room);}}
  else if(RUN.state==='sector'){RUN.t-=dt;if(RUN.t<=0){RUN.sector++;RUN.level++;flashT=.6;buildSector();}}
}
function perksHTML(){let h='<tr><th></th><th>Habilidade</th><th>Nível</th></tr>';let any=false;PERKS.forEach(q=>{const n=RUN.taken[q.id]||0;if(n){any=true;h+='<tr><td>'+q.ic+'</td><td>'+q.n+'</td><td>'+n+(q.max>1?' / '+q.max:'')+'</td></tr>';}});
  if(!any)h+='<tr><td></td><td>Ainda nenhuma</td><td></td></tr>';return h;}
function endRun(){
  if(mode!=='play')return;mode='over';firing=false;adsHeld=false;showBoard=false;closePerk();
  const rec=RUN.level>meta.bestLevel;meta.bestLevel=Math.max(meta.bestLevel,RUN.level);meta.kills+=RUN.kills;meta.deaths++;store.set('hmd_meta',meta);
  $('oTitle').textContent='Fim da incursão';$('oTitle').style.color=rec?'#f0a429':'#fff';
  $('oMsg').textContent='Chegaste ao nível '+RUN.level+' (setor '+RUN.sector+') com '+RUN.kills+' abates.'+(rec?' Novo recorde.':' O teu recorde é o nível '+meta.bestLevel+'.');
  $('endT').innerHTML=perksHTML();sfx.lose();setTimeout(()=>{if(mode==='over'){show('over');unlock();}},900);
}

/* ================= UI ================= */
function show(id){['menu','pause','over'].forEach(k=>$(k).classList.toggle('on',k===id));$('hud').classList.toggle('on',mode==='play'||mode==='pause'||mode==='over');$('touch').classList.toggle('on',touchMode&&mode==='play');}
function big(t,s,d){$('big').textContent=t;$('big').style.opacity=1;$('sub').textContent=s||'';$('sub').style.opacity=s?1:0;bigT=d;}
function refreshMenu(){$('mWins').textContent=meta.wins;$('mGames').textContent=meta.games;$('mKills').textContent=meta.kills;$('mKD').textContent=meta.deaths?(meta.kills/meta.deaths).toFixed(2):(meta.kills?meta.kills.toFixed(2):'—');$('mLvl').textContent=meta.bestLevel||'—';
  document.querySelectorAll('.seg').forEach(sg=>{const k=sg.dataset.k;sg.querySelectorAll('button').forEach(b=>b.classList.toggle('on',String(S[k])===b.dataset.v));});$('sens').value=S.sens;$('sens2').value=S.sens;}
document.querySelectorAll('.seg').forEach(sg=>sg.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{const k=sg.dataset.k;S[k]=(k==='primary'||k==='mode')?b.dataset.v:+b.dataset.v;store.set('hmd_set',S);refreshMenu();})));
['sens','sens2'].forEach(id=>$(id).addEventListener('input',e=>{S.sens=+e.target.value;store.set('hmd_set',S);}));
function setWeapon(i,force){if(!P.slots[i]||!P.alive&&!force||(i===P.cur&&!force))return;if(i===3&&P.nades<=0){sfx.empty();return;}if(i!==P.cur){P.last2=P.last;P.last=P.cur;}P.cur=i;P.backT=0;P.reloadT=0;swapT=.3;P.boltT=0;Object.keys(vm).forEach(k=>vm[k].g.visible=k===VK(P.slots[i].id));if(P.slots[i].id==='knife')P.drawT=.65;if(!force)sfx.swap();}
function startReload(){const wi=P.slots[P.cur];if(wi&&wi.id==='knife'&&P.alive&&P.drawT<=0&&P.stabT<=0){P.drawT=.65;noise(.25,3000,.06,0,true);return;}if(!wi||!P.alive||P.reloadT>0||!WP[wi.id].mag||wi.ammo>=PM(wi.id))return;P.reloadT=P.relDur=WP[wi.id].rel*PK.rel;}

/* ================= input ================= */
const keys={};let touchMode=false,locked=false,everLocked=false,dragLook=false,joy=null,look=null;
function lock(){if(touchMode||dragLook)return;try{const r=cv.requestPointerLock();if(r&&r.catch)r.catch(()=>onLockErr());}catch(e){onLockErr();}}
function unlock(){try{if(document.pointerLockElement)document.exitPointerLock();}catch(e){}}
function onLockErr(){if(everLocked){if(mode==='play')doPause();}else dragLook=true;}
document.addEventListener('pointerlockerror',onLockErr);
document.addEventListener('pointerlockchange',()=>{locked=document.pointerLockElement===cv;if(locked)everLocked=true;else if(mode==='play'&&!dragLook&&!touchMode)doPause();});
function doPause(){if(mode!=='play')return;toggleBuy(false);mode='pause';firing=false;adsHeld=false;sprintHeld=false;refreshMenu();show('pause');unlock();}
function doResume(){if(mode!=='pause')return;mode='play';show(null);last=performance.now();lock();}
function startGame(){if(!ready)return;initAudio();touchMode=coarse;mode='play';if(S.mode==='run')startRun();else{runMode=false;PK=basePK();pool.forEach(b=>b.h.g.visible=false);if(W.kind!=='suburbio')W.buildMap('suburbio',7);startMatch();}show(null);last=performance.now();lock();}
$('bPlay').onclick=startGame;$('bAgain').onclick=startGame;$('bCont').onclick=doResume;
function toMenu(){mode='menu';gateMark.visible=false;trajPreview(false);closePerk();pool.forEach(b=>b.h.g.visible=false);bots.forEach(b=>b.h.g.visible=false);refreshMenu();show('menu');}
$('bQuit').onclick=toMenu;$('bMenu').onclick=toMenu;
function goFull(){try{const el=document.documentElement,p=el.requestFullscreen?el.requestFullscreen():null;if(p&&p.then)p.then(()=>{if(navigator.keyboard&&navigator.keyboard.lock)navigator.keyboard.lock().catch(()=>{});}).catch(()=>{});}catch(e){}}
$('bFull').onclick=goFull;$('bFull2').onclick=goFull;
window.addEventListener('beforeunload',e=>{if(mode==='play'||mode==='pause'){e.preventDefault();e.returnValue='';}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)doPause();});
window.addEventListener('blur',()=>{for(const k in keys)keys[k]=false;firing=false;adsHeld=false;sprintHeld=false;showBoard=false;if(touchMode||dragLook)doPause();});
window.addEventListener('keydown',e=>{
  const k=e.key.toLowerCase();
  if(['tab',' ','arrowup','arrowdown','arrowleft','arrowright'].includes(k)&&mode!=='menu')e.preventDefault();
  if(e.repeat)return;keys[k]=true;
  if(k==='m')muted=!muted;
  if(mode==='pause'&&(k==='enter'||k==='p')){doResume();return;}
  if(mode!=='play')return;
  if(e.ctrlKey)e.preventDefault();
  if(perkOpen){const pi=['1','2','3'].indexOf(k);if(pi>=0)pickPerk(pi);return;}
  if(buyOpen){const bi=['1','2','3','4'].indexOf(k);if(bi>=0){choosePrimary(BUY[bi]);return;}if(k==='5'||k==='6'){chooseKnife(k==='5'?'karambit':'butterfly');return;}if(k==='b'){toggleBuy(false);return;}}
  if(k==='tab')showBoard=true;else if(k==='shift')sprintHeld=true;
  else if(k==='1')setWeapon(0);else if(k==='2')setWeapon(1);else if(k==='3')setWeapon(2);else if(k==='4'||k==='g')setWeapon(P.cur===3?P.last:3);
  else if(k==='q')setWeapon(P.last);else if(k==='r')startReload();else if(k==='f')radar();else if(k==='e')tryDash();else if(k==='v')tryFocus();else if(k==='b')toggleBuy(true);
  else if(k==='c'||k==='control')trySlide();else if(k==='p'||k==='escape')doPause();
});
window.addEventListener('keyup',e=>{const k=e.key.toLowerCase();keys[k]=false;if(k==='tab')showBoard=false;if(k==='shift')sprintHeld=false;});
window.addEventListener('wheel',()=>{if(mode==='play'&&P.alive)setWeapon(P.cur>=2?0:P.cur+1);},{passive:true});
document.addEventListener('mousemove',e=>{
  if(mode!=='play'||touchMode||!P.alive)return;
  if(locked||(dragLook&&(firing||adsHeld))){const s=.0021*S.sens*(camera.fov/75);P.yaw-=e.movementX*s;P.pitch=clamp(P.pitch-e.movementY*s,-1.5,1.5);
    lagX=clamp(lagX+e.movementX*.00045,-.07,.07);lagY=clamp(lagY+e.movementY*.00045,-.05,.05);}
});
/* rato: mousedown/mouseup disparam por botão, por isso funcionam com os dois botões premidos ao mesmo tempo */
cv.addEventListener('mousedown',e=>{
  if(mode!=='play'||touchMode)return;e.preventDefault();
  if(!locked&&!dragLook)lock();
  if(e.button===0){firing=true;P.trig=true;}else if(e.button===2)adsHeld=true;
});
window.addEventListener('mouseup',e=>{if(touchMode)return;if(e.button===0)firing=false;else if(e.button===2)adsHeld=false;});
window.addEventListener('contextmenu',e=>e.preventDefault());
cv.addEventListener('pointerdown',e=>{
  if(mode!=='play'||e.pointerType!=='touch')return;
  touchMode=true;$('touch').classList.add('on');
  if(e.clientX<window.innerWidth*.45&&!joy){joy={id:e.pointerId,ox:e.clientX,oy:e.clientY,dx:0,dy:0};const j=$('joyV');j.style.display='block';j.style.left=(e.clientX-48)+'px';j.style.top=(e.clientY-48)+'px';}
  else if(!look){look={id:e.pointerId,x:e.clientX,y:e.clientY};firing=true;P.trig=true;}
  try{cv.setPointerCapture(e.pointerId);}catch(_){}
});
cv.addEventListener('pointermove',e=>{
  if(e.pointerType!=='touch')return;
  if(joy&&e.pointerId===joy.id){let dx=e.clientX-joy.ox,dy=e.clientY-joy.oy;const m=Math.hypot(dx,dy),R=48;if(m>R){dx*=R/m;dy*=R/m;}joy.dx=dx/R;joy.dy=dy/R;$('joyV').firstElementChild.style.transform='translate('+dx+'px,'+dy+'px)';}
  else if(look&&e.pointerId===look.id){const s=.0052*S.sens*(camera.fov/75);P.yaw-=(e.clientX-look.x)*s;P.pitch=clamp(P.pitch-(e.clientY-look.y)*s,-1.5,1.5);look.x=e.clientX;look.y=e.clientY;}
});
function pUp(e){if(e.pointerType!=='touch')return;if(joy&&e.pointerId===joy.id){joy=null;$('joyV').style.display='none';$('joyV').firstElementChild.style.transform='';}else if(look&&e.pointerId===look.id){look=null;firing=false;}}
window.addEventListener('pointerup',pUp);window.addEventListener('pointercancel',pUp);
const tb=(id,fn)=>$(id).addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();fn();});
tb('tJump',()=>jump());tb('tAds',()=>{adsHeld=!adsHeld;});tb('tNade',()=>setWeapon(P.cur===3?P.last:3));tb('tSwap',()=>setWeapon(P.cur>=2?0:P.cur+1));tb('tRel',()=>startReload());tb('tRadar',()=>radar());tb('tCrouch',()=>{if(!P.crouchTog)trySlide();P.crouchTog=!P.crouchTog;});tb('tPause',()=>doPause());

/* ================= ações do jogador ================= */
function moveInput(){
  let ix=0,iz=0;
  if(keys['w']||keys['arrowup'])iz-=1;if(keys['s']||keys['arrowdown'])iz+=1;if(keys['a']||keys['arrowleft'])ix-=1;if(keys['d']||keys['arrowright'])ix+=1;
  if(joy){ix+=joy.dx;iz+=joy.dy;}
  const m=Math.hypot(ix,iz);if(m>1){ix/=m;iz/=m;}const s=Math.sin(P.yaw),c=Math.cos(P.yaw);return{x:ix*c+iz*s,z:-ix*s+iz*c,f:-iz,m:Math.min(1,m)};
}
function jump(){if(mode==='play'&&P.alive&&P.onG){P.vy=6.6;P.onG=false;P.crouchTog=false;}}
function tryDash(){
  if(mode!=='play'||!P.alive||P.dashT>0)return;if(!PK.dash){pop('O <b>Dash</b> só existe no modo Incursão');return;}if(P.dashCh<=0){sfx.empty();return;}const f=moveInput();let mx=f.x,mz=f.z;if(!mx&&!mz){mx=-Math.sin(P.yaw);mz=-Math.cos(P.yaw);}const l=Math.hypot(mx,mz);
  P.ddx=mx/l;P.ddz=mz/l;P.dashT=.16;P.dashCh--;if(P.dashCd<=0)P.dashCd=PK.dash>=2?3.5:6;P.slideT=0;noise(.2,1100,.2);
}
function tryFocus(){
  if(mode!=='play'||!P.alive)return;
  if(!PK.focus){pop('O <b>Foco</b> só existe no modo Incursão');return;}
  if(P.focusT>0)return;if(P.focusCd>0){sfx.empty();pop('Foco a recarregar: <b>'+Math.ceil(P.focusCd)+' s</b>');return;}
  P.focusT=[0,3.5,5,6.5][PK.focus];P.focusCd=20;tone(320,70,.7,'sine',.25);tone(90,45,1.2,'sine',.2);flashT=.18;pop('<b>FOCO</b> ativo');
}
function trySlide(){
  if(mode!=='play'||!P.alive||!P.onG||P.slideT>0||P.slideCd>0||P.sprint<.55)return;
  const v=Math.hypot(P.vx,P.vz);if(v<5.2)return;P.slideT=.85;P.slideV=Math.min(11,v+2.6);P.sdx=P.vx/v;P.sdz=P.vz/v;noise(.55,800,.16);
}
const BUY=['ar','smg','shotgun','sniper'];let buyOpen=false;
function toggleBuy(on){buyOpen=on&&mode==='play';$('buy').classList.toggle('on',buyOpen);if(buyOpen)document.querySelectorAll('#buy [data-id]').forEach(d=>d.classList.toggle('on',d.dataset.id===S.primary||d.dataset.id===S.knife));}
function choosePrimary(id){
  S.primary=id;store.set('hmd_set',S);toggleBuy(false);
  if(P.alive){P.slots[0]={id,ammo:PM(id)};P.reloadT=0;if(P.cur===0)setWeapon(0,true);else setWeapon(0);sfx.swap();}
  pop('<b>'+WP[id].n.toUpperCase()+'</b> equipada');
}
function chooseKnife(id){S.knife=id;store.set('hmd_set',S);toggleBuy(false);if(P.alive)setWeapon(2,true);pop('<b>'+(id==='butterfly'?'BUTTERFLY':'KARAMBIT')+'</b> equipada');}
document.querySelectorAll('#buy [data-id]').forEach(d=>d.addEventListener('pointerdown',e=>{e.stopPropagation();const id=d.dataset.id;if(id==='karambit'||id==='butterfly')chooseKnife(id);else choosePrimary(id);}));
function knife(){
  P.trig=false;P.fireCd=1/WP.knife.rate;P.stabT=.3;P.slashDir=-(P.slashDir||1);P.drawT=0;noise(.13,2600,.14,0,true);
  const fx0=-Math.sin(P.yaw),fz0=-Math.cos(P.yaw);let best=null,bd=2.5;
  for(const b of bots){if(!b.alive)continue;const dx=b.x-P.x,dz=b.z-P.z,d=Math.hypot(dx,dz);if(d>bd||Math.abs(b.y-P.y)>1.6)continue;if(d>.35&&(dx*fx0+dz*fz0)/d<.7)continue;
    if(!W.los(eye.x,eye.y,eye.z,b.x,b.y+1.15,b.z))continue;bd=d;best=b;}
  if(best){noise(.1,420,.35);puff(best.x,best.y+1.2,best.z,0x7a0d0d,.25,.35,1.4,.2,.8);kickR+=.7;hurt(best,WP.knife.dmg,P,false,{id:'knife'});}
}
function nadeLaunch(g){camera.getWorldDirection(_d);g.x=eye.x+_d.x*.5;g.y=eye.y-.1+_d.y*.5;g.z=eye.z+_d.z*.5;g.vx=_d.x*17+P.vx*.6;g.vy=_d.y*17+4;g.vz=_d.z*17+P.vz*.6;return g;}
function radar(){if(mode!=='play'||!P.alive||P.radarR>0)return;P.radarR=RCD();P.radarT=6;sfx.radar();flashT=.12;pop('<b>RADAR</b> ativo');}
const _ng={};
function playerNade(){
  if(mode!=='play'||!P.alive||P.nades<=0||P.nadeCd>0)return;P.nades--;P.nadeCd=.9;P.throwT=.32;P.backT=.34;
  camera.updateMatrixWorld(true);const g=nadeLaunch(_ng);throwNade(P,g.x,g.y,g.z,g.vx,g.vy,g.vz);noise(.12,1800,.1,0,true);
}
function curSpread(w){
  const hv=Math.hypot(P.vx,P.vz);
  return (w.spr*(1-P.ads)+w.ads*P.ads+P.bloom*(1-.7*P.ads)+hv/7*.022*(1-.8*P.ads)+(P.onG?0:.045))*(P.crouch>.5?.72:1);
}
function playerFire(){
  const wi=P.slots[P.cur],w=WP[wi.id];wi.ammo--;P.fireCd=1/(w.rate*PK.rate);P.trig=false;kick=Math.min(2.4,kick+w.kick);kickR+=rnd(-1,1)*w.kick*.5;
  camera.updateMatrixWorld(true);camera.getWorldDirection(_d);
  if(w.pel===1){const spr=curSpread(w);_r.crossVectors(_d,UP).normalize();_u.crossVectors(_r,_d);const a=rnd(0,TAU),r=Math.sqrt(Math.random())*spr;_d.addScaledVector(_r,Math.cos(a)*r).addScaledVector(_u,Math.sin(a)*r).normalize();}
  muzzle.getWorldPosition(_a);flashMat.opacity=1;flash.rotation.z=rnd(0,TAU);const fs=rnd(.11,.17)*(wi.id==='shotgun'||wi.id==='sniper'?1.6:1)*(1-.3*P.ads);flash.scale.set(fs,fs,fs);
  shotLight.position.copy(_a);shotLight.intensity=6;shotLight.distance=12;
  shoot(P,eye,_d,wi,_a);
  const k=(1-.35*P.ads)*(P.crouch>.5?.8:1);P.pitch=clamp(P.pitch+w.rv*k*.4,-1.5,1.5);P.recOff+=w.rv*k*.6;P.yaw+=rnd(-1,1)*w.rh*k;P.bloom=Math.min(.05,P.bloom+(w.auto?.0042:.012));
  if(wi.id!=='shotgun'&&wi.id!=='sniper'){eject.getWorldPosition(_b);const s=shells[shI=(shI+1)%shells.length];s.m.position.copy(_b);s.m.visible=true;s.l=1.3;_r.crossVectors(_d,UP).normalize();
    s.vx=_r.x*rnd(1.6,2.6)+P.vx;s.vy=rnd(1.4,2.4);s.vz=_r.z*rnd(1.6,2.6)+P.vz;s.rx=rnd(-12,12);s.rz=rnd(-12,12);}
  else P.boltT=wi.id==='sniper'?.75:.55;
  if(wi.ammo<=0)startReload();
}
function playerUpdate(dt){
  if(!P.alive){P.deadT-=dt;if(P.deadT<=0&&mode==='play'&&runMode){endRun();return;}if(P.deadT<=0&&mode==='play'){spawnEnt(P);big('','',0);$('big').style.opacity=0;$('sub').style.opacity=0;}return;}
  const mi=moveInput(),wi=P.slots[P.cur],w=WP[wi.id];
  P.prot=Math.max(0,P.prot-dt);P.hurtT+=dt;if(P.hurtT>4.5/PK.regen&&P.hp<PK.hp)P.hp=Math.min(PK.hp,P.hp+30*PK.regen*dt);P.pingT=Math.max(0,P.pingT-dt);
  P.crouchOn=!!(keys['control']||keys['c']||P.crouchTog||P.slideT>0);
  P.crouch+=((P.crouchOn?1:0)-P.crouch)*Math.min(1,dt*12);P.slideK+=((P.slideT>0?1:0)-P.slideK)*Math.min(1,dt*10);
  P.drawT=Math.max(0,(P.drawT||0)-dt);P.stabT=Math.max(0,P.stabT-dt);P.throwT=Math.max(0,P.throwT-dt);if(P.backT>0){P.backT-=dt;if(P.backT<=0&&P.cur===3){const l2=P.last2;setWeapon(P.last===3?0:P.last);P.last=(l2!==undefined&&l2!==3&&l2!==P.cur)?l2:(P.cur===0?1:0);}}
  const wantSprint=sprintHeld&&mi.f>.3&&!adsHeld&&(!firing||w.melee)&&P.onG&&!P.crouchOn;P.sprint+=((wantSprint?1:0)-P.sprint)*Math.min(1,dt*9);
  const tAds=adsHeld&&P.reloadT<=0&&swapT<=0&&P.sprint<.4&&!w.melee&&!w.thrown?1:0;P.ads+=(tAds-P.ads)*Math.min(1,dt*(wi.id==='sniper'?9:15));
  const spd=PK.speed*(4.7+2.5*P.sprint)*(1-.42*P.ads)*(1-.5*P.crouch)*(w.melee?1.22:wi.id==='smg'||wi.id==='pistol'||w.thrown?1.06:wi.id==='sniper'?.94:1);
  P.slideCd=Math.max(0,P.slideCd-dt);P.focusT=Math.max(0,P.focusT-dt);P.focusCd=Math.max(0,P.focusCd-dt);
  if(PK.dash){const mc=PK.dash>=3?2:1;if(P.dashCh<mc){P.dashCd-=dt;if(P.dashCd<=0){P.dashCh++;P.dashCd=P.dashCh<mc?(PK.dash>=2?3.5:6):0;}}}
  if(P.dashT>0){P.dashT-=dt;P.vx=P.ddx*27;P.vz=P.ddz*27;if(P.dashT<=0){P.vx*=.3;P.vz*=.3;}}
  else if(P.slideT>0){P.slideT-=dt;P.slideV=Math.max(0,P.slideV-7*dt);P.vx=P.sdx*P.slideV+mi.x*.7;P.vz=P.sdz*P.slideV+mi.z*.7;
    if(keys[' ']){P.slideT=0;P.slideCd=.5;jump();}else if(P.slideT<=0||P.slideV<3.2||!P.onG){P.slideT=0;P.slideCd=.5;}}
  else{const k=Math.min(1,(P.onG?12:3)*dt);P.vx+=(mi.x*spd-P.vx)*k;P.vz+=(mi.z*spd-P.vz)*k;if(keys[' '])jump();}
  const ox=P.x,oz=P.z;P.x+=P.vx*dt;P.z+=P.vz*dt;W.collide(P,.42,P.y);
  const g=W.floorAt(P.x,P.z,P.y);P.vy-=20*dt;P.y+=P.vy*dt;
  if(P.y<=g){if(!P.onG&&P.vy<-4){P.landK=clamp(-P.vy/14,0,1);sfx.land();}P.y=g;P.vy=0;P.onG=true;}else if(P.y-g>.25||P.vy>0)P.onG=false;else{P.y=g;P.vy=0;P.onG=true;}
  P.landK=Math.max(0,P.landK-dt*4);
  const hv=Math.hypot(P.x-ox,P.z-oz)/dt;
  if(P.onG&&P.slideT<=0){P.bob+=hv*dt*(1.25+.25*P.sprint);P.stepD+=hv*dt;if(P.stepD>(P.sprint>.5?2.5:2)){P.stepD=0;sfx.step(.05+.07*P.sprint);}}
  P.nadeCd=Math.max(0,P.nadeCd-dt);P.radarR=Math.max(0,P.radarR-dt);P.radarT=Math.max(0,P.radarT-dt);
  P.bloom=Math.max(0,P.bloom-dt*.09);P.recOff*=Math.exp(-7*dt);P.boltT=Math.max(0,P.boltT-dt);
  const eh=1.62-.58*P.crouch-P.landK*.12;
  eye.set(P.x,P.y+eh+Math.sin(P.bob*2)*.022*Math.min(1,hv/5)*(1-P.ads),P.z);
  P.fireCd-=dt;swapT=Math.max(0,swapT-dt);
  if(P.reloadT>0){const t0=1-P.reloadT/P.relDur;P.reloadT-=dt;const t1=1-P.reloadT/P.relDur;if(t0<.2&&t1>=.2)sfx.reloadA();if(t0<.68&&t1>=.68)sfx.reloadB();if(P.reloadT<=0)wi.ammo=PM(wi.id);}
  else if(firing&&P.fireCd<=0&&swapT<=0&&(P.sprint<.45||w.melee)&&P.boltT<=0){
    if(w.melee){if(P.trig)knife();}else if(w.thrown){if(P.trig){P.trig=false;playerNade();}}else if(wi.ammo>0){if(w.auto||P.trig)playerFire();}else if(P.trig){P.trig=false;sfx.empty();startReload();}
  }
}

/* ================= câmara, arma na mão, efeitos ================= */
function fx(dt){
  for(const t of tracers){if(!t.m.visible)continue;t.l-=dt;if(t.l<=0)t.m.visible=false;else t.m.material.opacity=.7*t.l/t.max;}
  for(const p of parts){if(!p.m.visible)continue;p.l-=dt;if(p.l<=0){p.m.visible=false;continue;}p.vy-=14*dt;p.m.position.x+=p.vx*dt;p.m.position.y+=p.vy*dt;p.m.position.z+=p.vz*dt;if(p.m.position.y<.03){p.m.position.y=.03;p.vy*=-.3;p.vx*=.5;p.vz*=.5;}}
  for(const p of puffs){if(!p.s.visible)continue;p.l-=dt;if(p.l<=0){p.s.visible=false;continue;}const k=1-p.l/p.max;p.s.scale.setScalar(p.sz+p.g*k*p.max);p.s.position.y+=p.vy*dt;p.s.material.opacity=p.o*(1-k)*(k<.1?k*10:1);}
  for(const s of shells){if(!s.m.visible)continue;s.l-=dt;if(s.l<=0){s.m.visible=false;continue;}s.vy-=12*dt;s.m.position.x+=s.vx*dt;s.m.position.y+=s.vy*dt;s.m.position.z+=s.vz*dt;s.m.rotation.x+=s.rx*dt;s.m.rotation.z+=s.rz*dt;
    if(s.m.position.y<.02){s.m.position.y=.02;if(s.vy<-1)noise(.02,6000,.02,0,true);s.vy*=-.35;s.vx*=.5;s.vz*=.5;s.rx*=.4;s.rz*=.4;}}
  shotLight.intensity=Math.max(0,shotLight.intensity-dt*60);flashMat.opacity=Math.max(0,flashMat.opacity-dt*22);
  kick=Math.max(0,kick-dt*9);kickR*=Math.exp(-9*dt);lagX*=Math.exp(-9*dt);lagY*=Math.exp(-9*dt);shake=Math.max(0,shake-dt*1.8);
  const wi=P.slots[P.cur];
  if(!P.alive){
    eye.y+=(P.y+.32-eye.y)*Math.min(1,dt*5);camera.position.copy(eye);
    if(P.killer){const want=Math.atan2(-(P.killer.x-P.x),-(P.killer.z-P.z));P.yaw+=angDiff(want,P.yaw)*Math.min(1,dt*3);}
    camera.rotation.set(P.pitch*.4+.1,P.yaw,.38*Math.min(1,(3.2-P.deadT)*2.5));vmRoot.visible=false;if(fp)fp.root.visible=false;trajPreview(false);$('scope').style.display='none';return;
  }
  if(!wi)return;
  const w=WP[wi.id],o=vm[VK(wi.id)],a=P.ads,hv=Math.hypot(P.vx,P.vz),mv=Math.min(1,hv/5)*(1-.85*a),sK=P.sprint,br=Math.sin(time*1.7)*.0018*(1-a*.7);
  let rl=0,rt=-1;if(P.reloadT>0){rt=1-P.reloadT/P.relDur;rl=Math.sin(Math.min(1,rt*1.15)*Math.PI);}
  const sw=swapT/.3,bt=P.boltT>0?Math.sin((1-P.boltT/(wi.id==='sniper'?.75:.55))*Math.PI):0,pist=wi.id==='pistol'||w.melee||w.thrown,
    stK=wi.id==='knife'&&S.knife!=='butterfly',sph=1-P.stabT/.3,sdir=(P.slashDir||1),slX=stK&&P.stabT>0?sdir*(.2-.42*sph)*Math.sin(sph*Math.PI):0,slR=stK&&P.stabT>0?sdir*Math.sin(sph*Math.PI):0,
    st=P.stabT>0?Math.sin((1-P.stabT/.3)*Math.PI)*(stK?.45:1):0,th=P.throwT>0?1-P.throwT/.32:0,sl=P.slideK;
  const hipX=pist?.1:.105,hipY=pist?-.1:-.105,hipZ=pist?-.36:-.3;
  vmRoot.position.set(
    hipX*(1-a)+Math.cos(P.bob)*.007*mv*(1+sK)+lagX*.25-.045*sK+rl*.02-st*.05-sl*.02+slX,
    hipY*(1-a)-w.sight*VS*a+br-Math.abs(Math.sin(P.bob))*.008*mv*(1+1.5*sK)-rl*.075-sw*.22-.03*sK-P.landK*.03+clamp(P.vy,-6,6)*.0035-P.crouch*.008*(1-a)+lagY*.2+st*.03+th*.06-th*th*.2,
    hipZ*(1-a)+(pist?-.32:-.2)*a+kick*.028+sK*.03-bt*.02-st*.17-th*.16);
  vmRoot.rotation.set(kick*.045-rl*.5-sw*.7-.22*sK*(w.melee?.3:1)+lagY*.6+bt*.06+st*.25-th*1.1,(.04)*(1-a)+.62*sK*(w.melee?.25:1)+lagX*.9+rl*.25+st*.35,kickR*.03*(1-.6*a)+rl*.5-.12*sK+lagX*.5-bt*.25+sl*.28*(1-a)-st*.5-slR*1.1,'YXZ');
  if(o.mag){let my=o.magY;if(rt>=.12&&rt<.42)my-=(rt-.12)/.3*.3;else if(rt>=.42&&rt<.7)my-=(1-(rt-.42)/.28)*.3;o.mag.position.y=my;o.mag.visible=!(rt>=.38&&rt<.46);}
  const dk=P.drawT>0?P.drawT/.65:0;
  if(o.spin)o.spin.rotation.x=-dk*dk*TAU*2;
  if(o.pivot){o.pivot.rotation.x=dk*TAU*1.0;o.hB.rotation.x=Math.PI*Math.min(1,dk*1.5);o.hA.rotation.x=-Math.PI*Math.max(0,dk*2.2-1.2)*.35;}
  if(o.pump){if(wi.id==='shotgun')o.pump.position.z=-.3+bt*.09+(rt>=0?Math.abs(Math.sin(rt*Math.PI*5))*.05:0);else o.pump.position.z=.08+bt*.07;}
  muzzle.position.set(0,pist?.022:.012,-w.L);flash.position.copy(muzzle.position);eject.position.set(.03,.03,-.02);
  const scoped=wi.id==='sniper'&&a>.8;vmRoot.visible=!scoped;$('scope').style.display=scoped?'block':'none';
  camera.position.copy(eye);if(shake>0){camera.position.x+=rnd(-1,1)*shake*.09;camera.position.y+=rnd(-1,1)*shake*.09;}
  camera.rotation.set(clamp(P.pitch+P.recOff,-1.52,1.52)+rnd(-1,1)*shake*.02,P.yaw+rnd(-1,1)*shake*.02,kickR*.004+Math.cos(P.bob)*.0035*mv+P.slideK*.07);
  if(fp){
    fp.root.visible=vmRoot.visible;
    if(vmRoot.visible){
      camera.updateMatrixWorld(true);const ud=o.g.userData,gr=ud.grip,fo=ud.fore;
      _fr.set(gr[0]+FPO.r[0]/VS,gr[1]+FPO.r[1]/VS,gr[2]+FPO.r[2]/VS);vmRoot.localToWorld(_fr);
      if(fo){const kz=ud.pistol?1:.92;_fl.set(fo[0]+FPO.l[0]/VS,fo[1]+FPO.l[1]/VS,fo[2]*kz+FPO.l[2]/VS);vmRoot.localToWorld(_fl);}else{_fl.set(-.24,-.46,-.16);camera.localToWorld(_fl);}
      vmRoot.getWorldQuaternion(_fq);_fx.set(1,0,0).applyQuaternion(camera.quaternion);CH.updateFP(fp,_fr,_fl,_fq,_fx);
    }
  }
  trajPreview(wi.id==='nade'&&P.nades>0&&P.throwT<=0&&swapT<=0&&mode==='play');
  const tf=(75+5*sK+7*P.slideK+(P.dashT>0?12:0))/(1+(w.zoom-1)*a);if(Math.abs(camera.fov-tf)>.05){camera.fov+=(tf-camera.fov)*Math.min(1,dt*18);camera.updateProjectionMatrix();}
}
const mini=$('mini'),mctx=mini.getContext('2d');
function drawMini(){
  const g=mctx,Sz=316,k=Sz/124,X=x=>Sz/2+x*k,Z=z=>Sz/2+z*k;
  g.clearRect(0,0,Sz,Sz);g.fillStyle='rgba(60,66,52,.85)';g.fillRect(X(-60),Z(-60),120*k,120*k);
  g.fillStyle='rgba(40,40,44,.9)';g.fillRect(X(-60),Z(-4),120*k,8*k);g.fillRect(X(-4),Z(-60),8*k,120*k);
  for(const r of W.rects){g.fillStyle=r.k==='cont'?'#8a8f96':r.k==='car'?'#6a6f76':r.k==='ruina'?'rgba(190,180,160,.55)':'#c9c3b4';g.fillRect(X(r.x0),Z(r.z0),(r.x1-r.x0)*k,(r.z1-r.z0)*k);}
  g.fillStyle='#ff3b30';for(const b of bots)if(b.alive&&(b.pingT>0||P.radarT>0)){g.globalAlpha=P.radarT>0?1:Math.min(1,b.pingT);g.beginPath();g.arc(X(b.x),Z(b.z),5.5,0,TAU);g.fill();}g.globalAlpha=1;
  const fxv=-Math.sin(P.yaw),fzv=-Math.cos(P.yaw);g.save();g.translate(X(P.x),Z(P.z));g.rotate(Math.atan2(fzv,fxv));g.fillStyle='#f0a429';g.strokeStyle='#000';g.lineWidth=2;g.beginPath();g.moveTo(12,0);g.lineTo(-8,-8);g.lineTo(-3,0);g.lineTo(-8,8);g.closePath();g.fill();g.stroke();g.restore();
}
const crossEl=$('cross').children;
function hud(dt){
  if(runMode){$('time').textContent=RUN.level;$('timerL').textContent='Nível';$('timer').classList.remove('low');$('meL').textContent='Abates';$('meK').textContent=RUN.kills;$('ldName').textContent='Inimigos';$('ldK').textContent=bots.filter(b=>b.alive).length;
    $('xp').style.display='block';$('xpFill').style.width=(RUN.xp/RUN.xpNext*100)+'%';}
  else{$('time').textContent=fmt(tLeft);$('timerL').textContent='Tempo';$('meL').textContent='Tu';$('timer').classList.toggle('low',tLeft<=30);$('xp').style.display='none';
    let ld=null;for(const b of bots)if(!ld||b.kills>ld.kills)ld=b;$('meK').textContent=P.kills;if(ld){$('ldK').textContent=ld.kills;$('ldName').textContent=ld.name;}}
  const ed=$('eqDash'),ef=$('eqFocus');ed.style.display=PK.dash?'block':'none';ef.style.display=PK.focus?'block':'none';
  if(PK.dash){ed.classList.toggle('off',P.dashCh<=0);ed.lastElementChild.style.width=(P.dashCh>=(PK.dash>=3?2:1)?100:(1-P.dashCd/(PK.dash>=2?3.5:6))*100)+'%';}
  if(PK.focus){ef.classList.toggle('off',P.focusCd>0&&P.focusT<=0);ef.lastElementChild.style.width=((1-P.focusCd/20)*100)+'%';}
  $('focus').style.opacity=P.focusT>0?1:0;const ff=P.focusT>0?'saturate(.35) contrast(1.12) brightness(1.06)':'';if(cv.style.filter!==ff)cv.style.filter=ff;$('focusT').textContent=P.focusT>0?'FOCO '+P.focusT.toFixed(1)+' s':'';
  $('hpFill').style.width=clamp(P.hp/PK.hp*100,0,100)+'%';$('hpFill').style.background=P.hp<PK.hp*.35?'#ff4338':'#fff';
  const wi=P.slots[P.cur];
  if(wi){const w=WP[wi.id];$('wName').textContent=w.n.toUpperCase();$('ammo').innerHTML=w.melee?'<small>CORPO A CORPO</small>':w.thrown?'×'+P.nades:(P.reloadT>0?'--':wi.ammo)+' <small>/ '+PM(wi.id)+'</small>';$('ammo').style.color=w.mag>0&&wi.ammo<=PM(wi.id)*.25&&P.reloadT<=0?'#ff4338':'#fff';
    const gap=4+Math.tan(curSpread(w))/Math.tan(camera.fov*Math.PI/360)*window.innerHeight/2,vis=P.alive&&P.ads<.55&&P.sprint<.6?1:0;
    crossEl[0].style.top=-(gap+9)+'px';crossEl[1].style.top=gap+'px';crossEl[2].style.left=-(gap+9)+'px';crossEl[3].style.left=gap+'px';$('cross').style.opacity=vis;}
  $('nadeN').textContent=P.nades;$('eqNade').classList.toggle('off',P.nades<=0);$('eqRadar').classList.toggle('off',P.radarR>0);$('eqRadar').lastElementChild.style.width=((1-P.radarR/RCD())*100)+'%';
  blood=Math.max(0,blood-dt*.7);$('blood').style.opacity=Math.max(blood,P.alive?clamp((.6-P.hp/PK.hp)/.6,0,.85):.9);
  hitT=Math.max(0,hitT-dt);$('hitm').style.opacity=hitT>0?1:0;flashT=Math.max(0,flashT-dt);$('flash').style.opacity=flashT;
  dmgDirT=Math.max(0,dmgDirT-dt);$('dmgdir').style.opacity=Math.min(1,dmgDirT*2);
  if(bigT>0){bigT-=dt;if(bigT<=0){$('big').style.opacity=0;$('sub').style.opacity=0;}}
  if(streakT>0){streakT-=dt;if(streakT<=0)$('streak').style.opacity=0;}
  if(!P.alive&&mode==='play'&&!runMode)$('sub').textContent='Renasces em '+Math.max(1,Math.ceil(P.deadT)),$('sub').style.opacity=1;
  if(!runMode&&frameN<0)return;
  const bd=$('board');bd.classList.toggle('on',showBoard&&mode==='play');if(showBoard&&frameN%10===0){$('boardT').innerHTML=runMode?perksHTML():boardHTML();$('boardH').textContent=runMode?'HABILIDADES · NÍVEL '+RUN.level+' · SETOR '+RUN.sector:'CLASSIFICAÇÃO · TODOS CONTRA TODOS';}
  if(frameN%4===0)drawMini();
  if(frameN%6===0){let name='';if(P.alive){camera.getWorldDirection(_d);let ba=.035;for(const b of bots){if(!b.alive)continue;_b.set(b.x-eye.x,b.y+1.2-eye.y,b.z-eye.z);const d=_b.length();if(d>90)continue;_b.multiplyScalar(1/d);const an=Math.acos(clamp(_b.dot(_d),-1,1));if(an<ba&&W.los(eye.x,eye.y,eye.z,b.x,b.y+1.3,b.z)){ba=an;name=b.name;}}}
    $('aimName').textContent=name;$('aimName').style.opacity=name?1:0;}
}

/* ================= loop ================= */
let last=performance.now(),menuA=0;
function step(dt){
  if(runMode){if(perkOpen)return;if(RUN.pending>0&&P.alive){openPerk();return;}}
  time+=dt;frameN++;const bdt=P.focusT>0?dt*.22:dt;
  playerUpdate(dt);if(mode!=='play')return;for(const b of bots)botUpdate(b,bdt);nadeUpdate(bdt);
  if(runMode){runStep(dt);return;}
  tLeft-=dt;
  if(tLeft<=10&&tLeft>0&&Math.ceil(tLeft)!==Math.ceil(tLeft+dt))sfx.tick();
  if(tLeft<=0)endMatch();
}
function frame(now){
  requestAnimationFrame(frame);
  const dt=Math.min(.05,(now-last)/1000);last=now;
  if(mode==='play'){for(let i=0;i<timeScale&&mode==='play';i++)step(timeScale>1?.04:dt);fx(dt);hud(dt);}
  else if(mode==='over'){for(const b of bots)CH.update(b.h,dt*.25,0,0,0,false,-1);fx(dt*.25);hud(dt);}
  else if(mode==='menu'||mode==='load'){menuA+=dt*.05;camera.position.set(Math.cos(menuA)*30,9,Math.sin(menuA)*30);camera.lookAt(0,2.5,0);camera.rotation.z=0;vmRoot.visible=false;if(fp)fp.root.visible=false;if(camera.fov!==60){camera.fov=60;camera.updateProjectionMatrix();}}
  if(composer&&S.gfx){finalPass.uniforms.time.value=(now*.001)%10;composer.render();}else renderer.render(scene,camera);
}
window.__dbg={P,W,S,get bots(){return bots;},get mode(){return mode;},get time(){return time;},get tLeft(){return tLeft;},set tLeft(v){tLeft=v;},set timeScale(v){timeScale=v;},get post(){return !!composer;},get S(){return S;},get fp(){return fp;},get FPO(){return FPO;},killAll(){bots.slice().forEach(b=>{if(b.alive){b.prot=0;hurt(b,99999,P,false,{id:'ar'});}});},get RUN(){return RUN;},get PK(){return PK;},get runMode(){return runMode;},get perkOpen(){return perkOpen;},get firing(){return firing;},get ads(){return adsHeld;}};
refreshMenu();requestAnimationFrame(frame);
let fp=null;const _fr=new T.Vector3(),_fl=new T.Vector3(),_fq=new T.Quaternion(),_fx=new T.Vector3(),FPO={s:1.12,y:-1.85,z:.07,r:[.012,-.03,.07],l:[-.015,-.04,.03]};
CH.init(ok=>{try{fp=CH.makeFP();if(fp){camera.add(fp.root);fp.root.scale.setScalar(FPO.s);fp.root.position.set(0,FPO.y,FPO.z);fp.root.visible=false;Object.keys(vm).forEach(k=>{const a=vm[k].g.userData.arms;if(a)a.visible=false;});}}catch(e){fp=null;}
  ready=true;mode='menu';const b=$('bPlay');b.disabled=false;b.textContent='Entrar em combate';window.__dbg.model=ok;});
})();
