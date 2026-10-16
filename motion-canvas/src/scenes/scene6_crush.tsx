import { makeScene2D, Camera, Circle, Rect, Line, Txt } from '@motion-canvas/2d';
import { all, createSignal, easeInOutCubic, easeOutBack } from '@motion-canvas/core';

export default makeScene2D(function* (view) {
  const treeWalkDepth = createSignal(0);
  const rackBOffline = createSignal(0);
  const rerouteArc = createSignal(0);

  // Step 6.1 - 6.4: Deterministic CRUSH Tree Walk (root -> rack -> host -> osd [1, 5, 9])
  yield* treeWalkDepth(3, 18.0, easeInOutCubic);

  // Step 6.5: Rack B Power Outage -> Epoch e106 Re-routes only r=2 to osd.8
  yield* rackBOffline(1, 1.0, easeOutBack);
  yield* rerouteArc(1, 3.5, easeInOutCubic);
});
