/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from 'react';
import { AnalyticsDashboardModal } from './components/AnalyticsDashboardModal';
import { ArenaModal } from './components/ArenaModal';
import { BottomDock } from './components/BottomDock';
import { CapturedPhoto, FirstPersonOverlay } from './components/FirstPersonOverlay';
import { GateSettingsModal } from './components/GateSettingsModal';
import { ManagementModal } from './components/ManagementModal';
import { ResearchLabModal } from './components/ResearchLabModal';
import { ShowcaseModal } from './components/ShowcaseModal';
import { TopHud } from './components/TopHud';
import {
  BASE_UNLOCKED_SPECIES_IDS,
  CYCLE_DURATION,
  DEFAULT_DAY_CYCLE_SECONDS,
  DEFAULT_PARK_NAME,
  DEFAULT_SOUND_VOLUME,
  DEFAULT_TICKET_PRICE,
  DEFAULT_WEATHER_STAGE_SECONDS,
  START_FEED,
  START_MONEY,
} from './game/config';
import { ParkEngine } from './game/ParkEngine';
import { FacilityKey, GameSnapshot, GridCellSave, StaffRole, ToolMode } from './game/types';

const SNAPSHOT_STORAGE_KEY = 'jurassic_tycoon_snapshot_v1';
const GRID_STORAGE_KEY = 'jurassic_tycoon_grid_v1';

interface FloatingItem {
  id: number;
  x: number;
  y: number;
  text: string;
  variant: 'ticket' | 'shop';
}

interface ToastState {
  id: number;
  msg: string;
  tone: 'info' | 'success' | 'warn' | 'error';
}

const INITIAL_SNAPSHOT: GameSnapshot = {
  money: START_MONEY,
  dinoCount: 0,
  uniqueSpeciesCount: 0,
  visitorCount: 0,
  satisfaction: 62,
  safetyRating: 85,
  cleanlinessRating: 100,
  feedStock: START_FEED,
  autoBuyFeed: true,
  litterCount: 0,
  fenceCount: 0,
  facilityCounts: {
    drink: 0,
    icecream: 0,
    hotdog: 0,
    gift: 0,
    restroom: 0,
    water: 0,
    trashbin: 0,
    nursing: 0,
    service: 0,
    waveexhibit: 0,
    arena: 0,
  },
  staffCounts: {
    cleaner: 0,
    keeper: 0,
    security: 0,
  },
  cycleTimeLeft: CYCLE_DURATION,
  currentCycleFinance: {
    gateRevenue: 0,
    ticketRevenue: 0,
    shopRevenue: 0,
    staffWages: 0,
    facilityUpkeep: 0,
    dinoUpkeep: 0,
    feedCost: 0,
  },
  lastCycleFinance: {
    gateRevenue: 0,
    ticketRevenue: 0,
    shopRevenue: 0,
    staffWages: 0,
    facilityUpkeep: 0,
    dinoUpkeep: 0,
    feedCost: 0,
  },
  dinosaurs: [],
  activeTool: 'inspect',
  selectedDinoType: 1,
  selectedFacilityKey: 'drink',
  timeMode: 'auto',
  dayCycleDuration: DEFAULT_DAY_CYCLE_SECONDS,
  dayProgress: 0.34,
  dayPhase: 'morning',
  clockLabel: '08:09',
  parkName: DEFAULT_PARK_NAME,
  ticketPrice: DEFAULT_TICKET_PRICE,
  fairTicketPrice: 40,
  ticketFeedback: 'fair',
  soundMuted: false,
  soundVolume: DEFAULT_SOUND_VOLUME,
  weatherMode: 'auto',
  currentWeather: 'sunny',
  weatherTimeLeft: DEFAULT_WEATHER_STAGE_SECONDS,
  cumulativeRevenue: 0,
  analyticsHistory: [],
  unlockedTechs: [],
  unlockedSpeciesIds: BASE_UNLOCKED_SPECIES_IDS,
  fenceTier: 1,
  cameraMode: 'overview',
  arenaPopularityBonus: 0,
};

function loadPersistedSnapshot(): { snapshot: GameSnapshot; hasSaved: boolean } {
  if (typeof window === 'undefined') {
    return { snapshot: INITIAL_SNAPSHOT, hasSaved: false };
  }
  try {
    const raw = window.localStorage.getItem(SNAPSHOT_STORAGE_KEY);
    if (!raw) return { snapshot: INITIAL_SNAPSHOT, hasSaved: false };
    const parsed = JSON.parse(raw) as Partial<GameSnapshot>;
    if (!parsed || typeof parsed !== 'object') {
      return { snapshot: INITIAL_SNAPSHOT, hasSaved: false };
    }
    const merged: GameSnapshot = {
      ...INITIAL_SNAPSHOT,
      ...parsed,
      facilityCounts: {
        ...INITIAL_SNAPSHOT.facilityCounts,
        ...(parsed.facilityCounts || {}),
      },
      staffCounts: {
        ...INITIAL_SNAPSHOT.staffCounts,
        ...(parsed.staffCounts || {}),
      },
      currentCycleFinance: {
        ...INITIAL_SNAPSHOT.currentCycleFinance,
        ...(parsed.currentCycleFinance || {}),
      },
      lastCycleFinance: {
        ...INITIAL_SNAPSHOT.lastCycleFinance,
        ...(parsed.lastCycleFinance || {}),
      },
      dinosaurs: Array.isArray(parsed.dinosaurs) ? parsed.dinosaurs : [],
      analyticsHistory: Array.isArray(parsed.analyticsHistory) ? parsed.analyticsHistory : [],
      unlockedTechs: Array.isArray(parsed.unlockedTechs) ? parsed.unlockedTechs : [],
      unlockedSpeciesIds:
        Array.isArray(parsed.unlockedSpeciesIds) && parsed.unlockedSpeciesIds.length > 0
          ? parsed.unlockedSpeciesIds
          : BASE_UNLOCKED_SPECIES_IDS,
      cameraMode: 'overview',
    };
    return { snapshot: merged, hasSaved: true };
  } catch {
    return { snapshot: INITIAL_SNAPSHOT, hasSaved: false };
  }
}

function loadPersistedGridLayout(): GridCellSave[] | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = window.localStorage.getItem(GRID_STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as GridCellSave[]) : undefined;
  } catch {
    return undefined;
  }
}

function persistParkProgress(snap: GameSnapshot, gridLayout?: GridCellSave[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(snap));
    if (gridLayout) {
      window.localStorage.setItem(GRID_STORAGE_KEY, JSON.stringify(gridLayout));
    }
  } catch {
    // 忽略隱私瀏覽模式或空間上限錯誤
  }
}

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<ParkEngine | null>(null);
  const popupIdRef = useRef(1);
  const initialLoadRef = useRef<{ snapshot: GameSnapshot; hasSaved: boolean } | null>(null);
  if (!initialLoadRef.current) {
    initialLoadRef.current = loadPersistedSnapshot();
  }

  const [snapshot, setSnapshot] = useState<GameSnapshot>(() => initialLoadRef.current!.snapshot);
  const [floatingItems, setFloatingItems] = useState<FloatingItem[]>([]);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [mgmtOpen, setMgmtOpen] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [researchOpen, setResearchOpen] = useState(false);
  const [arenaOpen, setArenaOpen] = useState(false);
  const [gateSettingsOpen, setGateSettingsOpen] = useState(false);
  const [showcaseOpen, setShowcaseOpen] = useState(false);
  const [showcaseSpecies, setShowcaseSpecies] = useState(1);
  const [inspectedDinoId, setInspectedDinoId] = useState<number | null>(null);
  const [capturedPhotos, setCapturedPhotos] = useState<CapturedPhoto[]>([]);
  const [webglError, setWebglError] = useState<string | null>(null);
  const snapshotRef = useRef<GameSnapshot>(snapshot);
  snapshotRef.current = snapshot;

  // 每次 snapshot 狀態更新時自動保存至 localStorage
  useEffect(() => {
    if (!engineRef.current) return;
    persistParkProgress(snapshot, engineRef.current.exportGridLayout());
  }, [snapshot]);

  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const saved = initialLoadRef.current;
    const savedGrid = loadPersistedGridLayout();

    let engine: ParkEngine;
    try {
      engine = new ParkEngine(
        mount,
        {
          onSnapshot: (snap) => setSnapshot(snap),
          onToast: (msg, tone = 'info') => {
            const id = Date.now() + Math.random();
            setToast({ id, msg, tone });
            window.setTimeout(() => {
              setToast((cur) => (cur && cur.id === id ? null : cur));
            }, 2600);
          },
          onSelectDinoForShowcase: (dinoId, speciesType) => {
            setInspectedDinoId(dinoId);
            setShowcaseSpecies(speciesType);
            setShowcaseOpen(true);
          },
          onOpenGateSettings: () => {
            setGateSettingsOpen(true);
          },
          onOpenArena: () => {
            setArenaOpen(true);
          },
          onFloatingText: (x, y, text, variant) => {
            const id = popupIdRef.current++;
            setFloatingItems((prev) => [...prev.slice(-24), { id, x, y, text, variant }]);
            window.setTimeout(() => {
              setFloatingItems((prev) => prev.filter((item) => item.id !== id));
            }, 1500);
          },
        },
        saved?.hasSaved ? { snapshot: saved.snapshot, gridLayout: savedGrid } : undefined
      );
      engineRef.current = engine;
    } catch (err) {
      setWebglError(err instanceof Error ? err.message : 'WebGL 初始化失敗');
      return;
    }

    const handleBeforeUnload = () => {
      persistParkProgress(snapshotRef.current, engine.exportGridLayout());
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    const canvasEl = mount.querySelector('canvas');
    const onContextLost = (e: Event) => {
      e.preventDefault();
      setWebglError('3D 繪圖裝置連線中斷，請重新整理頁面。');
    };
    const onContextRestored = () => setWebglError(null);
    canvasEl?.addEventListener('webglcontextlost', onContextLost);
    canvasEl?.addEventListener('webglcontextrestored', onContextRestored);

    return () => {
      persistParkProgress(snapshotRef.current, engine.exportGridLayout());
      window.removeEventListener('beforeunload', handleBeforeUnload);
      canvasEl?.removeEventListener('webglcontextlost', onContextLost);
      canvasEl?.removeEventListener('webglcontextrestored', onContextRestored);
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const handleResetSave = () => {
    try {
      window.localStorage.removeItem(SNAPSHOT_STORAGE_KEY);
      window.localStorage.removeItem(GRID_STORAGE_KEY);
    } catch {
      // ignore
    }
    engineRef.current?.resetParkProgress();
  };

  const handleSelectTool = (
    mode: ToolMode,
    opts?: { dinoType?: number; facilityKey?: FacilityKey }
  ) => {
    engineRef.current?.setTool(mode, opts);
  };

  const handleInspectSpecies = (speciesType: number) => {
    setInspectedDinoId(null);
    setShowcaseSpecies(speciesType);
    setShowcaseOpen(true);
  };

  const handleInspectPlacedDino = (dinoId: number, speciesType: number) => {
    setInspectedDinoId(dinoId);
    setShowcaseSpecies(speciesType);
    setShowcaseOpen(true);
  };

  const toastToneClass =
    toast?.tone === 'error'
      ? 'bg-red-950/95 border-red-400/60 text-red-200'
      : toast?.tone === 'warn'
        ? 'bg-amber-950/95 border-amber-400/60 text-amber-200'
        : toast?.tone === 'success'
          ? 'bg-emerald-950/95 border-emerald-400/60 text-emerald-200'
          : 'bg-slate-900/95 border-white/20 text-slate-100';

  return (
    <div className="relative w-full h-full overflow-hidden bg-sky-950">
      {/* Dedicated isolated WebGL canvas container */}
      <div ref={canvasMountRef} className="fixed inset-0 z-0 w-full h-full" />

      {/* WebGL unavailable fallback */}
      {webglError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-6">
          <div className="max-w-md rounded-2xl bg-slate-900 border border-white/15 p-6 text-center">
            <h2 className="text-lg font-bold text-amber-300 mb-2">無法啟動 3D 繪圖引擎</h2>
            <p className="text-sm text-slate-300">{webglError}</p>
          </div>
        </div>
      )}

      {/* Floating +$ effects layer */}
      <div className="fixed inset-0 z-10 pointer-events-none overflow-hidden">
        {floatingItems.map((item) => (
          <div
            key={item.id}
            className={`floating-money ${item.variant === 'shop' ? 'shop text-emerald-300' : 'text-yellow-300'}`}
            style={{ left: item.x, top: item.y }}
          >
            {item.text}
          </div>
        ))}
      </div>

      {/* Top HUD vs First-Person Visitor Overlay */}
      {snapshot.cameraMode === 'overview' ? (
        <TopHud
          snapshot={snapshot}
          onOpenManagement={() => setMgmtOpen(true)}
          onOpenShowcase={() => {
            setInspectedDinoId(null);
            setShowcaseOpen(true);
          }}
          onOpenGateSettings={() => setGateSettingsOpen(true)}
          onResetCamera={() => engineRef.current?.resetCamera()}
          onToggleCameraMode={() => engineRef.current?.toggleCameraMode()}
          onToggleSoundMute={() => engineRef.current?.toggleSoundMuted()}
          onSetSoundVolume={(vol) => engineRef.current?.setSoundVolume(vol)}
          onSetTimeMode={(mode) => engineRef.current?.setTimeMode(mode)}
          onSetDayCycleDuration={(sec) => engineRef.current?.setDayCycleDuration(sec)}
          onSetWeatherMode={(mode) => engineRef.current?.setWeatherMode(mode)}
        />
      ) : (
        <FirstPersonOverlay
          snapshot={snapshot}
          photos={capturedPhotos}
          onExitFirstPerson={() => engineRef.current?.setCameraMode('overview')}
          onCapturePhoto={() => {
            const dataUrl = engineRef.current?.capturePhoto();
            if (dataUrl) {
              const weatherLabel =
                snapshot.currentWeather === 'sunny'
                  ? '晴天'
                  : snapshot.currentWeather === 'rainy'
                    ? '雨天'
                    : '大霧';
              setCapturedPhotos((prev) => [
                {
                  id: Date.now(),
                  dataUrl,
                  clockLabel: snapshot.clockLabel,
                  weatherLabel,
                },
                ...prev.slice(0, 11),
              ]);
            }
          }}
          onMoveStep={(fwd, strafe) => engineRef.current?.moveFirstPersonStep(fwd, strafe)}
          onDeletePhoto={(id) =>
            setCapturedPhotos((prev) => prev.filter((p) => p.id !== id))
          }
        />
      )}

      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-20 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-xl border text-xs font-bold shadow-xl max-w-[92vw] text-center ${toastToneClass}`}
        >
          {toast.msg}
        </div>
      )}

      {/* Bottom Collapsible Dock (Overview Mode Only) */}
      {snapshot.cameraMode === 'overview' && (
        <BottomDock
          snapshot={snapshot}
          onSelectTool={handleSelectTool}
          onInspectSpecies={handleInspectSpecies}
          onOpenResearchLab={() => setResearchOpen(true)}
          onOpenArena={() => setArenaOpen(true)}
        />
      )}

      {/* Gate Name & Ticket Price Settings Modal */}
      <GateSettingsModal
        open={gateSettingsOpen}
        snapshot={snapshot}
        onClose={() => setGateSettingsOpen(false)}
        onSetParkName={(name) => engineRef.current?.setParkName(name)}
        onSetTicketPrice={(price) => engineRef.current?.setTicketPrice(price)}
      />

      {/* Management & Financial Ledger Modal */}
      <ManagementModal
        open={mgmtOpen}
        snapshot={snapshot}
        onClose={() => setMgmtOpen(false)}
        onHireStaff={(role: StaffRole) => engineRef.current?.hireStaff(role)}
        onFireStaff={(role: StaffRole) => engineRef.current?.fireStaff(role)}
        onBuyFeed={() => engineRef.current?.buyFeedPack()}
        onToggleAutoBuyFeed={() => engineRef.current?.toggleAutoBuyFeed()}
        onInspectDino={handleInspectPlacedDino}
        onFeedDino={(dinoId) => engineRef.current?.feedSingleDino(dinoId)}
        onSetTicketPrice={(price) => engineRef.current?.setTicketPrice(price)}
        onOpenGateSettings={() => setGateSettingsOpen(true)}
        onOpenAnalytics={() => setAnalyticsOpen(true)}
        onOpenResearchLab={() => setResearchOpen(true)}
        onOpenArena={() => setArenaOpen(true)}
        onResetSave={handleResetSave}
      />

      {/* Research Lab & Tech Tree Modal */}
      <ResearchLabModal
        open={researchOpen}
        snapshot={snapshot}
        onClose={() => setResearchOpen(false)}
        onBackToManagement={() => {
          setResearchOpen(false);
          setMgmtOpen(true);
        }}
        onUnlockTech={(techId) => engineRef.current?.unlockTech(techId)}
      />

      {/* 3D Dinosaur Arena Duel Modal */}
      <ArenaModal
        open={arenaOpen}
        snapshot={snapshot}
        onClose={() => setArenaOpen(false)}
        onCompleteBattle={(dinoAId, dinoBId, winnerId) =>
          engineRef.current?.resolveArenaBattle(dinoAId, dinoBId, winnerId) ?? null
        }
        onPlayImpact={(heavy) => engineRef.current?.playArenaImpact(heavy)}
        onPlayRoar={(speciesType) => engineRef.current?.playDinoRoar(speciesType)}
        onBuildArena={() => handleSelectTool('facility', { facilityKey: 'arena' })}
      />

      {/* Recharts Analytics Dashboard Modal */}
      <AnalyticsDashboardModal
        open={analyticsOpen}
        snapshot={snapshot}
        onClose={() => setAnalyticsOpen(false)}
        onBackToManagement={() => {
          setAnalyticsOpen(false);
          setMgmtOpen(true);
        }}
      />

      {/* 3D Dinosaur Showcase & Details Modal */}
      <ShowcaseModal
        open={showcaseOpen}
        speciesType={showcaseSpecies}
        inspectedDinoId={inspectedDinoId}
        snapshot={snapshot}
        onClose={() => setShowcaseOpen(false)}
        onChangeSpecies={(sp) => {
          setInspectedDinoId(null);
          setShowcaseSpecies(sp);
        }}
        onFeedDino={(dinoId) => engineRef.current?.feedSingleDino(dinoId)}
        onSellDino={(dinoId) => engineRef.current?.sellSingleDino(dinoId)}
      />
    </div>
  );
}
