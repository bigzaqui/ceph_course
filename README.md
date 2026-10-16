# Ceph & CephFS — 3Blue1Brown-Style Educational Animation

A complete, self-contained single-page educational animation explaining the architecture of Ceph and CephFS using clean geometric primitives on a `#0d1117` / `#070a0f` dark canvas.

## Scene Outline (Total Continuous Runtime: 6m 20s / 380s)

1. **What Ceph Is (0:00 – 0:45, 45s)**
   - Contrasts legacy isolated storage silos (Object, SAN Block, NAS File) against a single unified self-healing Ceph cluster exposing **RGW (S3/Swift)**, **RBD (Virtual Block)**, and **CephFS (POSIX File)**.
2. **RADOS as the Foundation (0:45 – 1:30, 45s)**
   - Shows how files/volumes are sliced into deterministic **4 MB RADOS objects**, inspects object anatomy (`OID`, binary payload, `xattrs` + `OMAP`), and illustrates the autonomic peer-to-peer mesh via `librados`.
3. **OSDs & BlueStore (1:30 – 2:18, 48s)**
   - Zooms inside a single `ceph-osd` daemon managing one physical drive with **BlueStore** (direct raw block extents + embedded **RocksDB / WAL** on NVMe), followed by primary-driven 3x replication, strong consistency ACKs, and peer heartbeats.
4. **Monitors (MONs) & The Cluster Map (2:18 – 3:04, 46s)**
   - Visualizes an odd-numbered **Paxos quorum** (`MON.a`, `MON.b`, `MON.c`), the 5 maps inside the master **Cluster Map** (`MON`, `OSD`, `PG`, `CRUSH`, `MDS`), and incremental epoch updates (`e104 -> e105`) when `OSD.4` fails.
5. **Metadata Servers (MDS) for CephFS (3:04 – 3:52, 48s)**
   - Explains how `ceph-mds` maps POSIX paths (`/data/run.py`) to inodes and client **Capabilities (Caps)** in RAM, emphasizes that **MDS never touches file payload data**, and shows dynamic subtree partitioning (`ceph-mds.1`) + `Standby-Replay` failover.
6. **CRUSH Algorithm (3:52 – 4:44, 52s)**
   - Demonstrates how `CRUSH(PG_ID, ClusterMap, Rule)` replaces central lookup tables by walking the weighted topology tree (`root=default` → `Rack A / B / C` → `Hosts` → `[OSD.2, OSD.7, OSD.10]`) across failure domains.
7. **Pools & Placement Groups (PGs) (4:44 – 5:32, 48s)**
   - Illustrates why tracking millions of objects individually is expensive, and how **Placement Groups** act as aggregation buckets (`hash(OID) % pg_num -> PG 3.a7 -> CRUSH -> [OSD.2, OSD.7, OSD.10]`).
8. **Direct Client-to-OSD Data Path (5:32 – 6:20, 48s)**
   - Traces an end-to-end CephFS client flow: (1) fetch Cluster Map from **MON**, (2) resolve path & capabilities via **MDS** once, (3) compute **CRUSH** locally in the client CPU, and (4) stream **4 MB object stripes in parallel directly to Primary OSDs**.

## Adding Your Own Voiceover

Edit `narration.js` or drop recorded audio files into `/opt/argon/audio/`:
- `audio/scene-01.mp3` through `audio/scene-08.mp3`
- When **Voiceover: ON** is toggled in the control bar, `app.js` plays `audio/scene-0X.mp3` if present, or automatically falls back to browser Web Speech synthesis (`window.speechSynthesis`).

## Running the Web Server (0.0.0.0:8080)

```bash
cd /opt/argon
python3 serve.py
```

Then open **`http://192.168.1.20:8080`** from any device on your private network.
