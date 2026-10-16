import { makeScene2D, Camera, Circle, Rect, Line, Txt } from '@motion-canvas/2d';
import { all, createSignal, easeInOutCubic, easeOutBack } from '@motion-canvas/core';

export default makeScene2D(function* (view) {
  const epochDigit = createSignal(104);
  const partitionCut = createSignal(0);
  const deltaWave = createSignal(0);

  // Step 4.1 - 4.2: 3-Monitor Paxos Quorum Ring & Mechanical Odometer e104 -> e105
  yield* epochDigit(105, 4.5, easeInOutCubic);

  // Step 4.3 - 4.4: Split-Brain Partition Cut (mon.a + mon.b = 2/3 Quorum, mon.c fenced)
  yield* partitionCut(1, 3.0, easeOutBack);

  // Step 4.5: Incremental Epoch Delta (Δ e105) Gossip Fan-Out
  yield* deltaWave(1, 6.0, easeInOutCubic);
});
