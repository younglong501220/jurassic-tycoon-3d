import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Eye, Hammer, Info, Lock, Swords, Zap } from 'lucide-react';
import { DINO_SPECIES, FACILITY_CONFIGS, FENCE_COST } from '../game/config';
import { FacilityKey, GameSnapshot, ToolMode } from '../game/types';

interface BottomDockProps {
  snapshot: GameSnapshot;
  onSelectTool: (mode: ToolMode, opts?: { dinoType?: number; facilityKey?: FacilityKey }) => void;
  onInspectSpecies: (speciesType: number) => void;
  onOpenResearchLab: () => void;
  onOpenArena: () => void;
}

type CatalogTab = 'dinos' | 'shops' | 'utilities';

export const BottomDock: React.FC<BottomDockProps> = ({
  snapshot,
  onSelectTool,
  onInspectSpecies,
  onOpenResearchLab,
  onOpenArena,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<CatalogTab>('dinos');

  const dinos = Object.values(DINO_SPECIES);
  const shops = Object.values(FACILITY_CONFIGS).filter((f) => f.category === 'shop');
  const utilities = Object.values(FACILITY_CONFIGS).filter((f) => f.category === 'utility');
  const unlockedSet = new Set(snapshot.unlockedSpeciesIds);

  const getModeLabel = () => {
    switch (snapshot.activeTool) {
      case 'inspect':
        return '觀察模式：點選恐龍看 3D 展示，或點南側大門改名與調整門票';
      case 'fence':
        return `建造高壓柵欄 ($${FENCE_COST})：點擊草地自動連線`;
      case 'demolish':
        return '拆除回收模式：點擊設施或恐龍退還 50% 資金';
      case 'dino': {
        const cfg = DINO_SPECIES[snapshot.selectedDinoType];
        const ruleHint =
          cfg.diet === '肉食'
            ? '不同肉食不可同區，可與草食/飛行共處'
            : '可與草食、飛行或單一肉食恐龍共處';
        return `放入【${cfg.name}】($${cfg.cost})：${ruleHint}`;
      }
      case 'facility': {
        const fCfg = FACILITY_CONFIGS[snapshot.selectedFacilityKey];
        return `建造【${fCfg.name}】($${fCfg.cost})：點擊空草地放置`;
      }
    }
  };

  return (
    <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center w-[min(1180px,97vw)] pointer-events-none">
      {/* Collapse / Expand toggle */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="pointer-events-auto mb-1.5 flex items-center gap-1.5 px-3 py-1 rounded-t-xl bg-slate-950/90 border border-b-0 border-white/15 text-xs font-bold text-slate-300 hover:text-white cursor-pointer"
      >
        {collapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        <span>{collapsed ? '展開建設選單' : '收合選單'}</span>
      </button>

      {!collapsed && (
        <section className="pointer-events-auto w-full rounded-2xl bg-slate-950/90 border border-white/15 shadow-2xl p-3 flex flex-col gap-2.5">
          {/* Header Tabs & Active Mode Status */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-white/10">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setActiveTab('dinos')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'dinos'
                    ? 'bg-amber-500/25 text-amber-200 border border-amber-400/50'
                    : 'bg-white/5 text-slate-400 hover:text-white border border-transparent'
                }`}
              >
                恐龍培育 ({dinos.length}種)
              </button>
              <button
                onClick={() => setActiveTab('shops')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'shops'
                    ? 'bg-emerald-500/25 text-emerald-200 border border-emerald-400/50'
                    : 'bg-white/5 text-slate-400 hover:text-white border border-transparent'
                }`}
              >
                商店設施 ({shops.length}種)
              </button>
              <button
                onClick={() => setActiveTab('utilities')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'utilities'
                    ? 'bg-sky-500/25 text-sky-200 border border-sky-400/50'
                    : 'bg-white/5 text-slate-400 hover:text-white border border-transparent'
                }`}
              >
                公共設施與展區 ({utilities.length}種)
              </button>
            </div>

            <div className="text-xs font-semibold text-slate-300 truncate max-w-full">
              {getModeLabel()}
            </div>
          </div>

          {/* Dock Body */}
          <div className="flex flex-col md:flex-row gap-3 items-stretch">
            {/* Left Basic Tools */}
            <div className="flex md:flex-col gap-1.5 md:w-44 shrink-0 md:pr-3 md:border-r border-white/10">
              <button
                onClick={() => onSelectTool('inspect')}
                className={`flex-1 md:flex-initial flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-left transition-colors cursor-pointer ${
                  snapshot.activeTool === 'inspect'
                    ? 'bg-white/20 border-white/50 text-white'
                    : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                }`}
              >
                <Eye className="w-4 h-4 shrink-0 text-sky-300" />
                <div className="min-w-0">
                  <div className="text-xs font-bold whitespace-nowrap">觀察 / 檢視</div>
                  <div className="text-[10px] text-slate-400 truncate">點恐龍看展示</div>
                </div>
              </button>

              <button
                onClick={() => onSelectTool('fence')}
                className={`flex-1 md:flex-initial flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-left transition-colors cursor-pointer ${
                  snapshot.activeTool === 'fence'
                    ? 'bg-sky-500/25 border-sky-400 text-white'
                    : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                }`}
              >
                <Zap className="w-4 h-4 shrink-0 text-sky-300" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between text-xs font-bold whitespace-nowrap">
                    <span>高壓柵欄 Lv.{snapshot.fenceTier}</span>
                    <span className="text-yellow-300 font-mono-num">${FENCE_COST}</span>
                  </div>
                  <div className="text-[10px] text-slate-400 truncate">
                    {snapshot.fenceTier === 3
                      ? '等離子力場防護'
                      : snapshot.fenceTier === 2
                        ? '鈦合金強化電網'
                        : '區隔肉食恐龍'}
                  </div>
                </div>
              </button>

              <button
                onClick={() => onSelectTool('demolish')}
                className={`flex-1 md:flex-initial flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-left transition-colors cursor-pointer ${
                  snapshot.activeTool === 'demolish'
                    ? 'bg-red-500/25 border-red-400 text-white'
                    : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                }`}
              >
                <Hammer className="w-4 h-4 shrink-0 text-red-400" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between text-xs font-bold whitespace-nowrap">
                    <span>拆除回收</span>
                    <span className="text-rose-300 text-[10px]">退50%</span>
                  </div>
                  <div className="text-[10px] text-slate-400 truncate">移除設施恐龍</div>
                </div>
              </button>
            </div>

            {/* Right Catalog Grid */}
            <div className="flex-1 min-w-0">
              {activeTab === 'dinos' && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1.5">
                  {dinos.map((cfg) => {
                    const isUnlocked = unlockedSet.has(cfg.id);
                    const isSelected =
                      isUnlocked &&
                      snapshot.activeTool === 'dino' &&
                      snapshot.selectedDinoType === cfg.id;
                    return (
                      <div
                        key={cfg.id}
                        onClick={() => {
                          if (!isUnlocked) {
                            onOpenResearchLab();
                            return;
                          }
                          onSelectTool('dino', { dinoType: cfg.id });
                        }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            if (!isUnlocked) onOpenResearchLab();
                            else onSelectTool('dino', { dinoType: cfg.id });
                          }
                        }}
                        title={
                          isUnlocked
                            ? `點擊放置 ${cfg.name}`
                            : `尚未解鎖「${cfg.name}」，點擊開啟研究實驗室進行基因解密`
                        }
                        className={`flex items-center gap-2 px-2 py-1.5 rounded-xl border text-left transition-all cursor-pointer ${
                          !isUnlocked
                            ? 'bg-slate-900/70 border-white/10 opacity-70 hover:opacity-100 hover:border-emerald-400/50'
                            : isSelected
                              ? 'bg-amber-500/25 border-amber-400 shadow-sm'
                              : 'bg-white/5 border-white/10 hover:bg-white/15'
                        }`}
                      >
                        <div
                          className="w-5 h-5 rounded-md shrink-0 border border-white/30 flex items-center justify-center"
                          style={{ backgroundColor: cfg.hex }}
                        >
                          {!isUnlocked && <Lock className="w-3 h-3 text-white drop-shadow" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1 text-xs font-bold">
                            <span className="truncate">
                              {cfg.id}. {cfg.name}
                            </span>
                            {isUnlocked ? (
                              <span className="text-yellow-300 font-mono-num shrink-0">
                                ${cfg.cost}
                              </span>
                            ) : (
                              <span className="text-emerald-300 text-[10px] shrink-0">需研發</span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate">
                            {isUnlocked ? `${cfg.diet} · +$${cfg.income}/次` : '點擊前往實驗室解鎖'}
                          </div>
                        </div>
                        <button
                          type="button"
                          title={`查看 ${cfg.name} 3D 展示`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onInspectSpecies(cfg.id);
                          }}
                          className="p-1 rounded-md hover:bg-sky-500/30 text-slate-400 hover:text-sky-200 shrink-0 cursor-pointer"
                        >
                          <Info className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {activeTab === 'shops' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                  {shops.map((f) => {
                    const isSelected =
                      snapshot.activeTool === 'facility' && snapshot.selectedFacilityKey === f.key;
                    return (
                      <button
                        key={f.key}
                        onClick={() => onSelectTool('facility', { facilityKey: f.key })}
                        className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-emerald-500/25 border-emerald-400'
                            : 'bg-white/5 border-white/10 hover:bg-white/15'
                        }`}
                      >
                        <div
                          className="w-7 h-7 rounded-lg shrink-0 border border-white/30"
                          style={{ backgroundColor: f.colorHex }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between text-xs font-bold">
                            <span>{f.name}</span>
                            <span className="text-yellow-300 font-mono-num">${f.cost}</span>
                          </div>
                          <div className="text-[11px] text-slate-400 truncate">{f.desc}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {activeTab === 'utilities' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                  {utilities.map((f) => {
                    const isSelected =
                      snapshot.activeTool === 'facility' && snapshot.selectedFacilityKey === f.key;
                    const isArenaBuilt = f.key === 'arena' && snapshot.facilityCounts.arena > 0;
                    return (
                      <div
                        key={f.key}
                        onClick={() => onSelectTool('facility', { facilityKey: f.key })}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            onSelectTool('facility', { facilityKey: f.key });
                          }
                        }}
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border text-left transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-sky-500/25 border-sky-400'
                            : 'bg-white/5 border-white/10 hover:bg-white/15'
                        }`}
                      >
                        <div
                          className="w-7 h-7 rounded-lg shrink-0 border border-white/30"
                          style={{ backgroundColor: f.colorHex }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between text-xs font-bold gap-1">
                            <span className="truncate">{f.name}</span>
                            <span className="text-yellow-300 font-mono-num shrink-0">${f.cost}</span>
                          </div>
                          <div className="text-[11px] text-slate-400 truncate">{f.desc}</div>
                        </div>
                        {isArenaBuilt && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenArena();
                            }}
                            title="開啟 3D 競技場對決"
                            className="px-2 py-1 rounded-lg bg-rose-500/25 hover:bg-rose-500/40 border border-rose-400/50 text-rose-100 text-[10px] font-extrabold shrink-0 flex items-center gap-1 cursor-pointer"
                          >
                            <Swords className="w-3 h-3" />
                            <span>對決</span>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
};
