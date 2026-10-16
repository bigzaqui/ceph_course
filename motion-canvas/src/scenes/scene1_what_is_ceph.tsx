import { makeScene2D, Camera, Circle, Rect, Line, Txt, Node } from '@motion-canvas/2d';
import { all, chain, createRef, createSignal, easeInOutCubic, easeOutBack, tween, waitFor } from '@motion-canvas/core';

export default makeScene2D(function* (view) {
  const camera = createRef<Camera>();
  const siloGroup = createRef<Node>();
  const ringGroup = createRef<Node>();
  const stackGroup = createRef<Node>();
  const ringRotation = createSignal(0);
  const siloFill = createSignal(0.35);

  view.add(
    <Camera ref={camera}>
      <Node ref={siloGroup} x={-520} opacity={0}>
        {/* Legacy SAN / NAS / Object Silos */}
      </Node>
      <Node ref={ringGroup} x={320} rotation={() => ringRotation()} scale={0.85} opacity={0}>
        {/* 12-OSD Unified RADOS Torus Ring */}
      </Node>
      <Node ref={stackGroup} opacity={0} y={80}>
        {/* librados -> RGW / RBD / CephFS */}
      </Node>
    </Camera>,
  );

  // Step 1.1: Reveal storage silos & animate capacity saturation to 99% FULL
  yield* all(
    siloGroup().opacity(1, 0.9, easeOutBack),
    siloFill(0.99, 6.5, easeInOutCubic),
  );

  // Step 1.2: Morph camera focus to Unified 12-OSD RADOS Ring
  yield* all(
    siloGroup().opacity(0.25, 1.0),
    ringGroup().opacity(1, 1.1, easeOutBack),
    ringGroup().scale(1, 1.1, easeOutBack),
    tween(11.0, v => ringRotation(v * 180)),
  );

  // Steps 1.3 - 1.5: Transition to Unified Protocol Stack (RGW, RBD, CephFS)
  yield* all(
    siloGroup().opacity(0, 0.8),
    ringGroup().scale(0.45, 1.0, easeInOutCubic),
    ringGroup().position([0, 260], 1.0, easeInOutCubic),
    stackGroup().opacity(1, 1.0, easeOutBack),
    stackGroup().y(0, 1.0, easeOutBack),
  );
  yield* waitFor(25);
});
