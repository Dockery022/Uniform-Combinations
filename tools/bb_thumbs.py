"""Panel thumbnails for the basketball sets: flat front views of each tank
and pair of shorts, drawn from the trim specs (no photo pixels).

Usage: python3 tools/bb_thumbs.py  -> basketball/assets/uni/bb-*.webp
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

R, K, W = '#C9001F', '#000000', '#FFFFFF'
OUT = Path(__file__).resolve().parent.parent / 'basketball' / 'assets' / 'uni'
S = 4  # supersample

JERSEYS = {
    'bb-jersey-white-2627': dict(base=W, neck=[K, R, K], arm=[K], side=(R, K), word='LOUISVILLE', wfill=R, wline=K, nfill=R, nline=K),
    'bb-jersey-black-2627': dict(base=K, neck=[R, K, R], arm=[R], side=('pins', R), word='Cardinals', wfill=R, wline=W, nfill=R, nline=W),
    'bb-jersey-white-2526': dict(base=W, neck=[K, R, K], arm=[K, R, K], side=None, word='LOUISVILLE', wfill=R, wline=K, nfill=K, nline=R),
}
SHORTS = {
    'bb-shorts-white-2627': dict(base=W, waist=[K, R, K], hem=[K], side=(R, K)),
    'bb-shorts-black-2627': dict(base=K, waist=[R, K, R], hem=[R], side=('pins', R)),
    'bb-shorts-white-2526': dict(base=W, waist=[], hem=[K, R, W, R, K], side=None),
}


def font(size):
    for f in ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf']:
        try:
            return ImageFont.truetype(f, size)
        except OSError:
            pass
    return ImageFont.load_default()


def outline(base):
    return '#3a3a3a' if base == K else '#c8c8c8'


def jersey(spec):
    w, h = 400 * S, 440 * S
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    s = lambda pts: [(x * S, y * S) for x, y in pts]
    body = s([(120, 20), (160, 20), (200, 95), (240, 20), (280, 20), (290, 60), (300, 130), (330, 160), (330, 430), (70, 430), (70, 160), (100, 130), (110, 60)])
    d.polygon(body, fill=spec['base'], outline=outline(spec['base']), width=2 * S)
    # Side panels
    if spec['side']:
        a, b = spec['side']
        for x0 in (70, 304):
            if a == 'pins':
                for i in range(4):
                    d.rectangle([(x0 + 4 + i * 6) * S, 168 * S, (x0 + 6 + i * 6) * S, 428 * S], fill=b)
            else:
                d.rectangle([x0 * S, 165 * S, (x0 + 26) * S, 428 * S], fill=a)
                d.rectangle([((x0 + 26) if x0 == 70 else x0) * S, 165 * S, ((x0 + 29) if x0 == 70 else x0 + 3) * S, 428 * S], fill=b)
    # Neck V bands
    for i, c in enumerate(spec['neck']):
        o = i * 6
        d.line(s([(160 + o * 0.6, 20), (200, 95 - o * 0)]), fill=c, width=7 * S)
        d.line(s([(240 - o * 0.6, 20), (200, 95)]), fill=c, width=7 * S)
        d.line(s([(158 - o, 20), (200, 104 + o)]), fill=c, width=6 * S) if i else None
        d.line(s([(242 + o, 20), (200, 104 + o)]), fill=c, width=6 * S) if i else None
    # Armholes
    for i, c in enumerate(spec['arm']):
        o = i * 5
        d.line(s([(118 + o, 22), (108 + o, 60), (98 + o * 0.5, 128), (72, 160 + o)]), fill=c, width=7 * S, joint='curve')
        d.line(s([(282 - o, 22), (292 - o, 60), (302 - o * 0.5, 128), (328, 160 + o)]), fill=c, width=7 * S, joint='curve')
    f = font(34 * S)
    for txt, y, size, fill, line in [(spec['word'], 170, 34, spec['wfill'], spec['wline']), ('19', 280, 96, spec['nfill'], spec['nline'])]:
        f = font(size * S)
        d.text((200 * S, y * S), txt, font=f, fill=fill, anchor='mm', stroke_width=3 * S, stroke_fill=line)
    return im.resize((w // S, h // S), Image.LANCZOS)


def shorts(spec):
    w, h = 400 * S, 440 * S
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    s = lambda pts: [(x * S, y * S) for x, y in pts]
    body = s([(70, 30), (330, 30), (350, 400), (215, 410), (200, 200), (185, 410), (50, 400)])
    d.polygon(body, fill=spec['base'], outline=outline(spec['base']), width=2 * S)
    if spec['side']:
        a, b = spec['side']
        for left in (True, False):
            if a == 'pins':
                for i in range(4):
                    x = 56 + i * 7 if left else 334 - i * 7
                    d.line(s([(x + (14 if left else -14), 40), (x, 396)]), fill=b, width=2 * S)
                x = 52 if left else 340
                d.line(s([(x + (16 if left else -16), 40), (x, 398)]), fill=b, width=6 * S)
            else:
                pts = [(70, 32), (100, 32), (82, 402), (52, 400)] if left else [(300, 32), (330, 32), (348, 400), (318, 402)]
                d.polygon(s(pts), fill=a)
                d.line(s([pts[1], pts[2]] if left else [pts[0], pts[3]]), fill=b, width=4 * S)
    y = 30
    for c in spec['waist']:
        d.rectangle([70 * S, y * S, 330 * S, (y + 8) * S], fill=c)
        y += 8
    for leg in ((50, 185), (215, 350)):
        y = 400
        for c in spec['hem']:
            d.line(s([(leg[0], y), (leg[1], y + 4)]), fill=c, width=7 * S)
            y -= 7
    return im.resize((w // S, h // S), Image.LANCZOS)


if __name__ == '__main__':
    for name, spec in JERSEYS.items():
        jersey(spec).save(OUT / f'{name}.webp', quality=90)
    for name, spec in SHORTS.items():
        shorts(spec).save(OUT / f'{name}.webp', quality=90)
    print('wrote', len(JERSEYS) + len(SHORTS), 'thumbnails to', OUT)
