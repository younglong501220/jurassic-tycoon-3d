import React, { useEffect, useRef, useState } from 'react';
import {
  BarChart3,
  BookOpen,
  Clock,
  CloudFog,
  CloudRain,
  Edit3,
  Eye,
  Moon,
  RotateCcw,
  Sun,
  Sunrise,
  Sunset,
  Ticket,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  DINO_SPECIES,
  MAX_DAY_CYCLE_SECONDS,
  MIN_DAY_CYCLE_SECONDS,
} from '../game/config';
import { DayPhase, GameSnapshot, TimeMode, WeatherMode, WeatherType } from '../game/types';

interface TopHudProps {
  snapshot: GameSnapshot;
  onOpenManagement: () => void;
  onOpenShowcase: () => void;
  onOpenGateSettings: () => void;
  onResetCamera: () => void;
  onToggleCameraMode: () => void;
  onToggleSoundMute: () => void;
  onSetSoundVolume: (percent: number) => void;
  onSetTimeMode: (mode: TimeMode) => void;
  onSetDayCycleDuration: (seconds: number) => void;
  onSetWeatherMode: (mode: WeatherMode) => void;
}

const PHASE_META: Record<DayPhase, { label: string; colorClass: string }> = {
  morning: { label: '早上', colorClass: 'text-amber-300' },
  afternoon: { label: '下午', colorClass: 'text-yellow-300' },
  dusk: { label: '黃昏', colorClass: 'text-orange-400' },
  night: { label: '夜晚', colorClass: 'text-indigo-300' },
};

const TIME_MODES: { mode: TimeMode; label: string }[] = [
  { mode: 'auto', label: '自動循環' },
  { mode: 'morning', label: '早上' },
  { mode: 'afternoon', label: '下午' },
  { mode: 'dusk', label: '黃昏' },
  { mode: 'night', label: '夜晚' },
];

const WEATHER_META: Record<WeatherType, { label: string; colorClass: string; effectHint: string }> = {
  sunny: { label: '晴天', colorClass: 'text-amber-300', effectHint: '訪客入園踴躍 · 滿意度 +2%' },
  rainy: { label: '雨天', colorClass: 'text-sky-300', effectHint: '降雨影響 · 在園訪客與入園量大幅下降' },
  foggy: { label: '大霧', colorClass: 'text-slate-300', effectHint: '能見度降低 · 訪客略微減少' },
};

const WEATHER_MODES: { mode: WeatherMode; label: string }[] = [
  { mode: 'auto', label: '自動循環' },
  { mode: 'sunny', label: '晴天' },
  { mode: 'rainy', label: '雨天' },
  { mode: 'foggy', label: '大霧' },
];

export const TopHud: React.FC<TopHudProps> = ({
  snapshot,
  onOpenManagement,
  onOpenShowcase,
  onOpenGateSettings,
  onResetCamera,
  onToggleCameraMode,
  onToggleSoundMute,
  onSetSoundVolume,
  onSetTimeMode,
  onSetDayCycleDuration,
  onSetWeatherMode,
}) => {
  const [timeMenuOpen, setTimeMenuOpen] = useState(false);
  const [weatherMenuOpen, setWeatherMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const weatherMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!timeMenuOpen && !weatherMenuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setTimeMenuOpen(false);
      }
      if (weatherMenuRef.current && !weatherMenuRef.current.contains(e.target as Node)) {
        setWeatherMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handleOutside);
    return () => window.removeEventListener('mousedown', handleOutside);
  }, [timeMenuOpen, weatherMenuOpen]);

  const satColor =
    snapshot.satisfaction >= 75
      ? 'bg-emerald-500'
      : snapshot.satisfaction >= 45
        ? 'bg-amber-500'
        : 'bg-red-500';

  const phaseInfo = PHASE_META[snapshot.dayPhase];
  const PhaseIcon =
    snapshot.dayPhase === 'morning'
      ? Sunrise
      : snapshot.dayPhase === 'afternoon'
        ? Sun
        : snapshot.dayPhase === 'dusk'
          ? Sunset
          : Moon;

  const weatherInfo = WEATHER_META[snapshot.currentWeather];
  const WeatherIcon =
    snapshot.currentWeather === 'sunny'
      ? Sun
      : snapshot.currentWeather === 'rainy'
        ? CloudRain
        : CloudFog;

  const VolumeIcon =
    snapshot.soundMuted || snapshot.soundVolume === 0
      ? VolumeX
      : snapshot.soundVolume < 45
        ? Volume1
        : Volume2;

  return (
    <header className="fixed top-3 left-1/2 -translate-x-1/2 z-20 flex flex-wrap items-center justify-center gap-4 px-5 py-2.5 rounded-2xl bg-slate-950/90 border border-white/15 shadow-2xl max-w-[97vw]">
      {/* Brand (Gate Name & Ticket Price) */}
      <div className="flex items-center gap-2 pr-4 border-r border-white/15 shrink-0">
        <button
          onClick={onOpenGateSettings}
          title="點擊修改大門名稱與入園門票價格"
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-400/35 text-amber-300 transition-colors cursor-pointer"
        >
          <span className="text-base font-extrabold tracking-tight whitespace-nowrap">
            {snapshot.parkName}
          </span>
          <Edit3 className="w-3.5 h-3.5 text-amber-300/80 shrink-0" />
        </button>

        <button
          onClick={onOpenGateSettings}
          title="調整入園門票價格"
          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-yellow-500/15 hover:bg-yellow-500/30 border border-yellow-400/40 text-yellow-200 text-xs font-extrabold font-mono-num whitespace-nowrap transition-colors cursor-pointer"
        >
          <Ticket className="w-3.5 h-3.5 text-yellow-300" />
          <span>門票 ${snapshot.ticketPrice}</span>
        </button>
      </div>

      {/* Key Metrics */}
      <div className="flex items-center gap-5">
        <div className="flex flex-col">
          <span className="text-[11px] text-slate-400 whitespace-nowrap">公園資產</span>
          <span className="text-base font-extrabold text-yellow-300 font-mono-num whitespace-nowrap">
            ${snapshot.money.toLocaleString()}
          </span>
        </div>

        <div className="flex flex-col">
          <span className="text-[11px] text-slate-400 whitespace-nowrap">恐龍總數</span>
          <span className="text-base font-extrabold text-emerald-300 font-mono-num whitespace-nowrap">
            {snapshot.dinoCount} 隻 · {snapshot.uniqueSpeciesCount}/{Object.keys(DINO_SPECIES).length} 種
          </span>
        </div>

        <div className="flex flex-col">
          <span className="text-[11px] text-slate-400 whitespace-nowrap">飼料存量</span>
          <span
            className={`text-base font-extrabold font-mono-num whitespace-nowrap ${
              snapshot.feedStock < 30 ? 'text-red-400' : 'text-orange-300'
            }`}
          >
            {snapshot.feedStock} 單位
          </span>
        </div>

        <div className="flex flex-col">
          <span className="text-[11px] text-slate-400 whitespace-nowrap">顧客滿意度</span>
          <div className="flex items-center gap-2">
            <span className="text-base font-extrabold text-sky-300 font-mono-num whitespace-nowrap">
              {snapshot.satisfaction}%
            </span>
            <div className="w-14 h-1.5 bg-white/15 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${satColor}`}
                style={{ width: `${snapshot.satisfaction}%` }}
              />
            </div>
          </div>
        </div>

        <div className="hidden sm:flex flex-col">
          <span className="text-[11px] text-slate-400 whitespace-nowrap">遊客 / 結算</span>
          <span className="text-sm font-bold text-slate-200 font-mono-num whitespace-nowrap">
            {snapshot.visitorCount} 人 · {snapshot.cycleTimeLeft}s
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pl-3 border-l border-white/15 shrink-0">
        {/* Day-Night Cycle Control */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setTimeMenuOpen((v) => !v)}
            title="調整晝夜循環與時段"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/35 border border-indigo-400/45 text-slate-100 text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <PhaseIcon className={`w-3.5 h-3.5 ${phaseInfo.colorClass}`} />
            <span className={phaseInfo.colorClass}>{phaseInfo.label}</span>
            <span className="font-mono-num text-slate-200">{snapshot.clockLabel}</span>
            <span className="text-[10px] text-slate-400">
              ({snapshot.timeMode === 'auto' ? `${snapshot.dayCycleDuration}s` : '固定'})
            </span>
          </button>

          {timeMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-72 rounded-xl bg-slate-950 border border-white/20 shadow-2xl p-3.5 z-50 flex flex-col gap-3">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <div className="flex items-center gap-1.5 text-xs font-extrabold text-white">
                  <Clock className="w-3.5 h-3.5 text-indigo-300" />
                  <span>晝夜循環設定</span>
                </div>
                <span className="text-[11px] font-mono-num text-slate-300">
                  {phaseInfo.label} {snapshot.clockLabel}
                </span>
              </div>

              <div className="grid grid-cols-5 gap-1">
                {TIME_MODES.map((item) => {
                  const active = snapshot.timeMode === item.mode;
                  return (
                    <button
                      key={item.mode}
                      onClick={() => onSetTimeMode(item.mode)}
                      className={`px-1.5 py-1.5 rounded-lg text-[11px] font-bold border transition-colors whitespace-nowrap cursor-pointer ${
                        active
                          ? 'bg-indigo-500/35 border-indigo-400 text-indigo-100'
                          : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-col gap-1.5 pt-1 border-t border-white/10">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-300 font-bold">單次晝夜循環週期</span>
                  <span className="font-mono-num text-amber-300 font-bold">
                    {snapshot.dayCycleDuration} 秒 ({Math.round((snapshot.dayCycleDuration / 60) * 10) / 10} 分)
                  </span>
                </div>
                <input
                  type="range"
                  min={MIN_DAY_CYCLE_SECONDS}
                  max={MAX_DAY_CYCLE_SECONDS}
                  step={30}
                  value={snapshot.dayCycleDuration}
                  onChange={(e) => onSetDayCycleDuration(Number(e.target.value))}
                  className="w-full accent-indigo-400 cursor-pointer"
                />
                <div className="flex items-center justify-between gap-1">
                  {[180, 600, 1800, 3600].map((sec) => (
                    <button
                      key={sec}
                      onClick={() => onSetDayCycleDuration(sec)}
                      className={`flex-1 py-1 rounded-md text-[11px] font-mono-num font-bold border transition-colors cursor-pointer ${
                        snapshot.dayCycleDuration === sec
                          ? 'bg-amber-500/25 border-amber-400 text-amber-200'
                          : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                      }`}
                    >
                      {sec}s
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Weather Cycle Control */}
        <div className="relative" ref={weatherMenuRef}>
          <button
            onClick={() => {
              setWeatherMenuOpen((v) => !v);
              setTimeMenuOpen(false);
            }}
            title="切換或檢視天氣系統（晴天 / 雨天 / 大霧）"
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              snapshot.currentWeather === 'rainy'
                ? 'bg-sky-500/20 hover:bg-sky-500/35 border-sky-400/50 text-sky-100'
                : snapshot.currentWeather === 'foggy'
                  ? 'bg-slate-500/25 hover:bg-slate-500/40 border-slate-400/45 text-slate-100'
                  : 'bg-amber-500/15 hover:bg-amber-500/30 border-amber-400/40 text-amber-100'
            }`}
          >
            <WeatherIcon className={`w-3.5 h-3.5 ${weatherInfo.colorClass}`} />
            <span className={weatherInfo.colorClass}>{weatherInfo.label}</span>
            <span className="text-[10px] text-slate-300 font-mono-num">
              ({snapshot.weatherMode === 'auto' ? `${snapshot.weatherTimeLeft}s` : '固定'})
            </span>
          </button>

          {weatherMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-64 rounded-xl bg-slate-950 border border-white/20 shadow-2xl p-3.5 z-50 flex flex-col gap-3">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <div className="flex items-center gap-1.5 text-xs font-extrabold text-white">
                  <WeatherIcon className={`w-3.5 h-3.5 ${weatherInfo.colorClass}`} />
                  <span>天氣系統控制</span>
                </div>
                <span className={`text-[11px] font-bold ${weatherInfo.colorClass}`}>
                  目前：{weatherInfo.label}
                </span>
              </div>

              <div className="grid grid-cols-4 gap-1">
                {WEATHER_MODES.map((item) => {
                  const active = snapshot.weatherMode === item.mode;
                  return (
                    <button
                      key={item.mode}
                      onClick={() => onSetWeatherMode(item.mode)}
                      className={`px-1.5 py-1.5 rounded-lg text-[11px] font-bold border transition-colors whitespace-nowrap cursor-pointer ${
                        active
                          ? 'bg-sky-500/30 border-sky-400 text-sky-100'
                          : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>

              <p className="text-[11px] text-slate-300 leading-relaxed pt-1 border-t border-white/10">
                {weatherInfo.effectHint}
              </p>
            </div>
          )}
        </div>

        <button
          onClick={onOpenManagement}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/35 border border-amber-400/50 text-amber-200 text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <BarChart3 className="w-3.5 h-3.5" />
          <span>經營管理</span>
        </button>

        <button
          onClick={onOpenShowcase}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/35 border border-sky-400/50 text-sky-200 text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>恐龍展示</span>
        </button>

        <button
          onClick={onToggleCameraMode}
          title="切換為第一人稱遊客視角漫步園區並拍照"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/35 border border-emerald-400/50 text-emerald-200 text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Eye className="w-3.5 h-3.5" />
          <span>遊客視角</span>
        </button>

        <button
          onClick={onResetCamera}
          title="重置為斜 45 度俯瞰視角"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-slate-100 text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span className="hidden md:inline">重置視角</span>
        </button>

        {/* Mute Toggle + Adjustable Sound Volume Slider */}
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/10 border border-white/20 shrink-0">
          <button
            onClick={onToggleSoundMute}
            title={snapshot.soundMuted ? '開啟音效' : '靜音音效'}
            className={`flex items-center justify-center p-0.5 rounded transition-colors cursor-pointer ${
              snapshot.soundMuted
                ? 'text-rose-300 hover:text-rose-200'
                : 'text-slate-100 hover:text-amber-300'
            }`}
          >
            <VolumeIcon className="w-3.5 h-3.5" />
          </button>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            aria-label="調整園區音效音量"
            value={snapshot.soundMuted ? 0 : snapshot.soundVolume}
            onChange={(e) => onSetSoundVolume(Number(e.target.value))}
            className="w-16 accent-amber-400 cursor-pointer"
          />
          <span className="w-8 text-right text-[11px] font-mono-num font-bold text-slate-200">
            {snapshot.soundMuted ? 0 : snapshot.soundVolume}%
          </span>
        </div>
      </div>
    </header>
  );
};

