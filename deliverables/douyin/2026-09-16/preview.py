import build_video as B
from PIL import Image
B.init()
sheet=Image.new("RGB",(4*300,2*533),(0,0,0))
for i,(name,fn,dur) in enumerate(B.SCENES):
    lt=dur*0.86
    c=B.frame_at(i, lt, i/len(B.SCENES))
    p=f"/tmp/p{i}.png"; c.save(p)
    sheet.paste(c.resize((300,533)),((i%4)*300,(i//4)*533))
sheet.save("/tmp/contact.png")
print("ok")
