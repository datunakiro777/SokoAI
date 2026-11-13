"""Draw the SokoAI mark and write every icon asset the app uses.

The mark is a geometric mushroom in black ink (a half-disc cap over a square-ended
stem) with the red signal square used as the section marker in the app. Run from
mobile/:  python scripts/logo.py
"""

from pathlib import Path

from PIL import Image, ImageDraw

INK = (0, 0, 0, 255)
ACCENT = (201, 0, 0, 255)  # theme.ts accent #c90000
GROUND = (255, 255, 255, 255)
SUPERSAMPLE = 4
ASSETS = Path(__file__).resolve().parent.parent / "assets"


def mark(draw: ImageDraw.ImageDraw, cx: float, cy: float, unit: float, ink=INK, accent=ACCENT) -> None:
    """Draw the mark centred on (cx, cy); unit is the cap radius."""
    r = unit
    gap = r * 0.13
    stem_w = r * 0.4
    stem_h = r * 0.87
    # Cap: upper half of a disc, flat edge at cy - stem_h / 2 + offset so the
    # whole mark (cap top to stem bottom) is centred vertically.
    total = r + gap + stem_h
    cap_base = cy - total / 2 + r
    draw.pieslice([cx - r, cap_base - r, cx + r, cap_base + r], 180, 360, fill=ink)
    stem_top = cap_base + gap
    draw.rectangle([cx - stem_w / 2, stem_top, cx + stem_w / 2, stem_top + stem_h], fill=ink)
    # Signal square: same width as the stem, sitting on the stem's baseline.
    sq = stem_w
    sq_left = cx + r * 0.47
    draw.rectangle([sq_left, stem_top + stem_h - sq, sq_left + sq, stem_top + stem_h], fill=accent)


def render(size: int, unit_ratio: float, background, ink=INK, accent=ACCENT) -> Image.Image:
    big = size * SUPERSAMPLE
    image = Image.new("RGBA", (big, big), background)
    mark(ImageDraw.Draw(image), big / 2, big / 2, big * unit_ratio, ink, accent)
    return image.resize((size, size), Image.LANCZOS)


def main() -> None:
    clear = (0, 0, 0, 0)
    # iOS / default icon: full-bleed white square, mark at roughly 60% width.
    render(1024, 0.3, GROUND).convert("RGB").save(ASSETS / "icon.png")
    # Android adaptive icon: keep the mark inside the 66% safe circle.
    render(512, 0.2, clear).save(ASSETS / "android-icon-foreground.png")
    Image.new("RGBA", (512, 512), GROUND).save(ASSETS / "android-icon-background.png")
    # Themed (monochrome) icon: Android uses only the alpha channel.
    white = (255, 255, 255, 255)
    render(432, 0.2, clear, white, white).save(ASSETS / "android-icon-monochrome.png")
    render(1024, 0.3, clear).save(ASSETS / "splash-icon.png")
    render(48, 0.36, GROUND).convert("RGB").save(ASSETS / "favicon.png")


if __name__ == "__main__":
    main()
