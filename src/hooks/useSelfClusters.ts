import { useEffect, useRef, useState } from 'react';
import type { Grid } from '../shape';
import type { SelfClustersResult } from '../selfFit';
import type { SelfClustersRequest, SelfClustersResponse } from '../selfClusters.worker';

/** Wait this long after the last edit before kicking off cluster analysis. */
const SELF_CLUSTERS_DEBOUNCE_MS = 300;

/**
 * Run the N-copy self-cluster search in a Web Worker, debounced so we only
 * fire after the user stops editing or changes N. Stale responses are
 * discarded by requestId.
 */
export function useSelfClusters(
  grid: Grid | null,
  n: number,
): { result: SelfClustersResult | null; pending: boolean } {
  const [result, setResult] = useState<SelfClustersResult | null>(null);
  const [pending, setPending] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const latestRequestIdRef = useRef(0);

  useEffect(() => {
    const worker = new Worker(new URL('../selfClusters.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    worker.addEventListener('message', (e: MessageEvent<SelfClustersResponse>) => {
      if (e.data.requestId !== latestRequestIdRef.current) return;
      setResult(e.data.result);
      setPending(false);
    });
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!grid) {
      requestIdRef.current++;
      latestRequestIdRef.current = requestIdRef.current;
      setPending(false);
      return;
    }
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
      const req: SelfClustersRequest = { requestId, grid, n };
      worker.postMessage(req);
    }, SELF_CLUSTERS_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [grid, n]);

  return { result, pending };
}
