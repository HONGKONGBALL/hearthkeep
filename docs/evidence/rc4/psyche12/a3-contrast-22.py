import sys,subprocess,numpy as np
from PIL import Image
V=sys.argv[1]; out=sys.argv[2]
import json; cues=[(k,round((a+b)/2,2)) for k,a,b,_ in json.load(open(sys.argv[3]))]
def lin(c):
    c=c/255.0; return np.where(c<=0.04045,c/12.92,((c+0.055)/1.055)**2.4)
def L(rgb):
    l=lin(np.asarray(rgb,float)); return 0.2126*l[...,0]+0.7152*l[...,1]+0.0722*l[...,2]
def cr(a,b):
    la,lb=float(L(a)),float(L(b)); hi,lo=max(la,lb),min(la,lb); return (hi+0.05)/(lo+0.05)
res=[]
for name,t in cues:
    fr=int(round(t*30)); p=f"{out}/{name}.png"
    subprocess.run(["ffmpeg","-v","error","-y","-i",V,"-vf",f"select=eq(n\\,{fr})","-frames:v","1",p],check=True)
    im=np.asarray(Image.open(p).convert("RGB")).astype(int); H,W,_=im.shape
    band=im[900:]; mx=band.max(2); mn=band.min(2); lum=L(band)
    box=(mx<=40)&((mx-mn)<=14)&(lum<0.02)
    ys,xs=np.nonzero(box)
    if len(ys)==0: print(name,"NO BOX"); res.append((name,0,0)); continue
    y0,y1,x0,x1=ys.min(),ys.max(),xs.min(),xs.max()
    sub=band[y0:y1+1,x0:x1+1]; g=(sub.min(2)>=230)&(L(sub)>=0.90)
    gm=np.median(sub[g],0); bm=np.median(sub[box[y0:y1+1,x0:x1+1]],0)
    med=cr(gm,bm)
    # sample: glyph pixels with box pixel 8-14 px above; take worst
    worst=None; gy,gx=np.nonzero(g)
    for yy,xx in list(zip(gy,gx))[::7]:
        for d in range(8,15):
            if yy-d>=0 and box[y0+yy-d - 0, x0+xx] if False else (yy-d>=0 and box[y0:y1+1,x0:x1+1][yy-d,xx]):
                c=cr(sub[yy,xx],sub[yy-d,xx])
                if worst is None or c<worst[0]: worst=(c,xx+x0,yy+y0+900,tuple(sub[yy,xx]),yy-d+y0+900,tuple(sub[yy-d,xx]))
                break
    page=im[24,24]; md5=subprocess.run(["md5sum",p],capture_output=True,text=True).stdout.split()[0]
    ok=med>=4.5 and worst[0]>=4.5
    print(f"{name} {'PASS' if ok else 'FAIL'}\n  time_s: {t}  frame: {fr}\n  box_bbox: x={x0}..{x1} y={y0+900}..{y1+900}  glyph_pixels: {int(g.sum())}  box_pixels: {int(box.sum())}\n  glyph_median_rgb: {','.join(str(int(v)) for v in gm)}\n  box_median_rgb: {','.join(str(int(v)) for v in bm)}\n  median_contrast: {med:.2f}:1\n  worst_sample: glyph x={worst[1]} y={worst[2]} rgb={','.join(map(str,worst[3]))} / box x={worst[1]} y={worst[4]} rgb={','.join(map(str,worst[5]))}\n  worst_sample_contrast: {worst[0]:.2f}:1\n  page_rgb(24,24): {','.join(map(str,page))}  glyph_vs_page: {cr(gm,page):.2f}:1\n  frame_md5: {md5}")
    res.append((name,med,worst[0]))
print("SUMMARY", " ".join(f"{n}={m:.2f}/{w:.2f}" for n,m,w in res))
print("ALL_PASS", all(m>=4.5 and w>=4.5 for _,m,w in res))
