"""Rebuild See-through layers at the source image's full size.

usage: prep.py IMAGE SEETHROUGH_OUT_DIR NAME [--panel x0,x1,y0,y1]
  IMAGE               the original illustration
  SEETHROUGH_OUT_DIR  e.g. see-through/workspace/layerdiff_output
  NAME                image stem used by See-through (NAME.psd, NAME/optimized/)
  --panel             background box (full-size px) to fill row by row; outside it the fill is white
Writes ./layers/*.png, ./layers/_bg.png, ./layers/_meta.json, check_recomp.jpg
"""
import cv2, numpy as np, json, os, argparse
from psd_tools import PSDImage
ap=argparse.ArgumentParser()
ap.add_argument('image'); ap.add_argument('st'); ap.add_argument('name')
ap.add_argument('--panel',default='')
A=ap.parse_args()
ST=A.st; NAME=A.name
orig=cv2.imread(A.image)
H,W=orig.shape[:2]; s=max(H,W)/1280.
src=cv2.imread(f'{ST}/{NAME}/src_img.png',cv2.IMREAD_UNCHANGED)
cols=np.where(src[...,3].max(0)>0)[0]; rows=np.where(src[...,3].max(1)>0)[0]
x_off=cols.min(); wlo=cols.max()-cols.min()+1
y_off=rows.min(); hlo=rows.max()-rows.min()+1
psd=PSDImage.open(f'{ST}/{NAME}.psd')
order=[l.name for l in psd]
info=json.load(open(f'{ST}/{NAME}/optimized/info.json'))['parts']
def load(n):
    im=cv2.imread(f'{ST}/{NAME}/optimized/{n}.png',cv2.IMREAD_UNCHANGED)
    x0,y0,x1,y1=info[n]['xyxy']
    c=np.zeros((1280,1280,4),np.uint8)
    if im.shape[:2]==(1280,1280): c=im
    else: c[y0:y1,x0:x1]=im
    c=c[y_off:y_off+hlo, x_off:x_off+wlo].astype(np.float32)/255.
    # premultiply before resize to avoid fringe
    a=c[...,3:]; pm=np.concatenate([c[...,:3]*a,a],-1)
    hi=cv2.resize(pm,(W,H),interpolation=cv2.INTER_CUBIC)
    a=np.clip(hi[...,3],0,1)
    rgb=np.where(a[...,None]>1e-3, hi[...,:3]/np.maximum(a[...,None],1e-3), 0)
    # tighten alpha edge
    a2=np.clip((a-0.25)/0.5,0,1); a2=a2*a2*(3-2*a2)
    return np.clip(rgb,0,1), a2
layers={n:load(n) for n in order}
for side in 'lr':
    parts=[f'eyewhite-{side}',f'irides-{side}',f'eyelash-{side}']
    a=np.zeros((H,W),np.float32)
    for p in parts: a=np.maximum(a,layers[p][1])
    a=cv2.GaussianBlur(cv2.dilate(a,np.ones((7,7),np.uint8)),(0,0),1.5)
    rgb=layers[parts[0]][0]
    for p in parts: del layers[p]
    layers[f'eye-{side}']=(rgb,a)
for p in ['nose','mouth','eyebrow-l','eyebrow-r']: del layers[p]
i=order.index('front hair')
order=[n for n in order if n in layers]
i=order.index('front hair'); order[i:i]=['eye-l','eye-r']

# visibility top-down
of=orig.astype(np.float32)/255.
above=np.zeros((H,W),np.float32)
out={}
union=np.zeros((H,W),np.float32)
for n in reversed(order):
    rgb,a=layers[n]
    vis=a*(1-above)
    # where this layer is what the viewer sees, trust original pixels
    k=np.clip((vis-0.5)/0.4,0,1)
    k=cv2.erode(k,np.ones((3,3),np.uint8))[...,None]
    rgb2=rgb*(1-k)+of*k
    if n.startswith('eye-'): rgb2=of
    out[n]=np.concatenate([rgb2,a[...,None]],-1)
    above=above+(1-above)*a
union=above
os.makedirs('layers',exist_ok=True)
for n,v in out.items():
    cv2.imwrite(f'layers/{n}.png',(np.clip(v,0,1)*255).astype(np.uint8))
# background: inpaint union at 1/4 res
m=(cv2.dilate(union,np.ones((25,25),np.uint8))>0.02).astype(np.uint8)*255
sm=cv2.resize(orig,(W//4,H//4),interpolation=cv2.INTER_AREA); mm=cv2.resize(m,(W//4,H//4),interpolation=cv2.INTER_NEAREST)
ip=orig.copy().astype(np.float32)
hole=m>0
bad_rows=[]
# panel = blue rounded rect; detect from original: saturated blue-ish or inside its bbox
px0,px1,py0,py1=[int(v) for v in A.panel.split(',')] if A.panel else (0,W,0,H)
for y in range(H):
    row=orig[y].astype(np.float32); h=hole[y]
    inp=np.zeros(W,bool)
    if py0<=y<py1: inp[px0:px1]=True
    ok=inp&~h
    if ok.sum()>30:
        xs=np.where(ok)[0]; fill=np.where(inp&h)[0]
        if len(fill):
            for c in range(3): ip[y,fill,c]=np.interp(fill,xs,row[xs,c])
    elif inp.any():
        bad_rows.append(y)
    out_h=h&~inp
    ip[y,out_h]=255
good=[y for y in range(py0,py1) if y not in set(bad_rows)]
for y in bad_rows:
    ya=max([g for g in good if g<y],default=None); yb=min([g for g in good if g>y],default=None)
    if ya is None: ip[y,px0:px1]=ip[yb,px0:px1]
    elif yb is None: ip[y,px0:px1]=ip[ya,px0:px1]
    else:
        w=(y-ya)/(yb-ya); ip[y,px0:px1]=ip[ya,px0:px1]*(1-w)+ip[yb,px0:px1]*w
ip=cv2.GaussianBlur(ip,(0,0),9)
mf=cv2.GaussianBlur(m.astype(np.float32)/255.,(0,0),6)[...,None]
bg=orig*(1-mf)+ip*mf
cv2.imwrite('layers/_bg.png',bg.astype(np.uint8))
json.dump({'order':order,'W':W,'H':H},open('layers/_meta.json','w'))
# check: recomposite
comp=bg.astype(np.float32)/255.
for n in order:
    v=out[n]; comp=comp*(1-v[...,3:])+v[...,:3]*v[...,3:]
cv2.imwrite('check_recomp.jpg',cv2.resize(np.hstack([orig,(comp*255).astype(np.uint8),bg.astype(np.uint8)]),None,fx=0.33,fy=0.33))
d=np.abs(comp-of).mean(); print('mean abs diff',d)
