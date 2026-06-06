import { useCallback, useState } from 'react';
import { emptyGrid, type Grid } from './shape';
import { CatalogPanel } from './components/CatalogPanel';
import { HelperPanel } from './components/HelperPanel';
import { CompassPanel } from './components/CompassPanel';
import { WatchtowerPanel } from './components/WatchtowerPanel';
import { LoopyPanel } from './components/LoopyPanel';
import { useHashTab } from './hooks/useHashTab';
import { usePersistedAppState } from './hooks/usePersistedAppState';

const PIECE_MIN_SIZE = 5;
const PIECE_MAX_SIZE = 20;
const PIECE_DEFAULT_SIZE = 6;
const BOARD_MIN_SIZE = 5;
const BOARD_MAX_SIZE = 15;
const BOARD_DEFAULT_SIZE = 8;
const CATALOG_MIN_SIZE = 3;
const CATALOG_MAX_SIZE = 9;
const CATALOG_DEFAULT_SIZE = 5;

const BOUNDS = {
  pieceMin: PIECE_MIN_SIZE,
  pieceMax: PIECE_MAX_SIZE,
  pieceDefault: PIECE_DEFAULT_SIZE,
  boardMin: BOARD_MIN_SIZE,
  boardMax: BOARD_MAX_SIZE,
  boardDefault: BOARD_DEFAULT_SIZE,
} as const;

const TABS = ['helper', 'catalog', 'compass', 'watchtower', 'loopy'] as const;
type TabId = (typeof TABS)[number];

export default function App() {
  const {
    pieceSize,
    setPieceSize,
    pieceGrid,
    setPieceGrid,
    boardSize,
    setBoardSize,
    boardGrid,
    setBoardGrid,
  } = usePersistedAppState(BOUNDS);

  const [activeTab, goToTab] = useHashTab<TabId>(TABS, 'helper');
  const [catalogSize, setCatalogSize] = useState(CATALOG_DEFAULT_SIZE);

  /**
   * Load a polyomino (from the catalog) into the main piece grid and switch to
   * the helper tab. The grid is sized to fit the piece (clamped to MIN/MAX) and
   * the piece is centered.
   */
  const loadPieceFromCatalog = useCallback(
    (pieceGridIn: Grid) => {
      const rows = pieceGridIn.length;
      const cols = pieceGridIn[0]?.length ?? 0;
      const needed = Math.max(rows, cols);
      const nextSize = Math.max(PIECE_MIN_SIZE, Math.min(PIECE_MAX_SIZE, needed));
      const next = emptyGrid(nextSize);
      const offR = Math.floor((nextSize - rows) / 2);
      const offC = Math.floor((nextSize - cols) / 2);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (pieceGridIn[r][c]) next[offR + r][offC + c] = true;
        }
      }
      setPieceSize(nextSize);
      setPieceGrid(next);
      goToTab('helper');
    },
    [goToTab, setPieceGrid, setPieceSize],
  );

  return (
    <div className="app">
      <header>
        <h1>Shape Helper</h1>
        <p className="subtitle">for The Artisan of Glimmith</p>
      </header>

      <main>
        <div className="tabs" role="tablist" aria-label="Sections">
          <button
            type="button"
            role="tab"
            id="tab-helper"
            aria-selected={activeTab === 'helper'}
            aria-controls="panel-helper"
            tabIndex={activeTab === 'helper' ? 0 : -1}
            className={`tab ${activeTab === 'helper' ? 'active' : ''}`}
            onClick={() => goToTab('helper')}
          >
            Shape Helper
          </button>
          <button
            type="button"
            role="tab"
            id="tab-catalog"
            aria-selected={activeTab === 'catalog'}
            aria-controls="panel-catalog"
            tabIndex={activeTab === 'catalog' ? 0 : -1}
            className={`tab ${activeTab === 'catalog' ? 'active' : ''}`}
            onClick={() => goToTab('catalog')}
          >
            Piece Catalog
          </button>
          <button
            type="button"
            role="tab"
            id="tab-compass"
            aria-selected={activeTab === 'compass'}
            aria-controls="panel-compass"
            tabIndex={activeTab === 'compass' ? 0 : -1}
            className={`tab ${activeTab === 'compass' ? 'active' : ''}`}
            onClick={() => goToTab('compass')}
          >
            Compass
          </button>
          <button
            type="button"
            role="tab"
            id="tab-watchtower"
            aria-selected={activeTab === 'watchtower'}
            aria-controls="panel-watchtower"
            tabIndex={activeTab === 'watchtower' ? 0 : -1}
            className={`tab ${activeTab === 'watchtower' ? 'active' : ''}`}
            onClick={() => goToTab('watchtower')}
          >
            Watchtower
          </button>
          <button
            type="button"
            role="tab"
            id="tab-loopy"
            aria-selected={activeTab === 'loopy'}
            aria-controls="panel-loopy"
            tabIndex={activeTab === 'loopy' ? 0 : -1}
            className={`tab ${activeTab === 'loopy' ? 'active' : ''}`}
            onClick={() => goToTab('loopy')}
          >
            Loopy &amp; Bricky
          </button>
        </div>

        {activeTab === 'catalog' ? (
          <div id="panel-catalog" role="tabpanel" aria-labelledby="tab-catalog">
            <CatalogPanel
              size={catalogSize}
              minSize={CATALOG_MIN_SIZE}
              maxSize={CATALOG_MAX_SIZE}
              onSizeChange={setCatalogSize}
              onSelectPiece={loadPieceFromCatalog}
            />
          </div>
        ) : activeTab === 'compass' ? (
          <div id="panel-compass" role="tabpanel" aria-labelledby="tab-compass">
            <CompassPanel />
          </div>
        ) : activeTab === 'watchtower' ? (
          <div id="panel-watchtower" role="tabpanel" aria-labelledby="tab-watchtower">
            <WatchtowerPanel />
          </div>
        ) : activeTab === 'loopy' ? (
          <div id="panel-loopy" role="tabpanel" aria-labelledby="tab-loopy">
            <LoopyPanel />
          </div>
        ) : (
          <div id="panel-helper" role="tabpanel" aria-labelledby="tab-helper">
            <HelperPanel
              active={activeTab === 'helper'}
              pieceSize={pieceSize}
              setPieceSize={setPieceSize}
              pieceGrid={pieceGrid}
              setPieceGrid={setPieceGrid}
              boardSize={boardSize}
              setBoardSize={setBoardSize}
              boardGrid={boardGrid}
              setBoardGrid={setBoardGrid}
              pieceMin={PIECE_MIN_SIZE}
              pieceMax={PIECE_MAX_SIZE}
              boardMin={BOARD_MIN_SIZE}
              boardMax={BOARD_MAX_SIZE}
            />
          </div>
        )}
      </main>

      <footer>
        <a
          href="https://github.com/acasperw/shape-helper-for-the-artisan-of-glimmith/"
          target="_blank"
          rel="noreferrer"
        >
          Source on GitHub
        </a>
      </footer>
    </div>
  );
}
