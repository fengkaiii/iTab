#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Generate extension icons: squircle gradient bg + 3x3 launchpad grid. No external deps."""
import struct, zlib, os

OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "img")


def lerp(a, b, t):
    return a + (b - a) * t


def clamp(v, lo=0, hi=255):
    return max(lo, min(hi, v))


def rounded_rect_alpha(x, y, w, h, r, px, py):
    if px < x or py < y or px > x + w or py > y + h:
        return 0.0
    cx = min(max(px, x + r), x + w - r)
    cy = min(max(py, y + r), y + h - r)
    d = ((px - cx) ** 2 + (py - cy) ** 2) ** 0.5
    return max(0.0, min(1.0, r - d + 0.7))


def render(size, ss=3):
    n = size * ss
    buf = [[0, 0, 0, 0] for _ in range(n * n)]
    S = float(n)

    pad = S * 0.02
    bw = S - pad * 2
    r = S * 0.235
    for j in range(n):
        py = j + 0.5
        for i in range(n):
            px = i + 0.5
            a = rounded_rect_alpha(pad, pad, bw, bw, r, px, py)
            if a <= 0:
                continue
            t = (px / S * 0.55 + py / S * 0.45)
            # gradient #6366F1 (indigo) -> #22D3EE (cyan) -> #38BDF8 (sky)
            red = lerp(0x63, 0x22, t)
            grn = lerp(0x66, 0xD3, t)
            blu = lerp(0xF1, 0xEE, t)
            # soft top highlight, never negative
            hl = max(0.0, 1.0 - py / (S * 0.65)) * 22
            idx = j * n + i
            buf[idx] = [
                clamp(int(red + hl * 0.5)),
                clamp(int(grn + hl * 0.7)),
                clamp(int(blu + hl * 0.3)),
                clamp(int(round(a * 255))),
            ]

    # 3x3 tiles
    cell = S * 0.165
    gap = S * 0.07
    total = cell * 3 + gap * 2
    ox = (S - total) / 2
    oy = (S - total) / 2
    tr = cell * 0.30
    sh_off = S * 0.012
    for row in range(3):
        for col in range(3):
            tx = ox + col * (cell + gap)
            ty = oy + row * (cell + gap)
            # drop shadow
            for j in range(max(0, int(ty - sh_off - 2)), min(n, int(ty + cell + sh_off + 4))):
                for i in range(max(0, int(tx - sh_off - 2)), min(n, int(tx + cell + sh_off + 4))):
                    sa = rounded_rect_alpha(tx, ty + sh_off, cell, cell, tr, i + 0.5, j + 0.5)
                    if sa <= 0:
                        continue
                    idx = j * n + i
                    bg = buf[idx]
                    sh = 0.30 * sa * (bg[3] / 255.0)
                    buf[idx] = [int(bg[0] * (1 - sh)), int(bg[1] * (1 - sh)), int(bg[2] * (1 - sh) * 0.92), bg[3]]
            # tile (white with subtle vertical gradient)
            for j in range(max(0, int(ty - 2)), min(n, int(ty + cell + 3))):
                for i in range(max(0, int(tx - 2)), min(n, int(tx + cell + 3))):
                    ta = rounded_rect_alpha(tx, ty, cell, cell, tr, i + 0.5, j + 0.5)
                    if ta <= 0:
                        continue
                    idx = j * n + i
                    bg = buf[idx]
                    vg = 1.0 - 0.05 * max(0.0, min(1.0, (j - ty) / cell))
                    w_r = 255 * vg
                    w_g = 255 * vg
                    w_b = int(255 * vg * 0.98)
                    out = [
                        clamp(int(lerp(bg[0], w_r, ta))),
                        clamp(int(lerp(bg[1], w_g, ta))),
                        clamp(int(lerp(bg[2], w_b, ta))),
                        max(bg[3], int(ta * 255)),
                    ]
                    buf[idx] = out

    out = bytearray()
    for y in range(size):
        out.append(0)
        for x in range(size):
            rs = gs = bs = as_ = 0
            cnt = 0
            w_sum = 0.0
            for dy in range(ss):
                for dx in range(ss):
                    p = buf[(y * ss + dy) * n + (x * ss + dx)]
                    a = p[3] / 255.0
                    w_sum += a
                    rs += p[0] * a
                    gs += p[1] * a
                    bs += p[2] * a
                    as_ += p[3]
                    cnt += 1
            if w_sum > 0:
                rs, gs, bs = rs / w_sum, gs / w_sum, bs / w_sum
            out += bytes((int(rs), int(gs), int(bs), clamp(int(as_ / cnt))))
    return bytes(out)


def write_png(path, size):
    raw = render(size)

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + \
        chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)
    print("wrote", path, len(png), "bytes")


if __name__ == "__main__":
    os.makedirs(OUT_DIR, exist_ok=True)
    for s in (16, 32, 48, 128):
        write_png(os.path.join(OUT_DIR, "icon%d.png" % s), s)
