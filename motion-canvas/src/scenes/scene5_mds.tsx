import { makeScene2D, Camera, Circle, Rect, Line, Txt } from '@motion-canvas/2d';
import { all, createSignal, easeInOutCubic, easeOutBack } from '@motion-canvas/core';

export default makeScene2D(function* (view) {
  const mds0Load = createSignal(0.45);
  const mds1Load = createSignal(0.18);
  const subtreeShift = createSignal(0);

  // Step 5.1 - 5.3: POSIX Inode Tree & Capability Tokens (Fc, Fw, Fb)
  yield* mds0Load(0.94, 12.0, easeInOutCubic);

  // Step 5.4 - 5.5: Dynamic Subtree Partitioning (mds.0 migrates /project/build to mds.1)
  yield* all(
    subtreeShift(1, 3.5, easeInOutCubic),
    mds0Load(0.51, 3.5, easeInOutCubic),
    mds1Load(0.46, 3.5, easeOutBack),
  );
});
