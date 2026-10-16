/**
 * Ceph Architecture & CephFS — Complete Narration & Timing Data
 * Total continuous duration: 380 seconds (~6 minutes 20 seconds)
 *
 * VOICEOVER INTEGRATION NOTE:
 * 1. Drop custom recorded voiceover tracks into `./audio/scene-01.mp3` ... `./audio/scene-08.mp3`
 *    (or modify `audioFile` in each scene below).
 * 2. When `Voiceover` is enabled in the UI, the player first attempts to play `scene.audioFile`
 *    synchronized to the scene clock; if no custom file is present, it falls back cleanly
 *    to the browser's Web Speech API (`window.speechSynthesis`) timed to each segment.
 */

window.CEPH_SCENES = [
  {
    id: 1,
    shortTitle: "What is Ceph?",
    title: "1. What Ceph Is — Unified Distributed Storage",
    duration: 45,
    audioFile: "audio/scene-01.mp3",
    formula: "1 Cluster  →  Object (RGW)  +  Block (RBD)  +  File (CephFS)",
    segments: [
      {
        start: 0,
        end: 9,
        stepLabel: "The Silo Problem",
        text: "Traditional data centers split storage into isolated silos: one system for S3 objects, another SAN for virtual disks, and a third NAS for shared files."
      },
      {
        start: 9,
        end: 18,
        stepLabel: "Unified Storage",
        text: "Ceph replaces those silos with a single, self-healing distributed storage cluster built entirely from commodity servers and drives."
      },
      {
        start: 18,
        end: 27,
        stepLabel: "Interface 1: Object (RGW)",
        text: "On top of this unified core, RADOS Gateway (RGW) exposes S3 and Swift compatible REST APIs for cloud-native object storage."
      },
      {
        start: 27,
        end: 36,
        stepLabel: "Interface 2: Block (RBD)",
        text: "RADOS Block Device (RBD) provides thin-provisioned, snapshottable virtual disks that attach directly to Linux hosts, KVM, and Kubernetes."
      },
      {
        start: 36,
        end: 45,
        stepLabel: "Interface 3: File (CephFS)",
        text: "And CephFS delivers a POSIX-compliant distributed filesystem—where thousands of clients share directories and files over the exact same cluster."
      }
    ]
  },
  {
    id: 2,
    shortTitle: "RADOS Foundation",
    title: "2. RADOS — The Foundation Layer",
    duration: 45,
    audioFile: "audio/scene-02.mp3",
    formula: "RADOS = Reliable Autonomic Distributed Object Store",
    segments: [
      {
        start: 0,
        end: 9,
        stepLabel: "Everything Is an Object",
        text: "Beneath Object, Block, and File lies RADOS: the Reliable Autonomic Distributed Object Store. In Ceph, every piece of data ultimately becomes a RADOS object."
      },
      {
        start: 9,
        end: 18,
        stepLabel: "Sharding into 4 MB Objects",
        text: "Whether you write a 10-gigabyte VM image or a CephFS video file, Ceph slices it into deterministic, fixed-size chunks—typically 4 megabytes each."
      },
      {
        start: 18,
        end: 27,
        stepLabel: "Object Anatomy",
        text: "Each RADOS object has three parts: a unique Object ID (OID), a binary data payload, and key-value extended attributes called OMAP and xattrs."
      },
      {
        start: 27,
        end: 36,
        stepLabel: "librados & Autonomic Healing",
        text: "Applications talk to RADOS through librados. The cluster is autonomic: nodes replicate objects, detect bit-rot via scrubbing, and recover without human intervention."
      },
      {
        start: 36,
        end: 45,
        stepLabel: "Zero Single Points of Failure",
        text: "Crucially, RADOS has no central gateway bottleneck. Every storage daemon participates in peer-to-peer replication and recovery."
      }
    ]
  },
  {
    id: 3,
    shortTitle: "OSDs & BlueStore",
    title: "3. OSDs — Object Storage Daemons & Data Persistence",
    duration: 48,
    audioFile: "audio/scene-03.mp3",
    formula: "1 Physical Disk (NVMe / SSD / HDD)  ⇄  1 ceph-osd Daemon (BlueStore)",
    segments: [
      {
        start: 0,
        end: 9,
        stepLabel: "One Daemon Per Drive",
        text: "Where do RADOS objects actually live? Inside OSDs—Object Storage Daemons. As a rule of thumb, one ceph-osd daemon manages one physical disk."
      },
      {
        start: 9,
        end: 19,
        stepLabel: "BlueStore Engine",
        text: "Modern Ceph OSDs use BlueStore, a storage engine that bypasses local filesystems like XFS and writes objects directly to raw block devices."
      },
      {
        start: 19,
        end: 29,
        stepLabel: "RocksDB + WAL Metadata",
        text: "Inside BlueStore, raw blocks hold object data, while an embedded RocksDB instance and Write-Ahead Log (WAL) on fast NVMe track metadata and allocation."
      },
      {
        start: 29,
        end: 39,
        stepLabel: "Primary-Driven Replication",
        text: "When a client writes an object, it sends the write to the Primary OSD. That Primary OSD replicates the write in parallel to Secondary and Tertiary OSDs."
      },
      {
        start: 39,
        end: 48,
        stepLabel: "Strong Consistency Ack & Heartbeats",
        text: "Only after all replica OSDs commit to disk does the Primary send an ACK back to the client. Meanwhile, OSDs exchange peer heartbeats every few seconds."
      }
    ]
  },
  {
    id: 4,
    shortTitle: "MONs & Cluster Map",
    title: "4. Monitors (MONs) & The Cluster Map",
    duration: 46,
    audioFile: "audio/scene-04.mp3",
    formula: "Paxos Quorum:  ⌊N / 2⌋ + 1   (e.g., 3 or 5 MONs)",
    segments: [
      {
        start: 0,
        end: 9,
        stepLabel: "Who Knows the Cluster State?",
        text: "With hundreds of OSDs joining, leaving, or failing, how does everyone agree on what the cluster looks like? That is the job of Ceph Monitors, or MONs."
      },
      {
        start: 9,
        end: 18,
        stepLabel: "Odd-Numbered Paxos Quorum",
        text: "Monitors run in odd numbers—typically 3 or 5 nodes—using the Paxos consensus algorithm. A strict majority quorum prevents split-brain scenarios."
      },
      {
        start: 18,
        end: 28,
        stepLabel: "The 5 Maps Inside the Cluster Map",
        text: "Monitors do not touch user data. Instead, they maintain the master Cluster Map: a versioned bundle of the MON Map, OSD Map, PG Map, MDS Map, and CRUSH Map."
      },
      {
        start: 28,
        end: 37,
        stepLabel: "Epoch Updates on Failure",
        text: "When OSD.4 goes down and peers report it unreachable, the MONs increment the map Epoch—say from e104 to e105—marking OSD.4 as DOWN and OUT."
      },
      {
        start: 37,
        end: 46,
        stepLabel: "Lightweight Map Broadcast",
        text: "Incremental map deltas propagate rapidly to all OSDs and connected clients, so every participant always computes against the same cluster topology."
      }
    ]
  },
  {
    id: 5,
    shortTitle: "MDS for CephFS",
    title: "5. Metadata Servers (MDS) — Powering CephFS",
    duration: 48,
    audioFile: "audio/scene-05.mp3",
    formula: "POSIX Path (/data/proj/run.py)  →  MDS Inode + Capabilities  (Zero File Data in MDS)",
    segments: [
      {
        start: 0,
        end: 9,
        stepLabel: "Why CephFS Needs an MDS",
        text: "RADOS stores flat objects, not hierarchical folders. To offer a POSIX filesystem like /home/alice/report.pdf, CephFS introduces the Metadata Server: ceph-mds."
      },
      {
        start: 9,
        end: 19,
        stepLabel: "Inodes, Dentries & Capabilities",
        text: "The MDS manages the directory tree, filenames (dentries), permissions, file sizes, and client locks called Capabilities (Caps) inside a fast RAM cache."
      },
      {
        start: 19,
        end: 29,
        stepLabel: "Crucial Rule: MDS Never Holds File Data",
        text: "Here is the key architectural insight: the MDS never stores or routes actual file contents. Even its own metadata journal is persisted inside a RADOS metadata pool!"
      },
      {
        start: 29,
        end: 39,
        stepLabel: "Dynamic Subtree Partitioning",
        text: "When metadata traffic spikes on a hot directory, active-active MDS daemons dynamically partition the directory tree and migrate hot subtrees to balance load."
      },
      {
        start: 39,
        end: 48,
        stepLabel: "Active + Standby-Replay HA",
        text: "Standby-Replay MDS nodes continuously follow the active journal in RADOS, enabling sub-second failover if an active MDS daemon crashes."
      }
    ]
  },
  {
    id: 6,
    shortTitle: "CRUSH Algorithm",
    title: "6. CRUSH — Algorithmic Placement Without Lookup Tables",
    duration: 52,
    audioFile: "audio/scene-06.mp3",
    formula: "CRUSH(PG_ID, ClusterMap, Rule)  →  [ OSD.2, OSD.7, OSD.10 ]",
    segments: [
      {
        start: 0,
        end: 10,
        stepLabel: "No Central Lookup Table",
        text: "Traditional storage systems look up every block in a central location table—a massive bottleneck. Ceph eliminates lookups entirely with the CRUSH algorithm."
      },
      {
        start: 10,
        end: 20,
        stepLabel: "Controlled, Scalable, Decentralized",
        text: "CRUSH stands for Controlled Replication Under Scalable Hashing. It is a deterministic pseudo-random function: given the same inputs, any node computes the exact same OSDs."
      },
      {
        start: 20,
        end: 31,
        stepLabel: "The CRUSH Hierarchy Tree",
        text: "CRUSH models your physical topology as a weighted tree: Root → Racks → Hosts → OSDs, where disk capacities determine bucket weights."
      },
      {
        start: 31,
        end: 42,
        stepLabel: "Failure-Domain Traversal",
        text: "To place 3 replicas across failure domain 'Rack', CRUSH walks down from Root, selects 3 distinct Racks—Rack A, Rack B, Rack C—then picks one Host and one OSD in each."
      },
      {
        start: 42,
        end: 52,
        stepLabel: "Deterministic & Fault Resilient",
        text: "Because placement is calculated rather than looked up, clients and OSDs independently compute [OSD.2, OSD.7, OSD.10] in microseconds—and survive whole-rack power loss."
      }
    ]
  },
  {
    id: 7,
    shortTitle: "Pools & PGs",
    title: "7. Pools & Placement Groups (PGs) — The Indirection Layer",
    duration: 48,
    audioFile: "audio/scene-07.mp3",
    formula: "Object  ──hash(OID) % N_pg──►  PG 3.a7  ──CRUSH──►  [ OSD.2, OSD.7, OSD.10 ]",
    segments: [
      {
        start: 0,
        end: 9,
        stepLabel: "Logical Pools",
        text: "Before objects reach CRUSH, Ceph organizes them into Logical Pools—such as 'cephfs_data' or 'cephfs_metadata'—each with its own replication or erasure coding policy."
      },
      {
        start: 9,
        end: 19,
        stepLabel: "Why Not Track Millions of Objects Directly?",
        text: "If a pool holds 100 million objects, tracking replication state and recovery per-object would overwhelm memory and CPU across the cluster."
      },
      {
        start: 19,
        end: 29,
        stepLabel: "Placement Groups (PGs) as Buckets",
        text: "Placement Groups (PGs) solve this. A pool is divided into a fixed number of PGs—for example, 128 or 512 buckets. Millions of objects hash into those PGs."
      },
      {
        start: 29,
        end: 39,
        stepLabel: "Two-Step Mapping Pipeline",
        text: "First: Ceph hashes the Object ID modulo the pool's PG count to pick a PG (like PG 3.a7). Second: CRUSH maps PG 3.a7 to an Acting Set of OSDs."
      },
      {
        start: 39,
        end: 48,
        stepLabel: "PGs Are the Unit of Peering & Recovery",
        text: "When a disk fails or a new host joins, Ceph rebalances whole Placement Groups rather than individual objects—making petabyte recovery fast and predictable."
      }
    ]
  },
  {
    id: 8,
    shortTitle: "Direct Data Path",
    title: "8. Putting It All Together — Client Direct-to-OSD Data Flow",
    duration: 48,
    audioFile: "audio/scene-08.mp3",
    formula: "Metadata via MDS (Once)   ‖   Data Striping Direct to OSDs (Parallel)",
    segments: [
      {
        start: 0,
        end: 9,
        stepLabel: "Step 1: Contact MON for Cluster Map",
        text: "Let's trace a CephFS client reading and writing '/dataset/train.bin'. At mount time, the client fetches the latest Cluster Map and CRUSH Map from a Monitor."
      },
      {
        start: 9,
        end: 19,
        stepLabel: "Step 2: Resolve Path & Capabilities via MDS",
        text: "When the app opens '/dataset/train.bin', the client asks the MDS for the path's inode number (say 100001a), stripe layout, and read/write Capabilities."
      },
      {
        start: 19,
        end: 29,
        stepLabel: "Step 3: Local Hash + CRUSH Calculation",
        text: "Now the MDS steps out of the way! The client slices the file into 4 MB objects (100001a.00000000, .00000001...) and runs CRUSH locally in its own CPU."
      },
      {
        start: 29,
        end: 39,
        stepLabel: "Step 4: Direct Parallel I/O to OSDs",
        text: "The client opens direct TCP streams to the Primary OSDs across the cluster, reading and writing 4 MB object stripes in parallel at full network bandwidth."
      },
      {
        start: 39,
        end: 48,
        stepLabel: "Summary: Why Ceph Scales Linearly",
        text: "Because metadata is separated from data and placement is computed via CRUSH, adding more OSD hosts linearly scales both capacity and aggregate throughput."
      }
    ]
  }
];
