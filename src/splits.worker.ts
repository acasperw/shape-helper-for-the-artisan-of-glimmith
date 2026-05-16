/// <reference lib="webworker" />
import { findSplits, type SplitsResult } from './splits';
import type { Grid } from './shape';

export type SplitsRequest = {
  requestId: number;
  grid: Grid;
};

export type SplitsResponse = {
  requestId: number;
  result: SplitsResult;
  durationMs: number;
};

self.addEventListener('message', (e: MessageEvent<SplitsRequest>) => {
  const { requestId, grid } = e.data;
  const t0 = performance.now();
  const result = findSplits(grid);
  const durationMs = performance.now() - t0;
  const response: SplitsResponse = { requestId, result, durationMs };
  (self as unknown as Worker).postMessage(response);
});
