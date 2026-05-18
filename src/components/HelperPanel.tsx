import { useEffect, useDeferredValue, useMemo, useState } from 'react';
import type { Grid } from '../shape';
import { emptyGrid, generateVariants, resizeGrid } from '../shape';
import { findSelfFits, type SelfFitResult } from '../selfFit';
import { tileRegion } from '../tile';
import type { Variant } from '../shape';
import { useSplits } from '../hooks/useSplits';
import { DrawableGrid } from './DrawableGrid';
import { VariantView } from './VariantView';
import { SplitView } from './SplitView';
import { SelfFitView } from './SelfFitView';
import { TilingView } from './TilingView';

/** Stable empty values reused while the Helper tab is hidden so identity-based
 *  memoization downstream stays cheap. */
const EMPTY_VARIANTS: Variant[] = [];
const EMPTY_SELF_FITS: SelfFitResult = {
  fits: [],
  totalCells: 0,
  disconnected: false,
  empty: true,
};

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
  const selfFits = useMemo(
    () => (active ? findSelfFits(deferredPiece) : EMPTY_SELF_FITS),
    [active, deferredPiece],
  );
  const { result: splitsResult, pending: splitsPending } = useSplits(active ? pieceGrid : null);

  const [showAllSplits, setShowAllSplits] = useState(false);
  const SELF_FIT_TIERS_DEFAULT = 3;
  const [selfFitTiers, setSelfFitTiers] = useState(SELF_FIT_TIERS_DEFAULT);

  // Reset the "show top X tiers" slider whenever the drawn shape changes, so
  // adding cells doesn't leave the user stuck on a narrow tier selection from
  // the previous shape.
  useEffect(() => {
    setSelfFitTiers(SELF_FIT_TIERS_DEFAULT);
  }, [deferredPiece]);

  const selfFitDistinctTiers = useMemo(
    () => Array.from(new Set(selfFits.fits.map((f) => f.contactEdges))).sort((a, b) => b - a),
    [selfFits],
  );
  const effectiveSelfFitTiers = Math.min(selfFitTiers, Math.max(1, selfFitDistinctTiers.length));
  const selfFitCutoff = selfFitDistinctTiers[effectiveSelfFitTiers - 1] ?? -Infinity;
  const displayedSelfFits = useMemo(
    () => selfFits.fits.filter((f) => f.contactEdges >= selfFitCutoff),
    [selfFits, selfFitCutoff],
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

      <section className="self-fits" aria-labelledby="self-fits-heading">
        <h2 id="self-fits-heading">
          Fits with itself{' '}
          {!selfFits.empty && !selfFits.disconnected ? `(${selfFits.fits.length})` : null}
        </h2>
        <p className="hint">
          Every way a single rotated or flipped copy of the drawn shape can sit snugly against the original (sharing
          at least two edges, no overlap). Original is shown in red, the placed copy in blue.
        </p>
        {selfFitDistinctTiers.length > 1 ? (
          <div className="splits-controls">
            <label>
              Show top <strong aria-live="polite">{effectiveSelfFitTiers}</strong> of{' '}
              {selfFitDistinctTiers.length} shared-edge tier{selfFitDistinctTiers.length === 1 ? '' : 's'}{' '}
              <input
                type="range"
                min={1}
                max={selfFitDistinctTiers.length}
                value={effectiveSelfFitTiers}
                aria-valuetext={`Top ${effectiveSelfFitTiers} of ${selfFitDistinctTiers.length} tiers (≥ ${selfFitCutoff} shared edges)`}
                onChange={(e) => setSelfFitTiers(Number(e.target.value))}
              />{' '}
              <span className="dims">
                ({displayedSelfFits.length} of {selfFits.fits.length} shown, ≥ {selfFitCutoff} edge
                {selfFitCutoff === 1 ? '' : 's'})
              </span>
            </label>
          </div>
        ) : null}
        {selfFits.empty ? (
          <p className="hint">Draw a shape to explore self-fitting placements.</p>
        ) : selfFits.disconnected ? (
          <p className="hint">Self-fit analysis only works on a single connected shape.</p>
        ) : selfFits.fits.length === 0 ? (
          <p className="hint">This shape cannot fit snugly against a rotated or flipped copy of itself.</p>
        ) : (
          <div className="split-list">
            {displayedSelfFits.map((f, i) => (
              <SelfFitView key={`${f.variantLabel}-${f.contactEdges}-${i}`} fit={f} />
            ))}
          </div>
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
