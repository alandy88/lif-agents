"""Layered 2.5D promo renderer. Reads ./layers (from prep.py), pipes frames to ffmpeg.

usage: render.py                 -> video_silent.mp4 (1080x1920, 30 fps)
       render.py --stills 0.5,8,12.1   -> stills.jpg, one frame per beat position

PER-IMAGE VALUES, all in full-size source pixels. Re-measure them for every new image:
  BEAT, T0, NBEATS            music grid from beats.py
  HEAD_C, NECK_P              head centre, neck pivot
  EYE                         eye boxes (x0,x1,y0,y1) per eye layer
  BAG_P, HIP, SH_L, SH_R      pendulum pivot, hip pivot, shoulder pivots
  w_* / lift_w / knee ranges  the y ranges of hips, shoulders, chest, knees, feet
  chest centre x (1010)       in the topwear line of character()
  K                           camera keyframes (beat, cx, cy, zoom, roll_deg)
  make_title()                title text
The values below are the worked example (Vivian, 2048x3072).
"""
import cv2, numpy as np, json, math, sys, subprocess, argparse
import torch, torch.nn.functional as F
from PIL import Image, ImageDraw, ImageFont

ap=argparse.ArgumentParser()
ap.add_argument('--stills',default='')   # comma list of beat positions -> jpg
ap.add_argument('--out',default='video_silent.mp4')
ap.add_argument('--ss',type=int,default=2)
ap.add_argument('--idle',action='store_true')   # plain full-frame loop for the gacha cards
ap.add_argument('--nbeats',type=int,default=0)
args=ap.parse_args()

dev='cuda'; FPS=30; OW,OH=1080,1920
BEAT=0.6; T0=0.0; NBEATS=31
NBEATS=args.nbeats or NBEATS
NF=int(round((T0+NBEATS*BEAT)*FPS))
meta=json.load(open('layers/_meta.json')); order=meta['order']; W,H=meta['W'],meta['H']

def load(n):
    im=cv2.imread(f'layers/{n}.png',cv2.IMREAD_UNCHANGED).astype(np.float32)/255.
    im=im[...,[2,1,0,3]]; im[...,:3]*=im[...,3:]
    return torch.from_numpy(im).permute(2,0,1).to(dev)
L={n:load(n) for n in order}
bg=cv2.imread('layers/_bg.png').astype(np.float32)/255.
bg=torch.from_numpy(bg[...,::-1].copy()).permute(2,0,1).to(dev)
# eye glow source
glow_src={}
for n in ('eye-l','eye-r'):
    v=L[n]; a=v[3:].clamp(min=1e-3); rgb=v[:3]/a
    red=(rgb[0]-torch.maximum(rgb[1],rgb[2])-0.25).clamp(0,0.25)/0.25
    glow_src[n]=torch.cat([rgb*red*v[3:], red*v[3:]],0)

ys,xs=torch.meshgrid(torch.arange(H,device=dev,dtype=torch.float32),torch.arange(W,device=dev,dtype=torch.float32),indexing='ij')

def sstep(a,b,x):
    t=((x-a)/(b-a)).clamp(0,1); return t*t*(3-2*t)
def fs(a,b,x):
    t=min(max((x-a)/(b-a),0.),1.); return t*t*(3-2*t)

HEAD_C=(470.,430.); NECK_P=(520.,640.)
dist_head=torch.sqrt((xs-HEAD_C[0])**2+(ys-HEAD_C[1])**2)
w_back=sstep(160,700,dist_head)**1.2
w_front=sstep(250,560,ys)
lift_w=sstep(1250,700,ys)         # breathing weight by height
EYE={'eye-l':(439,556,411,477),'eye-r':(327,400,427,486)}
BAG_P=(560.,760.)
HIP=(560.,1250.)
w_up=sstep(1250,700,ys)            # spine bend weight, 0 at hip, 1 at shoulders
w_leg=torch.zeros_like(ys)   # seated: legs stay put
w_root=sstep(1300,900,ys)        # 1 above hips, 0 at the feet (feet stay planted)
knee=torch.zeros_like(ys)
SH_L=(780.,700.); SH_R=(330.,760.)
d_shl=torch.sqrt((xs-SH_L[0])**2+(ys-SH_L[1])**2); w_arml=sstep(0,500,d_shl)
d_shr=torch.sqrt((xs-SH_R[0])**2+(ys-SH_R[1])**2); w_armr=sstep(0,400,d_shr)
w_chest=sstep(700,850,ys)*(1-sstep(1000,1150,ys))
def bend(sx,sy,P,ang,w):
    a=ang*w; c,s_=torch.cos(a),torch.sin(a); dx,dy=sx-P[0],sy-P[1]
    return P[0]+c*dx-s_*dy, P[1]+s_*dx+c*dy
HEADSET={'face','ears','headwear','eye-l','eye-r','front hair'}

def sample(img,sx,sy):
    g=torch.stack([(sx+0.5)/W*2-1,(sy+0.5)/H*2-1],-1)[None]
    return F.grid_sample(img[None],g,mode='bilinear',padding_mode='zeros',align_corners=False)[0]

def rot_about(sx,sy,P,ang):
    c,s=math.cos(ang),math.sin(ang); dx,dy=sx-P[0],sy-P[1]
    return P[0]+c*dx-s*dy, P[1]+s*dx+c*dy

def character(t,p):
    """returns premult RGBA character + glow buffer at full res"""
    fb_=1/(4*BEAT); fs_=1/(8*BEAT)             # breathe every 4 beats, sway every 8
    tt=t-T0
    br=math.sin(2*math.pi*fb_*tt)
    lift=5.0*br
    gust=p['gust']; k=p['body']
    def sway(lag): return math.sin(2*math.pi*fs_*(tt-lag))+0.3*math.sin(2*math.pi*2*fs_*(tt-lag)+0.8)
    bob=5.0*k*math.sin(2*math.pi*fb_*(tt-0.12))      # whole body sinks and rises
    body=math.radians(1.25*k)*sway(0.0)
    hipx=4.0*k*sway(0.15)
    rootx=3.0*k*sway(0.05)
    legs=math.radians(-0.6*k)*sway(0.1)
    th=math.radians(0.3*math.sin(2*math.pi*0.19*t+1.0)+p['head'])-0.2*math.radians(1.25*k)*sway(0.45)
    arml=math.radians(0.3*k)*sway(0.55)
    armr=math.radians(0.2*k)*sway(0.4)
    out=torch.zeros(4,H,W,device=dev); glow=torch.zeros(4,H,W,device=dev)
    for n in order:
        sx=xs-rootx*w_root; sy=ys-bob*w_root
        if n in ('legwear','footwear'):
            sx,sy=bend(sx,sy,HIP,-legs,w_leg)
            sx=sx-0.7*bob*knee          # knees give a little as she sinks
        else:
            sx,sy=bend(sx,sy,HIP,-body,w_up)
            sx=sx-hipx*w_up
            sy=sy+lift*lift_w            # backward map: content moves up when lift>0
        if n=='topwear':
            sx=560+(sx-560)/(1+0.010*br*w_chest)
        if n=='handwear-l':
            sx,sy=bend(sx,sy,SH_L,-arml,w_arml)
        if n=='handwear-r':
            sx,sy=bend(sx,sy,SH_R,-armr,w_armr)
        if n in HEADSET:
            sx,sy=rot_about(sx,sy,NECK_P,-th)
        if n in ('neck','neckwear'):
            sx,sy=rot_about(sx,sy,NECK_P,-th*0.5)
        if n=='back hair':
            hx,hy=rot_about(sx,sy,NECK_P,-th)
            sx=sx+(hx-sx)*(1-w_back); sy=sy+(hy-sy)*(1-w_back)
            A=(13+26*gust)
            ph=dist_head/230.
            sx=sx-A*w_back*(torch.sin(2*math.pi*0.45*t-ph)+0.35*torch.sin(2*math.pi*1.1*t-ph*1.7+1.3))
            sy=sy-0.45*A*w_back*torch.sin(2*math.pi*0.45*t-ph+1.2)
        if n=='front hair':
            A=(4+7*gust); ph=ys/170.
            sx=sx-A*w_front*torch.sin(2*math.pi*0.5*t-ph)
        if n=='objects':
            ang=math.radians(0.4*math.sin(2*math.pi*0.33*t+0.6)+0.6*k*sway(0.7))
            sx,sy=rot_about(sx,sy,BAG_P,-ang)
        if n in EYE and p['blink']>0:
            x0,x1,y0,y1=EYE[n]; yb=y1-6
            syc=1-0.88*p['blink']
            sy=yb+(sy-yb)/syc
        v=sample(L[n],sx,sy)
        out=v+out*(1-v[3:])
        if n in glow_src:
            gv=sample(glow_src[n],sx,sy); glow=gv+glow*(1-v[3:])
        else:
            glow=glow*(1-v[3:])
    return out,glow

SS=args.ss
oy,ox=torch.meshgrid(torch.arange(OH*SS,device=dev,dtype=torch.float32),torch.arange(OW*SS,device=dev,dtype=torch.float32),indexing='ij')
ox=(ox+0.5)/SS-OW/2; oy=(oy+0.5)/SS-OH/2
def cam(img,c,z,roll,pad='zeros'):
    cr,sr=math.cos(roll),math.sin(roll)
    sx=c[0]+(cr*ox-sr*oy)/z; sy=c[1]+(sr*ox+cr*oy)/z
    g=torch.stack([(sx)/W*2-1,(sy)/H*2-1],-1)[None]
    o=F.grid_sample(img[None],g,mode='bilinear',padding_mode=pad,align_corners=False)
    return F.avg_pool2d(o,SS)[0] if SS>1 else o[0]

def blur(img,sig):
    if sig<0.3: return img
    # downsample-blur-upsample for speed
    f=max(1,int(sig/2)); x=img[None]
    if f>1: x=F.avg_pool2d(x,f)
    s=sig/f; k=int(s*3)*2+1
    ax=torch.arange(k,device=dev)-k//2; ker=torch.exp(-ax**2/(2*s*s)); ker/=ker.sum()
    C=x.shape[1]
    x=F.conv2d(F.pad(x,(k//2,k//2,0,0),mode='replicate'),ker.view(1,1,1,k).repeat(C,1,1,1),groups=C)
    x=F.conv2d(F.pad(x,(0,0,k//2,k//2),mode='replicate'),ker.view(1,1,k,1).repeat(C,1,1,1),groups=C)
    if f>1: x=F.interpolate(x,size=img.shape[1:],mode='bilinear',align_corners=False)
    return x[0]

# particles
rng=np.random.default_rng(3)
NP=70
P0=rng.random((NP,2)); Pz=rng.random(NP); Pph=rng.random(NP)*6.28; Psp=0.4+rng.random(NP)
def particles(t,amount,drift):
    if amount<=0: return 0
    acc=[]
    for cls,(lo,hi,sig,gain) in enumerate([(0,.55,2.2,1.2),(.55,.85,6,0.9),(.85,1,20,0.8)]):
        m=(Pz>=lo)&(Pz<hi)
        sp=(0.012+0.05*Pz[m])*Psp[m]
        x=(P0[m,0]+0.02*np.sin(t*0.7+Pph[m])+drift*0.05*(0.3+Pz[m]))%1.0
        y=(P0[m,1]-sp*t)%1.0
        tw=0.6+0.4*np.sin(t*2.0*Psp[m]+Pph[m])
        img=torch.zeros(1,OH//2,OW//2,device=dev)
        xi=torch.from_numpy((x*(OW//2-1)).astype(np.int64)).to(dev); yi=torch.from_numpy((y*(OH//2-1)).astype(np.int64)).to(dev)
        img[0].index_put_((yi,xi),torch.from_numpy((tw*gain*sig*sig*6).astype(np.float32)).to(dev),accumulate=True)
        img=blur(img,sig/2)
        acc.append(F.interpolate(img[None],size=(OH,OW),mode='bilinear',align_corners=False)[0])
    a=sum(acc)*amount*0.45
    return a*torch.tensor([0.85,0.9,1.0],device=dev).view(3,1,1)

vy,vx=torch.meshgrid(torch.linspace(-1,1,OH,device=dev),torch.linspace(-1,1,OW,device=dev),indexing='ij')
vig_r=(vx**2*0.8+vy**2)
def grade(img,sat,exp,tint,vig):
    l=(img*torch.tensor([.299,.587,.114],device=dev).view(3,1,1)).sum(0,keepdim=True)
    img=l+(img-l)*sat
    img=img*exp*torch.tensor(tint,device=dev).view(3,1,1)
    img=img*(1-vig*sstep(0.25,1.6,vig_r))
    return img

# title
def make_title():
    im=Image.new('RGBA',(OW,OH),(0,0,0,0)); d=ImageDraw.Draw(im)
    f1=ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSerifCJK-Bold.ttc',150,index=2)
    f2=ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc',44,index=2)
    f3=ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc',30,index=2)
    def spaced(txt,font,y,sp,fill):
        ws=[d.textlength(ch,font=font) for ch in txt]; tot=sum(ws)+sp*(len(txt)-1); x=(OW-tot)/2
        for ch,w in zip(txt,ws): d.text((x,y),ch,font=font,fill=fill); x+=w+sp
        return (OW-tot)/2,tot
    x,tot=spaced('DAKI',f1,1440,40,(255,255,255,255))
    d.line([(x,1655),(x+tot,1655)],fill=(255,255,255,200),width=2)
    spaced('堕姫 · 街头穿搭',f2,1675,18,(255,255,255,235))
    spaced('UPPER MOON SIX · OFF DUTY',f3,1760,12,(255,200,230,210))
    a=np.asarray(im).astype(np.float32)/255.
    return torch.from_numpy(a).permute(2,0,1).to(dev)
TITLE=make_title()
scrim=sstep(0.3,0.75,vy)[None]   # bottom dark gradient

def lerp(a,b,u): return a+(b-a)*u
def ease(u): return u*u*(3-2*u)
def eout(u,k=3): return 1-(1-u)**k

K=[(0,540,1690,1.6,-4),(4,720,1300,1.5,-3),(6,560,990,1.4,3),(8,600,900,1.12,0),
   (10,900,560,1.45,4),(12,445,455,1.95,-2),(16,445,455,2.0,-1),(19,562,1000,0.98,0),(99,562,1000,0.98,0)]
def sm5(u): return u*u*u*(u*(u*6-15)+10)
def camera(b):
    for i in range(len(K)-1):
        if b<K[i+1][0]: break
    b0,x0,y0,z0,r0=K[i]; b1,x1,y1,z1,r1=K[i+1]
    u=(b-b0)/(b1-b0)
    if i==0: u=ease(u)
    elif b0==12: u=u
    elif b0==16: u=sm5(u)
    else: u=sm5(min(max((u-0.3)/0.7,0),1))     # linger on the detail, then glide, land on the beat
    z=math.exp(lerp(math.log(z0),math.log(z1),u))
    return (lerp(x0,x1,u),lerp(y0,y1,u)),z,math.radians(lerp(r0,r1,u))
def bump(b,b0,rate): return math.exp(-(b-b0)*rate) if b>=b0 else 0.
def blinkat(b,b0): return fs(b0-0.12,b0,b)*(1-fs(b0,b0+0.28,b))
REVEALS=(5,9,13,17,21,25,31)
def idle_shot(b):
    p=dict(body=1.,head=0.,gust=0.3,blink=0.,sat=1.,exp=1.,tint=(1,1,1),vig=0.,dof=0.,parts=0.,flash=0.,ca=0.,title=0.,fade=1.,punch=0.,bgpar=1.,glow=0.4,jit=0.)
    p['c'],p['z'],p['roll']=(W/2,H/2),min(OW/W,OH/H),0.   # whole image, centred
    p['cref']=(W/2,H/2)
    p['gust']=0.3+sum(0.9*bump(b,r,0.7) for r in REVEALS)
    p['blink']=max(blinkat(b,r+1.6) for r in REVEALS)
    return p
def shot(b):
    if args.idle: return idle_shot(b)
    p=dict(body=1.,head=0.,gust=0.3,blink=0.,sat=1.,exp=1.,tint=(1,1,1),vig=0.25,dof=0.,parts=0.6,flash=0.,ca=0.,title=0.,fade=1.,punch=0.,bgpar=0.93,glow=0.4,jit=1.)
    p['c'],p['z'],p['roll']=camera(b); p['cref']=(562,1000)
    z=p['z']
    p['dof']=8*fs(0.7,1.1,z); p['body']=lerp(1,0.45,fs(1.3,1.9,z))
    if b<8:
        p.update(sat=0.35,exp=lerp(0.5,0.62,b/8),tint=(0.85,0.95,1.2),vig=0.75); p['fade']=fs(0,0.8,b)
    else:
        p['vig']=lerp(0.1,0.42,fs(0.7,1.2,z)); p['sat']=1.06
        p['flash']=0.3*bump(b,8,5)+0.22*bump(b,12,6)+0.15*bump(b,19,5)+0.12*bump(b,24,5)
        p['ca']=9*bump(b,8,2.5)+9*bump(b,12,2.5)
        p['punch']=0.028*(1-fs(18,19,b))
    p['gust']=0.3+0.8*bump(b,8,0.6)+0.5*bump(b,12,0.6)+0.9*bump(b,16.5,0.4)
    p['blink']=max(fs(10.4,10.8,b)*(1-fs(12-3/18,12+2/18,b)), blinkat(b,14.5), blinkat(b,22.5), blinkat(b,27))
    p['glow']=0.4+1.0*bump(b,12,2.2)
    p['jit']=1-fs(18,19,b)
    p['parts']=lerp(0.6,1.0,fs(16,19,b))
    p['title']=fs(24,24.6,b)
    p['fade']*=1-fs(29.6,31,b)
    return p

def frame(b):
    t=T0+b*BEAT
    p=shot(b)
    ch,glow=character(t,p)
    fb=b-math.floor(b)
    z=p['z']*(1+p['punch']*math.exp(-fb*5))
    j=p['jit']; c=(p['c'][0]+j*(5*math.sin(t*0.9)+3*math.sin(t*2.3)), p['c'][1]+j*4*math.sin(t*0.7+1))
    cb=(p['cref'][0]+(c[0]-p['cref'][0])*p['bgpar'], p['cref'][1]+(c[1]-p['cref'][1])*p['bgpar'])
    B=cam(bg,cb,z,p['roll'],'border')
    B=blur(B,p['dof'])
    C=cam(ch,c,z,p['roll'])
    img=C[:3]+B*(1-C[3:])
    G=cam(glow,c,z,p['roll'])
    if p['glow']>0:
        img=img+p['glow']*(blur(G[:3],6)*1.2+blur(G[:3],28)*2.0)
    # soft bloom
    hi=(img-0.75).clamp(min=0)
    img=img+0.3*blur(hi,18)
    img=grade(img,p['sat'],p['exp'],p['tint'],p['vig'])
    img=img+particles(t,p['parts'],t)
    if p['ca']>0.5:
        s=int(round(p['ca']))
        img=torch.stack([torch.roll(img[0],s,1),img[1],torch.roll(img[2],-s,1)],0)
    img=img+p['flash']
    if p['title']>0:
        a=p['title']
        img=img*(1-0.85*a*scrim)
        ta=TITLE[3:]*a
        img=img*(1-ta)+TITLE[:3]*ta
    img=img*p['fade']
    # grain
    img=img+(torch.rand(1,OH,OW,device=dev)-0.5)*0.03
    return (img.clamp(0,1)*255).byte().permute(1,2,0).cpu().numpy()

with torch.no_grad():
    if args.stills:
        ims=[]
        for b in [float(x) for x in args.stills.split(',')]:
            f=frame(b); f=cv2.resize(f[...,::-1],(OW//3,OH//3),interpolation=cv2.INTER_AREA); cv2.putText(f,f'b{b}',(8,24),0,0.7,(0,255,255),2); ims.append(f)
        cv2.imwrite('stills.jpg',np.hstack(ims))
    else:
        ff=subprocess.Popen(['ffmpeg','-y','-loglevel','error','-f','rawvideo','-pix_fmt','rgb24','-s',f'{OW}x{OH}','-r',str(FPS),'-i','-','-c:v','libx264','-crf','15','-preset','medium','-pix_fmt','yuv420p',args.out],stdin=subprocess.PIPE)
        for i in range(NF):
            b=(i/FPS-T0)/BEAT
            ff.stdin.write(frame(max(b,0)).tobytes())
            if i%60==0: print(i,NF,flush=True)
        ff.stdin.close(); ff.wait()
