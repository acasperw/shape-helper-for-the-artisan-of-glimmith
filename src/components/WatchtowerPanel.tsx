import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { gridTemplateStyle } from '../utils/edgeStyle';
import {
  EMPTY,
  emptyRegionGrid,
  labelRegions,
  resizeRegionGrid,
  watchtowerVertexCount,
  type RegionGrid,
} from '../watchtower';

const MIN_SIZE = 5;
const MAX_SIZE = 12;
const DEFAULT_SIZE = 7;
const MAX_TOWERS = 5;

type Mode = 'region' | 'watchtower';
/** Watchtower position: a grid vertex (corner), each axis in [0, size]. The
 *  stable `id` lets towers be added, removed, and selected independently. */
type Tower = { id: number; vr: number; vc: number };
type PaintMode = 'paint' | null;

/**
 * Region palette mapped onto the shared stained-glass `tile-N` colours used by
 * the piece catalog and tiling view, so the whole app speaks one visual
 * language. `tile` indexes the global `.cell.on.tile-N` palette.
 */
const PALETTE: { idx: number; tile: number; name: string }[] = [
  { idx: 0, tile: 0, name: 'Red' },
  { idx: 1, tile: 1, name: 'Blue' },
  { idx: 2, tile: 2, name: 'Green' },
  { idx: 3, tile: 3, name: 'Amber' },
  { idx: 4, tile: 4, name: 'Purple' },
  { idx: 5, tile: 5, name: 'Teal' },
];

/**
 * A worked example showing all four clue values at once. Five regions are laid
 * out in quadrants (one quadrant split in two), and four watchtowers sit on
 * corners that read 1, 2, 3 and 4 respectively — so the tab demonstrates the
 * whole range the moment it's opened.
 */
function makeExampleRegions(size: number): { cells: RegionGrid; towers: Tower[] } {
  const cells = emptyRegionGrid(size);
  const mid = Math.floor(size / 2);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const top = r < mid;
      const left = c < mid;
      // 0 = top-left, 1 = top-right, 2 = bottom-left; the bottom-right quadrant
      // is split into 3 and 4 so a corner there can see three regions at once.
      cells[r][c] = top ? (left ? 0 : 1) : left ? 2 : c < mid + 2 ? 3 : 4;
    }
  }
  const towers: Tower[] = [
    { id: 0, vr: 1, vc: 1 }, // deep inside the top-left region -> 1
    { id: 1, vr: mid, vc: 1 }, // seam between top-left and bottom-left -> 2
    { id: 2, vr: mid, vc: mid + 2 }, // top-right + the two bottom-right regions -> 3
    { id: 3, vr: mid, vc: mid }, // where all four quadrants meet -> 4
  ];
  return { cells, towers };
}

/**
 * Interactive explainer for the game's "Watchtower" clue. Players paint
 * coloured regions, drop a watchtower on a grid corner, and the panel shows how
 * many distinct regions meet at that corner (up to the four cells around it) —
 * highlighting exactly which regions are being counted.
 */
export function WatchtowerPanel() {
  const example = useMemo(() => makeExampleRegions(DEFAULT_SIZE), []);
  const [size, setSize] = useState(DEFAULT_SIZE);
  const [cells, setCells] = useState<RegionGrid>(example.cells);
  const [towers, setTowers] = useState<Tower[]>(example.towers);
  const [selectedId, setSelectedId] = useState<number | null>(
    example.towers[example.towers.length - 1]?.id ?? null,
  );
  const [mode, setMode] = useState<Mode>('watchtower');
  const [activeColor, setActiveColor] = useState(0);
  const [erase, setErase] = useState(false);
  const [highlight, setHighlight] = useState(true);

  const paintModeRef = useRef<PaintMode>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const vertexLayerRef = useRef<HTMLDivElement | null>(null);
  const nextIdRef = useRef(example.towers.length);
  const [focus, setFocus] = useState({ r: 0, c: 0 });
  const [vFocus, setVFocus] = useState({ vr: 0, vc: 0 });

  // Keep focus + tower coordinates valid when the grid shrinks.
  useEffect(() => {
    setFocus((f) => ({ r: Math.min(f.r, size - 1), c: Math.min(f.c, size - 1) }));
    setVFocus((f) => ({ vr: Math.min(f.vr, size), vc: Math.min(f.vc, size) }));
    setTowers((prev) => prev.filter((t) => t.vr <= size && t.vc <= size));
  }, [size]);

  const { labels } = useMemo(() => labelRegions(cells), [cells]);

  // Count + region ids for every placed watchtower.
  const towerResults = useMemo(
    () =>
      towers.map((t) => {
        const res = watchtowerVertexCount(labels, t.vr, t.vc);
        return { ...t, count: res.count, regionIds: res.regionIds };
      }),
    [towers, labels],
  );

  // Map each region id to a representative colour index, for swatches.
  const regionColour = useMemo(() => {
    const m = new Map<number, number>();
    for (let r = 0; r < labels.length; r++) {
      for (let c = 0; c < labels[r].length; c++) {
        const id = labels[r][c];
        if (id !== EMPTY && !m.has(id)) m.set(id, cells[r][c]);
      }
    }
    return m;
  }, [labels, cells]);

  // The selected tower drives the highlight overlay on the grid.
  const selected = towerResults.find((t) => t.id === selectedId) ?? null;
  const touchingIds = new Set(selected?.regionIds ?? []);
  const highlightActive = highlight && selected != null;

  const handleSizeChange = (n: number) => {
    const clamped = Math.max(MIN_SIZE, Math.min(MAX_SIZE, n));
    setSize(clamped);
    setCells((prev) => resizeRegionGrid(prev, clamped));
  };

  const paintCell = useCallback(
    (r: number, c: number) => {
      const value = erase ? EMPTY : activeColor;
      setCells((prev) => {
        if (prev[r][c] === value) return prev;
        const next = prev.map((row) => row.slice());
        next[r][c] = value;
        return next;
      });
    },
    [activeColor, erase],
  );

  // ----- Cell (region painting) keyboard + pointer -----
  const focusCell = useCallback((r: number, c: number) => {
    setFocus({ r, c });
    gridRef.current
      ?.querySelector<HTMLButtonElement>(`[data-r="${r}"][data-c="${c}"]`)
      ?.focus();
  }, []);

  const handleCellPointerDown = (r: number, c: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    paintModeRef.current = 'paint';
    paintCell(r, c);
  };

  const handleCellPointerEnter = (r: number, c: number) => (e: React.PointerEvent) => {
    if (paintModeRef.current === null) return;
    if (e.buttons === 0) {
      paintModeRef.current = null;
      return;
    }
    paintCell(r, c);
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
        paintCell(r, c);
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

  // ----- Vertex (watchtower placement) keyboard + pointer -----
  const focusVertex = useCallback((vr: number, vc: number) => {
    setVFocus({ vr, vc });
    vertexLayerRef.current
      ?.querySelector<HTMLButtonElement>(`[data-vr="${vr}"][data-vc="${vc}"]`)
      ?.focus();
  }, []);

  // Toggle a watchtower at a corner: remove if one is already there, otherwise
  // add a new one. Once at MAX_TOWERS, placing on a fresh corner replaces the
  // most-recently-placed tower so the user never has to remove one by hand.
  const toggleTower = useCallback(
    (vr: number, vc: number) => {
      const existing = towers.find((t) => t.vr === vr && t.vc === vc);
      if (existing) {
        const next = towers.filter((t) => t !== existing);
        setTowers(next);
        if (selectedId === existing.id) {
          setSelectedId(next.length ? next[next.length - 1].id : null);
        }
        return;
      }
      const id = nextIdRef.current++;
      // At capacity: drop the newest tower and append the new one in its place.
      const base = towers.length >= MAX_TOWERS ? towers.slice(0, -1) : towers;
      setTowers([...base, { id, vr, vc }]);
      setSelectedId(id);
    },
    [towers, selectedId],
  );

  const removeTower = useCallback(
    (id: number) => {
      const next = towers.filter((t) => t.id !== id);
      setTowers(next);
      if (selectedId === id) {
        setSelectedId(next.length ? next[next.length - 1].id : null);
      }
    },
    [towers, selectedId],
  );

  const handleVertexKeyDown = (vr: number, vc: number) => (e: React.KeyboardEvent) => {
    switch (e.key) {
      case ' ':
      case 'Enter':
        e.preventDefault();
        toggleTower(vr, vc);
        return;
      case 'ArrowUp':
        e.preventDefault();
        focusVertex(Math.max(0, vr - 1), vc);
        return;
      case 'ArrowDown':
        e.preventDefault();
        focusVertex(Math.min(size, vr + 1), vc);
        return;
      case 'ArrowLeft':
        e.preventDefault();
        focusVertex(vr, Math.max(0, vc - 1));
        return;
      case 'ArrowRight':
        e.preventDefault();
        focusVertex(vr, Math.min(size, vc + 1));
        return;
    }
  };

  const clear = () => {
    setCells(emptyRegionGrid(size));
    setTowers([]);
    setSelectedId(null);
  };

  const loadExample = () => {
    const ex = makeExampleRegions(DEFAULT_SIZE);
    setSize(DEFAULT_SIZE);
    setCells(ex.cells);
    setTowers(ex.towers);
    setSelectedId(ex.towers[ex.towers.length - 1]?.id ?? null);
    setMode('watchtower');
  };

  const stageStyle: CSSProperties = {
    ['--size' as string]: size,
  };

  /** Region-boundary edges + glass pane position vars for one painted cell. */
  const cellVars = (r: number, c: number): CSSProperties => {
    const id = labels[r][c];
    const diff = (nr: number, nc: number) =>
      nr < 0 || nr >= size || nc < 0 || nc >= size || labels[nr][nc] !== id;
    return {
      ['--row' as string]: r,
      ['--col' as string]: c,
      ['--et' as string]: diff(r - 1, c) ? 1 : 0,
      ['--er' as string]: diff(r, c + 1) ? 1 : 0,
      ['--eb' as string]: diff(r + 1, c) ? 1 : 0,
      ['--el' as string]: diff(r, c - 1) ? 1 : 0,
    };
  };

  const tileOf = (colour: number) => PALETTE[colour]?.tile ?? 0;

  return (
    <section className="watchtower">
      <h2 id="watchtower-heading">Watchtower clue explainer</h2>
      <p className="hint">
        A Watchtower sits on a grid <strong>corner</strong> and counts how many{' '}
        <strong>distinct regions</strong> meet there. Paint some regions, then
        drop up to {MAX_TOWERS} watchtowers on corners — a corner where four
        regions meet reads 4. Click a watchtower again to remove it.
      </p>

      <div className="watchtower-controls">
        <div className="wt-modes" role="radiogroup" aria-label="Click action">
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'watchtower'}
            className={`mode-btn ${mode === 'watchtower' ? 'active' : ''}`}
            onClick={() => setMode('watchtower')}
          >
            Place watchtower
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'region'}
            className={`mode-btn ${mode === 'region' ? 'active' : ''}`}
            onClick={() => setMode('region')}
          >
            Paint regions
          </button>
        </div>

        <label className="wt-size">
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

      <fieldset className="wt-palette" aria-label="Region colour to paint with">
        <legend>Paint colour</legend>
        {PALETTE.map(({ idx, tile, name }) => (
          <button
            key={idx}
            type="button"
            role="radio"
            aria-checked={!erase && activeColor === idx}
            aria-label={name}
            title={name}
            className={`wt-swatch tile-${tile} ${
              !erase && activeColor === idx ? 'active' : ''
            }`}
            onClick={() => {
              setActiveColor(idx);
              setErase(false);
              setMode('region');
            }}
          />
        ))}
        <button
          type="button"
          role="radio"
          aria-checked={erase}
          className={`wt-swatch wt-erase ${erase ? 'active' : ''}`}
          onClick={() => {
            setErase(true);
            setMode('region');
          }}
        >
          Erase
        </button>
      </fieldset>

      <p className="hint" id="watchtower-instructions">
        {mode === 'watchtower'
          ? `Click a corner to add a watchtower, or click one to remove it. At ${MAX_TOWERS}, a new corner replaces the most recent.`
          : erase
            ? 'Click or drag to clear region cells.'
            : 'Click or drag to paint with the selected colour.'}{' '}
        Tab into the grid and use the arrow keys, then Space or Enter to act.
      </p>

      <div className="watchtower-layout">
        <div className={`watchtower-stage mode-${mode}`} style={stageStyle}>
          <div
            ref={gridRef}
            className="grid watchtower-grid"
            role="grid"
            aria-labelledby="watchtower-heading"
            aria-describedby="watchtower-instructions"
            aria-rowcount={size}
            aria-colcount={size}
            style={gridTemplateStyle(size, size)}
            onPointerUp={endPaint}
            onPointerLeave={endPaint}
          >
            {cells.map((row, r) =>
              row.map((colour, c) => {
                const isFocus = focus.r === r && focus.c === c;
                const label = labels[r][c];
                const painted = colour !== EMPTY;
                const isTouching =
                  highlightActive && label !== EMPTY && touchingIds.has(label);
                const dimmed =
                  highlightActive && label !== EMPTY && !touchingIds.has(label);
                const cellLabel = `Row ${r + 1}, column ${c + 1}, ${
                  painted ? `${PALETTE[colour]?.name ?? 'region'} region` : 'empty'
                }`;
                return (
                  <button
                    key={`${r}-${c}`}
                    type="button"
                    role="gridcell"
                    aria-label={cellLabel}
                    data-r={r}
                    data-c={c}
                    tabIndex={mode === 'region' ? (isFocus ? 0 : -1) : -1}
                    className={`cell wt-cell${painted ? ` on tile-${tileOf(colour)}` : ''}${
                      isTouching ? ' touching' : ''
                    }${dimmed ? ' dimmed' : ''}`}
                    style={painted ? cellVars(r, c) : undefined}
                    onPointerDown={handleCellPointerDown(r, c)}
                    onPointerEnter={handleCellPointerEnter(r, c)}
                    onFocus={() => setFocus({ r, c })}
                    onKeyDown={handleCellKeyDown(r, c)}
                  />
                );
              }),
            )}
          </div>

          <div
            ref={vertexLayerRef}
            className="wt-vertices"
            role="grid"
            aria-label="Watchtower corner positions"
          >
            {Array.from({ length: size + 1 }, (_, vr) =>
              Array.from({ length: size + 1 }, (_, vc) => {
                const towerHere = towerResults.find((t) => t.vr === vr && t.vc === vc);
                const isTower = towerHere != null;
                const isSelected = isTower && towerHere.id === selectedId;
                const isVFocus = vFocus.vr === vr && vFocus.vc === vc;
                const vStyle: CSSProperties = {
                  ['--vr' as string]: vr,
                  ['--vc' as string]: vc,
                };
                return (
                  <button
                    key={`v-${vr}-${vc}`}
                    type="button"
                    role="gridcell"
                    aria-label={`Corner row ${vr + 1}, column ${vc + 1}${
                      towerHere
                        ? `, watchtower counting ${towerHere.count} region${
                            towerHere.count === 1 ? '' : 's'
                          }`
                        : ''
                    }`}
                    aria-pressed={isTower}
                    data-vr={vr}
                    data-vc={vc}
                    tabIndex={mode === 'watchtower' ? (isVFocus ? 0 : -1) : -1}
                    className={`wt-vertex${isTower ? ' is-tower' : ''}${
                      isSelected ? ' is-selected' : ''
                    }`}
                    style={vStyle}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      toggleTower(vr, vc);
                    }}
                    onFocus={() => setVFocus({ vr, vc })}
                    onKeyDown={handleVertexKeyDown(vr, vc)}
                  >
                    {towerHere && (
                      <span className="wt-tower" aria-hidden="true">
                        <span className="wt-tower-icon" />
                        <span className="wt-tower-count">{towerHere.count}</span>
                      </span>
                    )}
                  </button>
                );
              }),
            )}
          </div>
        </div>

        <aside
          className="watchtower-readout"
          aria-live="polite"
          aria-labelledby="watchtower-count-heading"
        >
          <h3 id="watchtower-count-heading">
            Watchtowers <span className="wt-count-of">{towerResults.length}/{MAX_TOWERS}</span>
          </h3>
          {towerResults.length > 0 ? (
            <>
              <ol className="wt-tower-list">
                {towerResults.map((t, i) => {
                  const isSel = t.id === selectedId;
                  return (
                    <li key={t.id} className={`wt-tower-item${isSel ? ' selected' : ''}`}>
                      <button
                        type="button"
                        className="wt-tower-card"
                        aria-pressed={isSel}
                        aria-label={`Watchtower ${i + 1}, ${t.count} region${
                          t.count === 1 ? '' : 's'
                        }, highlight on grid`}
                        onClick={() => setSelectedId(t.id)}
                      >
                        <span className="wt-card-count">{t.count}</span>
                        <span className="wt-card-body">
                          <span className="wt-card-title">
                            Watchtower {i + 1}
                            <span className="wt-card-pos">
                              R{t.vr + 1}·C{t.vc + 1}
                            </span>
                          </span>
                          {t.regionIds.length > 0 ? (
                            <span className="wt-card-regions">
                              {t.regionIds.map((id) => {
                                const colour = regionColour.get(id) ?? 0;
                                return (
                                  <span
                                    key={id}
                                    className={`wt-swatch-mini tile-${tileOf(colour)}`}
                                    title={PALETTE[colour]?.name ?? 'Region'}
                                  />
                                );
                              })}
                            </span>
                          ) : (
                            <span className="wt-card-empty">bare board</span>
                          )}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="wt-card-remove"
                        aria-label={`Remove watchtower ${i + 1}`}
                        onClick={() => removeTower(t.id)}
                      >
                        ×
                      </button>
                    </li>
                  );
                })}
              </ol>

              <label className="wt-highlight-toggle">
                <input
                  type="checkbox"
                  checked={highlight}
                  onChange={(e) => setHighlight(e.target.checked)}
                />
                Highlight selected tower's regions
              </label>
            </>
          ) : (
            <p className="hint">
              No watchtowers placed. Switch to <em>Place watchtower</em> and
              click a corner.
            </p>
          )}
        </aside>
      </div>

      <details className="watchtower-notes">
        <summary>How the rule works</summary>
        <p>
          A Watchtower rests on a corner of the grid and reports how many
          separate glass regions meet at that point. A corner is shared by up to
          four cells, so the clue tallies the distinct regions among them — a
          region counts even if it only touches the corner diagonally.
        </p>
        <p>
          That is why a watchtower where four quadrants meet reads 4, one on the
          seam between two regions reads 2, and one tucked inside a single region
          reads 1. Place several towers to compare corners at once, and select a
          card to highlight exactly which regions that tower is counting.
        </p>
      </details>
    </section>
  );
}
