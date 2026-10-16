import { makeScene2D, Camera, Circle, Rect, Line, Txt } from '@motion-canvas/2d';
import { all, createSignal, easeInOutCubic, easeOutBack } from '@motion-canvas/core';

export default makeScene2D(function* (view) {
  const funnelProgress = createSignal(0);
  const ecReveal = createSignal(0);

  // Step 7.1 - 7.3: 10,000,000 Objects -> Hash Funnel -> 128 Placement Groups
  yield* funnelProgress(1, 16.0, easeInOutCubic);

  // Step 7.4 - 7.5: Replicated Pool (3x) vs Erasure Coded Pool (k=4, m=2)
  yield* ecReveal(1, 4.0, easeOutBack);
});
