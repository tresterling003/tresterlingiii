import sys
from PIL import Image
out, cols, *files = sys.argv[1:]
cols = int(cols)
ims = [Image.open(f) for f in files]
w, h = ims[0].size
rows = (len(ims) + cols - 1) // cols
M = Image.new('RGB', (w * cols, h * rows), 'black')
for i, im in enumerate(ims):
    M.paste(im, ((i % cols) * w, (i // cols) * h))
M.save(out)
