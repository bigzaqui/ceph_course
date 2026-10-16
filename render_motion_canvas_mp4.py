#!/usr/bin/env python3
"""
Motion Canvas Procedural 2D -> MP4 Renderer (librsvg + libcairo + ffmpeg)
Renders all 8 Ceph Course scenes with camera pan/zoom, splines, procedural signals,
and muxes the 40 ElevenLabs voiceover MP3 tracks into:
  - /opt/argon/videos/scene-01.mp4 .. scene-08.mp4
  - /opt/argon/videos/ceph-course-full.mp4
"""
import ctypes
import json
import math
import multiprocessing as mp
import os
import re
import subprocess
import time
from xml.sax.saxutils import escape

ROOT = "/opt/argon"
VIDEOS_DIR = os.path.join(ROOT, "videos")
os.makedirs(VIDEOS_DIR, exist_ok=True)

W, H = 1280, 720
RENDER_FPS = 15  # 15 procedural frames/sec -> 6,466 frames total (~12s render on 4 cores)

P = {
    "bg": "#070a0f",
    "panel": "#0e1520",
    "panelDark": "#080d14",
    "blue": "#58c4dd",
    "blueSoft": "rgba(88, 196, 221, 0.16)",
    "green": "#83c167",
    "greenSoft": "rgba(131, 193, 103, 0.16)",
    "yellow": "#f4d03f",
    "yellowSoft": "rgba(244, 208, 63, 0.16)",
    "orange": "#ff862f",
    "orangeSoft": "rgba(255, 134, 47, 0.16)",
    "purple": "#b189e8",
    "purpleSoft": "rgba(177, 137, 232, 0.16)",
    "red": "#fc6255",
    "redSoft": "rgba(252, 98, 85, 0.16)",
    "teal": "#45d0b0",
    "tealSoft": "rgba(69, 208, 176, 0.16)",
    "white": "#eceff4",
    "muted": "#8b9bb0",
    "dim": "#2a384b",
}


def load_course_scenes():
    with open(os.path.join(ROOT, "course-data.js"), "r", encoding="utf-8") as f:
        txt = f.read()
    m = re.search(r"window\.COURSE_SCENES\s*=\s*(\[\s*\{.*?\}\s*\]);", txt, re.S)
    return json.loads(m.group(1))


def clamp(v, lo=0.0, hi=1.0):
    return max(lo, min(hi, v))


def ease_in_out(t):
    t = clamp(t)
    return 4 * t * t * t if t < 0.5 else 1 - pow(-2 * t + 2, 3) / 2


def ease_out_back(t):
    t = clamp(t)
    c1 = 1.70158
    c3 = c1 + 1
    return 1 + c3 * pow(t - 1, 3) + c1 * pow(t - 1, 2)


def tween(frame, start, dur, ease_fn=ease_in_out):
    if dur <= 0:
        return 1.0 if frame >= start else 0.0
    return ease_fn(clamp((frame - start) / float(dur)))


def crossfade(frame, enter_f, exit_f=None, fade=18):
    fade_in = clamp((frame - enter_f) / float(fade)) if enter_f > 0 else 1.0
    fade_out = clamp((exit_f - frame) / float(fade)) if exit_f is not None else 1.0
    return fade_in * fade_out


def wrap_text(text, max_chars=82):
    words = text.split()
    lines, cur = [], []
    cur_len = 0
    for w in words:
        if cur_len + len(w) + (1 if cur else 0) > max_chars:
            lines.append(" ".join(cur))
            cur = [w]
            cur_len = len(w)
        else:
            cur.append(w)
            cur_len += len(w) + (1 if len(cur) > 1 else 0)
    if cur:
        lines.append(" ".join(cur))
    return lines[:3]


def svg_card(x, y, w, h, title, subtitle="", stroke=P["blue"], fill=P["panel"], badge="", opacity=1.0, scale=1.0):
    if opacity <= 0.01:
        return ""
    cx, cy = x + w / 2.0, y + h / 2.0
    s = f'<g opacity="{opacity:.3f}" transform="translate({cx:.1f},{cy:.1f}) scale({scale:.3f}) translate({-cx:.1f},{-cy:.1f})">'
    s += f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="14" fill="{fill}" stroke="{stroke}" stroke-width="2.5"/>'
    if badge:
        bw = len(badge) * 10 + 24
        s += f'<rect x="{x + w - bw - 14}" y="{y + 12}" width="{bw}" height="26" rx="7" fill="rgba(7,10,15,0.85)" stroke="{stroke}" stroke-width="1.3"/>'
        s += f'<text x="{x + w - bw/2 - 14:.1f}" y="{y + 29}" text-anchor="middle" fill="{stroke}" font-size="13" font-weight="700" font-family="monospace">{escape(badge)}</text>'
    s += f'<text x="{x + 22}" y="{y + 36}" fill="{P["white"]}" font-size="22" font-weight="700" font-family="sans-serif">{escape(title)}</text>'
    if subtitle:
        s += f'<text x="{x + 22}" y="{y + 62}" fill="{P["muted"]}" font-size="15" font-family="monospace">{escape(subtitle)}</text>'
    s += "</g>"
    return s


def svg_node(cx, cy, r, label, sub="", stroke=P["blue"], fill=P["panel"], opacity=1.0, scale=1.0):
    if opacity <= 0.01:
        return ""
    s = f'<g opacity="{opacity:.3f}" transform="translate({cx:.1f},{cy:.1f}) scale({scale:.3f})">'
    s += f'<circle r="{r + 5}" fill="none" stroke="{stroke}" stroke-width="1.5" opacity="0.28"/>'
    s += f'<circle r="{r}" fill="{fill}" stroke="{stroke}" stroke-width="3"/>'
    s += f'<text y="{-4 if sub else 6}" text-anchor="middle" fill="{P["white"]}" font-size="{max(14, int(r*0.36))}" font-weight="700" font-family="sans-serif">{escape(label)}</text>'
    if sub:
        s += f'<text y="{r*0.42:.1f}" text-anchor="middle" fill="{stroke}" font-size="{max(11, int(r*0.26))}" font-family="monospace">{escape(sub)}</text>'
    s += "</g>"
    return s


def svg_cable(x1, y1, x2, y2, color=P["blue"], width=3, dashed=False, packet=-1.0, label="", opacity=1.0):
    if opacity <= 0.01:
        return ""
    dash = 'stroke-dasharray="9 7"' if dashed else ""
    s = f'<g opacity="{opacity:.3f}">'
    s += f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{color}" stroke-width="{width}" {dash} stroke-linecap="round"/>'
    if 0.0 <= packet <= 1.0:
        px = x1 + (x2 - x1) * packet
        py = y1 + (y2 - y1) * packet
        s += f'<circle cx="{px:.1f}" cy="{py:.1f}" r="11" fill="{color}" opacity="0.28"/>'
        s += f'<circle cx="{px:.1f}" cy="{py:.1f}" r="6" fill="{P["white"]}" stroke="{color}" stroke-width="2.5"/>'
    if label:
        mx, my = (x1 + x2) / 2.0, (y1 + y2) / 2.0 - 11
        s += f'<text x="{mx:.1f}" y="{my:.1f}" text-anchor="middle" fill="{color}" font-size="14" font-weight="700" font-family="monospace">{escape(label)}</text>'
    s += "</g>"
    return s


# ============================================================
# MOTION CANVAS PROCEDURAL SCENES (WITH CAMERA PAN/ZOOM)
# ============================================================

def render_scene_1(frame, segs):
    s2 = segs[1]["fromFrameInScene"]
    s3 = segs[2]["fromFrameInScene"]
    s4 = segs[3]["fromFrameInScene"]
    s5 = segs[4]["fromFrameInScene"]

    phase_a = crossfade(frame, 0, s3 + 15)
    phase_b = crossfade(frame, s3 - 10, None)

    # Motion Canvas Camera: slight zoom into ring during step 2, then pull back for protocol stack
    cam_zoom = 1.0 + 0.06 * math.sin(clamp((frame - s2) / 90.0) * math.pi) if s2 <= frame < s3 else 1.0
    cam_x = -40 * tween(frame, s2, 45) * (1 - tween(frame, s3, 30))
    out = [f'<g transform="translate({960 + cam_x:.1f},500) scale({cam_zoom:.3f}) translate(-960,-500)">']

    if phase_a > 0.01:
        out.append(f'<g opacity="{phase_a:.3f}">')
        silos = [
            ("Legacy SAN Array", "Fixed LUNs • Fibre Channel", 95, 165, P["red"], 0.96),
            ("Legacy NAS Filer", "Single-Head NFS Bottleneck", 95, 395, P["orange"], 0.89),
            ("Isolated Object Pods", "Separate Hardware Silo", 95, 625, P["purple"], 0.94),
        ]
        for title, sub, x, y, col, cap in silos:
            fill_pct = clamp(frame / float(max(1, s2))) * cap
            warn = fill_pct > 0.85
            out.append(svg_card(x, y, 470, 175, title, sub, P["red"] if warn else col, P["panel"], "99% FULL!" if warn else "SILO"))
            out.append(f'<rect x="{x+24}" y="{y+105}" width="420" height="22" rx="6" fill="#060a10" stroke="{col}" stroke-width="1.2"/>')
            out.append(f'<rect x="{x+26}" y="{y+107}" width="{416*fill_pct:.1f}" height="18" rx="4" fill="{P["red"] if warn else col}"/>')
            out.append(f'<text x="{x+24}" y="{y+150}" fill="{P["red"] if warn else P["muted"]}" font-size="13" font-family="monospace">{"CAPACITY WALL — CANNOT SHARE FREE SPACE" if warn else "ISOLATED STORAGE POOL"}</text>')

        ring_ap = tween(frame, int(s2 * 0.65), 35, ease_out_back)
        if ring_ap > 0.01:
            rcx, rcy, rr = 1280, 480, 250
            out.append(f'<g opacity="{ring_ap:.3f}">')
            out.append(f'<circle cx="{rcx}" cy="{rcy}" r="{rr+42}" fill="none" stroke="rgba(88,196,221,0.15)" stroke-width="2" stroke-dasharray="10 8"/>')
            out.append(f'<circle cx="{rcx}" cy="{rcy}" r="{rr}" fill="rgba(88,196,221,0.05)" stroke="{P["blue"]}" stroke-width="3"/>')
            out.append(f'<circle cx="{rcx}" cy="{rcy}" r="96" fill="{P["panel"]}" stroke="{P["yellow"]}" stroke-width="3"/>')
            out.append(f'<text x="{rcx}" y="{rcy-8}" text-anchor="middle" fill="{P["yellow"]}" font-size="25" font-weight="700" font-family="sans-serif">RADOS</text>')
            out.append(f'<text x="{rcx}" y="{rcy+20}" text-anchor="middle" fill="{P["white"]}" font-size="14" font-family="monospace">12 OSD Pool</text>')
            for i in range(12):
                ang = (i / 12.0) * math.pi * 2 + frame * 0.008
                ox = rcx + math.cos(ang) * rr
                oy = rcy + math.sin(ang) * rr
                c = P["blue"] if i % 3 == 0 else (P["green"] if i % 3 == 1 else P["teal"])
                out.append(f'<line x1="{rcx}" y1="{rcy}" x2="{ox:.1f}" y2="{oy:.1f}" stroke="{c}" stroke-width="1.5" opacity="0.35"/>')
                out.append(svg_node(ox, oy, 30, f"osd.{i}", "4TB", c, P["panel"]))
            out.append("</g>")
        out.append("</g>")

    if phase_b > 0.01:
        out.append(f'<g opacity="{phase_b:.3f}">')
        out.append(svg_card(140, 650, 1640, 175, "RADOS — Autonomous Self-Healing Object Store", "100% Unified Shared Capacity • Peer-to-Peer OSD Mesh • Deterministic CRUSH", P["blue"], P["blueSoft"], "FOUNDATION LAYER"))
        for i in range(10):
            ox = 235 + i * 160
            failed = (frame >= s5 + 25) and (i == 6)
            col = P["red"] if failed else (P["blue"] if i % 2 == 0 else P["teal"])
            out.append(svg_node(ox, 765, 30, "X" if failed else f"osd.{i}", "HEALING" if failed else "ONLINE", col, P["redSoft"] if failed else P["panel"]))

        out.append(svg_card(260, 480, 1400, 110, "librados — Native Low-Level Object API (C / C++ / Python / Go / Rust)", "Direct parallel socket I/O to all OSDs without central gateway bottlenecks", P["teal"], P["panel"], "CORE PROTOCOL"))

        protos = [
            ("RADOSGW (RGW)", "S3 & Swift HTTP Object REST", "Buckets • Multi-Site • IAM", 140, P["orange"], s3),
            ("RBD (Block Device)", "Linux Kernel & QEMU/KVM", "Thin Snapshots • Cloud Disks", 700, P["purple"], s3 + 30),
            ("CephFS (Filesystem)", "POSIX Hierarchy & Shared Mounts", "Dirs • Inodes • HPC & AI Clusters", 1260, P["green"], s4),
        ]
        for name, sub, detail, x, col, st in protos:
            ap = tween(frame, st, 28, ease_out_back)
            out.append(svg_cable(x + 260, 480, x + 260, 355, col, 4, False, ((frame * 0.03) % 1.0), "librados", ap))
            out.append(svg_card(x, 155, 520, 200, name, sub, col, P["panel"], "UNIFIED INTERFACE", ap))
            if ap > 0.1:
                out.append(f'<text x="{x+24}" y="{295}" fill="{col}" font-size="16" font-weight="700" font-family="monospace" opacity="{ap:.3f}">{escape(detail)}</text>')
        out.append("</g>")

    out.append("</g>")
    return "".join(out)


def render_scene_2(frame, segs):
    s2 = segs[1]["fromFrameInScene"]
    s3 = segs[2]["fromFrameInScene"]
    s4 = segs[3]["fromFrameInScene"]
    s5 = segs[4]["fromFrameInScene"]

    p1 = crossfade(frame, 0, s3 + 12)
    p2 = crossfade(frame, s3 - 10, s5 + 12)
    p3 = crossfade(frame, s5 - 10, None)

    out = []
    if p1 > 0.01:
        out.append(f'<g opacity="{p1:.3f}">')
        slice_prog = clamp((frame - 25) / 55.0)
        split = clamp((frame - s2) / 35.0)
        out.append(svg_card(140, 150, 1640, 195, "Client File: training_dataset.parquet (16 MB Contiguous Stream)", "RADOS slices large files into fixed-size 4 MB stripe objects with deterministic IDs", P["blue"], P["panel"], "STRIPE SIZE = 4 MB"))
        cols = [P["blue"], P["teal"], P["green"], P["yellow"]]
        for i in range(4):
            bx = 200 + i * (340 + split * 36)
            out.append(f'<rect x="{bx:.1f}" y="235" width="335" height="82" rx="10" fill="{P["panelDark"]}" stroke="{cols[i]}" stroke-width="3"/>')
            out.append(f'<text x="{bx+167:.1f}" y="272" text-anchor="middle" fill="{P["white"]}" font-size="18" font-weight="700" font-family="monospace">inode.100f.0000000{i}</text>')
            out.append(f'<text x="{bx+167:.1f}" y="298" text-anchor="middle" fill="{cols[i]}" font-size="14" font-family="monospace">4 MB Object Chunk #{i}</text>')
        if 0.0 < slice_prog < 1.0:
            lx = 200 + slice_prog * 1420
            out.append(f'<line x1="{lx:.1f}" y1="205" x2="{lx:.1f}" y2="335" stroke="{P["red"]}" stroke-width="4"/>')

        if frame >= s2 - 10:
            ap = tween(frame, s2 - 10, 30, ease_out_back)
            out.append(svg_card(140, 410, 1640, 420, "Autonomous RADOS Placement Across Cluster Nodes", "Each 4 MB object is placed independently across failure domains — zero central lookup tables", P["teal"], P["panel"], "DISTRIBUTED", ap))
            targets = [(360, 665, "osd.2", P["blue"]), (760, 665, "osd.7", P["teal"]), (1160, 665, "osd.11", P["green"]), (1560, 665, "osd.19", P["yellow"])]
            for i, (tx, ty, name, col) in enumerate(targets):
                out.append(svg_cable(367 + i * 376, 317, tx, ty - 55, col, 3.5, False, ((frame * 0.025 + i * 0.2) % 1.0), f"obj.0{i}", ap))
                out.append(svg_node(tx, ty, 52, name, f"Chunk #{i}", col, P["panel"], ap))
        out.append("</g>")

    if p2 > 0.01:
        out.append(f'<g opacity="{p2:.3f}">')
        out.append(svg_card(95, 150, 810, 680, "Inside a Single RADOS Object (3-Layer Blueprint)", "Every RADOS object combines raw byte extents with rich atomic metadata", P["yellow"], P["panel"], "ATOMIC OBJECT"))
        layers = [
            ("1. Byte Payload (4 MB Raw Extent)", "Direct binary slice stored on NVMe blocks", "01001101 11010010 00111010 ... (4,194,304 B)", 260, P["blue"]),
            ("2. Extended Attributes (xattrs)", "Fast inline key-value tags attached to object", 'mtime="1729104000"  crc32c="0x9f4a2b11"', 445, P["green"]),
            ("3. OMAP (Object Map in RocksDB)", "High-speed B-Tree key-value directory index", '{"weights.bin": inode_1099511627780}', 630, P["purple"]),
        ]
        for title, sub, code, ly, col in layers:
            out.append(svg_card(135, ly, 730, 155, title, sub, col, P["panelDark"], "LAYER"))
            out.append(f'<text x="160" y="{ly+118}" fill="{col}" font-size="16" font-weight="700" font-family="monospace">{escape(code)}</text>')

        rep_ap = tween(frame, s4 - 15, 30, ease_out_back)
        out.append(svg_card(955, 150, 870, 680, "Strong Consistency: Primary-to-Replica Write", "Write is ACKed to client only after all 3 replicas commit to NVMe", P["green"], P["panel"], "SIZE = 3 REPLICAS", rep_ap))
        if rep_ap > 0.05:
            cyc = ((frame - s4) % 90) / 90.0 if frame >= s4 else 0.0
            out.append(svg_node(1110, 490, 52, "Client", "App Write", P["white"], P["panel"], rep_ap))
            out.append(svg_node(1380, 490, 62, "OSD.4", "PRIMARY", P["yellow"], P["yellowSoft"], rep_ap))
            out.append(svg_node(1675, 320, 54, "OSD.11", "REPLICA 2", P["green"], P["panel"], rep_ap))
            out.append(svg_node(1675, 660, 54, "OSD.18", "REPLICA 3", P["green"], P["panel"], rep_ap))
            out.append(svg_cable(1162, 490, 1318, 490, P["yellow"], 4, False, cyc * 2 if cyc < 0.5 else -1, "1. Write", rep_ap))
            out.append(svg_cable(1442, 460, 1621, 340, P["blue"], 3.5, False, (cyc - 0.3) * 2.5 if 0.3 <= cyc < 0.7 else -1, "2. Replicate", rep_ap))
            out.append(svg_cable(1442, 520, 1621, 640, P["blue"], 3.5, False, (cyc - 0.3) * 2.5 if 0.3 <= cyc < 0.7 else -1, "2. Replicate", rep_ap))
            out.append(svg_cable(1318, 525, 1162, 525, P["green"], 3.5, True, (cyc - 0.7) * 3.3 if cyc >= 0.7 else -1, "3. Commit ACK", rep_ap))
        out.append("</g>")

    if p3 > 0.01:
        local_p = clamp((frame - s5) / float(max(1, segs[4]["durationInFrames"])))
        healed = local_p > 0.58
        out.append(f'<g opacity="{p3:.3f}">')
        out.append(svg_card(140, 160, 1640, 660, "Autonomous Deep Scrubbing & Bit-Rot Self-Healing", "OSDs periodically compare CRC32C checksums across replicas and automatically repair silent disk corruption", P["green"] if healed else P["red"], P["panel"], "REPAIRED (3/3 HEALTHY)" if healed else "SCRUBBING IN PROGRESS"))
        cards = [
            ("Primary OSD.4", "CRC32C: 0x9F4A2B11", P["green"], "GOLDEN COPY", 230),
            ("Replica OSD.11", "CRC32C: 0x9F4A2B11 (FIXED)" if healed else "CRC32C: 0xDEAD0000 (BIT-ROT!)", P["green"] if healed else P["red"], "HEALED" if healed else "CORRUPT SECTOR", 740),
            ("Replica OSD.18", "CRC32C: 0x9F4A2B11", P["green"], "VERIFIED OK", 1250),
        ]
        for title, crc, col, badge, cx in cards:
            out.append(svg_card(cx, 330, 440, 250, title, crc, col, P["panelDark"], badge))
        if not healed:
            scan_y = 340 + math.sin(frame * 0.18) * 90 + 90
            out.append(f'<line x1="730" y1="{scan_y:.1f}" x2="1190" y2="{scan_y:.1f}" stroke="{P["red"]}" stroke-width="4"/>')
        else:
            out.append(svg_cable(670, 455, 740, 455, P["green"], 5, False, (frame * 0.05) % 1.0, "Heal Stream"))
        out.append(f'<text x="960" y="715" text-anchor="middle" fill="{P["green"] if healed else P["yellow"]}" font-size="22" font-weight="700" font-family="monospace">{"✓ Replica OSD.11 overwritten with clean 4 MB object from Primary OSD.4 — zero human intervention!" if healed else "⚠ Scrub mismatch detected on Replica OSD.11 — fetching clean replica from Primary OSD.4..."}</text>')
        out.append("</g>")

    return "".join(out)


def render_scene_3(frame, segs):
    s2 = segs[1]["fromFrameInScene"]
    s3 = segs[2]["fromFrameInScene"]
    s4 = segs[3]["fromFrameInScene"]
    s5 = segs[4]["fromFrameInScene"]

    p_left = crossfade(frame, 0, s3 + 12)
    p_right = crossfade(frame, s3 - 10, None)
    out = []

    if p_left > 0.01:
        out.append(f'<g opacity="{p_left:.3f}">')
        out.append(svg_card(100, 150, 780, 680, "Physical OSD Node Anatomy (ceph-osd Daemon)", "1 Storage Drive = 1 ceph-osd Daemon Process + CPU/RAM + Heartbeat Network", P["blue"], P["panel"], "1 DISK = 1 OSD"))
        out.append(svg_card(150, 265, 680, 150, "ceph-osd Linux Daemon", "Handles replication, scrubbing, backfilling, and peer heartbeats", P["teal"], P["panelDark"], "PID 4821"))
        out.append(svg_card(150, 450, 680, 150, "Dedicated NVMe / SAS / HDD Drive", "Exclusive raw block storage device managed by this OSD", P["green"], P["panelDark"], "/dev/nvme0n1"))
        out.append(svg_card(150, 635, 680, 145, "Cluster & Public Network Interfaces", "Frontend client traffic + Backend replication & peer heartbeat mesh", P["yellow"], P["panelDark"], "25/100 GbE"))

        fs_ap = tween(frame, s2 - 10, 30, ease_out_back)
        out.append(svg_card(930, 150, 890, 680, "The Legacy FileStore Bottleneck (Double-Write Penalty)", "Writing objects on top of XFS/ext4 forced every byte to be written TWICE to disk", P["red"], P["panel"], "2x WRITE PENALTY", fs_ap))
        if fs_ap > 0.05:
            out.append(svg_card(980, 280, 790, 130, "Step 1: Write Full Data + Metadata to FileStore Journal", "First physical disk write required before XFS transaction", P["orange"], P["panelDark"], "WRITE #1", fs_ap))
            out.append(svg_card(980, 455, 790, 130, "Step 2: Flush to POSIX Filesystem (XFS / ext4)", "Second physical disk write + slow POSIX inode/dentry lookup overhead", P["red"], P["panelDark"], "WRITE #2", fs_ap))
            bar = clamp((frame - s2) / 70.0) * 680
            out.append(f'<text x="980" y="655" fill="{P["red"]}" font-size="18" font-weight="700" font-family="monospace">Legacy FileStore Disk I/O Time (2.0x Bandwidth Consumed):</text>')
            out.append(f'<rect x="980" y="675" width="{bar:.1f}" height="32" rx="8" fill="{P["red"]}"/>')
        out.append("</g>")

    if p_right > 0.01:
        out.append(f'<g opacity="{p_right:.3f}">')
        out.append(svg_card(100, 150, 1720, 680, "Modern Ceph BlueStore Engine — Direct Raw Block Device Architecture", "Eliminates the POSIX filesystem middleman completely: 1x direct raw block writes + embedded RocksDB on BlueFS", P["green"], P["panel"], "DEFAULT SINCE LUMINOUS"))
        out.append(svg_node(250, 480, 68, "ceph-osd", "BlueStore", P["blue"], P["blueSoft"]))

        out.append(svg_cable(318, 440, 560, 320, P["green"], 5, False, (frame * 0.04) % 1.0, "Raw 4MB Extents (1x Write)"))
        out.append(svg_card(560, 235, 1190, 210, "Direct Raw Block Device (/dev/nvme0n1) — Zero Filesystem Tax", "Allocator writes 4 MB data payloads directly to physical LBA sectors — no journal double-write!", P["green"], P["panelDark"], "FAST DATA PATH"))
        for i in range(6):
            out.append(f'<rect x="{600 + i*185}" y="340" width="165" height="72" rx="8" fill="{P["greenSoft"]}" stroke="{P["green"]}" stroke-width="2"/>')
            out.append(f'<text x="{682 + i*185}" y="382" text-anchor="middle" fill="{P["white"]}" font-size="15" font-weight="700" font-family="monospace">LBA Extent #{i}</text>')

        rk_ap = tween(frame, s4 - 15, 30, ease_out_back)
        out.append(svg_cable(318, 520, 560, 620, P["purple"], 4, False, (frame * 0.05 + 0.3) % 1.0, "OMAP / xattrs / WAL", rk_ap))
        out.append(svg_card(560, 495, 1190, 285, "Embedded RocksDB + BlueFS + High-Speed NVMe WAL", "Stores object metadata, OMAP B-Trees, and CRC32C checksums in a minimalist C++ user-space block driver", P["purple"], P["panelDark"], "ROCKSDB + BLUEFS", rk_ap))
        if frame >= s5 - 15:
            out.append(f'<rect x="600" y="675" width="520" height="44" rx="8" fill="{P["redSoft"]}" stroke="{P["red"]}" stroke-width="1.5"/>')
            out.append(f'<text x="860" y="703" text-anchor="middle" fill="{P["red"]}" font-size="16" font-weight="700" font-family="monospace">Legacy FileStore: 2.0x Disk Writes (Slow)</text>')
            out.append(f'<rect x="1160" y="675" width="540" height="44" rx="8" fill="{P["greenSoft"]}" stroke="{P["green"]}" stroke-width="2"/>')
            out.append(f'<text x="1430" y="703" text-anchor="middle" fill="{P["green"]}" font-size="16" font-weight="700" font-family="monospace">BlueStore: 0.9x Latency • Zero Double-Write!</text>')
        out.append("</g>")

    return "".join(out)


def render_scene_4(frame, segs):
    s2 = segs[1]["fromFrameInScene"]
    s3 = segs[2]["fromFrameInScene"]
    s4 = segs[3]["fromFrameInScene"]
    s5 = segs[4]["fromFrameInScene"]

    p1 = crossfade(frame, 0, s3 + 12)
    p2 = crossfade(frame, s3 - 10, None)
    out = []

    if p1 > 0.01:
        out.append(f'<g opacity="{p1:.3f}">')
        out.append(svg_card(95, 150, 770, 680, "Ceph Monitor Paxos Quorum Ring", "Odd number of MONs (3 or 5) run Paxos consensus on cluster state", P["yellow"], P["panel"], "QUORUM: 3 / 3"))
        mons = [("mon.a", "LEADER", 480, 320), ("mon.b", "PEON", 280, 640), ("mon.c", "PEON", 680, 640)]
        out.append(svg_cable(480, 320, 280, 640, P["yellow"], 3.5, False, (frame * 0.03) % 1.0, "Paxos"))
        out.append(svg_cable(280, 640, 680, 640, P["yellow"], 3.5, False, (frame * 0.03 + 0.33) % 1.0, "Lease"))
        out.append(svg_cable(680, 640, 480, 320, P["yellow"], 3.5, False, (frame * 0.03 + 0.66) % 1.0, "Commit"))
        for name, role, mx, my in mons:
            out.append(svg_node(mx, my, 64, name, role, P["yellow"], P["panelDark"]))

        epoch_bump = frame >= s2 + 20
        out.append(svg_card(915, 150, 905, 680, "The Master Cluster Map & Mechanical Epoch Odometer", "Every topology change increments the monotonically increasing Epoch counter", P["blue"], P["panel"], "EPOCH e105" if epoch_bump else "EPOCH e104"))
        out.append(f'<rect x="1150" y="250" width="430" height="90" rx="12" fill="#05080d" stroke="{P["yellow"]}" stroke-width="3"/>')
        out.append(f'<text x="1365" y="308" text-anchor="middle" fill="{P["yellow"]}" font-size="38" font-weight="700" font-family="monospace">{"EPOCH  0 0 1 0 5" if epoch_bump else "EPOCH  0 0 1 0 4"}</text>')

        maps = [
            ("1. Monitor Map", "IPs & ports of mon.a, mon.b, mon.c", 960, 380, P["yellow"]),
            ("2. OSD Map", "osd.14 marked DOWN -> triggers e105" if epoch_bump else "All 24 OSDs UP and IN", 1385, 380, P["red"] if epoch_bump else P["green"]),
            ("3. PG Map", "Placement Group versions & acting sets", 960, 535, P["purple"]),
            ("4. CRUSH Map", "Physical hierarchy: racks, hosts, failure rules", 1385, 535, P["teal"]),
            ("5. MDS Map", "Active and standby CephFS Metadata Daemons", 960, 690, P["blue"]),
        ]
        for title, sub, mx, my, col in maps:
            out.append(svg_card(mx, my, 395, 120, title, sub, col, P["panelDark"]))
        out.append("</g>")

    if p2 > 0.01:
        out.append(f'<g opacity="{p2:.3f}">')
        out.append(svg_card(95, 150, 820, 680, "Split-Brain Prevention: Strict Majority Quorum (⌊N/2⌋ + 1)", "When a network cut isolates mon.c, mon.a + mon.b keep 2/3 majority while mon.c halts writes", P["green"], P["panel"], "NO SPLIT-BRAIN"))
        out.append(svg_card(140, 280, 440, 490, "Majority Partition (2 / 3 MONs)", "mon.a + mon.b retain quorum -> Cluster stays ONLINE", P["green"], P["greenSoft"], "QUORUM ACTIVE"))
        out.append(svg_node(260, 520, 58, "mon.a", "LEADER", P["green"], P["panel"]))
        out.append(svg_node(450, 520, 58, "mon.b", "PEON", P["green"], P["panel"]))
        out.append(svg_cable(318, 520, 392, 520, P["green"], 4, False, (frame * 0.04) % 1.0, "2/3 OK"))

        out.append(f'<line x1="625" y1="265" x2="625" y2="785" stroke="{P["red"]}" stroke-width="5" stroke-dasharray="14 10"/>')
        out.append(f'<text x="625" y="250" text-anchor="middle" fill="{P["red"]}" font-size="15" font-weight="700" font-family="monospace">⚡ NETWORK PARTITION</text>')
        out.append(svg_card(665, 280, 215, 490, "Isolated (1/3)", "mon.c FENCED", P["red"], P["redSoft"]))
        out.append(svg_node(772, 520, 56, "mon.c", "READ-ONLY", P["red"], P["panel"]))

        d_ap = tween(frame, s4 - 10, 30, ease_out_back)
        out.append(svg_card(960, 150, 860, 680, "Lightweight Incremental Epoch Delta Broadcast (Δ e105)", "Monitors never sit in the data I/O path — they only gossip tiny KB map diffs when state changes", P["blue"], P["panel"], "DELTA GOSSIP", d_ap))
        if d_ap > 0.05:
            out.append(svg_node(1120, 490, 64, "MON Quorum", "Δ e104->e105", P["yellow"], P["panelDark"], d_ap))
            targets = [("Client App A", 1620, 290, P["white"]), ("Client App B", 1620, 420, P["white"]), ("OSD.4 Primary", 1620, 560, P["blue"]), ("OSD.11 Peer", 1620, 690, P["teal"])]
            for label, tx, ty, col in targets:
                out.append(svg_cable(1184, 490, tx - 58, ty, P["yellow"], 3, True, (frame * 0.035) % 1.0, "Δ e105 (4 KB)", d_ap))
                out.append(svg_node(tx, ty, 48, label, "Map e105", col, P["panelDark"], d_ap))
        out.append("</g>")

    return "".join(out)


def render_scene_5(frame, segs):
    s2 = segs[1]["fromFrameInScene"]
    s3 = segs[2]["fromFrameInScene"]
    s4 = segs[3]["fromFrameInScene"]
    s5 = segs[4]["fromFrameInScene"]

    p1 = crossfade(frame, 0, s4 + 12)
    p2 = crossfade(frame, s4 - 10, None)
    out = []

    if p1 > 0.01:
        out.append(f'<g opacity="{p1:.3f}">')
        out.append(svg_card(95, 150, 920, 680, "CephFS Metadata Server (ceph-mds) — In-Memory POSIX Tree", "Translates flat RADOS objects into human directories, permissions, and inode trees in RAM", P["purple"], P["panel"], "ZERO DATA ON MDS"))
        nodes = [
            ("/", "ino 0x1", 555, 280, P["yellow"]),
            ("/home", "dir", 335, 430, P["purple"]),
            ("/project", "dir", 775, 430, P["purple"]),
            ("/home/alice", "dir", 335, 590, P["blue"]),
            ("/project/model.pt", "ino 0x100f", 635, 590, P["green"]),
            ("/project/build", "hot dir", 905, 590, P["orange"]),
            ("RADOS: 100f.00000000", "Pointer Only", 635, 745, P["teal"]),
        ]
        edges = [(555, 280, 335, 430), (555, 280, 775, 430), (335, 430, 335, 590), (775, 430, 635, 590), (775, 430, 905, 590), (635, 590, 635, 745)]
        for x1, y1, x2, y2 in edges:
            out.append(svg_cable(x1, y1 + 38, x2, y2 - 38, P["purple"], 3))
        for label, sub, nx, ny, col in nodes:
            out.append(svg_node(nx, ny, 44, label, sub, col, P["panelDark"]))

        cap_ap = tween(frame, s3 - 15, 30, ease_out_back)
        out.append(svg_card(1055, 150, 770, 680, "MDS Capability Tokens (Caps) & Cache Coherence", "MDS issues fine-grained locks so clients safely cache reads or buffer writes", P["teal"], P["panel"], "POSIX COHERENCE", cap_ap))
        if cap_ap > 0.05:
            out.append(svg_card(1100, 285, 680, 210, "Client A — Holds Read/Cache Token (Fr, Fc)", "Allowed to cache directory & file pages locally in RAM", P["green"], P["panelDark"], "CAP: Fr + Fc", cap_ap))
            out.append(svg_card(1100, 540, 680, 230, "Client B — Requests Exclusive Write (Fw, Fb)", "MDS revokes Client A's cache token before granting Client B write lock!", P["orange"], P["panelDark"], "CAP: Fw + Fb", cap_ap))
        out.append("</g>")

    if p2 > 0.01:
        mig = clamp((frame - s4 - 20) / 55.0)
        balanced = mig > 0.65
        out.append(f'<g opacity="{p2:.3f}">')
        out.append(svg_card(95, 150, 1730, 680, "Dynamic Subtree Partitioning & Metadata Journal Replay", "Hot directory subtrees automatically migrate across active MDS daemons while journaling to RADOS", P["green"] if balanced else P["orange"], P["panel"], "LOAD BALANCED" if balanced else "HOTSPOT DETECTED"))

        load0 = 0.94 - mig * 0.43
        load1 = 0.18 + mig * 0.28
        out.append(svg_card(150, 265, 580, 310, "Active Daemon: mds.0 (Rank 0)", "Authoritative for /home/* and /project/model.pt", P["orange"] if not balanced else P["green"], P["panelDark"], f"CPU: {int(load0*100)}%"))
        out.append(f'<rect x="190" y="380" width="500" height="28" rx="7" fill="#060a10" stroke="{P["orange"]}" stroke-width="1.5"/>')
        out.append(f'<rect x="192" y="382" width="{496*load0:.1f}" height="24" rx="5" fill="{P["red"] if load0 > 0.8 else P["green"]}"/>')

        out.append(svg_card(1190, 265, 580, 310, "Active Daemon: mds.1 (Rank 1)", "Takes ownership of hot /project/build/* subtree", P["teal"], P["panelDark"], f"CPU: {int(load1*100)}%"))
        out.append(f'<rect x="1230" y="380" width="500" height="28" rx="7" fill="#060a10" stroke="{P["teal"]}" stroke-width="1.5"/>')
        out.append(f'<rect x="1232" y="382" width="{496*load1:.1f}" height="24" rx="5" fill="{P["teal"]}"/>')

        sub_x = 440 + mig * 1040
        out.append(svg_cable(730, 420, 1190, 420, P["yellow"], 4, True, mig if 0 < mig < 1 else -1, "Migrate Subtree /project/build/*"))
        out.append(svg_node(sub_x, 495, 46, "/build/*", "HOT SUBTREE", P["yellow"], P["panel"]))

        j_ap = tween(frame, s5 - 15, 30, ease_out_back)
        out.append(svg_card(150, 615, 1620, 175, "RADOS Pool: cephfs_metadata (Persistent MDS Journal)", "If an MDS node crashes, a standby MDS replays the journal from RADOS in seconds", P["purple"], P["panelDark"], "CRASH RECOVERY", j_ap))
        out.append("</g>")

    return "".join(out)


def render_scene_6(frame, segs):
    s2 = segs[1]["fromFrameInScene"]
    s3 = segs[2]["fromFrameInScene"]
    s4 = segs[3]["fromFrameInScene"]
    s5 = segs[4]["fromFrameInScene"]

    p1 = crossfade(frame, 0, s5 + 10)
    p2 = crossfade(frame, s5 - 10, None)

    # Motion Canvas Camera zooms slightly into the CRUSH tree during outage recovery
    cam_zoom = 1.0 + 0.05 * tween(frame, s5, 35)
    out = [f'<g transform="translate(960,500) scale({cam_zoom:.3f}) translate(-960,-500)">']

    def draw_crush_tree(rack_b_down=False, reroute_prog=0.0):
        t = []
        t.append(svg_card(95, 135, 1730, 105, "CRUSH(x, ClusterMap, Rule)  ->  [ osd.1,  osd.8,  osd.9 ]" if rack_b_down else "CRUSH(x, ClusterMap, Rule)  ->  [ osd.1,  osd.5,  osd.9 ]",
                          "Zero Central Lookup Table — Clients & OSDs compute exact object locations directly in CPU!", P["yellow"], P["panel"], "EPOCH e106 (RE-ROUTED)" if rack_b_down else "DETERMINISTIC MATH"))
        root_x, root_y = 960, 305
        racks = [
            ("Rack A", "Failure Domain #1", 370, 465, P["green"], True),
            ("Rack B", "POWER OUTAGE!" if rack_b_down else "Failure Domain #2", 960, 465, P["red"] if rack_b_down else P["green"], not rack_b_down),
            ("Rack C", "Failure Domain #3", 1550, 465, P["green"], True),
        ]
        for rname, rsub, rx, ry, rcol, healthy in racks:
            t.append(svg_cable(root_x, root_y + 38, rx, ry - 42, rcol, 4 if healthy else 2.5, not healthy, (frame * 0.03) % 1.0 if healthy else -1))
            t.append(svg_node(rx, ry, 46, rname, rsub, rcol, P["redSoft"] if not healthy else P["panelDark"]))

        osds = [
            ("osd.0", 190, 720, 370, False, False),
            ("osd.1", 370, 720, 370, True, False),
            ("osd.2", 550, 720, 370, False, False),
            ("osd.4", 780, 720, 960, False, rack_b_down),
            ("osd.5", 960, 720, 960, not rack_b_down, rack_b_down),
            ("osd.6", 1140, 720, 960, False, rack_b_down),
            ("osd.8", 1370, 720, 1550, rack_b_down and reroute_prog > 0.3, False),
            ("osd.9", 1550, 720, 1550, True, False),
            ("osd.10", 1730, 720, 1550, False, False),
        ]
        for oname, ox, oy, prx, chosen, dead in osds:
            col = P["red"] if dead else (P["yellow"] if chosen else P["dim"])
            t.append(svg_cable(prx, 511, ox, oy - 42, col, 4.5 if chosen else 2, dead, (frame * 0.04) % 1.0 if chosen else -1))
            t.append(svg_node(ox, oy, 42, oname, "OFFLINE" if dead else ("SELECTED ★" if chosen else "standby"), col, P["yellowSoft"] if chosen else P["panelDark"]))

        t.append(svg_node(root_x, root_y, 48, "root=default", "Datacenter", P["blue"], P["panelDark"]))
        if rack_b_down and reroute_prog > 0.05:
            t.append(f'<path d="M 960 720 Q 1165 590 1370 720" fill="none" stroke="{P["yellow"]}" stroke-width="4" stroke-dasharray="10 6"/>')
            t.append(f'<text x="1165" y="635" text-anchor="middle" fill="{P["yellow"]}" font-size="16" font-weight="700" font-family="monospace">Re-routed Replica #2 -> osd.8 (r1 &amp; r3 untouched!)</text>')
        return "".join(t)

    if p1 > 0.01:
        out.append(f'<g opacity="{p1:.3f}">{draw_crush_tree(False, 0.0)}</g>')
    if p2 > 0.01:
        rp = clamp((frame - s5 - 20) / 45.0)
        out.append(f'<g opacity="{p2:.3f}">{draw_crush_tree(True, rp)}</g>')

    out.append("</g>")
    return "".join(out)


def render_scene_7(frame, segs):
    s3 = segs[2]["fromFrameInScene"]
    s4 = segs[3]["fromFrameInScene"]
    out = []

    out.append(svg_card(95, 145, 1080, 690, "2-Stage Indirection: Objects -> Placement Groups (PGs) -> OSDs", "10,000,000 objects hash into 128 manageable PG buckets, which CRUSH maps to OSDs", P["purple"], P["panel"], "O(1) AGGREGATION"))

    for i in range(14):
        ox = 155 + (i % 7) * 145
        oy = 250 + (i // 7) * 58
        c = P["blue"] if i % 3 == 0 else (P["teal"] if i % 3 == 1 else P["yellow"])
        out.append(f'<circle cx="{ox}" cy="{oy}" r="18" fill="{P["panelDark"]}" stroke="{c}" stroke-width="2.5"/>')
        out.append(f'<text x="{ox}" y="{oy+4}" text-anchor="middle" fill="{P["white"]}" font-size="11" font-family="monospace">o.{i}</text>')

    out.append(f'<polygon points="220,365 1040,365 760,485 500,485" fill="rgba(177,137,232,0.18)" stroke="{P["purple"]}" stroke-width="3"/>')
    out.append(f'<text x="630" y="432" text-anchor="middle" fill="{P["yellow"]}" font-size="20" font-weight="700" font-family="monospace">hash(object_id) % 128  ->  pg 1.3f</text>')

    pgs = [("PG 1.3a", "[osd.1, 5, 9]", 240, P["purple"]), ("PG 1.3b", "[osd.2, 6, 10]", 500, P["teal"]), ("PG 1.3f ★", "[osd.0, 4, 8]", 760, P["yellow"]), ("PG 1.4c", "[osd.3, 7, 11]", 1020, P["green"])]
    for name, act, px, col in pgs:
        out.append(svg_cable(630, 485, px, 575, col, 3, False, (frame * 0.04) % 1.0))
        out.append(svg_node(px, 625, 48, name, act, col, P["panelDark"]))
        out.append(f'<text x="{px}" y="715" text-anchor="middle" fill="{P["muted"]}" font-size="14" font-family="monospace">~78,000 Objs</text>')

    out.append(svg_card(1215, 145, 610, 325, "Pool Policy A: 3x Replication", "Full 4 MB copies on 3 OSDs (200% overhead, lowest latency)", P["green"], P["panel"], "SIZE = 3"))
    for i in range(3):
        out.append(f'<rect x="{1255 + i*180}" y="275" width="155" height="140" rx="10" fill="{P["greenSoft"]}" stroke="{P["green"]}" stroke-width="2.5"/>')
        out.append(f'<text x="{1332 + i*180}" y="340" text-anchor="middle" fill="{P["white"]}" font-size="17" font-weight="700" font-family="monospace">Replica #{i+1}</text>')
        out.append(f'<text x="{1332 + i*180}" y="368" text-anchor="middle" fill="{P["green"]}" font-size="14" font-family="monospace">Full 4 MB</text>')

    ec_ap = tween(frame, s4 - 20, 30, ease_out_back)
    out.append(svg_card(1215, 505, 610, 330, "Pool Policy B: Erasure Coding (k=4, m=2)", "4 Data Chunks + 2 Parity Chunks = 50% overhead, survives 2 failures!", P["orange"], P["panel"], "EC 4+2", ec_ap))
    if ec_ap > 0.05:
        for i in range(6):
            is_p = i >= 4
            col = P["orange"] if is_p else P["blue"]
            out.append(f'<rect x="{1245 + i*92}" y="635" width="80" height="140" rx="8" fill="{P["panelDark"]}" stroke="{col}" stroke-width="2.5" opacity="{ec_ap:.3f}"/>')
            out.append(f'<text x="{1285 + i*92}" y="705" text-anchor="middle" fill="{col}" font-size="16" font-weight="700" font-family="monospace" opacity="{ec_ap:.3f}">{"P"+str(i-3) if is_p else "D"+str(i+1)}</text>')

    return "".join(out)


def render_scene_8(frame, segs):
    s4 = segs[3]["fromFrameInScene"]
    p1 = crossfade(frame, 0, s4 + 12)
    p2 = crossfade(frame, s4 - 10, None)
    out = []

    if p1 > 0.01:
        out.append(f'<g opacity="{p1:.3f}">')
        out.append(svg_card(95, 145, 1730, 690, "CephFS End-to-End Architecture: Split Control Plane vs. Direct Data Path", "1.5% Metadata Control Plane (MDS) is completely decoupled from 98.5% Direct Parallel RADOS Data Streams", P["blue"], P["panel"], "ZERO GATEWAY BOTTLENECK"))
        out.append(svg_node(250, 500, 74, "CephFS Client", "Linux Kernel", P["white"], P["panelDark"]))
        out.append(svg_node(820, 275, 62, "Active MDS", "1.5% Control", P["purple"], P["purpleSoft"]))
        out.append(svg_node(480, 275, 52, "MON Quorum", "Cluster Map", P["yellow"], P["panelDark"]))

        out.append(svg_cable(250, 426, 480, 327, P["yellow"], 2.5, True, -1, "0. Map e106"))
        out.append(svg_cable(315, 455, 758, 295, P["purple"], 3.5, True, (frame * 0.025) % 1.0, "1. open(/data/video.mp4) -> ino 0x100f + Caps"))

        osds = [("OSD.1 (Rack A)", "Stripe #0 (4MB)", 1520, 330, P["blue"]), ("OSD.5 (Rack B)", "Stripe #1 (4MB)", 1520, 515, P["teal"]), ("OSD.9 (Rack C)", "Stripe #2 (4MB)", 1520, 700, P["green"])]
        for name, sub, ox, oy, col in osds:
            out.append(svg_cable(324, 515, ox - 72, oy, col, 6, False, (frame * 0.045) % 1.0, f"Direct {sub}"))
            out.append(svg_node(ox, oy, 64, name, sub, col, P["panelDark"]))
        out.append("</g>")

    if p2 > 0.01:
        prog = clamp((frame - s4) / 75.0)
        out.append(f'<g opacity="{p2:.3f}">')
        out.append(svg_card(95, 145, 1730, 690, "Linear O(N) Aggregate Throughput Scaling: Direct OSD Path vs. Gateway Proxy", "Adding more OSD nodes linearly scales aggregate client bandwidth because there is no central proxy", P["green"], P["panel"], "O(N) SCALABILITY"))

        gx, gy, gw, gh = 260, 730, 1380, 440
        out.append(f'<line x1="{gx}" y1="{gy}" x2="{gx+gw}" y2="{gy}" stroke="{P["white"]}" stroke-width="3"/>')
        out.append(f'<line x1="{gx}" y1="{gy}" x2="{gx}" y2="{gy-gh}" stroke="{P["white"]}" stroke-width="3"/>')
        out.append(f'<text x="{gx+gw/2}" y="{gy+52}" text-anchor="middle" fill="{P["muted"]}" font-size="18" font-weight="700" font-family="monospace">Cluster Scale: Number of Storage Daemons (10 OSDs  ->  1,000 OSDs)</text>')
        out.append(f'<text x="{gx-30}" y="{gy-gh-18}" text-anchor="middle" fill="{P["green"]}" font-size="16" font-weight="700" font-family="monospace">Throughput (GB/s)</text>')

        cur_w = gw * prog
        cur_h = (gh - 40) * prog
        out.append(f'<line x1="{gx}" y1="{gy-20}" x2="{gx+cur_w:.1f}" y2="{gy-20-cur_h:.1f}" stroke="{P["green"]}" stroke-width="6"/>')
        out.append(f'<circle cx="{gx+cur_w:.1f}" cy="{gy-20-cur_h:.1f}" r="10" fill="{P["green"]}"/>')
        out.append(f'<text x="{gx+cur_w-20:.1f}" y="{gy-40-cur_h:.1f}" text-anchor="end" fill="{P["green"]}" font-size="20" font-weight="700" font-family="monospace">Ceph Direct Path: {int(prog*120)} GB/s Linear O(N)</text>')

        gw_y = gy - 85
        out.append(f'<line x1="{gx}" y1="{gy-20}" x2="{gx+180}" y2="{gw_y}" stroke="{P["red"]}" stroke-width="4" stroke-dasharray="10 6"/>')
        if cur_w > 180:
            out.append(f'<line x1="{gx+180}" y1="{gw_y}" x2="{gx+cur_w:.1f}" y2="{gw_y}" stroke="{P["red"]}" stroke-width="4" stroke-dasharray="10 6"/>')
            out.append(f'<text x="{gx+cur_w-20:.1f}" y="{gw_y-16}" text-anchor="end" fill="{P["red"]}" font-size="18" font-weight="700" font-family="monospace">Traditional Central NAS Gateway Ceiling: 8 GB/s Bottleneck</text>')
        out.append("</g>")

    return "".join(out)


SCENE_RENDERERS = {
    1: render_scene_1,
    2: render_scene_2,
    3: render_scene_3,
    4: render_scene_4,
    5: render_scene_5,
    6: render_scene_6,
    7: render_scene_7,
    8: render_scene_8,
}


def build_frame_svg(scene, frame_30fps):
    segs = scene["segments"]
    active_seg = segs[-1]
    for seg in segs:
        if seg["fromFrameInScene"] <= frame_30fps < seg["toFrameInScene"]:
            active_seg = seg
            break

    body = SCENE_RENDERERS[scene["id"]](frame_30fps, segs)
    lines = wrap_text(active_seg["text"], 84)
    sub_svg = ""
    start_y = 955 - (len(lines) - 1) * 14
    for idx, ln in enumerate(lines):
        sub_svg += f'<text x="960" y="{start_y + idx*30}" text-anchor="middle" fill="#f4f7fa" font-size="23" font-family="sans-serif">{escape(ln)}</text>'

    grid_lines = []
    for i in range(0, 1921, 120):
        grid_lines.append(f'<line x1="{i}" y1="0" x2="{i}" y2="1080"/>')
    for i in range(0, 1081, 120):
        grid_lines.append(f'<line x1="0" y1="{i}" x2="1920" y2="{i}"/>')
    grid_str = "".join(grid_lines)

    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 1920 1080">
<rect width="1920" height="1080" fill="{P['bg']}"/>
<g stroke="rgba(88,196,221,0.045)" stroke-width="1">{grid_str}</g>
<text x="85" y="66" fill="{P['white']}" font-size="32" font-weight="700" font-family="sans-serif">{escape(scene['title'])}</text>
<rect x="1140" y="26" width="695" height="50" rx="10" fill="rgba(16,24,36,0.95)" stroke="{P['blue']}" stroke-width="2"/>
<text x="1487" y="58" text-anchor="middle" fill="{P['yellow']}" font-size="18" font-weight="700" font-family="monospace">{escape(scene['formula'])}</text>
<line x1="85" y1="94" x2="1835" y2="94" stroke="rgba(88,196,221,0.25)" stroke-width="1.5"/>
{body}
<rect x="180" y="882" width="1560" height="150" rx="14" fill="rgba(10,15,23,0.94)" stroke="rgba(88,196,221,0.4)" stroke-width="2"/>
<text x="216" y="916" fill="{P['blue']}" font-size="15" font-weight="700" font-family="monospace">MOTION CANVAS 2D  •  {escape(active_seg['stepLabel'].upper())}</text>
<text x="1704" y="916" text-anchor="end" fill="{P['yellow']}" font-size="15" font-weight="700" font-family="monospace">STEP {active_seg['stepIndex']+1} / {len(segs)}  •  FRAME {frame_30fps}</text>
{sub_svg}
</svg>"""
    return svg.encode("utf-8")


def render_single_scene(scene):
    sid = scene["id"]
    t0 = time.time()

    cairo = ctypes.CDLL("libcairo.so.2")
    rsvg = ctypes.CDLL("librsvg-2.so.2")
    gobj = ctypes.CDLL("libgobject-2.0.so.0")

    cairo.cairo_image_surface_create.restype = ctypes.c_void_p
    cairo.cairo_create.restype = ctypes.c_void_p
    cairo.cairo_image_surface_get_data.restype = ctypes.c_void_p
    rsvg.rsvg_handle_new_from_data.restype = ctypes.c_void_p
    rsvg.rsvg_handle_new_from_data.argtypes = [ctypes.c_char_p, ctypes.c_size_t, ctypes.c_void_p]
    rsvg.rsvg_handle_render_cairo.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
    gobj.g_object_unref.argtypes = [ctypes.c_void_p]

    surface = cairo.cairo_image_surface_create(0, W, H)
    cr = cairo.cairo_create(surface)
    buf_ptr = cairo.cairo_image_surface_get_data(surface)
    buf = (ctypes.c_char * (W * H * 4)).from_address(buf_ptr)

    # 1. Build concatenated audio for this scene using ffmpeg concat + exact padding
    audio_list_path = f"/tmp/scene_{sid:02d}_audio.txt"
    scene_wav = f"/tmp/scene_{sid:02d}.aac"
    filter_parts = []
    inputs = []
    for idx, seg in enumerate(scene["segments"]):
        mp3_path = os.path.join(ROOT, seg["audioFile"])
        inputs.extend(["-i", mp3_path])
        delay_ms = int((seg["fromFrameInScene"] / 30.0) * 1000)
        filter_parts.append(f"[{idx}:a]adelay={delay_ms}|{delay_ms}[a{idx}]")
    mix_inputs = "".join(f"[a{i}]" for i in range(len(scene["segments"])))
    dur_sec = scene["durationInFrames"] / 30.0
    filter_complex = ";".join(filter_parts) + f";{mix_inputs}amix=inputs={len(scene['segments'])}:normalize=0,apad=whole_dur={dur_sec:.3f}[aout]"

    subprocess.run(
        ["ffmpeg", "-y", *inputs, "-filter_complex", filter_complex, "-map", "[aout]", "-t", f"{dur_sec:.3f}", "-c:a", "aac", "-b:a", "128k", scene_wav],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=True,
    )

    out_mp4 = os.path.join(VIDEOS_DIR, f"scene-{sid:02d}.mp4")
    cmd = [
        "ffmpeg", "-y",
        "-f", "rawvideo", "-vcodec", "rawvideo",
        "-s", f"{W}x{H}", "-pix_fmt", "bgra", "-r", str(RENDER_FPS), "-i", "-",
        "-i", scene_wav,
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "22", "-pix_fmt", "yuv420p",
        "-r", "30",
        "-c:a", "copy",
        "-shortest",
        out_mp4,
    ]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    total_30fps = scene["durationInFrames"]
    step = 30 // RENDER_FPS
    for f30 in range(0, total_30fps, step):
        svg_bytes = build_frame_svg(scene, f30)
        h = rsvg.rsvg_handle_new_from_data(svg_bytes, len(svg_bytes), None)
        rsvg.rsvg_handle_render_cairo(h, cr)
        gobj.g_object_unref(h)
        proc.stdin.write(buf)

    proc.stdin.close()
    proc.wait()
    dt = time.time() - t0
    size_mb = os.path.getsize(out_mp4) / (1024 * 1024)
    print(f"[Scene {sid:02d}] Rendered {out_mp4} ({size_mb:.2f} MB) in {dt:.1f}s", flush=True)
    return out_mp4


def main():
    t_all = time.time()
    scenes = load_course_scenes()
    print(f"Starting Motion Canvas MP4 render for {len(scenes)} scenes across 4 CPU workers...")
    with mp.Pool(processes=4) as pool:
        mp4_files = pool.map(render_single_scene, scenes)

    concat_list = "/tmp/ceph_course_concat.txt"
    with open(concat_list, "w") as f:
        for p in sorted(mp4_files):
            f.write(f"file '{p}'\n")

    full_mp4 = os.path.join(VIDEOS_DIR, "ceph-course-full.mp4")
    subprocess.run(
        ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", concat_list, "-c", "copy", "-movflags", "+faststart", full_mp4],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=True,
    )
    total_mb = os.path.getsize(full_mp4) / (1024 * 1024)
    print(f"\n✓ Master MP4 rendered: {full_mp4} ({total_mb:.2f} MB) in {time.time() - t_all:.1f}s!")


if __name__ == "__main__":
    main()
