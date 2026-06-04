import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { emptyGrid, resizeGrid, type Grid } from '../shape';
import { gridTemplateStyle } from '../utils/edgeStyle';
import { countCompass, directionsOf, type Direction } from '../compass';

const MIN_SIZE = 5;
const MAX_SIZE = 12;
const DEFAULT_SIZE = 8;

type Mode = 'region' | 'compass';
type Compass = { r: number; c: number };
type PaintMode = 'fill' | 'erase' | null;

const DIR_META: { key: Direction; short: string; full: string }[] = [
  { key: 'n', short: 'N', full: 'North' },
  { key: 'e', short: 'E', full: 'East' },
  { key: 's', short: 'S', full: 'South' },
  { key: 'w', short: 'W', full: 'West' },
];

/**
 * A small worked example region (an L-ish region with a notch) so the tab is
 * immediately illustrative the first time it's opened.
 */
function makeExampleRegion(size: number): Grid {
  const g = emptyGrid(size);
  const fill = (r: number, c: number) => {
    if (r >= 0 && r < size && c >= 0 && c < size) g[r][c] = true;
  };
  // Top bar
  for (let c = 1; c <= 5; c++) fill(1, c);
  // Middle band
  for (let c = 1; c <= 6; c++) fill(2, c);
  for (let c = 1; c <= 6; c++) fill(3, c);
  // Bottom feet
  for (let c = 1; c <= 3; c++) fill(4, c);
  fill(4, 5);
  fill(4, 6);
  return g;
}

/**
 * Interactive tutorial for the game's "Compass" clue. Players paint a region,
 * drop a compass on a cell, and the panel shows how many region cells lie
 * farther North / South / East / West — highlighting each half-plane so the
 * double-counting of diagonal cells is obvious.
 */
export function CompassPanel() {
  const [size, setSize] = useState(DEFAULT_SIZE);
  const [region, setRegion] = useState<Grid>(() => makeExampleRegion(DEFAULT_SIZE));
  const [compass, setCompass] = useState<Compass | null>({ r: 3, c: 3 });
  const [mode, setMode] = useState<Mode>('compass');
  const [visible, setVisible] = useState<Record<Direction, boolean>>({
    n: true,
    e: true,
    s: true,
    w: true,
  });

  const paintModeRef = useRef<PaintMode>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [focus, setFocus] = useState({ r: 0, c: 0 });

  // Keep focus + compass coordinates in range when the grid shrinks.
  useEffect(() => {
    setFocus((f) => ({ r: Math.min(f.r, size - 1), c: Math.min(f.c, size - 1) }));
    setCompass((cp) =>
      cp ? { r: Math.min(cp.r, size - 1), c: Math.min(cp.c, size - 1) } : cp,
    );
  }, [size]);

  const counts = useMemo(
    () => (compass ? countCompass(region, compass.r, compass.c) : null),
    [region, compass],
  );

  const handleSizeChange = (n: number) => {
    const clamped = Math.max(MIN_SIZE, Math.min(MAX_SIZE, n));
    setSize(clamped);
    setRegion((prev) => resizeGrid(prev, clamped));
  };

  const setCell = useCallback((r: number, c: number, value: boolean) => {
    setRegion((prev) => {
      if (prev[r][c] === value) return prev;
      const next = prev.map((row) => row.slice());
      next[r][c] = value;
      return next;
    });
  }, []);

  const focusCell = useCallback((r: number, c: number) => {
    setFocus({ r, c });
    gridRef.current
      ?.querySelector<HTMLButtonElement>(`[data-r="${r}"][data-c="${c}"]`)
      ?.focus();
  }, []);

  const act = useCallback(
    (r: number, c: number) => {
      if (mode === 'compass') {
        setCompass({ r, c });
      } else {
        setCell(r, c, !region[r][c]);
      }
    },
    [mode, region, setCell],
  );

  const handlePointerDown = (r: number, c: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    if (mode === 'compass') {
      setCompass({ r, c });
      return;
    }
    const m: PaintMode = region[r][c] ? 'erase' : 'fill';
    paintModeRef.current = m;
    setCell(r, c, m === 'fill');
  };

  const handlePointerEnter = (r: number, c: number) => (e: React.PointerEvent) => {
    if (mode !== 'region' || paintModeRef.current === null) return;
    if (e.buttons === 0) {
      paintModeRef.current = null;
      return;
    }
    setCell(r, c, paintModeRef.current === 'fill');
  };

  const endPaint = () => {
    paintModeRef.current = null;
  };

  const handleCellKeyDown = (r: number, c: number) => (e: React.KeyboardEvent) => {
    const last = size - 1;
    switch (e.key) {
      case ' ':
      case 'Enter':
        e.preventDefault();
        act(r, c);
        return;
      case 'ArrowUp':
        e.preventDefault();
        focusCell(Math.max(0, r - 1), c);
        return;
      case 'ArrowDown':
        e.preventDefault();
        focusCell(Math.min(last, r + 1), c);
        return;
      case 'ArrowLeft':
        e.preventDefault();
        focusCell(r, Math.max(0, c - 1));
        return;
      case 'ArrowRight':
        e.preventDefault();
        focusCell(r, Math.min(last, c + 1));
        return;
      case 'Home':
        e.preventDefault();
        focusCell(e.ctrlKey ? 0 : r, 0);
        return;
      case 'End':
        e.preventDefault();
        focusCell(e.ctrlKey ? last : r, last);
        return;
    }
  };

  const clear = () => {
    setRegion(emptyGrid(size));
    setCompass(null);
  };

  const loadExample = () => {
    const n = Math.max(MIN_SIZE, Math.min(MAX_SIZE, 8));
    setSize(n);
    setRegion(makeExampleRegion(n));
    setCompass({ r: 3, c: 3 });
    setMode('compass');
    setVisible({ n: true, e: true, s: true, w: true });
  };

  const gridStyle: CSSProperties = {
    ['--size' as string]: size,
    ...gridTemplateStyle(size, size),
  };

  /** Build the layered translucent background that tints a cell by direction. */
  const cellBackground = (
    r: number,
    c: number,
    isRegion: boolean,
  ): string | undefined => {
    if (!compass) return undefined;
    const dirs = directionsOf(r, c, compass.r, compass.c);
    const layers: string[] = [];
    for (const { key } of DIR_META) {
      if (!visible[key] || !dirs[key]) continue;
      // Counted region cells get a strong wash; empty half-plane cells a hint.
      const pct = isRegion ? 60 : 14;
      const color = `var(--compass-${key})`;
      const mix = `color-mix(in srgb, ${color} ${pct}%, transparent)`;
      layers.push(`linear-gradient(${mix}, ${mix})`);
    }
    if (layers.length === 0) return undefined;
    return layers.join(', ');
  };

  return (
    <section className="compass">
      <h2 id="compass-heading">Compass clue explainer</h2>
      <p className="hint">
        A Compass clue counts the region cells that lie farther in each
        direction. Paint a region, drop a compass on a cell, and watch the four
        counts update. A cell that is, say, up-and-to-the-right is counted by{' '}
        <strong>both</strong> North and East.
      </p>

      <div className="compass-controls">
        <div
          className="compass-modes"
          role="radiogroup"
          aria-label="Click action"
        >
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'compass'}
            className={`mode-btn ${mode === 'compass' ? 'active' : ''}`}
            onClick={() => setMode('compass')}
          >
            Place compass
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'region'}
            className={`mode-btn ${mode === 'region' ? 'active' : ''}`}
            onClick={() => setMode('region')}
          >
            Draw region
          </button>
        </div>

        <label className="compass-size">
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

        <button type="button" onClick={loadExample}>
          Load example
        </button>
        <button type="button" onClick={clear}>
          Clear
        </button>
      </div>

      <p className="hint" id="compass-instructions">
        {mode === 'compass'
          ? 'Click any cell to move the compass there.'
          : 'Click or drag to add or remove region cells.'}{' '}
        Tab into the grid and use the arrow keys, then Space or Enter to act.
      </p>

      <div className="compass-layout">
        <div
          ref={gridRef}
          className="grid compass-grid"
          role="grid"
          aria-labelledby="compass-heading"
          aria-describedby="compass-instructions"
          aria-rowcount={size}
          aria-colcount={size}
          style={gridStyle}
          onPointerUp={endPaint}
          onPointerLeave={endPaint}
        >
          {region.map((row, r) =>
            row.map((isRegion, c) => {
              const isCompass = compass?.r === r && compass?.c === c;
              const isFocus = focus.r === r && focus.c === c;
              const bg = cellBackground(r, c, isRegion);
              const label = `Row ${r + 1}, column ${c + 1}, ${
                isRegion ? 'in region' : 'empty'
              }${isCompass ? ', compass here' : ''}`;
              return (
                <button
                  key={`${r}-${c}`}
                  type="button"
                  role="gridcell"
                  aria-label={label}
                  aria-pressed={mode === 'region' ? isRegion : undefined}
                  data-r={r}
                  data-c={c}
                  tabIndex={isFocus ? 0 : -1}
                  className={`compass-cell${isRegion ? ' region' : ''}${
                    isCompass ? ' is-compass' : ''
                  }`}
                  style={bg ? { backgroundImage: bg } : undefined}
                  onPointerDown={handlePointerDown(r, c)}
                  onPointerEnter={handlePointerEnter(r, c)}
                  onFocus={() => setFocus({ r, c })}
                  onKeyDown={handleCellKeyDown(r, c)}
                >
                  {isCompass && (
                    <span className="compass-rose" aria-hidden="true">
                      <span className="rose-mark" />
                      {counts &&
                        DIR_META.map(({ key }) =>
                          visible[key] ? (
                            <span key={key} className={`rose-num rose-${key}`}>
                              {counts[key]}
                            </span>
                          ) : null,
                        )}
                    </span>
                  )}
                </button>
              );
            }),
          )}
        </div>

        <aside className="compass-readout" aria-live="polite" aria-labelledby="compass-counts-heading">
          <h3 id="compass-counts-heading">Counts</h3>
          {compass && counts ? (
            <>
              <div className="compass-cross" role="img" aria-label={countsSummary(counts)}>
                <span className="cross-n">
                  <strong>{counts.n}</strong>
                  <em>N</em>
                </span>
                <span className="cross-w">
                  <strong>{counts.w}</strong>
                  <em>W</em>
                </span>
                <span className="cross-center" aria-hidden="true">
                  ✦
                </span>
                <span className="cross-e">
                  <strong>{counts.e}</strong>
                  <em>E</em>
                </span>
                <span className="cross-s">
                  <strong>{counts.s}</strong>
                  <em>S</em>
                </span>
              </div>

              <fieldset className="compass-toggles">
                <legend>Show direction</legend>
                {DIR_META.map(({ key, short, full }) => (
                  <label key={key} className={`dir-toggle dir-${key}`}>
                    <input
                      type="checkbox"
                      checked={visible[key]}
                      onChange={(e) =>
                        setVisible((v) => ({ ...v, [key]: e.target.checked }))
                      }
                    />
                    <span className="dir-swatch" aria-hidden="true" />
                    {full} ({short})
                  </label>
                ))}
              </fieldset>
            </>
          ) : (
            <p className="hint">
              No compass placed. Switch to <em>Place compass</em> and click a
              cell.
            </p>
          )}
        </aside>
      </div>

      <details className="compass-notes">
        <summary>How the rule works</summary>
        <p>
          Each arm of the compass reports how many cells of the same region sit
          beyond it along that axis — North counts every region cell in a higher
          row, East counts every region cell in a column to the right, and so
          on. The directions are independent half-planes, so the compass cell
          itself is never counted, and a diagonal cell contributes to two arms
          at once (for example a cell to the north-east adds to both N and E).
        </p>
        <p>
          That overlap is the key to reading a clue: a North of 2 and an East of
          2 does not necessarily mean four different cells — some of them may be
          the same north-east cells counted twice. Toggle the directions above to
          see exactly which cells each arm is counting.
        </p>
      </details>
    </section>
  );
}

function countsSummary(counts: { n: number; e: number; s: number; w: number }): string {
  return `North ${counts.n}, East ${counts.e}, South ${counts.s}, West ${counts.w}`;
}
