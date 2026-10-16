import { makeScene2D, Camera, Circle, Rect, Line, Txt, Node } from '@motion-canvas/2d';
import { all, createRef, createSignal, easeInOutCubic, easeOutBack, waitFor } from '@motion-canvas/core';

export default makeScene2D(function* (view) {
  const camera = createRef<Camera>();
  const laserX = createSignal(-680);
  const splitGap = createSignal(0);
  const blueprintOpacity = createSignal(0);
  const scrubBeamY = createSignal(-220);
  const healed = createSignal(0);

  view.add(<Camera ref={camera} />);

  // Step 2.1 - 2.2: 16 MB File Laser Slicer into 4x 4 MB RADOS Objects
  yield* all(
    laserX(680, 5.5, easeInOutCubic),
    splitGap(28, 4.0, easeOutBack),
  );

  // Step 2.3 - 2.4: Explode 3-Layer Object Blueprint (Payload + xattrs + OMAP) & Replication
  yield* all(
    camera().zoom(1.08, 1.2, easeInOutCubic),
    blueprintOpacity(1, 1.0, easeOutBack),
  );
  yield* waitFor(18);

  // Step 2.5: Deep Scrubbing Laser catches 0xDEAD bit-rot & heals from Primary OSD.4
  yield* scrubBeamY(220, 4.5, easeInOutCubic);
  yield* healed(1, 1.2, easeOutBack);
});
