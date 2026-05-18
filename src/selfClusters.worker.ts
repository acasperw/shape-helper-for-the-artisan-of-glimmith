/// <reference lib="webworker" />
import { findSelfClusters, type SelfClustersResult } from './selfFit';
import type { Grid } from './shape';

export type SelfClustersRequest = {
  requestId: number;
  grid: Grid;
  n: number;
};

export type SelfClustersResponse = {
  requestId: number;
  result: SelfClustersResult;
  durationMs: number;
};

self.addEventListener('message', (e: MessageEvent<SelfClustersRequest>) => {
  const { requestId, grid, n } = e.data;
  const t0 = performance.now();
  const result = findSelfClusters(grid, n);
  const durationMs = performance.now() - t0;
  const response: SelfClustersResponse = { requestId, result, durationMs };
  (self as unknown as Worker).postMessage(response);
});
