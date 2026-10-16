window.COURSE_FPS = 30;
window.COURSE_WIDTH = 1920;
window.COURSE_HEIGHT = 1080;
window.TOTAL_DURATION_IN_FRAMES = 12933;
window.COURSE_SCENES = [
  {
    "id": 1,
    "shortTitle": "What is Ceph?",
    "title": "1. What Ceph Is \u2014 Unified Distributed Storage",
    "formula": "1 Cluster  \u2192  Object (RGW)  +  Block (RBD)  +  File (CephFS)",
    "fromFrame": 0,
    "durationInFrames": 1405,
    "toFrame": 1405,
    "segments": [
      {
        "stepIndex": 0,
        "stepLabel": "The Silo Problem",
        "text": "Traditional data centers split storage into isolated silos: one system for S3 objects, another SAN for virtual disks, and a third NAS for shared files.",
        "audioFile": "audio/seg-01-01.mp3",
        "audioDurationSec": 9.38,
        "durationInFrames": 293,
        "fromFrameInScene": 0,
        "toFrameInScene": 293,
        "globalFromFrame": 0,
        "globalToFrame": 293
      },
      {
        "stepIndex": 1,
        "stepLabel": "Unified Storage",
        "text": "Ceph replaces those silos with a single, self-healing distributed storage cluster built entirely from commodity servers and drives.",
        "audioFile": "audio/seg-01-02.mp3",
        "audioDurationSec": 8.02,
        "durationInFrames": 253,
        "fromFrameInScene": 293,
        "toFrameInScene": 546,
        "globalFromFrame": 293,
        "globalToFrame": 546
      },
      {
        "stepIndex": 2,
        "stepLabel": "Interface 1: Object (RGW)",
        "text": "On top of this unified core, RADOS Gateway (RGW) exposes S3 and Swift compatible REST APIs for cloud-native object storage.",
        "audioFile": "audio/seg-01-03.mp3",
        "audioDurationSec": 9.33,
        "durationInFrames": 292,
        "fromFrameInScene": 546,
        "toFrameInScene": 838,
        "globalFromFrame": 546,
        "globalToFrame": 838
      },
      {
        "stepIndex": 3,
        "stepLabel": "Interface 2: Block (RBD)",
        "text": "RADOS Block Device (RBD) provides thin-provisioned, snapshottable virtual disks that attach directly to Linux hosts, KVM, and Kubernetes.",
        "audioFile": "audio/seg-01-04.mp3",
        "audioDurationSec": 8.78,
        "durationInFrames": 275,
        "fromFrameInScene": 838,
        "toFrameInScene": 1113,
        "globalFromFrame": 838,
        "globalToFrame": 1113
      },
      {
        "stepIndex": 4,
        "stepLabel": "Interface 3: File (CephFS)",
        "text": "And CephFS delivers a POSIX-compliant distributed filesystem\u2014where thousands of clients share directories and files over the exact same cluster.",
        "audioFile": "audio/seg-01-05.mp3",
        "audioDurationSec": 9.33,
        "durationInFrames": 292,
        "fromFrameInScene": 1113,
        "toFrameInScene": 1405,
        "globalFromFrame": 1113,
        "globalToFrame": 1405
      }
    ]
  },
  {
    "id": 2,
    "shortTitle": "RADOS Foundation",
    "title": "2. RADOS \u2014 The Foundation Layer",
    "formula": "RADOS = Reliable Autonomic Distributed Object Store",
    "fromFrame": 1405,
    "durationInFrames": 1567,
    "toFrame": 2972,
    "segments": [
      {
        "stepIndex": 0,
        "stepLabel": "Everything Is an Object",
        "text": "Beneath Object, Block, and File lies RADOS: the Reliable Autonomic Distributed Object Store. In Ceph, every piece of data ultimately becomes a RADOS object.",
        "audioFile": "audio/seg-02-01.mp3",
        "audioDurationSec": 10.21,
        "durationInFrames": 318,
        "fromFrameInScene": 0,
        "toFrameInScene": 318,
        "globalFromFrame": 1405,
        "globalToFrame": 1723
      },
      {
        "stepIndex": 1,
        "stepLabel": "Sharding into 4 MB Objects",
        "text": "Whether you write a 10-gigabyte VM image or a CephFS video file, Ceph slices it into deterministic, fixed-size chunks\u2014typically 4 megabytes each.",
        "audioFile": "audio/seg-02-02.mp3",
        "audioDurationSec": 10.63,
        "durationInFrames": 331,
        "fromFrameInScene": 318,
        "toFrameInScene": 649,
        "globalFromFrame": 1723,
        "globalToFrame": 2054
      },
      {
        "stepIndex": 2,
        "stepLabel": "Object Anatomy",
        "text": "Each RADOS object has three parts: a unique Object ID (OID), a binary data payload, and key-value extended attributes called OMAP and xattrs.",
        "audioFile": "audio/seg-02-03.mp3",
        "audioDurationSec": 11.83,
        "durationInFrames": 367,
        "fromFrameInScene": 649,
        "toFrameInScene": 1016,
        "globalFromFrame": 2054,
        "globalToFrame": 2421
      },
      {
        "stepIndex": 3,
        "stepLabel": "librados & Autonomic Healing",
        "text": "Applications talk to RADOS through librados. The cluster is autonomic: nodes replicate objects, detect bit-rot via scrubbing, and recover without human intervention.",
        "audioFile": "audio/seg-02-04.mp3",
        "audioDurationSec": 10.11,
        "durationInFrames": 315,
        "fromFrameInScene": 1016,
        "toFrameInScene": 1331,
        "globalFromFrame": 2421,
        "globalToFrame": 2736
      },
      {
        "stepIndex": 4,
        "stepLabel": "Zero Single Points of Failure",
        "text": "Crucially, RADOS has no central gateway bottleneck. Every storage daemon participates in peer-to-peer replication and recovery.",
        "audioFile": "audio/seg-02-05.mp3",
        "audioDurationSec": 7.47,
        "durationInFrames": 236,
        "fromFrameInScene": 1331,
        "toFrameInScene": 1567,
        "globalFromFrame": 2736,
        "globalToFrame": 2972
      }
    ]
  },
  {
    "id": 3,
    "shortTitle": "OSDs & BlueStore",
    "title": "3. OSDs \u2014 Object Storage Daemons & Data Persistence",
    "formula": "1 Physical Disk (NVMe / SSD / HDD)  \u21c4  1 ceph-osd Daemon (BlueStore)",
    "fromFrame": 2972,
    "durationInFrames": 1623,
    "toFrame": 4595,
    "segments": [
      {
        "stepIndex": 0,
        "stepLabel": "One Daemon Per Drive",
        "text": "Where do RADOS objects actually live? Inside OSDs\u2014Object Storage Daemons. As a rule of thumb, one ceph-osd daemon manages one physical disk.",
        "audioFile": "audio/seg-03-01.mp3",
        "audioDurationSec": 11.28,
        "durationInFrames": 351,
        "fromFrameInScene": 0,
        "toFrameInScene": 351,
        "globalFromFrame": 2972,
        "globalToFrame": 3323
      },
      {
        "stepIndex": 1,
        "stepLabel": "BlueStore Engine",
        "text": "Modern Ceph OSDs use BlueStore, a storage engine that bypasses local filesystems like XFS and writes objects directly to raw block devices.",
        "audioFile": "audio/seg-03-02.mp3",
        "audioDurationSec": 9.74,
        "durationInFrames": 304,
        "fromFrameInScene": 351,
        "toFrameInScene": 655,
        "globalFromFrame": 3323,
        "globalToFrame": 3627
      },
      {
        "stepIndex": 2,
        "stepLabel": "RocksDB + WAL Metadata",
        "text": "Inside BlueStore, raw blocks hold object data, while an embedded RocksDB instance and Write-Ahead Log (WAL) on fast NVMe track metadata and allocation.",
        "audioFile": "audio/seg-03-03.mp3",
        "audioDurationSec": 12.43,
        "durationInFrames": 385,
        "fromFrameInScene": 655,
        "toFrameInScene": 1040,
        "globalFromFrame": 3627,
        "globalToFrame": 4012
      },
      {
        "stepIndex": 3,
        "stepLabel": "Primary-Driven Replication",
        "text": "When a client writes an object, it sends the write to the Primary OSD. That Primary OSD replicates the write in parallel to Secondary and Tertiary OSDs.",
        "audioFile": "audio/seg-03-04.mp3",
        "audioDurationSec": 9.2,
        "durationInFrames": 288,
        "fromFrameInScene": 1040,
        "toFrameInScene": 1328,
        "globalFromFrame": 4012,
        "globalToFrame": 4300
      },
      {
        "stepIndex": 4,
        "stepLabel": "Strong Consistency Ack & Heartbeats",
        "text": "Only after all replica OSDs commit to disk does the Primary send an ACK back to the client. Meanwhile, OSDs exchange peer heartbeats every few seconds.",
        "audioFile": "audio/seg-03-05.mp3",
        "audioDurationSec": 9.43,
        "durationInFrames": 295,
        "fromFrameInScene": 1328,
        "toFrameInScene": 1623,
        "globalFromFrame": 4300,
        "globalToFrame": 4595
      }
    ]
  },
  {
    "id": 4,
    "shortTitle": "MONs & Cluster Map",
    "title": "4. Monitors (MONs) & The Cluster Map",
    "formula": "Paxos Quorum:  \u230aN / 2\u230b + 1   (e.g., 3 or 5 MONs)",
    "fromFrame": 4595,
    "durationInFrames": 1614,
    "toFrame": 6209,
    "segments": [
      {
        "stepIndex": 0,
        "stepLabel": "Who Knows the Cluster State?",
        "text": "With hundreds of OSDs joining, leaving, or failing, how does everyone agree on what the cluster looks like? That is the job of Ceph Monitors, or MONs.",
        "audioFile": "audio/seg-04-01.mp3",
        "audioDurationSec": 9.61,
        "durationInFrames": 300,
        "fromFrameInScene": 0,
        "toFrameInScene": 300,
        "globalFromFrame": 4595,
        "globalToFrame": 4895
      },
      {
        "stepIndex": 1,
        "stepLabel": "Odd-Numbered Paxos Quorum",
        "text": "Monitors run in odd numbers\u2014typically 3 or 5 nodes\u2014using the Paxos consensus algorithm. A strict majority quorum prevents split-brain scenarios.",
        "audioFile": "audio/seg-04-02.mp3",
        "audioDurationSec": 9.51,
        "durationInFrames": 297,
        "fromFrameInScene": 300,
        "toFrameInScene": 597,
        "globalFromFrame": 4895,
        "globalToFrame": 5192
      },
      {
        "stepIndex": 2,
        "stepLabel": "The 5 Maps Inside the Cluster Map",
        "text": "Monitors do not touch user data. Instead, they maintain the master Cluster Map: a versioned bundle of the MON Map, OSD Map, PG Map, MDS Map, and CRUSH Map.",
        "audioFile": "audio/seg-04-03.mp3",
        "audioDurationSec": 11.18,
        "durationInFrames": 347,
        "fromFrameInScene": 597,
        "toFrameInScene": 944,
        "globalFromFrame": 5192,
        "globalToFrame": 5539
      },
      {
        "stepIndex": 3,
        "stepLabel": "Epoch Updates on Failure",
        "text": "When OSD.4 goes down and peers report it unreachable, the MONs increment the map Epoch\u2014say from e104 to e105\u2014marking OSD.4 as DOWN and OUT.",
        "audioFile": "audio/seg-04-04.mp3",
        "audioDurationSec": 11.73,
        "durationInFrames": 364,
        "fromFrameInScene": 944,
        "toFrameInScene": 1308,
        "globalFromFrame": 5539,
        "globalToFrame": 5903
      },
      {
        "stepIndex": 4,
        "stepLabel": "Lightweight Map Broadcast",
        "text": "Incremental map deltas propagate rapidly to all OSDs and connected clients, so every participant always computes against the same cluster topology.",
        "audioFile": "audio/seg-04-05.mp3",
        "audioDurationSec": 9.8,
        "durationInFrames": 306,
        "fromFrameInScene": 1308,
        "toFrameInScene": 1614,
        "globalFromFrame": 5903,
        "globalToFrame": 6209
      }
    ]
  },
  {
    "id": 5,
    "shortTitle": "MDS for CephFS",
    "title": "5. Metadata Servers (MDS) \u2014 Powering CephFS",
    "formula": "POSIX Path (/data/proj/run.py)  \u2192  MDS Inode + Capabilities  (Zero File Data in MDS)",
    "fromFrame": 6209,
    "durationInFrames": 1751,
    "toFrame": 7960,
    "segments": [
      {
        "stepIndex": 0,
        "stepLabel": "Why CephFS Needs an MDS",
        "text": "RADOS stores flat objects, not hierarchical folders. To offer a POSIX filesystem like /home/alice/report.pdf, CephFS introduces the Metadata Server: ceph-mds.",
        "audioFile": "audio/seg-05-01.mp3",
        "audioDurationSec": 14.81,
        "durationInFrames": 456,
        "fromFrameInScene": 0,
        "toFrameInScene": 456,
        "globalFromFrame": 6209,
        "globalToFrame": 6665
      },
      {
        "stepIndex": 1,
        "stepLabel": "Inodes, Dentries & Capabilities",
        "text": "The MDS manages the directory tree, filenames (dentries), permissions, file sizes, and client locks called Capabilities (Caps) inside a fast RAM cache.",
        "audioFile": "audio/seg-05-02.mp3",
        "audioDurationSec": 11.28,
        "durationInFrames": 351,
        "fromFrameInScene": 456,
        "toFrameInScene": 807,
        "globalFromFrame": 6665,
        "globalToFrame": 7016
      },
      {
        "stepIndex": 2,
        "stepLabel": "Crucial Rule: MDS Never Holds File Data",
        "text": "Here is the key architectural insight: the MDS never stores or routes actual file contents. Even its own metadata journal is persisted inside a RADOS metadata pool!",
        "audioFile": "audio/seg-05-03.mp3",
        "audioDurationSec": 10.63,
        "durationInFrames": 331,
        "fromFrameInScene": 807,
        "toFrameInScene": 1138,
        "globalFromFrame": 7016,
        "globalToFrame": 7347
      },
      {
        "stepIndex": 3,
        "stepLabel": "Dynamic Subtree Partitioning",
        "text": "When metadata traffic spikes on a hot directory, active-active MDS daemons dynamically partition the directory tree and migrate hot subtrees to balance load.",
        "audioFile": "audio/seg-05-04.mp3",
        "audioDurationSec": 10.21,
        "durationInFrames": 318,
        "fromFrameInScene": 1138,
        "toFrameInScene": 1456,
        "globalFromFrame": 7347,
        "globalToFrame": 7665
      },
      {
        "stepIndex": 4,
        "stepLabel": "Active + Standby-Replay HA",
        "text": "Standby-Replay MDS nodes continuously follow the active journal in RADOS, enabling sub-second failover if an active MDS daemon crashes.",
        "audioFile": "audio/seg-05-05.mp3",
        "audioDurationSec": 9.43,
        "durationInFrames": 295,
        "fromFrameInScene": 1456,
        "toFrameInScene": 1751,
        "globalFromFrame": 7665,
        "globalToFrame": 7960
      }
    ]
  },
  {
    "id": 6,
    "shortTitle": "CRUSH Algorithm",
    "title": "6. CRUSH \u2014 Algorithmic Placement Without Lookup Tables",
    "formula": "CRUSH(PG_ID, ClusterMap, Rule)  \u2192  [ OSD.2, OSD.7, OSD.10 ]",
    "fromFrame": 7960,
    "durationInFrames": 1721,
    "toFrame": 9681,
    "segments": [
      {
        "stepIndex": 0,
        "stepLabel": "No Central Lookup Table",
        "text": "Traditional storage systems look up every block in a central location table\u2014a massive bottleneck. Ceph eliminates lookups entirely with the CRUSH algorithm.",
        "audioFile": "audio/seg-06-01.mp3",
        "audioDurationSec": 9.43,
        "durationInFrames": 295,
        "fromFrameInScene": 0,
        "toFrameInScene": 295,
        "globalFromFrame": 7960,
        "globalToFrame": 8255
      },
      {
        "stepIndex": 1,
        "stepLabel": "Controlled, Scalable, Decentralized",
        "text": "CRUSH stands for Controlled Replication Under Scalable Hashing. It is a deterministic pseudo-random function: given the same inputs, any node computes the exact same OSDs.",
        "audioFile": "audio/seg-06-02.mp3",
        "audioDurationSec": 10.71,
        "durationInFrames": 333,
        "fromFrameInScene": 295,
        "toFrameInScene": 628,
        "globalFromFrame": 8255,
        "globalToFrame": 8588
      },
      {
        "stepIndex": 2,
        "stepLabel": "The CRUSH Hierarchy Tree",
        "text": "CRUSH models your physical topology as a weighted tree: Root \u2192 Racks \u2192 Hosts \u2192 OSDs, where disk capacities determine bucket weights.",
        "audioFile": "audio/seg-06-03.mp3",
        "audioDurationSec": 9.38,
        "durationInFrames": 293,
        "fromFrameInScene": 628,
        "toFrameInScene": 921,
        "globalFromFrame": 8588,
        "globalToFrame": 8881
      },
      {
        "stepIndex": 3,
        "stepLabel": "Failure-Domain Traversal",
        "text": "To place 3 replicas across failure domain Rack, CRUSH walks down from Root, selects 3 distinct Racks\u2014Rack A, Rack B, Rack C\u2014then picks one Host and one OSD in each.",
        "audioFile": "audio/seg-06-04.mp3",
        "audioDurationSec": 12.38,
        "durationInFrames": 383,
        "fromFrameInScene": 921,
        "toFrameInScene": 1304,
        "globalFromFrame": 8881,
        "globalToFrame": 9264
      },
      {
        "stepIndex": 4,
        "stepLabel": "Deterministic & Fault Resilient",
        "text": "Because placement is calculated rather than looked up, clients and OSDs independently compute [OSD.2, OSD.7, OSD.10] in microseconds\u2014and survive whole-rack power loss.",
        "audioFile": "audio/seg-06-05.mp3",
        "audioDurationSec": 13.51,
        "durationInFrames": 417,
        "fromFrameInScene": 1304,
        "toFrameInScene": 1721,
        "globalFromFrame": 9264,
        "globalToFrame": 9681
      }
    ]
  },
  {
    "id": 7,
    "shortTitle": "Pools & PGs",
    "title": "7. Pools & Placement Groups (PGs) \u2014 The Indirection Layer",
    "formula": "Object  \u2500\u2500hash(OID) % N_pg\u2500\u2500\u25ba  PG 3.a7  \u2500\u2500CRUSH\u2500\u2500\u25ba  [ OSD.2, OSD.7, OSD.10 ]",
    "fromFrame": 9681,
    "durationInFrames": 1666,
    "toFrame": 11347,
    "segments": [
      {
        "stepIndex": 0,
        "stepLabel": "Logical Pools",
        "text": "Before objects reach CRUSH, Ceph organizes them into Logical Pools\u2014such as cephfs_data or cephfs_metadata\u2014each with its own replication or erasure coding policy.",
        "audioFile": "audio/seg-07-01.mp3",
        "audioDurationSec": 12.36,
        "durationInFrames": 383,
        "fromFrameInScene": 0,
        "toFrameInScene": 383,
        "globalFromFrame": 9681,
        "globalToFrame": 10064
      },
      {
        "stepIndex": 1,
        "stepLabel": "Why Not Track Millions of Objects Directly?",
        "text": "If a pool holds 100 million objects, tracking replication state and recovery per-object would overwhelm memory and CPU across the cluster.",
        "audioFile": "audio/seg-07-02.mp3",
        "audioDurationSec": 8.72,
        "durationInFrames": 274,
        "fromFrameInScene": 383,
        "toFrameInScene": 657,
        "globalFromFrame": 10064,
        "globalToFrame": 10338
      },
      {
        "stepIndex": 2,
        "stepLabel": "Placement Groups (PGs) as Buckets",
        "text": "Placement Groups (PGs) solve this. A pool is divided into a fixed number of PGs\u2014for example, 128 or 512 buckets. Millions of objects hash into those PGs.",
        "audioFile": "audio/seg-07-03.mp3",
        "audioDurationSec": 11.36,
        "durationInFrames": 353,
        "fromFrameInScene": 657,
        "toFrameInScene": 1010,
        "globalFromFrame": 10338,
        "globalToFrame": 10691
      },
      {
        "stepIndex": 3,
        "stepLabel": "Two-Step Mapping Pipeline",
        "text": "First: Ceph hashes the Object ID modulo the pool PG count to pick a PG (like PG 3.a7). Second: CRUSH maps PG 3.a7 to an Acting Set of OSDs.",
        "audioFile": "audio/seg-07-04.mp3",
        "audioDurationSec": 11.94,
        "durationInFrames": 370,
        "fromFrameInScene": 1010,
        "toFrameInScene": 1380,
        "globalFromFrame": 10691,
        "globalToFrame": 11061
      },
      {
        "stepIndex": 4,
        "stepLabel": "PGs Are the Unit of Peering & Recovery",
        "text": "When a disk fails or a new host joins, Ceph rebalances whole Placement Groups rather than individual objects\u2014making petabyte recovery fast and predictable.",
        "audioFile": "audio/seg-07-05.mp3",
        "audioDurationSec": 9.14,
        "durationInFrames": 286,
        "fromFrameInScene": 1380,
        "toFrameInScene": 1666,
        "globalFromFrame": 11061,
        "globalToFrame": 11347
      }
    ]
  },
  {
    "id": 8,
    "shortTitle": "Direct Data Path",
    "title": "8. Putting It All Together \u2014 Client Direct-to-OSD Data Flow",
    "formula": "Metadata via MDS (Once)   \u2016   Data Striping Direct to OSDs (Parallel)",
    "fromFrame": 11347,
    "durationInFrames": 1586,
    "toFrame": 12933,
    "segments": [
      {
        "stepIndex": 0,
        "stepLabel": "Step 1: Contact MON for Cluster Map",
        "text": "Let us trace a CephFS client reading and writing /dataset/train.bin. At mount time, the client fetches the latest Cluster Map and CRUSH Map from a Monitor.",
        "audioFile": "audio/seg-08-01.mp3",
        "audioDurationSec": 9.04,
        "durationInFrames": 283,
        "fromFrameInScene": 0,
        "toFrameInScene": 283,
        "globalFromFrame": 11347,
        "globalToFrame": 11630
      },
      {
        "stepIndex": 1,
        "stepLabel": "Step 2: Resolve Path & Capabilities via MDS",
        "text": "When the app opens /dataset/train.bin, the client asks the MDS for the path inode number (say 100001a), stripe layout, and read/write Capabilities.",
        "audioFile": "audio/seg-08-02.mp3",
        "audioDurationSec": 10.89,
        "durationInFrames": 339,
        "fromFrameInScene": 283,
        "toFrameInScene": 622,
        "globalFromFrame": 11630,
        "globalToFrame": 11969
      },
      {
        "stepIndex": 2,
        "stepLabel": "Step 3: Local Hash + CRUSH Calculation",
        "text": "Now the MDS steps out of the way! The client slices the file into 4 MB objects (100001a.00000000, .00000001...) and runs CRUSH locally in its own CPU.",
        "audioFile": "audio/seg-08-03.mp3",
        "audioDurationSec": 11.23,
        "durationInFrames": 349,
        "fromFrameInScene": 622,
        "toFrameInScene": 971,
        "globalFromFrame": 11969,
        "globalToFrame": 12318
      },
      {
        "stepIndex": 3,
        "stepLabel": "Step 4: Direct Parallel I/O to OSDs",
        "text": "The client opens direct TCP streams to the Primary OSDs across the cluster, reading and writing 4 MB object stripes in parallel at full network bandwidth.",
        "audioFile": "audio/seg-08-04.mp3",
        "audioDurationSec": 10.11,
        "durationInFrames": 315,
        "fromFrameInScene": 971,
        "toFrameInScene": 1286,
        "globalFromFrame": 12318,
        "globalToFrame": 12633
      },
      {
        "stepIndex": 4,
        "stepLabel": "Summary: Why Ceph Scales Linearly",
        "text": "Because metadata is separated from data and placement is computed via CRUSH, adding more OSD hosts linearly scales both capacity and aggregate throughput.",
        "audioFile": "audio/seg-08-05.mp3",
        "audioDurationSec": 9.61,
        "durationInFrames": 300,
        "fromFrameInScene": 1286,
        "toFrameInScene": 1586,
        "globalFromFrame": 12633,
        "globalToFrame": 12933
      }
    ]
  }
];
