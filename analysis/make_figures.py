"""Render the README figures as SVG from analysis/out/runs.csv.

Standard library only. Run from the repo root:  python analysis/make_figures.py
"""
import csv
import os
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV = os.path.join(ROOT, "analysis", "out", "runs.csv")
OUT = os.path.join(ROOT, "docs", "img")

INK, MUTED, GRID = "#1f2933", "#6b7785", "#e4e8ec"
ACCENT, WARN, NEUTRAL = "#1d6f8f", "#b5532f", "#9aa5b1"
FONT = "font-family=\"Segoe UI, Helvetica, Arial, sans-serif\""


def svg(width, height, body):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" '
            f'height="{height}" role="img">\n<rect width="{width}" height="{height}" fill="#ffffff" rx="6"/>\n'
            f'{body}\n</svg>\n')


def text(x, y, s, size=13, fill=INK, anchor="start", weight="normal"):
    s = s.replace("&", "&amp;").replace("<", "&lt;")
    return (f'<text x="{x}" y="{y}" font-size="{size}" fill="{fill}" text-anchor="{anchor}" '
            f'font-weight="{weight}" {FONT}>{s}</text>')


def hbars(title, subtitle, rows, vmax, unit="%", color=ACCENT, label_w=190, bar_w=420):
    """rows: [(label, value, caption)]"""
    top, row_h = 62, 30
    width = label_w + bar_w + 130
    height = top + row_h * len(rows) + 20
    parts = [text(20, 28, title, 16, weight="bold"), text(20, 47, subtitle, 12, MUTED)]
    for i in range(0, 101, 25):
        x = label_w + bar_w * i / 100 * (100 / vmax) if vmax else label_w
        if x <= label_w + bar_w + 1:
            parts.append(f'<line x1="{x:.1f}" y1="{top - 8}" x2="{x:.1f}" y2="{height - 14}" stroke="{GRID}"/>')
            parts.append(text(x, height - 2, f"{i}{unit}", 10, MUTED, "middle"))
    for i, (label, value, caption) in enumerate(rows):
        y = top + i * row_h
        w = bar_w * value / vmax
        parts.append(text(label_w - 10, y + 15, label, 12, INK, "end"))
        parts.append(f'<rect x="{label_w}" y="{y}" width="{w:.1f}" height="20" fill="{color}" rx="2"/>')
        parts.append(text(label_w + w + 8, y + 15, caption, 12, MUTED))
    return svg(width, height, "\n".join(parts))


def load():
    with open(CSV, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def fig_funnel(rows):
    n = len(rows)
    stages = [("Wood", "wood_min"), ("Stone pickaxe", "stone_pick_min"), ("Iron pickaxe", "iron_pick_min"),
              ("Below y=0", "below_y0_min"), ("Diamond depth", "diamond_depth_min"),
              ("First diamond", "first_diamond_min"), ("Three diamonds", "three_diamonds_min")]
    data = [(label, 100 * sum(1 for r in rows if r[col] != "") / n, None) for label, col in stages]
    banked = 100 * sum(1 for r in rows if float(r["deposited"] or 0) > 0) / n
    data.append(("Diamond deposited", banked, None))
    data = [(l, v, f"{v:.1f}%") for l, v, _ in data]
    return hbars("Progress funnel", f"Share of runs reaching each milestone, {n} logged runs", data, 100)


def fig_endings(rows):
    n = len(rows)
    c = Counter(r["reason"] for r in rows)
    order = [("timeout", "Timeout (60 min)"), ("stuck", "Stuck tracker"), ("deaths", "Three deaths"),
             ("lost", "Lost"), ("disconnected", "Disconnected")]
    data = [(label, 100 * c[k] / n, f"{100 * c[k] / n:.1f}%  ({c[k]})") for k, label in order]
    return hbars("How runs end", f"{n} logged runs, all experiment arms pooled", data, 60, color=NEUTRAL)


def fig_failures(rows):
    c = Counter()
    for r in rows:
        if float(r["deposited"] or 0) == 0:
            c[f'{r["reason"]} / {r["lastFailure"] or "none"}'] += 1
    top = c.most_common(8)
    total = sum(c.values())
    data = [(k[:34], 100 * v / total, f"{v}") for k, v in top]
    return hbars("Where runs fail", f"Most common ending and last failure among the {total} runs that banked nothing",
                 data, max(v for _, v in top) * 100 / total * 1.15, color=WARN, label_w=250)


# Paired A/B results copied from PLAN.md "Eval history": (switch, treatment banked, control banked, pairs)
EXPERIMENTS = [
    ("watchdog", 28, 32, 48), ("recovery", 65, 60, 96), ("branch level -53", 28, 29, 48),
    ("drownCap", 37, 43, 48), ("stationAbove", 33, 34, 48), ("earlyBank", 24, 22, 26),
    ("spawnEscape", 25, 26, 26), ("veinScan", 35, 33, 48), ("spawnWalk", 33, 32, 48),
    ("pickReady", 24, 30, 36), ("pickFirst", 34, 34, 48),
]


def fig_experiments():
    label_w, plot_w, top, row_h = 170, 440, 74, 28
    half = 30.0  # axis spans -30..+30 percentage points
    width, height = label_w + plot_w + 40, top + row_h * len(EXPERIMENTS) + 34
    x0 = label_w + plot_w / 2
    scale = (plot_w / 2) / half
    parts = [text(20, 28, "Paired A/B experiments", 16, weight="bold"),
             text(20, 47, "Change in banked-run rate, treatment minus control, in percentage points", 12, MUTED),
             f'<rect x="{x0 - 24 * scale:.1f}" y="{top - 8}" width="{48 * scale:.1f}" '
             f'height="{row_h * len(EXPERIMENTS) + 8}" fill="{GRID}" opacity="0.55"/>',
             text(x0, top - 14, "~24 pp: smallest effect 48 pairs can detect", 10, MUTED, "middle")]
    for v in (-30, -20, -10, 0, 10, 20, 30):
        x = x0 + v * scale
        parts.append(f'<line x1="{x:.1f}" y1="{top - 8}" x2="{x:.1f}" y2="{height - 22}" '
                     f'stroke="{"#52606d" if v == 0 else GRID}"/>')
        parts.append(text(x, height - 8, f"{v:+d}" if v else "0", 10, MUTED, "middle"))
    for i, (name, t, c, n) in enumerate(EXPERIMENTS):
        d = 100 * (t - c) / n
        y = top + i * row_h
        w = abs(d) * scale
        x = x0 if d >= 0 else x0 - w
        parts.append(text(label_w - 10, y + 15, name, 12, INK, "end"))
        parts.append(f'<rect x="{x:.1f}" y="{y}" width="{max(w, 1.5):.1f}" height="18" '
                     f'fill="{ACCENT if d >= 0 else WARN}" rx="2"/>')
        tx = x0 + d * scale + (8 if d >= 0 else -8)
        parts.append(text(tx, y + 14, f"{d:+.1f}", 11, MUTED, "start" if d >= 0 else "end"))
    return svg(width, height, "\n".join(parts))


def box(x, y, w, h, title, lines, fill="#f4f7f9", stroke="#c5ced6"):
    out = [f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{fill}" stroke="{stroke}" rx="5"/>',
           text(x + 12, y + 22, title, 13, weight="bold")]
    for i, ln in enumerate(lines):
        out.append(text(x + 12, y + 42 + i * 17, ln, 11.5, MUTED))
    return "\n".join(out)


def arrow(x1, y1, x2, y2, label=""):
    out = [f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="#52606d" stroke-width="1.4" '
           f'marker-end="url(#a)"/>']
    if label:
        out.append(text((x1 + x2) / 2, (y1 + y2) / 2 - 6, label, 10.5, MUTED, "middle"))
    return "\n".join(out)


def fig_architecture():
    defs = ('<defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" '
            'orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#52606d"/></marker></defs>')
    parts = [defs, text(20, 28, "Architecture", 16, weight="bold"),
             box(20, 50, 190, 112, "Paper server", ["Minecraft 1.21, one pinned patch", "600 pre-generated spawn slots",
                                                      "Fresh world snapshot per batch"]),
             box(280, 50, 270, 112, "Bot process (Node, Mineflayer)",
                 ["observe: visible blocks only, no x-ray", "planner: pure function of the state",
                  "skills: explore, dig_down, mine, craft,", "smelt, shelter, flee, fight, deposit"]),
             box(620, 50, 200, 112, "Telemetry", ["one JSON line per skill call", "per-run milestone timeline",
                                                   "stuck tracker and watchdogs"]),
             box(280, 214, 270, 92, "Evaluation harness", ["fixed slots, paired arms behind switches",
                                                            "12 bots per server, up to 3 servers"]),
             box(620, 214, 200, 92, "Analysis", ["runs.csv, REPORT.md", "failure signatures, timelines"]),
             arrow(210, 106, 280, 106, "player protocol"), arrow(550, 106, 620, 106, "skill log"),
             arrow(415, 214, 415, 162, "runs"), arrow(720, 162, 720, 214, "aggregate"),
             arrow(620, 260, 550, 260, "decisions")]
    return svg(840, 326, "\n".join(parts))


def main():
    os.makedirs(OUT, exist_ok=True)
    rows = load()
    figs = {"funnel.svg": fig_funnel(rows), "endings.svg": fig_endings(rows), "failures.svg": fig_failures(rows),
            "experiments.svg": fig_experiments(), "architecture.svg": fig_architecture()}
    for name, content in figs.items():
        with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
            f.write(content)
        print("wrote", os.path.join("docs", "img", name))
    print("runs:", len(rows))


if __name__ == "__main__":
    main()
