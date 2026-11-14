import React, { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowLeft, DollarSign, TrendingUp, Users, X } from 'lucide-react';
import { AnalyticsPoint, GameSnapshot, WeatherType } from '../game/types';

interface AnalyticsDashboardModalProps {
  open: boolean;
  snapshot: GameSnapshot;
  onClose: () => void;
  onBackToManagement: () => void;
}

type RangeFilter = 'all' | '30' | '15';
type RevenueViewMode = 'combined' | 'cumulative';

const WEATHER_LABEL: Record<WeatherType, string> = {
  sunny: '晴天',
  rainy: '雨天',
  foggy: '大霧',
};

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: AnalyticsPoint }>;
  mode: 'visitors' | 'revenue';
}

const ChartTooltip: React.FC<CustomTooltipProps> = ({ active, payload, mode }) => {
  if (!active || !payload || payload.length === 0) return null;
  const pt = payload[0].payload;
  return (
    <div className="rounded-lg bg-slate-950 border border-white/15 px-3 py-2 shadow-xl text-xs">
      <div className="font-bold text-slate-200 font-mono-num mb-1">
        {pt.timeLabel} · {WEATHER_LABEL[pt.weather]}
      </div>
      {mode === 'visitors' ? (
        <div className="flex flex-col gap-0.5 font-mono-num">
          <div className="flex items-center justify-between gap-4">
            <span className="text-slate-400">在園訪客數</span>
            <span className="font-bold text-sky-300">{pt.visitorCount} 人</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-slate-400">遊客滿意度</span>
            <span className="font-bold text-emerald-300">{pt.satisfaction}%</span>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-0.5 font-mono-num">
          <div className="flex items-center justify-between gap-4">
            <span className="text-slate-400">累計總營收</span>
            <span className="font-bold text-amber-300">${pt.totalRevenue.toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-slate-400">單期區間創收</span>
            <span className="font-bold text-emerald-300">+${pt.periodRevenue.toLocaleString()}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export const AnalyticsDashboardModal: React.FC<AnalyticsDashboardModalProps> = ({
  open,
  snapshot,
  onClose,
  onBackToManagement,
}) => {
  const [rangeFilter, setRangeFilter] = useState<RangeFilter>('all');
  const [revenueView, setRevenueView] = useState<RevenueViewMode>('combined');

  const chartData = useMemo(() => {
    const history = snapshot.analyticsHistory;
    if (rangeFilter === '15') return history.slice(-15);
    if (rangeFilter === '30') return history.slice(-30);
    return history;
  }, [snapshot.analyticsHistory, rangeFilter]);

  const metrics = useMemo(() => {
    if (chartData.length === 0) {
      return {
        peakVisitors: snapshot.visitorCount,
        avgVisitors: snapshot.visitorCount,
        latestPeriodRevenue: 0,
        revenueGrowthDelta: 0,
      };
    }
    const peakVisitors = chartData.reduce((m, p) => Math.max(m, p.visitorCount), 0);
    const avgVisitors = Math.round(
      chartData.reduce((acc, p) => acc + p.visitorCount, 0) / chartData.length
    );
    const latest = chartData[chartData.length - 1];
    const first = chartData[0];
    return {
      peakVisitors,
      avgVisitors,
      latestPeriodRevenue: latest.periodRevenue,
      revenueGrowthDelta: latest.totalRevenue - first.totalRevenue,
    };
  }, [chartData, snapshot.visitorCount]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4"
      onClick={onClose}
    >
      <div
        className="w-[min(1040px,96vw)] max-h-[90vh] rounded-2xl bg-slate-900 border border-white/15 shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-white/10 bg-slate-950/60">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-slate-400 mb-0.5">
              <span>{snapshot.parkName}</span>
              <span aria-hidden="true">/</span>
              <span>經營管理</span>
              <span aria-hidden="true">/</span>
              <span className="text-sky-300 font-semibold">分析儀錶板</span>
            </div>
            <h2 className="text-base font-extrabold text-white">
              園區訪客趨勢與收入增長分析
            </h2>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Time window segmented control */}
            <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-950/80 border border-white/10">
              {(
                [
                  { id: '15', label: '近 15 筆' },
                  { id: '30', label: '近 30 筆' },
                  { id: 'all', label: '全部紀錄' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setRangeFilter(opt.id)}
                  className={`px-2.5 py-1 rounded-md text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    rangeFilter === opt.id
                      ? 'bg-sky-500/25 text-sky-200 border border-sky-400/40'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <button
              onClick={onBackToManagement}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 text-slate-100 text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>返回管理</span>
            </button>

            <button
              onClick={onClose}
              aria-label="關閉分析儀錶板"
              className="p-1.5 rounded-lg bg-white/10 hover:bg-red-500/30 text-slate-200 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto custom-scroll flex flex-col gap-6">
          {/* 4-Column KPI Strip (single elevation, tabular-nums) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-xl bg-slate-950/60 border border-white/10 px-4 py-3 flex flex-col gap-1">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>目前在園訪客</span>
                <Users className="w-3.5 h-3.5 text-sky-400" />
              </div>
              <div className="text-xl font-extrabold text-sky-300 font-mono-num">
                {snapshot.visitorCount} 人
              </div>
              <div className="text-[11px] text-slate-400 font-mono-num">
                目前天氣：{WEATHER_LABEL[snapshot.currentWeather]} · 滿意度 {snapshot.satisfaction}%
              </div>
            </div>

            <div className="rounded-xl bg-slate-950/60 border border-white/10 px-4 py-3 flex flex-col gap-1">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>園區累計總營收</span>
                <DollarSign className="w-3.5 h-3.5 text-amber-400" />
              </div>
              <div className="text-xl font-extrabold text-amber-300 font-mono-num">
                ${snapshot.cumulativeRevenue.toLocaleString()}
              </div>
              <div className="text-[11px] text-slate-400 font-mono-num">
                區間淨增長 +${metrics.revenueGrowthDelta.toLocaleString()}
              </div>
            </div>

            <div className="rounded-xl bg-slate-950/60 border border-white/10 px-4 py-3 flex flex-col gap-1">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>尖峰 / 平均訪客</span>
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div className="text-xl font-extrabold text-emerald-300 font-mono-num">
                {metrics.peakVisitors} / {metrics.avgVisitors} 人
              </div>
              <div className="text-[11px] text-slate-400 font-mono-num">
                取樣樣本：{chartData.length} 筆 (每 4 秒更新)
              </div>
            </div>

            <div className="rounded-xl bg-slate-950/60 border border-white/10 px-4 py-3 flex flex-col gap-1">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>入園門票定價</span>
                <TrendingUp className="w-3.5 h-3.5 text-yellow-400" />
              </div>
              <div className="text-xl font-extrabold text-yellow-300 font-mono-num">
                ${snapshot.ticketPrice}
              </div>
              <div className="text-[11px] text-slate-400 font-mono-num">
                最近單期創收 +${metrics.latestPeriodRevenue.toLocaleString()}
              </div>
            </div>
          </div>

          {chartData.length < 2 ? (
            <div className="rounded-xl bg-slate-950/60 border border-white/10 p-10 text-center flex flex-col items-center gap-2">
              <div className="text-sm font-bold text-slate-200">
                正在累積即時營運時序資料
              </div>
              <p className="text-xs text-slate-400 max-w-md">
                系統每 4 秒自動記錄一次在園訪客數量、天氣狀態與累計營收，待累積 2 筆以上數據後即會自動繪製完整趨勢圖表。
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Chart 1: Visitor Count Trend */}
              <section className="rounded-xl bg-slate-950/60 border border-white/10 p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                  <div>
                    <h3 className="text-sm font-bold text-white">訪客數量趨勢變化</h3>
                    <p className="text-[11px] text-slate-400">
                      追蹤不同時段與天氣變化下在園人數波動
                    </p>
                  </div>
                  <span className="text-xs font-mono-num text-sky-300 font-bold">
                    最新 {chartData[chartData.length - 1]?.visitorCount ?? 0} 人
                  </span>
                </div>

                <div className="w-full h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={chartData}
                      margin={{ top: 8, right: 12, left: -16, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="visitorTrendGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.45} />
                          <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                      <XAxis
                        dataKey="timeLabel"
                        stroke="#94a3b8"
                        tick={{ fontSize: 11, fill: '#94a3b8' }}
                        minTickGap={18}
                      />
                      <YAxis
                        allowDecimals={false}
                        stroke="#94a3b8"
                        tick={{ fontSize: 11, fill: '#94a3b8' }}
                      />
                      <Tooltip content={<ChartTooltip mode="visitors" />} />
                      <Area
                        type="monotone"
                        dataKey="visitorCount"
                        name="在園訪客數"
                        stroke="#38bdf8"
                        strokeWidth={2.2}
                        fillOpacity={1}
                        fill="url(#visitorTrendGrad)"
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </section>

              {/* Chart 2: Revenue Growth Over Time */}
              <section className="rounded-xl bg-slate-950/60 border border-white/10 p-4 flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2.5">
                  <div>
                    <h3 className="text-sm font-bold text-white">收入增長隨時間變化</h3>
                    <p className="text-[11px] text-slate-400">
                      累計總營收曲線與各時段單期新增收入
                    </p>
                  </div>
                  <div className="flex items-center gap-1 p-0.5 rounded-md bg-slate-900 border border-white/10">
                    <button
                      onClick={() => setRevenueView('combined')}
                      className={`px-2 py-1 rounded text-[11px] font-bold cursor-pointer whitespace-nowrap ${
                        revenueView === 'combined'
                          ? 'bg-amber-500/25 text-amber-200'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      雙軸對比
                    </button>
                    <button
                      onClick={() => setRevenueView('cumulative')}
                      className={`px-2 py-1 rounded text-[11px] font-bold cursor-pointer whitespace-nowrap ${
                        revenueView === 'cumulative'
                          ? 'bg-amber-500/25 text-amber-200'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      累計曲線
                    </button>
                  </div>
                </div>

                <div className="w-full h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    {revenueView === 'combined' ? (
                      <ComposedChart
                        data={chartData}
                        margin={{ top: 8, right: 8, left: -4, bottom: 0 }}
                      >
                        <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                        <XAxis
                          dataKey="timeLabel"
                          stroke="#94a3b8"
                          tick={{ fontSize: 11, fill: '#94a3b8' }}
                          minTickGap={18}
                        />
                        <YAxis
                          yAxisId="left"
                          stroke="#f59e0b"
                          tick={{ fontSize: 11, fill: '#fbbf24' }}
                          tickFormatter={(v) => `$${v}`}
                        />
                        <YAxis
                          yAxisId="right"
                          orientation="right"
                          stroke="#10b981"
                          tick={{ fontSize: 11, fill: '#34d399' }}
                          tickFormatter={(v) => `+$${v}`}
                        />
                        <Tooltip content={<ChartTooltip mode="revenue" />} />
                        <Bar
                          yAxisId="right"
                          dataKey="periodRevenue"
                          name="區間新增收入"
                          fill="#10b981"
                          fillOpacity={0.55}
                          radius={[3, 3, 0, 0]}
                          maxBarSize={20}
                          isAnimationActive={false}
                        />
                        <Line
                          yAxisId="left"
                          type="monotone"
                          dataKey="totalRevenue"
                          name="累計總營收"
                          stroke="#fbbf24"
                          strokeWidth={2.4}
                          dot={false}
                          isAnimationActive={false}
                        />
                      </ComposedChart>
                    ) : (
                      <AreaChart
                        data={chartData}
                        margin={{ top: 8, right: 12, left: -4, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient id="revenueAreaGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#fbbf24" stopOpacity={0.45} />
                            <stop offset="95%" stopColor="#fbbf24" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                        <XAxis
                          dataKey="timeLabel"
                          stroke="#94a3b8"
                          tick={{ fontSize: 11, fill: '#94a3b8' }}
                          minTickGap={18}
                        />
                        <YAxis
                          stroke="#fbbf24"
                          tick={{ fontSize: 11, fill: '#fbbf24' }}
                          tickFormatter={(v) => `$${v}`}
                        />
                        <Tooltip content={<ChartTooltip mode="revenue" />} />
                        <Area
                          type="monotone"
                          dataKey="totalRevenue"
                          name="累計總營收"
                          stroke="#fbbf24"
                          strokeWidth={2.4}
                          fillOpacity={1}
                          fill="url(#revenueAreaGrad)"
                          isAnimationActive={false}
                        />
                      </AreaChart>
                    )}
                  </ResponsiveContainer>
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
