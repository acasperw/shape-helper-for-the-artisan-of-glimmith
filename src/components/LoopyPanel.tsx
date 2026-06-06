import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { gridTemplateStyle } from '../utils/edgeStyle';
import {
  analyse,
  degreeAt,
  emptyWalls,
  getWall,
  isFrameH,
  isFrameV,
  resizeWalls,
  setWall,
  type EdgeKind,
  type Walls,
} from '../loopy';

const MIN_SIZE = 4;
const MAX_SIZE = 10;
const DEFAULT_SIZE = 6;

type Rule = 'loopy' | 'bricky';
type PaintMode = boolean | null;

const RULE_META: Record<Rule, { label: string; forbidden: number; junction: string }> = {
  loopy: { label: 'Loopy', forbidden: 3, junction: 'triple junction' },
  bricky: { label: 'Bricky', forbidden: 4, junction: 'crossing' },
};

/** Name a rule-breaking vertex by how many borders meet there. */
const junctionName = (degree: number) => (degree === 4 ? 'crossing' : 'triple junction');

/**
 * Carve a 1×1 notch out of the top-right corner of the boundary, so the board
 * reads as a non-rectangular shape while the boundary stays one closed loop
 * (every boundary vertex keeps two borders). Shows that the frame is editable.
 */
function carveCorner(w: Walls, size: number): Walls {
  const k = size - 1;
  // Open the two outer corner segments…
  w = setWall(w, 'h', 0, k, false); // top edge of the corner cell
  w = setWall(w, 'v', 0, size, false); // right edge of the corner cell
  // …and step the boundary inward around the removed cell.
  w = setWall(w, 'v', 0, k, true); // new vertical wall on the cell's left
  w = setWall(w, 'h', 1, k, true); // new horizontal wall on the cell's bottom
  return w;
}

/**
 * A clean closed loop: a notched (non-rectangular) boundary plus one internal
 * rectangle of borders. Every vertex has two borders, so it satisfies both
 * rules — a good "this is allowed" state.
 */
function makeValidExample(size: number): Walls {
  let w = carveCorner(emptyWalls(size), size);
  const r0 = 1;
  const c0 = 1;
  const r1 = Math.min(size - 1, 4);
  const c1 = Math.min(size - 1, 4);
  for (let c = c0; c < c1; c++) {
    w = setWall(w, 'h', r0, c, true);
    w = setWall(w, 'h', r1, c, true);
  }
  for (let r = r0; r < r1; r++) {
    w = setWall(w, 'v', r, c0, true);
    w = setWall(w, 'v', r, c1, true);
  }
  return w;
}

/**
 * The valid loop plus one stray border branching off the bottom edge. The
 * branch point becomes a triple junction (✕) and its far end a loose end —
 * exactly the mistake the Loopy rule warns about.
 */
function makeBrokenExample(size: number): Walls {
  let w = makeValidExample(size);
  const r1 = Math.min(size - 1, 4);
  const branchCol = 2;
  w = setWall(w, 'v', r1, branchCol, true);
  return w;
}

/**
 * Interactive explainer for the game's "Loopy" and "Bricky" rules. Both govern
 * how borders may meet at a point, and a single puzzle can enforce either or
 * both at once, so they live together here. Players draw borders on the grid
 * edges; the panel marks every vertex that breaks an active rule, turning the
 * abstract "borders may not meet like this" constraint into something you can
 * see and fix.
 */
export function LoopyPanel() {
  const [size, setSize] = useState(DEFAULT_SIZE);
  const [walls, setWalls] = useState<Walls>(() => makeBrokenExample(DEFAULT_SIZE));
  // Both rules can apply at the same time; default to checking both.
  const [rules, setRules] = useState<Record<Rule, boolean>>({ loopy: true, bricky: true });

  const paintModeRef = useRef<PaintMode>(null);
  const vLayerRef = useRef<HTMLDivElement | null>(null);
  const hLayerRef = useRef<HTMLDivElement | null>(null);
  const [focusV, setFocusV] = useState({ r: 0, c: 1 });
  const [focusH, setFocusH] = useState({ r: 1, c: 0 });

  const activeRules = useMemo(
    () => (Object.keys(RULE_META) as Rule[]).filter((r) => rules[r]),
    [rules],
  );
  const forbidden = useMemo(() => activeRules.map((r) => RULE_META[r].forbidden), [activeRules]);
  const analysis = useMemo(() => analyse(walls, forbidden), [walls, forbidden]);

  const stageStyle: CSSProperties = { ['--size' as string]: size };

  const handleSizeChange = (n: number) => {
    const clamped = Math.max(MIN_SIZE, Math.min(MAX_SIZE, n));
    setSize(clamped);
    setWalls((prev) => resizeWalls(prev, clamped));
    setFocusV((f) => ({ r: Math.min(f.r, clamped - 1), c: Math.min(f.c, clamped) }));
    setFocusH((f) => ({ r: Math.min(f.r, clamped), c: Math.min(f.c, clamped - 1) }));
  };

  const paintEdge = useCallback((kind: EdgeKind, r: number, c: number, value: boolean) => {
    setWalls((prev) => setWall(prev, kind, r, c, value));
  }, []);

  const endPaint = () => {
    paintModeRef.current = null;
  };

  const handleEdgePointerDown =
    (kind: EdgeKind, r: number, c: number) => (e: React.PointerEvent) => {
      e.preventDefault();
      // Release implicit (touch) pointer capture so drag-paint can fire
      // pointerenter on sibling edges. Guard against the no-capture case,
      // which otherwise throws NotFoundError and aborts the toggle.
      const el = e.currentTarget as Element;
      if (el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId);
      const target = !getWall(walls, kind, r, c);
      paintModeRef.current = target;
      paintEdge(kind, r, c, target);
    };

  const handleEdgePointerEnter =
    (kind: EdgeKind, r: number, c: number) => (e: React.PointerEvent) => {
      if (paintModeRef.current === null) return;
      if (e.buttons === 0) {
        paintModeRef.current = null;
        return;
      }
      paintEdge(kind, r, c, paintModeRef.current);
    };

  const focusEdge = useCallback((kind: EdgeKind, r: number, c: number) => {
    if (kind === 'v') setFocusV({ r, c });
    else setFocusH({ r, c });
    const layer = (kind === 'v' ? vLayerRef : hLayerRef).current;
    layer?.querySelector<HTMLButtonElement>(`[data-er="${r}"][data-ec="${c}"]`)?.focus();
  }, []);

  // Arrow-key navigation within each orientation's internal-edge lattice.
  const handleEdgeKeyDown =
    (kind: EdgeKind, r: number, c: number) => (e: React.KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        paintEdge(kind, r, c, !getWall(walls, kind, r, c));
        return;
      }
      // Edge lattice ranges, boundary included.
      const rMin = 0;
      const rMax = kind === 'v' ? size - 1 : size;
      const cMin = 0;
      const cMax = kind === 'v' ? size : size - 1;
      const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          focusEdge(kind, clamp(r - 1, rMin, rMax), c);
          return;
        case 'ArrowDown':
          e.preventDefault();
          focusEdge(kind, clamp(r + 1, rMin, rMax), c);
          return;
        case 'ArrowLeft':
          e.preventDefault();
          focusEdge(kind, r, clamp(c - 1, cMin, cMax));
          return;
        case 'ArrowRight':
          e.preventDefault();
          focusEdge(kind, r, clamp(c + 1, cMin, cMax));
          return;
      }
    };

  const clear = () => setWalls(emptyWalls(size));
  const loadValid = () => {
    setSize(DEFAULT_SIZE);
    setWalls(makeValidExample(DEFAULT_SIZE));
  };
  const loadBroken = () => {
    setSize(DEFAULT_SIZE);
    setWalls(makeBrokenExample(DEFAULT_SIZE));
  };

  // Keep keyboard focus targets valid if a resize shrank the board.
  useEffect(() => {
    setFocusV((f) => ({ r: Math.min(f.r, size - 1), c: Math.min(f.c, size) }));
    setFocusH((f) => ({ r: Math.min(f.r, size), c: Math.min(f.c, size - 1) }));
  }, [size]);

  const jCount = analysis.junctions.length;
  const lCount = analysis.looseEnds.length;
  const checkLabel =
    activeRules.length === 0
      ? 'Loop'
      : activeRules.map((r) => RULE_META[r].label).join(' + ');

  // ----- Build edge descriptors for rendering -----
  const verticalEdges = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c <= size; c++) {
      verticalEdges.push({ r, c, frame: isFrameV(size, c), wall: walls.vertical[r][c] });
    }
  }
  const horizontalEdges = [];
  for (let r = 0; r <= size; r++) {
    for (let c = 0; c < size; c++) {
      horizontalEdges.push({ r, c, frame: isFrameH(size, r), wall: walls.horizontal[r][c] });
    }
  }

  return (
    <section className="loopy">
      <h2 id="loopy-heading">Loopy &amp; Bricky rule explainer</h2>
      <p className="hint">
        Borders must form unbroken <strong>loops</strong>. Two related rules
        govern how borders may meet at a single point:{' '}
        <strong>Loopy</strong> forbids any spot where exactly{' '}
        <strong>three</strong> borders meet (a T-junction), and{' '}
        <strong>Bricky</strong> forbids any spot where exactly{' '}
        <strong>four</strong> meet (a crossing). Pick the rules to check, then
        draw borders on the grid edges. The board starts as a rectangle, but the
        boundary is editable too — real boards are rarely rectangles — so you can
        reshape it and the panel marks every point that breaks an active rule.
      </p>

      <div className="loopy-controls">
        <div className="loopy-rules" role="group" aria-label="Rules to check">
          {(Object.keys(RULE_META) as Rule[]).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={rules[key]}
              className={`mode-btn ${rules[key] ? 'active' : ''}`}
              onClick={() => setRules((r) => ({ ...r, [key]: !r[key] }))}
            >
              {RULE_META[key].label} (no {RULE_META[key].forbidden}-way)
            </button>
          ))}
        </div>

        <label className="loopy-size">
          Grid size:{' '}
          <strong className="size-readout" aria-live="polite">
            {size}×{size}
          </strong>
          <input
            type="range"
            min={MIN_SIZE}
            max={MAX_SIZE}
            value={size}
            aria-valuetext={`${size} by ${size}`}
            onChange={(e) => handleSizeChange(Number(e.target.value))}
          />
        </label>

        <button type="button" onClick={loadBroken}>
          Broken example
        </button>
        <button type="button" onClick={loadValid}>
          Valid loop
        </button>
        <button type="button" onClick={clear}>
          Clear
        </button>
      </div>

      <p className="hint" id="loopy-instructions">
        Click or drag along the grid lines to add or remove borders — including
        the heavy boundary, so you can carve out non-rectangular boards. Tab into
        a border layer and use the arrow keys, then Space or Enter to toggle.
      </p>

      <div className="loopy-layout">
        <div className="loopy-stage" style={stageStyle}>
          <div
            className="grid loopy-grid"
            role="presentation"
            style={gridTemplateStyle(size, size)}
          >
            {Array.from({ length: size * size }, (_, k) => (
              <div key={k} className="cell" />
            ))}
          </div>

          {/* Vertical border edges */}
          <div ref={vLayerRef} className="loopy-edges" role="grid" aria-label="Vertical borders">
            {verticalEdges.map(({ r, c, frame, wall }) => {
              const style: CSSProperties = {
                ['--er' as string]: r,
                ['--ec' as string]: c,
              };
              const isFocus = focusV.r === r && focusV.c === c;
              return (
                <button
                  key={`v-${r}-${c}`}
                  type="button"
                  role="gridcell"
                  data-er={r}
                  data-ec={c}
                  tabIndex={isFocus ? 0 : -1}
                  aria-pressed={wall}
                  aria-label={`${frame ? 'Boundary' : 'Vertical'} border, row ${r + 1}, line ${c}`}
                  className={`loopy-edge loopy-edge-v${wall ? ' is-wall' : ''}${frame ? ' is-frame' : ''}`}
                  style={style}
                  onPointerDown={handleEdgePointerDown('v', r, c)}
                  onPointerEnter={handleEdgePointerEnter('v', r, c)}
                  onPointerUp={endPaint}
                  onFocus={() => setFocusV({ r, c })}
                  onKeyDown={handleEdgeKeyDown('v', r, c)}
                >
                  <span className="loopy-wall" aria-hidden="true" />
                </button>
              );
            })}
          </div>

          {/* Horizontal border edges */}
          <div ref={hLayerRef} className="loopy-edges" role="grid" aria-label="Horizontal borders">
            {horizontalEdges.map(({ r, c, frame, wall }) => {
              const style: CSSProperties = {
                ['--er' as string]: r,
                ['--ec' as string]: c,
              };
              const isFocus = focusH.r === r && focusH.c === c;
              return (
                <button
                  key={`h-${r}-${c}`}
                  type="button"
                  role="gridcell"
                  data-er={r}
                  data-ec={c}
                  tabIndex={isFocus ? 0 : -1}
                  aria-pressed={wall}
                  aria-label={`${frame ? 'Boundary' : 'Horizontal'} border, line ${r}, column ${c + 1}`}
                  className={`loopy-edge loopy-edge-h${wall ? ' is-wall' : ''}${frame ? ' is-frame' : ''}`}
                  style={style}
                  onPointerDown={handleEdgePointerDown('h', r, c)}
                  onPointerEnter={handleEdgePointerEnter('h', r, c)}
                  onPointerUp={endPaint}
                  onFocus={() => setFocusH({ r, c })}
                  onKeyDown={handleEdgeKeyDown('h', r, c)}
                >
                  <span className="loopy-wall" aria-hidden="true" />
                </button>
              );
            })}
          </div>

          {/* Rule-breaking vertices */}
          <div
            className="loopy-vertices"
            role="presentation"
            onPointerUp={endPaint}
            onPointerLeave={endPaint}
          >
            {analysis.junctions.map(({ i, j }) => (
              <span
                key={`j-${i}-${j}`}
                className="loopy-mark loopy-junction"
                style={{ ['--vr' as string]: i, ['--vc' as string]: j }}
                role="img"
                aria-label={`${junctionName(degreeAt(walls, i, j))} at row ${i + 1}, column ${j + 1}`}
              >
                ✕
              </span>
            ))}
            {analysis.looseEnds.map(({ i, j }) => (
              <span
                key={`l-${i}-${j}`}
                className="loopy-mark loopy-loose"
                style={{ ['--vr' as string]: i, ['--vc' as string]: j }}
                role="img"
                aria-label={`Loose end at row ${i + 1}, column ${j + 1}`}
              />
            ))}
          </div>
        </div>

        <aside className="loopy-readout" aria-live="polite" aria-labelledby="loopy-status-heading">
          <h3 id="loopy-status-heading">{checkLabel} check</h3>
          {analysis.valid ? (
            <p className="loopy-status ok">
              <span className="loopy-status-icon" aria-hidden="true">
                ✓
              </span>
              Every border forms a closed loop — nothing broken.
            </p>
          ) : (
            <p className="loopy-status bad">
              <span className="loopy-status-icon" aria-hidden="true">
                ✕
              </span>
              {jCount > 0 && (
                <>
                  {jCount} forbidden junction{jCount === 1 ? '' : 's'}
                </>
              )}
              {jCount > 0 && lCount > 0 && ' · '}
              {lCount > 0 && (
                <>
                  {lCount} loose end{lCount === 1 ? '' : 's'}
                </>
              )}
            </p>
          )}

          <ul className="loopy-legend">
            <li>
              <span className="loopy-swatch junction" aria-hidden="true">
                ✕
              </span>
              <span>
                A forbidden junction: three borders meeting breaks{' '}
                <strong>Loopy</strong>, four breaks <strong>Bricky</strong>.
              </span>
            </li>
            <li>
              <span className="loopy-swatch loose" aria-hidden="true" />
              <span>A loose end: a border that just stops. Loops never dead-end.</span>
            </li>
          </ul>
        </aside>
      </div>

      <details className="loopy-notes">
        <summary>How the rules work</summary>
        <p>
          Picture the borders as string laid along the grid lines. For the string
          to form proper loops, every point it passes must have an{' '}
          <strong>even</strong> number of border ends — zero (empty), two (the
          loop passes straight through or turns a corner), or four (two loops
          cross). The board boundary is just more border, so reshaping it changes
          which points break the rules: a stray line poking in from the edge
          instantly makes a three-border point.
        </p>
        <p>
          <strong>Loopy</strong> forbids the <em>three-border</em> point (a
          T-junction): you can never have a spot where a third border tees into a
          passing line. <strong>Bricky</strong> forbids the{' '}
          <em>four-border</em> point (a crossing), the way bricks are laid so
          seams never line up into a plus. Because borders cannot simply stop,
          adding one segment usually forces you to keep going until it closes a
          loop, meets the frame cleanly, or joins another border.
        </p>
        <p>
          Use the <em>Broken example</em> to see the ✕ marks, then remove the
          stray border (or extend it to close a second loop) and watch the board
          turn valid. Toggle <strong>Loopy</strong> and <strong>Bricky</strong>
          {' '}to check one rule at a time or both at once.
        </p>
      </details>
    </section>
  );
}
