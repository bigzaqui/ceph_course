import { makeScene2D, Camera, Rect, Line, Txt, Node } from '@motion-canvas/2d';
import { all, createRef, createSignal, easeInOutCubic, easeOutBack } from '@motion-canvas/core';

export default makeScene2D(function* (view) {
  const filestoreLatency = createSignal(0);
  const bluestoreLatency = createSignal(0);
  const bluestoreReveal = createSignal(0);

  // Step 3.1 - 3.2: OSD Hardware Anatomy & Legacy FileStore Double-Write Penalty
  yield* filestoreLatency(2.0, 9.0, easeInOutCubic);

  // Step 3.3 - 3.5: BlueStore Direct Raw Block I/O + RocksDB/BlueFS WAL
  yield* all(
    bluestoreReveal(1, 1.2, easeOutBack),
    bluestoreLatency(0.9, 8.0, easeInOutCubic),
  );
});
