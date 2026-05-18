import { useEffect, useDeferredValue, useMemo, useState } from 'react';
import type { Grid } from '../shape';
import { emptyGrid, generateVariants, resizeGrid } from '../shape';
import {
  findSelfClusters,
  type SelfClustersResult,
  SELF_CLUSTER_MIN_N,
  SELF_CLUSTER_MAX_N,
} from '../selfFit';
import { tileRegion } from '../tile';
import type { Variant } from '../shape';
import { useSplits } from '../hooks/useSplits';
import { useSelfClusters } from '../hooks/useSelfClusters';
import { DrawableGrid } from './DrawableGrid';
import { VariantView } from './VariantView';
import { SplitView } from './SplitView';
import { SelfClusterView } from './SelfClusterView';
import { TilingView } from './TilingView';

/** Stable empty values reused while the Helper tab is hidden so identity-based
 *  memoization downstream stays cheap. */
const EMPTY_VARIANTS: Variant[] = [];

type HelperPanelProps = {
  active: boolean;
  pieceSize: number;
  setPieceSize: (n: number) => void;
  pieceGrid: Grid;
  setPieceGrid: React.Dispatch<React.SetStateAction<Grid>>;
  boardSize: number;
  setBoardSize: (n: number) => void;
  boardGrid: Grid;
  setBoardGrid: React.Dispatch<React.SetStateAction<Grid>>;
  pieceMin: number;
  pieceMax: number;
  boardMin: number;
  boardMax: number;
};

export function HelperPanel({
  active,
  pieceSize,
  setPieceSize,
  pieceGrid,
  setPieceGrid,
  boardSize,
  setBoardSize,
  boardGrid,
  setBoardGrid,
  pieceMin,
  pieceMax,
  boardMin,
  boardMax,
}: HelperPanelProps) {
  const handleSizeChange = (n: number) => {
    const clamped = Math.max(pieceMin, Math.min(pieceMax, n));
    setPieceSize(clamped);
    setPieceGrid((prev) => resizeGrid(prev, clamped));
  };
  const clear = () => setPieceGrid(emptyGrid(pieceSize));

  const handleBoardSizeChange = (n: number) => {
    const clamped = Math.max(boardMin, Math.min(boardMax, n));
    setBoardSize(clamped);
    setBoardGrid((prev) => resizeGrid(prev, clamped));
  };
  const clearBoard = () => setBoardGrid(emptyGrid(boardSize));

  // Defer heavy analyses so dragging to paint stays fluid.
  const deferredPiece = useDeferredValue(pieceGrid);
  const deferredBoard = useDeferredValue(boardGrid);

  const [tilingOpen, setTilingOpen] = useState(false);
  const tiling = useMemo(
    () => (active && tilingOpen ? tileRegion(deferredBoard, deferredPiece) : null),
    [active, tilingOpen, deferredBoard, deferredPiece],
  );

  const variants = useMemo(
    () => (active ? generateVariants(pieceGrid) : EMPTY_VARIANTS),
    [active, pieceGrid],
  );

  // Self-fit / N-copy clusters: a single unified section. N=2 runs on the
  // main thread (cheap, instant feedback while drawing); N≥3 goes through a
  // worker since the search grows like P^(N-1).
  const [clusterN, setClusterN] = useState<number>(2);
  const [rectanglesOnly, setRectanglesOnly] = useState(false);

  const syncClusters = useMemo(
    () => (active && clusterN === 2 ? findSelfClusters(deferredPiece, 2) : null),
    [active, clusterN, deferredPiece],
  );
  // The worker hook accepts a fallback N when we're on the sync path so we
  // don't accidentally request N=2 from the worker.
  const { result: workerClusters, pending: workerPending } = useSelfClusters(
    active && clusterN >= 3 ? pieceGrid : null,
    clusterN >= 3 ? clusterN : 3,
  );

  const clustersResult: SelfClustersResult | null =
    clusterN === 2 ? syncClusters : workerClusters;
  const clustersPending = clusterN >= 3 && workerPending;

  const { result: splitsResult, pending: splitsPending } = useSplits(active ? pieceGrid : null);

  const [showAllSplits, setShowAllSplits] = useState(false);
  const SELF_FIT_TIERS_DEFAULT = 3;
  const [clusterTiers, setClusterTiers] = useState(SELF_FIT_TIERS_DEFAULT);

  // Reset the "show top X tiers" slider whenever the drawn shape or N
  // changes — otherwise the user can get stuck on a narrow tier from a
  // previous shape.
  useEffect(() => {
    setClusterTiers(SELF_FIT_TIERS_DEFAULT);
  }, [deferredPiece, clusterN]);

  // Apply the "rectangles only" filter first, then derive tiers from the
  // filtered set so the tier slider stays meaningful when filtering is on.
  const clustersAll = clustersResult?.clusters ?? [];
  const clustersFilteredByRect = useMemo(
    () => (rectanglesOnly ? clustersAll.filter((c) => c.isRectangle) : clustersAll),
    [clustersAll, rectanglesOnly],
  );
  const clusterDistinctTiers = useMemo(
    () =>
      Array.from(new Set(clustersFilteredByRect.map((c) => c.contactEdges))).sort(
        (a, b) => b - a,
      ),
    [clustersFilteredByRect],
  );
  const effectiveClusterTiers = Math.min(
    clusterTiers,
    Math.max(1, clusterDistinctTiers.length),
  );
  const clusterCutoff = clusterDistinctTiers[effectiveClusterTiers - 1] ?? -Infinity;
  const displayedClusters = useMemo(
    () => clustersFilteredByRect.filter((c) => c.contactEdges >= clusterCutoff),
    [clustersFilteredByRect, clusterCutoff],
  );
  const rectangleCount = useMemo(
    () => clustersAll.filter((c) => c.isRectangle).length,
    [clustersAll],
  );

  // A piece of one cell isn't a useful tiling answer, so hide those.
  const meaningfulSplits = useMemo(
    () => (splitsResult?.splits ?? []).filter((s) => Math.min(s.a.length, s.b.length) >= 2),
    [splitsResult],
  );
  const displayedSplits = useMemo(
    () => (showAllSplits ? meaningfulSplits : meaningfulSplits.filter((s) => s.congruent)),
    [meaningfulSplits, showAllSplits],
  );

  return (
    <>
      <section className="controls">
        <label>
          Grid size:{' '}
          <strong className="size-readout" aria-live="polite">
            {pieceSize}×{pieceSize}
          </strong>
          <input
            type="range"
            min={pieceMin}
            max={pieceMax}
            value={pieceSize}
            aria-valuetext={`${pieceSize} by ${pieceSize}`}
            onChange={(e) => handleSizeChange(Number(e.target.value))}
          />
        </label>
        <button onClick={clear} type="button">
          Clear
        </button>
      </section>

      <section className="draw-area" aria-labelledby="draw-heading">
        <h2 id="draw-heading">Draw your shape</h2>
        <p className="hint">
          Click or drag to fill/erase cells. Tab to enter the grid, arrow keys to move, Space or Enter to toggle.
        </p>
        <DrawableGrid grid={pieceGrid} setGrid={setPieceGrid} ariaLabelledBy="draw-heading" keyboardNav />
      </section>

      <section className="tiling" aria-labelledby="tiling-heading">
        <details onToggle={(e) => setTilingOpen((e.currentTarget as HTMLDetailsElement).open)}>
          <summary>
            <h2 id="tiling-heading">Tile a board with this piece</h2>
            <span className="hint cheating-tag">
              Finds one full tiling of a board you draw using the piece above
            </span>
          </summary>
          <p className="hint">
            Draw a board below and we'll try to tile every filled cell of it using only rotated and flipped copies of
            the piece you drew above. Each placement gets its own color.
          </p>

          <div className="piece-controls">
            <label>
              Board grid:{' '}
              <strong className="size-readout" aria-live="polite">
                {boardSize}×{boardSize}
              </strong>
              <input
                type="range"
                min={boardMin}
                max={boardMax}
                value={boardSize}
                aria-valuetext={`${boardSize} by ${boardSize}`}
                onChange={(e) => handleBoardSizeChange(Number(e.target.value))}
              />
            </label>
            <button onClick={clearBoard} type="button">
              Clear board
            </button>
          </div>

          <div className="piece-and-result">
            <div>
              <h3 className="piece-heading">Board</h3>
              <DrawableGrid
                grid={boardGrid}
                setGrid={setBoardGrid}
                ariaLabel={`Piece, ${boardSize} by ${boardSize}`}
                className="piece-grid"
                cellVar="--piece-cell-size"
              />
            </div>
            <div className="tiling-result">
              <h3 className="piece-heading">Tiling</h3>
              <TilingView grid={boardGrid} tiling={tiling} />
            </div>
          </div>
        </details>
      </section>

      <section className="variants">
        <h2>Variants ({variants.length})</h2>
        {variants.length === 0 ? (
          <p className="hint">Draw a shape to see its rotations and flips.</p>
        ) : (
          <div className="variant-list">
            {variants.map((v) => (
              <VariantView key={v.key} label={v.label} grid={v.grid} />
            ))}
          </div>
        )}
      </section>

      <section className="self-fits" aria-labelledby="self-fits-heading" aria-busy={clustersPending}>
        <h2 id="self-fits-heading">
          Fits with itself{' '}
          {clustersResult && !clustersResult.empty && !clustersResult.disconnected && !clustersResult.tooLarge
            ? `(${clustersResult.clusters.length}${clustersResult.aborted ? '+' : ''}${rectangleCount > 0 ? `, ${rectangleCount} rectangle${rectangleCount === 1 ? '' : 's'}` : ''})`
            : null}
        </h2>
        <p className="hint">
          Every way {clusterN === 2 ? 'a single rotated or flipped copy' : `${clusterN - 1} more rotated or flipped copies`} of the drawn shape can sit snugly against the original
          {clusterN >= 3 ? ' to form an N-piece cluster' : ''} (each copy shares ≥ 2 edges with what's already
          there, no overlaps). Original in red, copies in blue{clusterN >= 3 ? ', green' : ''}
          {clusterN >= 4 ? ', gold' : ''}. Clusters whose union exactly fills a rectangle are flagged.
        </p>
        <div className="splits-controls">
          <label>
            Copies (N): <strong aria-live="polite">{clusterN}</strong>{' '}
            <input
              type="range"
              min={SELF_CLUSTER_MIN_N}
              max={SELF_CLUSTER_MAX_N}
              value={clusterN}
              aria-valuetext={`${clusterN} copies`}
              onChange={(e) => setClusterN(Number(e.target.value))}
            />
          </label>{' '}
          <label>
            <input
              type="checkbox"
              checked={rectanglesOnly}
              onChange={(e) => setRectanglesOnly(e.target.checked)}
            />{' '}
            Rectangles only
          </label>
        </div>
        {clusterDistinctTiers.length > 1 ? (
          <div className="splits-controls">
            <label>
              Show top <strong aria-live="polite">{effectiveClusterTiers}</strong> of{' '}
              {clusterDistinctTiers.length} shared-edge tier
              {clusterDistinctTiers.length === 1 ? '' : 's'}{' '}
              <input
                type="range"
                min={1}
                max={clusterDistinctTiers.length}
                value={effectiveClusterTiers}
                aria-valuetext={`Top ${effectiveClusterTiers} of ${clusterDistinctTiers.length} tiers (≥ ${clusterCutoff} shared edges)`}
                onChange={(e) => setClusterTiers(Number(e.target.value))}
              />{' '}
              <span className="dims">
                ({displayedClusters.length} of {clustersFilteredByRect.length} shown, ≥ {clusterCutoff} edge
                {clusterCutoff === 1 ? '' : 's'})
              </span>
            </label>
          </div>
        ) : null}
        {clustersPending ? (
          <p className="hint" role="status">
            Computing {clusterN}-copy clusters…
          </p>
        ) : !clustersResult || clustersResult.empty ? (
          <p className="hint">Draw a shape to explore self-fitting placements.</p>
        ) : clustersResult.disconnected ? (
          <p className="hint">Self-fit analysis only works on a single connected shape.</p>
        ) : clustersResult.tooLarge ? (
          <p className="hint">
            Shape has {clustersResult.totalCells} cells — {clusterN}-copy analysis is capped at{' '}
            {clustersResult.maxCells} cells to keep the browser responsive.
          </p>
        ) : clustersResult.clusters.length === 0 ? (
          <p className="hint">
            {clusterN === 2
              ? 'This shape cannot fit snugly against a rotated or flipped copy of itself.'
              : `No ${clusterN}-copy cluster found where each new copy shares ≥ 2 edges with the others.`}
          </p>
        ) : displayedClusters.length === 0 ? (
          <p className="hint">
            {rectanglesOnly
              ? `No rectangular ${clusterN}-copy cluster found. Uncheck "Rectangles only" to see other arrangements.`
              : 'No clusters match the current filter.'}
          </p>
        ) : (
          <>
            {clustersResult.aborted ? (
              <p className="hint">
                Search hit its iteration budget — there may be more clusters than shown.
              </p>
            ) : null}
            <div className="split-list">
              {displayedClusters.map((c, i) => (
                <SelfClusterView
                  key={`${i}-${c.contactEdges}-${c.pieces.map((p) => p.label).join('|')}`}
                  cluster={c}
                />
              ))}
            </div>
          </>
        )}
      </section>

      <section className="splits" aria-labelledby="splits-heading" aria-busy={splitsPending}>
        <h2 id="splits-heading">
          Two shapes that tile into this one{' '}
          {splitsResult && !splitsResult.tooLarge && !splitsResult.disconnected && splitsResult.totalCells >= 4
            ? `(${displayedSplits.length}${splitsResult.aborted ? '+' : ''})`
            : null}
        </h2>
        <p className="hint">
          Two shapes that, placed together (with rotations or flips), exactly fill the drawn shape. The two copies
          are shown in red and blue.
        </p>
        <div className="splits-controls">
          <label>
            <input
              type="checkbox"
              checked={showAllSplits}
              onChange={(e) => setShowAllSplits(e.target.checked)}
            />{' '}
            Also show non-matching 2-piece cuts (the two pieces are different shapes)
          </label>
        </div>
        {splitsPending ? (
          <p className="hint" role="status">
            Computing tilings…
          </p>
        ) : !splitsResult ? (
          <p className="hint">Draw a shape with at least 4 cells to see tilings.</p>
        ) : splitsResult.tooLarge ? (
          <p className="hint">
            Shape has {splitsResult.totalCells} cells — tiling analysis is capped at {splitsResult.maxCells} cells to
            keep the browser responsive.
          </p>
        ) : splitsResult.disconnected ? (
          <p className="hint">Tiling analysis only works on a single connected shape.</p>
        ) : splitsResult.totalCells < 4 ? (
          <p className="hint">Draw a shape with at least 4 cells to see tilings.</p>
        ) : displayedSplits.length === 0 ? (
          splitsResult.aborted ? (
            <p className="hint">
              Search hit its iteration budget before finding a tiling. The shape may still have one.
            </p>
          ) : (
            <p className="hint">
              {showAllSplits
                ? 'No 2-piece cuts found.'
                : 'No single piece tiles this shape twice. Try the option above to see uneven 2-piece cuts.'}
            </p>
          )
        ) : (
          <>
            {splitsResult.aborted ? (
              <p className="hint">
                Showing partial results — the search hit its iteration budget before exploring every possibility.
              </p>
            ) : null}
            <div className="split-list">
              {displayedSplits.map((s, i) => (
                <SplitView key={`${s.a.length}-${s.b.length}-${s.congruent ? 'c' : 'u'}-${i}`} split={s} />
              ))}
            </div>
          </>
        )}
      </section>
    </>
  );
}
