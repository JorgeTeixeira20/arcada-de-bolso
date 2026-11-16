/* Texturas: fotos embutidas (ASSETS) + texturas procedurais com relevo */
(function(){
'use strict';
const T=THREE,TX=window.TX={};
const rnd=(a,b)=>a+Math.random()*(b-a);
function cv(s){const c=document.createElement('canvas');c.width=c.height=s;return c;}
function tex(c,srgb){const t=new T.CanvasTexture(c);t.wrapS=t.wrapT=T.RepeatWrapping;if(srgb)t.encoding=T.sRGBEncoding;t.anisotropy=8;return t;}
TX.img=function(name,srgb){
  const t=new T.Texture(),im=new Image();im.onload=()=>{t.image=im;t.needsUpdate=true;};im.src=window.ASSETS[name];
  t.wrapS=t.wrapT=T.RepeatWrapping;if(srgb)t.encoding=T.sRGBEncoding;t.anisotropy=8;return t;
};
function splots(g,s,n,r0,r1,cols,alpha){
  for(let i=0;i<n;i++){
    const x=rnd(0,s),y=rnd(0,s),r=rnd(r0,r1),c=cols[Math.floor(Math.random()*cols.length)];
    for(let ox=-s;ox<=s;ox+=s)for(let oy=-s;oy<=s;oy+=s){
      if(x+ox+r<0||x+ox-r>s||y+oy+r<0||y+oy-r>s)continue;
      const gr=g.createRadialGradient(x+ox,y+oy,0,x+ox,y+oy,r);gr.addColorStop(0,'rgba('+c+','+alpha+')');gr.addColorStop(1,'rgba('+c+',0)');
      g.fillStyle=gr;g.fillRect(x+ox-r,y+oy-r,r*2,r*2);
    }
  }
}
function grain(g,s,amt){const d=g.getImageData(0,0,s,s),p=d.data;for(let i=0;i<p.length;i+=4){const n=(Math.random()-.5)*amt;p[i]+=n;p[i+1]+=n;p[i+2]+=n;}g.putImageData(d,0,0);}
function cracks(g,s,n,col){g.strokeStyle=col;for(let i=0;i<n;i++){let x=rnd(0,s),y=rnd(0,s);g.lineWidth=rnd(.6,1.6);g.beginPath();g.moveTo(x,y);
  for(let k=0;k<rnd(6,18);k++){x+=rnd(-22,22);y+=rnd(-22,22);g.lineTo(x,y);}g.stroke();}}

TX.concrete=function(){const s=512,c=cv(s),g=c.getContext('2d');g.fillStyle='#a3a29c';g.fillRect(0,0,s,s);
  splots(g,s,260,20,90,['70,70,66','200,198,190','120,116,108'],.07);splots(g,s,40,30,120,['60,52,40'],.08);
  g.strokeStyle='rgba(40,40,40,.25)';g.lineWidth=2;for(let y=0;y<s;y+=128){g.beginPath();g.moveTo(0,y+1);g.lineTo(s,y+1);g.stroke();}
  for(let x=64;x<s;x+=256){g.beginPath();g.moveTo(x,0);g.lineTo(x,s);g.stroke();}
  cracks(g,s,5,'rgba(30,30,30,.35)');grain(g,s,30);return tex(c,true);};
TX.asphalt=function(){const s=512,c=cv(s),g=c.getContext('2d');g.fillStyle='#3d3d40';g.fillRect(0,0,s,s);
  splots(g,s,200,20,100,['20,20,22','90,90,92','60,56,50'],.09);cracks(g,s,9,'rgba(10,10,10,.5)');grain(g,s,46);return tex(c,true);};
TX.dirt=function(){const s=512,c=cv(s),g=c.getContext('2d');g.fillStyle='#7b6a50';g.fillRect(0,0,s,s);
  splots(g,s,300,10,70,['50,40,28','150,132,100','100,90,60'],.1);grain(g,s,40);return tex(c,true);};
TX.plaster=function(){const s=512,c=cv(s),g=c.getContext('2d');g.fillStyle='#e9e5dc';g.fillRect(0,0,s,s);
  splots(g,s,160,30,120,['150,140,120','255,255,250','110,100,80'],.06);
  for(let i=0;i<26;i++){const x=rnd(0,s),w=rnd(4,16),gr=g.createLinearGradient(0,0,0,s);gr.addColorStop(0,'rgba(70,60,45,.16)');gr.addColorStop(rnd(.3,.9),'rgba(70,60,45,0)');g.fillStyle=gr;g.fillRect(x,0,w,s);}
  cracks(g,s,3,'rgba(60,50,40,.3)');grain(g,s,18);return tex(c,true);};
function corr(waves,base,rust){
  const s=512,c=cv(s),g=c.getContext('2d'),b=cv(s),gb=b.getContext('2d');
  for(let x=0;x<s;x++){const v=.5+.5*Math.sin(x/s*Math.PI*2*waves),k=.72+.28*v;
    g.fillStyle='rgb('+Math.round(base[0]*k)+','+Math.round(base[1]*k)+','+Math.round(base[2]*k)+')';g.fillRect(x,0,1,s);
    const q=Math.round(v*255);gb.fillStyle='rgb('+q+','+q+','+q+')';gb.fillRect(x,0,1,s);}
  splots(g,s,rust,15,70,['110,60,30','80,45,25'],.13);splots(g,s,60,20,90,['30,30,30'],.07);
  for(let i=0;i<30;i++){const x=rnd(0,s),w=rnd(3,10),y=rnd(0,s*.6),gr=g.createLinearGradient(0,y,0,y+rnd(80,260));gr.addColorStop(0,'rgba(60,35,20,.22)');gr.addColorStop(1,'rgba(60,35,20,0)');g.fillStyle=gr;g.fillRect(x,y,w,300);}
  grain(g,s,16);return{map:tex(c,true),bump:tex(b,false)};
}
TX.metal=()=>corr(16,[150,160,165],70);
TX.container=()=>corr(10,[236,236,236],34);
TX.sandbag=function(){
  const s=512,c=cv(s),g=c.getContext('2d'),b=cv(s),gb=b.getContext('2d');g.fillStyle='#5c5038';g.fillRect(0,0,s,s);gb.fillStyle='#000';gb.fillRect(0,0,s,s);
  const bw=128,bh=64;
  for(let r=0;r<s/bh;r++)for(let k=-1;k<=s/bw;k++){
    const x=k*bw+(r%2?bw/2:0),y=r*bh,t=rnd(.9,1.1);
    const gr=g.createRadialGradient(x+bw/2,y+bh/2,4,x+bw/2,y+bh/2,bw*.62);gr.addColorStop(0,'rgb('+Math.round(190*t)+','+Math.round(172*t)+','+Math.round(128*t)+')');gr.addColorStop(1,'rgb(96,84,58)');
    g.fillStyle=gr;g.beginPath();g.ellipse(x+bw/2,y+bh/2,bw/2-2,bh/2-2,0,0,7);g.fill();
    const gr2=gb.createRadialGradient(x+bw/2,y+bh/2,2,x+bw/2,y+bh/2,bw*.55);gr2.addColorStop(0,'#fff');gr2.addColorStop(1,'#222');
    gb.fillStyle=gr2;gb.beginPath();gb.ellipse(x+bw/2,y+bh/2,bw/2-2,bh/2-2,0,0,7);gb.fill();
  }
  grain(g,s,26);return{map:tex(c,true),bump:tex(b,false)};
};
TX.facade=function(){const s=512,c=cv(s),g=c.getContext('2d');g.fillStyle='#cfc8ba';g.fillRect(0,0,s,s);splots(g,s,80,30,120,['90,80,70'],.08);
  for(let r=0;r<4;r++)for(let k=0;k<4;k++){const x=k*128+26,y=r*128+30;g.fillStyle='#8d8678';g.fillRect(x-5,y-5,86,78);
    g.fillStyle=Math.random()<.2?'#d8c890':'rgb('+Math.round(rnd(30,60))+','+Math.round(rnd(45,70))+','+Math.round(rnd(60,90))+')';g.fillRect(x,y,76,68);g.fillStyle='#8d8678';g.fillRect(x+36,y,4,68);}
  grain(g,s,14);return tex(c,true);};
TX.flare=function(){const s=128,c=cv(s),g=c.getContext('2d'),gr=g.createRadialGradient(64,64,0,64,64,64);
  gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(.18,'rgba(255,236,170,.95)');gr.addColorStop(.45,'rgba(255,150,40,.4)');gr.addColorStop(1,'rgba(255,90,0,0)');
  g.fillStyle=gr;g.fillRect(0,0,s,s);g.globalCompositeOperation='lighter';g.strokeStyle='rgba(255,220,150,.8)';
  for(let i=0;i<7;i++){const a=rnd(0,6.28),l=rnd(30,62);g.lineWidth=rnd(2,6);g.beginPath();g.moveTo(64,64);g.lineTo(64+Math.cos(a)*l,64+Math.sin(a)*l);g.stroke();}
  return new T.CanvasTexture(c);};
TX.soft=function(){const s=64,c=cv(s),g=c.getContext('2d'),gr=g.createRadialGradient(32,32,0,32,32,32);gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(0,0,s,s);return new T.CanvasTexture(c);};
TX.aoStrip=function(){const c=cv(64),g=c.getContext('2d'),gr=g.createLinearGradient(0,64,0,0);gr.addColorStop(0,'rgba(0,0,0,.62)');gr.addColorStop(.35,'rgba(0,0,0,.22)');gr.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gr;g.fillRect(0,0,64,64);return new T.CanvasTexture(c);};
TX.grassTuft=function(){const s=128,c=cv(s),g=c.getContext('2d');g.lineCap='round';
  for(let i=0;i<34;i++){const x=rnd(14,114),h=rnd(50,120),lean=rnd(-26,26),k=Math.round(rnd(90,170));g.strokeStyle='rgb('+Math.round(k*.62)+','+k+','+Math.round(k*.38)+')';g.lineWidth=rnd(2,4.5);
    g.beginPath();g.moveTo(x,s);g.quadraticCurveTo(x+lean*.3,s-h*.6,x+lean,s-h);g.stroke();}
  const t=new T.CanvasTexture(c);t.encoding=T.sRGBEncoding;return t;};
TX.hole=function(){const s=64,c=cv(s),g=c.getContext('2d'),gr=g.createRadialGradient(32,32,2,32,32,30);gr.addColorStop(0,'rgba(0,0,0,.95)');gr.addColorStop(.25,'rgba(15,12,10,.8)');gr.addColorStop(.6,'rgba(40,36,30,.25)');gr.addColorStop(1,'rgba(40,36,30,0)');g.fillStyle=gr;g.fillRect(0,0,s,s);return new T.CanvasTexture(c);};

/* UV em espaço-mundo: a textura mantém a escala real em caixas de qualquer tamanho (só caixas alinhadas aos eixos) */
TX.worldUV=function(mat,scale){
  mat.onBeforeCompile=sh=>{sh.vertexShader=sh.vertexShader.replace('#include <uv_vertex>',
    '#ifdef USE_UV\n vec4 wuvP=vec4(position,1.0);\n #ifdef USE_INSTANCING\n wuvP=instanceMatrix*wuvP;\n #endif\n wuvP=modelMatrix*wuvP;\n'+
    ' vUv=(abs(normal.x)>0.5?wuvP.zy:(abs(normal.y)>0.5?wuvP.xz:wuvP.xy))*'+scale.toFixed(3)+';\n#endif');};
  return mat;
};
TX.materials=function(){
  const S=o=>new T.MeshStandardMaterial(o),m={},met=TX.metal(),con=TX.container(),sb=TX.sandbag(),cc=TX.concrete(),pl=TX.plaster(),as=TX.asphalt();
  m.brick=TX.worldUV(S({map:TX.img('brick',true),bumpMap:TX.img('brickB'),bumpScale:.035,roughness:.92}),.42);
  m.concrete=TX.worldUV(S({map:cc,bumpMap:cc,bumpScale:.012,roughness:.9}),.3);
  m.asphalt=TX.worldUV(S({map:as,bumpMap:as,bumpScale:.01,roughness:.95}),.25);
  m.plaster=TX.worldUV(S({map:pl,bumpMap:pl,bumpScale:.006,roughness:.88}),.3);
  m.metal=TX.worldUV(S({map:met.map,bumpMap:met.bump,bumpScale:.03,roughness:.55,metalness:.55}),.5);
  m.container=TX.worldUV(S({map:con.map,bumpMap:con.bump,bumpScale:.035,roughness:.6,metalness:.35}),.42);
  m.sandbag=TX.worldUV(S({map:sb.map,bumpMap:sb.bump,bumpScale:.06,roughness:1}),.9);
  m.wood=TX.worldUV(S({map:TX.img('wood',true),bumpMap:TX.img('woodB'),bumpScale:.01,roughness:.75}),.7);
  m.facade=TX.worldUV(S({map:TX.facade(),roughness:.9}),.085);
  m.crate=S({map:TX.img('crate',true),roughness:.85});
  m.paint=S({roughness:.42,metalness:.55});
  m.glass=S({color:0x9fc4d8,transparent:true,opacity:.3,roughness:.04,metalness:.7,depthWrite:false});
  m.dark=S({color:0x1c1d20,roughness:.8,metalness:.2});
  const gt=TX.img('grass',true),gn=TX.img('grassN');gt.repeat.set(34,34);gn.repeat.set(34,34);
  m.ground=S({map:gt,normalMap:gn,roughness:1,color:0xd8d2c0});
  const dt=TX.dirt();m.dirt=TX.worldUV(S({map:dt,bumpMap:dt,bumpScale:.02,roughness:1}),.22);
  for(const k in m)m[k].envMapIntensity=.55;
  m.glass.envMapIntensity=1.8;
  return m;
};
})();
