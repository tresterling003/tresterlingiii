import numpy as np, sys
from PIL import Image
RB='/home/user/microsoft/microsoft-rocketbox/Assets/Avatars/Professions/'
OUT='/tmp/claude-0/-home-user-tresterlingiii/701d70d3-674d-5c5c-a2fb-4f76113dc462/scratchpad/rb/out/'
SOCCER_RECTS=[((880,420,1150,690),1),((870,680,1170,840),1),((285,275,415,405),1),((910,1155,1000,1205),1),((1055,1140,1135,1230),1),
              ((885,1230,1165,1390),2),((560,855,610,1015),2),((1645,355,1755,400),1)]
CFG={
 'm301':dict(dir='Sports_Male_02',mode='soccer'),
 'm300':dict(dir='Sports_Male_03',mode='soccer'),
 'm026':dict(dir='Sports_Male_04',mode='tank'),
 'f013':dict(dir='Sports_Female_02',mode='female'),
}
def hsv(a):
    r,g,b=a[...,0],a[...,1],a[...,2]
    mx=a.max(-1); mn=a.min(-1); d=mx-mn
    s=np.where(mx>1e-4,d/np.maximum(mx,1e-4),0)
    h=np.zeros_like(mx)
    m=d>1e-4
    rc=np.where(m,(mx-r)/np.maximum(d,1e-4),0);gc=np.where(m,(mx-g)/np.maximum(d,1e-4),0);bc=np.where(m,(mx-b)/np.maximum(d,1e-4),0)
    h=np.where(r==mx,bc-gc,np.where(g==mx,2+rc-bc,4+gc-rc));h=(h/6)%1*360
    return h,s,mx
for id,c in CFG.items():
    d=RB+c['dir']+'/Textures/'+id
    body=Image.open(d+'_body_color.tga').convert('RGB')
    S=1024
    b=np.asarray(body.resize((S,S),Image.LANCZOS)).astype(np.float32)/255
    h,s,v=hsv(b)
    cls=np.zeros((S,S),np.uint8)
    ach=s<0.16
    if c['mode']=='soccer':
        cls[ach&(v<0.42)]=1; cls[ach&(v>=0.42)]=2
        trim=(s>0.78)&(v>0.45)&((h<22)|(h>335)); cls[trim]=3
        # medium greys inside cloth bands
    elif c['mode']=='tank':
        blue=(h>190)&(h<250)&(s>0.3); cls[blue]=1
        cls[ach&(v>=0.55)]=2
    else:
        cls[ach&(v>=0.45)]=1; cls[(s<0.3)&(v<0.45)]=2
    if c['mode']=='soccer':
        for (x0,y0,x1,y1),k in SOCCER_RECTS:
            cls[y0//2:y1//2,x0//2:x1//2]=k
    shade=np.ones((S,S),np.float32)
    for k in (1,2,3):
        m=cls==k
        if m.sum()==0: continue
        med=np.median(v[m]); shade[m]=np.clip(v[m]/max(med,0.05),0,1.99)
    if c['mode']=='soccer':
        for (x0,y0,x1,y1),k in SOCCER_RECTS:
            sl=(slice(y0//2,y1//2),slice(x0//2,x1//2))
            shade[sl]=0.96
    uni=(cls.astype(np.int32)*64+np.clip(np.round(shade*32),0,63).astype(np.int32)).astype(np.uint8)
    Image.fromarray(uni,'L').save(OUT+id+'_uni.png',optimize=True)
    body.resize((S,S),Image.LANCZOS).save(OUT+id+'_body.jpg',quality=86)
    Image.open(d+'_head_color.tga').convert('RGB').resize((1024,1024),Image.LANCZOS).save(OUT+id+'_head.jpg',quality=82)
    for part in ('body','head'):
        Image.open(d+'_%s_normal.tga'%part).convert('RGB').resize((512,512),Image.LANCZOS).save(OUT+id+'_%sn.jpg'%part[0],quality=88)
    try:
        op=Image.open(d+'_opacity_color.tga').convert('RGBA'); op.resize((512,512),Image.LANCZOS).save(OUT+id+'_op.png',optimize=True)
    except FileNotFoundError: pass
    # preview
    pal=np.array([[0,0,0],[30,60,200],[240,200,40],[230,40,40]],np.float32)/255
    prev=np.where((cls>0)[...,None],pal[cls]*np.clip(shade,0,1.6)[...,None],b)
    Image.fromarray((np.clip(prev,0,1)*255).astype(np.uint8)).resize((512,512)).save(OUT+id+'_prev.jpg')
    print(id,[int((cls==k).sum()) for k in range(4)])
