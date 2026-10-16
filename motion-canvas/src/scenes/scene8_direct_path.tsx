import { makeScene2D, Camera, Circle, Rect, Line, Txt } from '@motion-canvas/2d';
import { all, createSignal, easeInOutCubic, easeOutBack } from '@motion-canvas/core';

export default makeScene2D(function* (view) {
  const dataStreams = createSignal(0);
  const throughputCurve = createSignal(0);

  // Step 8.1 - 8.3: 1.5% MDS Metadata Handshake vs 98.5% Direct Client-to-OSD Striping
  yield* dataStreams(1, 18.0, easeInOutCubic);

  // Step 8.4 - 8.5: 3Blue1Brown O(N) Linear Throughput Scaling Graph (120 GB/s at 1,000 OSDs)
  yield* throughputCurve(1, 12.0, easeOutBack);
});
