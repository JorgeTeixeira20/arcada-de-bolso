/* Soldados: modelo com esqueleto (Soldier.glb) + animações de captura de movimento (pack Mixamo convertido em js/anims.js).
   Pernas e tronco vêm das animações; os braços seguram a arma por cinemática inversa, exceto a recarregar.
   Se o modelo não carregar, usa-se um boneco de caixas como reserva. */
(function(){
'use strict';
const T=THREE,CH=window.CH={};
CH.HEAD_Y=1.66;CH.HEAD_R=.17;CH.BODY_H=1.5;CH.BODY_R=.3;
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const TINTS=[0xffffff,0x9aa57a,0xb9c0c8,0x8ea0c0,0xc48a78,0xd9c48a,0x7d8288,0x86b0a6,0xb89ad0,0xd0a070,0x90b878,0xc8c8a0];
const boxG=new T.BoxGeometry(1,1,1),mats={};
function mat(hex,o){const k=hex+(o?JSON.stringify(o):'');return mats[k]||(mats[k]=new T.MeshStandardMaterial(Object.assign({color:new T.Color(hex).convertSRGBToLinear(),roughness:.6,metalness:.1},o||{})));}
CH.mat=mat;CH.box=boxG;
function part(parent,hex,sx,sy,sz,x,y,z,o){const m=new T.Mesh(boxG,mat(hex,o));m.scale.set(sx,sy,sz);m.position.set(x,y,z);m.castShadow=true;parent.add(m);return m;}
CH.part=part;

const UPPER=/^(Spine|Spine1|Spine2|Neck|Head|LeftShoulder|LeftArm|LeftForeArm|LeftHand|RightShoulder|RightArm|RightForeArm|RightHand)$/;
/* velocidade natural (m/s) de cada animação de locomoção, para os pés não patinarem */
const NAT={walkF:1.5,run:3.22,walkB:1.12,runB:2.63,strafeL:1.41,strafeFL:2.87,strafeR:.77,strafeFR:2.87};
function buildClip(name,c,upper){
  const times=new Float32Array(c.n),tr=[];for(let i=0;i<c.n;i++)times[i]=i/(c.n-1)*c.d;
  for(const b in c.q){if(upper&&!UPPER.test(b))continue;tr.push(new T.QuaternionKeyframeTrack('mixamorig'+b+'.quaternion',times,c.q[b]));}
  if(!upper)tr.push(new T.VectorKeyframeTrack('mixamorigHips.position',times,c.hp));
  return new T.AnimationClip(name,c.d,tr);
}
CH.init=function(done){
  if(!T.GLTFLoader||!T.SkeletonUtils||!window.ASSETS||!window.ASSETS.soldier){done(false);return;}
  try{
    const bin=atob(window.ASSETS.soldier),u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);
    let shadowed=false;try{window.createImageBitmap=undefined;shadowed=true;}catch(e){}
    new T.GLTFLoader().parse(u.buffer,'',g=>{
      g.scene.traverse(o=>{if(o.isMesh){o.castShadow=true;o.frustumCulled=false;o.material.envMapIntensity=.7;}});
      CH.gltf=g;
      try{const A=window.ANIMS;if(A&&A.run&&A.aim){CH.clips={walkF:T.AnimationClip.findByName(g.animations,'Walk')};
        ['run','walkB','runB','strafeL','strafeR','strafeFL','strafeFR','aim'].forEach(k=>{CH.clips[k]=buildClip(k,A[k]);});
        if(A.reload)CH.clips.reloadU=buildClip('reloadU',A.reload,true);if(A.hit)CH.clips.hitU=buildClip('hitU',A.hit,true);}}catch(e){CH.clips=null;}
      done(true);
    },()=>done(false));
    if(shadowed){try{delete window.createImageBitmap;}catch(e){}}
  }catch(e){done(false);}
};
function tpGun(){
  const g=new T.Group(),d=0x26282c,o={roughness:.5,metalness:.6};
  part(g,d,.05,.08,.34,0,0,.1,o);part(g,d,.04,.045,.3,0,.01,.42,o);part(g,d,.022,.022,.2,0,.015,.66,o);part(g,d,.04,.07,.24,0,-.01,-.18,o);
  part(g,d,.035,.15,.06,0,-.11,.12,o);part(g,d,.04,.11,.05,0,-.09,-.01,o);part(g,d,.025,.03,.1,0,.065,.08,o);
  return g;
}
const LOCO=['walkF','run','walkB','runB','strafeL','strafeFL','strafeR','strafeFR'];
CH.CURL={axis:'z',r:[.95,1.0,.7],l:[-.95,-1.0,-.7],thumb:.35};
function curlFingers(model){
  const C=CH.CURL;
  for(const side of ['Right','Left'])for(const f of ['Thumb','Index','Middle','Ring','Pinky'])for(let j=1;j<=3;j++){
    const b=model.getObjectByName('mixamorig'+side+'Hand'+f+j);if(!b)continue;const a=(side==='Right'?C.r:C.l)[j-1]*(f==='Thumb'?C.thumb:1);
    if(C.axis==='x')b.rotateX(a);else if(C.axis==='y')b.rotateY(a);else b.rotateZ(a);
  }
}
function setWorldQ(b,q){b.parent.getWorldQuaternion(qp);b.quaternion.copy(qp.invert().multiply(q));b.updateMatrixWorld(true);}
const _m=new T.Matrix4(),_m2=new T.Matrix4(),_sc=new T.Vector3();
CH.make=function(i){
  const root=new T.Group();root.rotation.order='YXZ';
  if(!CH.gltf)return makeBox(i,root);
  const model=T.SkeletonUtils.clone(CH.gltf.scene);model.rotation.y=Math.PI;root.add(model);
  const tint=new T.Color(TINTS[i%TINTS.length]).convertSRGBToLinear();
  model.traverse(o=>{if(o.isSkinnedMesh&&o.material.name==='VanguardBodyMat'){o.material=o.material.clone();o.material.color.multiply(tint);}});
  const B=n=>model.getObjectByName('mixamorig'+n),mixer=new T.AnimationMixer(model);
  const h={g:root,model,mixer,pitch:0,aimK:0,deadT:-1,flinch:0,fall:1,relK:0,hitK:0,w:{},act:{},
    sp1:B('Spine1'),sp2:B('Spine2'),rA:B('RightArm'),rF:B('RightForeArm'),rH:B('RightHand'),lA:B('LeftArm'),lF:B('LeftForeArm'),lH:B('LeftHand'),head:B('Head'),gun:tpGun(),offM:null};
  root.add(h.gun);
  if(CH.clips){
    const A=(k,w)=>{const a=mixer.clipAction(CH.clips[k]);a.play();a.setEffectiveWeight(w);h.act[k]=a;h.w[k]=w;return a;};
    A('aim',1);LOCO.forEach(k=>A(k,0));
    if(CH.clips.reloadU){h.rel=mixer.clipAction(CH.clips.reloadU);h.rel.play();h.rel.timeScale=0;h.rel.setEffectiveWeight(0);}
    if(CH.clips.hitU){h.hitA=mixer.clipAction(CH.clips.hitU);h.hitA.setLoop(T.LoopOnce,1);h.hitA.clampWhenFinished=true;h.hitA.play();h.hitA.setEffectiveWeight(0);}
    // calibrar: posição da arma em relação à mão direita na pose de pontaria (usada a recarregar)
    mixer.update(0);root.updateMatrixWorld(true);h.gun.position.set(-.115,1.33,.2);h.gun.rotation.set(0,0,0);h.gun.updateMatrixWorld(true);
    h.offM=new T.Matrix4().copy(h.rH.matrixWorld).invert().multiply(h.gun.matrixWorld);
    h.relR=h.rH.getWorldQuaternion(new T.Quaternion());h.relL=h.lH.getWorldQuaternion(new T.Quaternion());curlFingers(model);
    h.act.aim.time=Math.random()*3;
  }else{
    const A=n=>{const a=mixer.clipAction(T.AnimationClip.findByName(CH.gltf.animations,n));a.play();return a;};
    h.idle=A('Idle');h.walk=A('Walk');h.run=A('Run');h.wI=1;h.wW=0;h.wR=0;h.idle.setEffectiveWeight(1);h.walk.setEffectiveWeight(0);h.run.setEffectiveWeight(0);mixer.update(Math.random()*2);
  }
  return h;
};
const S=new T.Vector3(),E=new T.Vector3(),H=new T.Vector3(),v1=new T.Vector3(),v2=new T.Vector3(),dir=new T.Vector3(),pol=new T.Vector3(),tg=new T.Vector3(),
  right=new T.Vector3(),dq=new T.Quaternion(),qw=new T.Quaternion(),qp=new T.Quaternion(),DOWN=new T.Vector3(0,-1,0);
function aimBone(b,child,t){
  b.getWorldPosition(v1);child.getWorldPosition(v2);v2.sub(v1).normalize();tg.copy(t).sub(v1).normalize();
  dq.setFromUnitVectors(v2,tg);b.getWorldQuaternion(qw);qw.premultiply(dq);b.parent.getWorldQuaternion(qp);b.quaternion.copy(qp.invert().multiply(qw));b.updateMatrixWorld(true);
}
function rotWorld(b,q){b.getWorldQuaternion(qw);qw.premultiply(q);b.parent.getWorldQuaternion(qp);b.quaternion.copy(qp.invert().multiply(qw));b.updateMatrixWorld(true);}
function ik(a,f,hd,target,pole){
  a.getWorldPosition(S);f.getWorldPosition(E);hd.getWorldPosition(H);
  const l1=S.distanceTo(E),l2=E.distanceTo(H);dir.copy(target).sub(S);let d=dir.length();const mx=(l1+l2)*.995;if(d>mx)d=mx;if(d<.05)d=.05;dir.normalize();
  const al=(l1*l1-l2*l2+d*d)/(2*d),hh=Math.sqrt(Math.max(0,l1*l1-al*al));
  pol.copy(pole).addScaledVector(dir,-pole.dot(dir));if(pol.lengthSq()<1e-6)pol.set(0,-1,0);pol.normalize();
  E.copy(S).addScaledVector(dir,al).addScaledVector(pol,hh);aimBone(a,f,E);
  H.copy(S).addScaledVector(dir,d);aimBone(f,hd,H);
}
const gp=new T.Vector3(),ge=new T.Euler(0,0,0,'YXZ'),gq=new T.Quaternion(),gq2=new T.Quaternion(),off=new T.Vector3(),
  hp=new T.Vector3(),hq=new T.Quaternion(),bq=new T.Quaternion(),s0=new T.Quaternion(),s1=new T.Quaternion(),s2=new T.Quaternion(),s3=new T.Quaternion();
/* vf, vr: velocidade local (m/s) para a frente e para a direita · pitch rad (cima positivo) · aiming · rel: -1 ou fração 0..1 da recarga */
CH.update=function(h,dt,vf,vr,pitch,aiming,rel){
  const speed=Math.hypot(vf,vr);
  if(h.box)return updBox(h,dt,speed,pitch,aiming);
  if(h.deadT>=0){
    h.deadT+=dt;const k=Math.min(1,h.deadT/.6),e=k*k*(3-2*k);
    h.g.rotation.x=-1.48*e*h.fall;h.model.position.y=.16*e;h.model.position.z=-.25*e*h.fall;h.g.rotation.z=h.twist*e;
    if(h.deadT<.6)h.mixer.update(dt*(1-k)*.8);return;
  }
  if(h.act.aim){
    const mv=clamp(speed/.9,0,1),fast=clamp((speed-1.7)/1.3,0,1);let wf=0,wb=0,wl=0,wr=0;
    if(speed>.05){const af=Math.abs(vf),ar=Math.abs(vr),t=af+ar;if(vf>=0)wf=af/t;else wb=af/t;if(vr<0)wl=ar/t;else wr=ar/t;}
    const tgt={aim:1-mv,walkF:mv*wf*(1-fast),run:mv*wf*fast,walkB:mv*wb*(1-fast),runB:mv*wb*fast,strafeL:mv*wl*(1-fast),strafeFL:mv*wl*fast,strafeR:mv*wr*(1-fast),strafeFR:mv*wr*fast};
    const q=Math.min(1,dt*9);
    for(const k in tgt){h.w[k]+=(tgt[k]-h.w[k])*q;const a=h.act[k];a.setEffectiveWeight(h.w[k]);if(NAT[k])a.timeScale=clamp(speed/NAT[k],.55,1.75);}
    h.relK+=((rel>=0?1:0)-h.relK)*Math.min(1,dt*9);
    if(h.rel){if(rel>=0)h.rel.time=clamp(rel,0,.985)*h.rel.getClip().duration;h.rel.setEffectiveWeight(h.relK*40);}
    if(h.hitA){if(h.flinch===1){h.hitA.reset();h.hitA.play();h.hitK=1;h.flinch=.99;}h.hitK=Math.max(0,h.hitK-dt*2.4);h.hitA.setEffectiveWeight(h.hitK*2.5);}
  }else{
    let wI,wW,wR;if(speed<.2){wI=1;wW=0;wR=0;}else if(speed<2.4){const k=speed/2.4;wI=1-k;wW=k;wR=0;}else{const k=clamp((speed-2.4)/2.2,0,1);wI=0;wW=1-k;wR=k;}
    const q=Math.min(1,dt*9);h.wI+=(wI-h.wI)*q;h.wW+=(wW-h.wW)*q;h.wR+=(wR-h.wR)*q;h.idle.setEffectiveWeight(h.wI);h.walk.setEffectiveWeight(h.wW);h.run.setEffectiveWeight(h.wR);
    const sg=vf<-.3?-1:1;h.walk.timeScale=clamp(speed/1.55,.6,1.7)*sg;h.run.timeScale=clamp(speed/4.7,.75,1.35)*sg;
  }
  h.mixer.update(dt);
  h.pitch+=(pitch-h.pitch)*Math.min(1,dt*10);h.aimK+=((aiming?1:0)-h.aimK)*Math.min(1,dt*8);
  const ikK=1-h.relK,p=h.pitch*h.aimK,k=h.aimK;
  h.g.updateMatrixWorld(true);
  h.g.getWorldQuaternion(gq);right.set(-1,0,0).applyQuaternion(gq);
  h.flinch=Math.max(0,h.flinch-dt*5);
  dq.setFromAxisAngle(right,(p*.38+k*.05)*ikK-h.flinch*.2);const sq=dq.clone();rotWorld(h.sp1,sq);rotWorld(h.sp2,sq);
  // arma presa ao corpo: encostada ao ombro a apontar, ou baixa a correr
  const bob=Math.sin(h.mixer.time*9)*.012*Math.min(1,speed/3);
  off.set(-.115,-.075+bob,.2);ge.set(-p,0,0);gq2.setFromEuler(ge);off.applyQuaternion(gq2);
  h.rA.getWorldPosition(v1);h.g.worldToLocal(v1);const sy=clamp(v1.y-.035,1.2,1.46);
  hp.set(-.115+(1-k)*.07,sy+off.y*k+(1-k)*(-.3+bob),off.z*k+(1-k)*.24);ge.set(-p*k+(1-k)*.55,(1-k)*.75,0);hq.setFromEuler(ge);
  if(h.relK>.01&&h.offM){ // a recarregar: a arma segue a mão direita da animação
    _m.multiplyMatrices(h.rH.matrixWorld,h.offM);_m2.copy(h.g.matrixWorld).invert().multiply(_m);_m2.decompose(gp,bq,_sc);
    hp.lerp(gp,h.relK);hq.slerp(bq,h.relK);
  }
  h.gun.position.copy(hp);h.gun.quaternion.copy(hq);h.gun.updateMatrixWorld(true);
  if(ikK>.02){
    s0.copy(h.rA.quaternion);s1.copy(h.rF.quaternion);s2.copy(h.lA.quaternion);s3.copy(h.lF.quaternion);
    gp.set(0,-.07,.0);h.gun.localToWorld(gp);v1.copy(right).multiplyScalar(.6).add(DOWN);ik(h.rA,h.rF,h.rH,gp,v1);
    gp.set(0,-.03,.4);h.gun.localToWorld(gp);v1.copy(right).multiplyScalar(-.5).add(DOWN);ik(h.lA,h.lF,h.lH,gp,v1);
    if(ikK<.98){h.rA.quaternion.slerp(s0,1-ikK);h.rF.quaternion.slerp(s1,1-ikK);h.lA.quaternion.slerp(s2,1-ikK);h.lF.quaternion.slerp(s3,1-ikK);}
    else if(h.relR){h.gun.getWorldQuaternion(gq2);bq.copy(gq2).multiply(h.relR);setWorldQ(h.rH,bq);bq.copy(gq2).multiply(h.relL);setWorldQ(h.lH,bq);}
  }
};
/* braços em primeira pessoa: o corpo do soldado preso à câmara, sem cabeça, com as mãos levadas à arma por cinemática inversa */
CH.makeFP=function(){
  if(!CH.gltf||!CH.clips)return null;
  const root=new T.Group(),model=T.SkeletonUtils.clone(CH.gltf.scene);root.add(model);
  model.traverse(o=>{if(o.isMesh){o.castShadow=false;o.frustumCulled=false;}});
  const B=n=>model.getObjectByName('mixamorig'+n),mixer=new T.AnimationMixer(model);mixer.clipAction(CH.clips.aim).play();mixer.update(0);
  B('Head').scale.setScalar(.0001);root.updateMatrixWorld(true);
  const fp={root,model,rA:B('RightArm'),rF:B('RightForeArm'),rH:B('RightHand'),lA:B('LeftArm'),lF:B('LeftForeArm'),lH:B('LeftHand'),rS:B('RightShoulder'),lS:B('LeftShoulder')};
  fp.relR=fp.rH.getWorldQuaternion(new T.Quaternion());fp.relL=fp.lH.getWorldQuaternion(new T.Quaternion());curlFingers(model);
  fp.bones=[fp.rA,fp.rF,fp.rH,fp.lA,fp.lF,fp.lH];fp.base=fp.bones.map(b=>b.quaternion.clone());
  return fp;
};
const fq=new T.Quaternion(),fv=new T.Vector3();
CH.updateFP=function(fp,rT,lT,gunQ,rightAxis){
  fp.bones.forEach((b,i)=>b.quaternion.copy(fp.base[i]));fp.root.updateMatrixWorld(true);
  fv.copy(rightAxis).multiplyScalar(.45).add(DOWN);ik(fp.rA,fp.rF,fp.rH,rT,fv);fq.copy(gunQ).multiply(fp.relR);setWorldQ(fp.rH,fq);
  fv.copy(rightAxis).multiplyScalar(-.3).add(DOWN);ik(fp.lA,fp.lF,fp.lH,lT,fv);fq.copy(gunQ).multiply(fp.relL);setWorldQ(fp.lH,fq);
};
CH.kill=function(h){h.deadT=0;h.fall=Math.random()<.5?1:-1;h.twist=(Math.random()-.5)*.7;if(h.gun)h.gun.visible=false;if(h.rel)h.rel.setEffectiveWeight(0);h.relK=0;};
CH.reset=function(h){h.deadT=-1;h.g.rotation.x=0;h.g.rotation.z=0;if(h.model){h.model.position.set(0,0,0);}if(h.gun)h.gun.visible=true;if(h.body)h.body.position.y=0;h.aimK=0;h.flinch=0;h.relK=0;h.hitK=0;};

/* ---------- reserva: boneco de caixas ---------- */
function makeBox(i,root){
  const body=new T.Group();root.add(body);const shirt=TINTS[(i+1)%TINTS.length],pants=0x34393f,skin=0xd9a57b;
  part(body,pants,.4,.2,.24,0,.92,0);const torso=new T.Group();torso.position.y=.98;body.add(torso);part(torso,shirt,.46,.5,.25,0,.27,0);
  const head=new T.Group();head.position.y=.6;torso.add(head);part(head,skin,.23,.25,.23,0,.1,0);part(head,0x3d4a2f,.27,.11,.27,0,.24,0);
  function arm(sx){const sh=new T.Group();sh.position.set(sx*.3,.46,0);torso.add(sh);part(sh,shirt,.13,.32,.13,0,-.15,0);const el=new T.Group();el.position.y=-.31;sh.add(el);part(el,skin,.11,.3,.11,0,-.14,0);return{sh,el};}
  const aR=arm(-1),aL=arm(1),gun=new T.Group();gun.position.set(0,-.3,0);aR.el.add(gun);part(gun,0x1c1c1c,.06,.52,.09,0,-.2,.04);
  function leg(sx){const hip=new T.Group();hip.position.set(sx*.115,.88,0);body.add(hip);part(hip,pants,.17,.44,.19,0,-.21,0);const kn=new T.Group();kn.position.y=-.43;hip.add(kn);part(kn,pants,.15,.36,.16,0,-.18,0);part(kn,0x1b1b1b,.16,.1,.25,0,-.4,.04);return{hip,kn};}
  return{box:true,g:root,body,torso,head,aR,aL,lR:leg(-1),lL:leg(1),ph:Math.random()*6,deadT:-1,pitch:0,flinch:0,fall:1};
}
function updBox(h,dt,speed,pitch,aiming){
  if(h.deadT>=0){h.deadT+=dt;const k=Math.min(1,h.deadT/.5),e=k*k;h.g.rotation.x=-e*1.52;h.body.position.y=e*.14;return;}
  h.ph+=speed*dt*2.15;const a=Math.min(1,speed/5)*.85,s=Math.sin(h.ph),c=Math.cos(h.ph);
  h.lL.hip.rotation.x=s*a;h.lR.hip.rotation.x=-s*a;h.lL.kn.rotation.x=Math.max(0,-c)*a*1.25;h.lR.kn.rotation.x=Math.max(0,c)*a*1.25;h.body.position.y=Math.abs(c)*.05*a;
  h.pitch+=(pitch-h.pitch)*Math.min(1,dt*10);const p=h.pitch;h.torso.rotation.x=a*.13-p*.4;
  if(!aiming){h.aR.sh.rotation.set(-.75-s*a*.25,0,.1);h.aR.el.rotation.x=-.75;h.aL.sh.rotation.set(-.6+s*a*.3,0,-.45);h.aL.el.rotation.x=-1;}
  else{h.aR.sh.rotation.set(-1.5-p*.6,0,.06);h.aR.el.rotation.x=0;h.aL.sh.rotation.set(-1.32-p*.6,0,-.5);h.aL.el.rotation.x=-.35;}
}
})();
