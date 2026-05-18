import { useEffect, useRef, useState } from 'react';
import type { Grid } from '../shape';
import type { SplitsResult } from '../splits';
import type { SplitsRequest, SplitsResponse } from '../splits.worker';

/** Wait this long after the last edit before kicking off split analysis. */
const SPLITS_DEBOUNCE_MS = 400;

/**
 * Run split analysis in a Web Worker, debounced so we only kick off after the
 * user stops editing. Stale responses (from a grid that has since changed) are
 * dropped by comparing requestIds.
 */
export function useSplits(grid: Grid | null): { result: SplitsResult | null; pending: boolean } {
  const [result, setResult] = useState<SplitsResult | null>(null);
  const [pending, setPending] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const latestRequestIdRef = useRef(0);

  // Spin up the worker once.
  useEffect(() => {
    const worker = new Worker(new URL('../splits.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    worker.addEventListener('message', (e: MessageEvent<SplitsResponse>) => {
      // Drop responses for requests that have already been superseded.
      if (e.data.requestId !== latestRequestIdRef.current) return;
      setResult(e.data.result);
      setPending(false);
    });
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  // Debounce: schedule a worker request after the most recent grid edit.
  useEffect(() => {
    // `null` grid means the consumer is currently hidden (e.g. the Catalog tab
    // is active) — don't bother the worker.
    if (!grid) {
      requestIdRef.current++;
      latestRequestIdRef.current = requestIdRef.current;
      setPending(false);
      return;
    }
    // If the grid has no filled cells, short-circuit to an empty result.
    const hasAny = grid.some((row) => row.some(Boolean));
    if (!hasAny) {
      requestIdRef.current++;
      latestRequestIdRef.current = requestIdRef.current;
      setResult(null);
      setPending(false);
      return;
    }
    setPending(true);
    const timer = window.setTimeout(() => {
      const worker = workerRef.current;
      if (!worker) return;
      requestIdRef.current++;
      const requestId = requestIdRef.current;
      latestRequestIdRef.current = requestId;
      const req: SplitsRequest = { requestId, grid };
      worker.postMessage(req);
    }, SPLITS_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [grid]);

  return { result, pending };
}
