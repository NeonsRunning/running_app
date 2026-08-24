"""Cut every brand asset from the one supplied logo file.

    python scripts/brand-assets.py

Source: public/brand/source/neons-running-source.jpg

The artwork is additive neon glow painted on black, which means the pixel
values already *are* premultiplied alpha. Taking alpha from the brightest
channel and un-premultiplying the colour therefore recovers a true cutout —
the glow fades out softly instead of ending at a keyed edge — so the badge
composites cleanly onto ink, carbon or any other surface in the ramp.

Outputs:
    public/brand/neons-running.png   full badge, 512px square
    public/brand/neons-mark.png      winged N emblem, 256px square
    app/icon.png                     the emblem, 512px, transparent
    app/apple-icon.png               the emblem, 180px, on ink (iOS flattens)

Requires: pillow, numpy.
"""

from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "public" / "brand" / "source" / "neons-running-source.jpg"

# The winged N, in coordinates on the squared 512px master.
EMBLEM_BOX = (207, 391, 303, 437)
EMBLEM_PADDING = 1.10  # breathing room around the crop
NOISE_FLOOR = 6.0  # JPEG grain in the black field
INK = (5, 5, 5)  # --color-ink


def build_master() -> Image.Image:
    """The whole badge, cut out of its black field and squared up."""
    rgb = np.asarray(Image.open(SOURCE).convert("RGB")).astype(np.float32)

    alpha = np.clip(
        (rgb.max(axis=2) - NOISE_FLOOR) * (255.0 / (255.0 - NOISE_FLOOR)), 0, 255
    )
    unpremultiplied = np.clip(rgb / np.maximum(alpha, 1.0)[..., None] * 255.0, 0, 255)
    cut = Image.fromarray(
        np.dstack([unpremultiplied, alpha]).astype(np.uint8), "RGBA"
    )

    opaque = cut.getchannel("A").point(lambda v: 255 if v > 8 else 0)
    return square(cut.crop(opaque.getbbox()))


def square(img: Image.Image, scale: float = 1.0) -> Image.Image:
    """Centre `img` on a transparent square canvas."""
    width, height = img.size
    side = int(max(width, height) * scale)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(img, ((side - width) // 2, (side - height) // 2))
    return canvas


def write(img: Image.Image, size: int, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.resize((size, size), Image.LANCZOS).save(path, optimize=True)
    print(f"{path.relative_to(ROOT).as_posix()}  {size}px  {path.stat().st_size:,} B")


def main() -> None:
    master = build_master()

    # EMBLEM_BOX is expressed against the 512px master, so scale it to whatever
    # resolution the source happens to be.
    k = master.size[0] / 512.0
    emblem = square(
        master.crop(tuple(int(round(v * k)) for v in EMBLEM_BOX)), EMBLEM_PADDING
    )

    write(master, 512, ROOT / "public" / "brand" / "neons-running.png")
    write(emblem, 256, ROOT / "public" / "brand" / "neons-mark.png")
    write(emblem, 512, ROOT / "app" / "icon.png")

    # iOS composites the icon onto white, so this one ships its own ground.
    apple = Image.new("RGBA", (180, 180), (*INK, 255))
    inset = emblem.resize((160, 160), Image.LANCZOS)
    apple.paste(inset, (10, 10), inset)
    path = ROOT / "app" / "apple-icon.png"
    apple.convert("RGB").save(path, optimize=True)
    print(f"{path.relative_to(ROOT).as_posix()}  180px  {path.stat().st_size:,} B")


if __name__ == "__main__":
    main()
