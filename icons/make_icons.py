"""Generate the app icons. Run: python icons/make_icons.py
Produces icon-192.png, icon-512.png, maskable-512.png, apple-touch-icon.png (180)
and icon.svg. Motif: a soft crescent on a calm teal square (dark at night)."""
from PIL import Image, ImageDraw
import os

HERE = os.path.dirname(os.path.abspath(__file__))
BG = (47, 107, 122)        # accent teal
FG = (246, 244, 239)       # off-white

def draw(size, rounded=True, pad_ratio=0.0):
    s = size * 4  # supersample
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = int(s * 0.22) if rounded else 0
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=r, fill=BG)
    # crescent: big pale circle minus offset background circle
    pad = int(s * (0.22 + pad_ratio))
    d.ellipse([pad, pad, s - pad, s - pad], fill=FG)
    off = int(s * 0.16)
    d.ellipse([pad + off, pad - off // 2, s - pad + off, s - pad - off // 2], fill=BG)
    return img.resize((size, size), Image.LANCZOS)

draw(192).save(os.path.join(HERE, "icon-192.png"))
draw(512).save(os.path.join(HERE, "icon-512.png"))
draw(512, rounded=False, pad_ratio=0.08).save(os.path.join(HERE, "maskable-512.png"))
draw(180, rounded=False).save(os.path.join(HERE, "apple-touch-icon.png"))

svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<rect width="100" height="100" rx="22" fill="#2f6b7a"/>
<circle cx="50" cy="50" r="28" fill="#f6f4ef"/>
<circle cx="66" cy="42" r="28" fill="#2f6b7a"/>
</svg>
"""
with open(os.path.join(HERE, "icon.svg"), "w", encoding="utf-8") as f:
    f.write(svg)
print("icons written")
