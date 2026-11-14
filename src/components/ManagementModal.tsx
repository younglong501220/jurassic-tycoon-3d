import React, { useState } from 'react';
import { FlaskConical, LineChart, Minus, Plus, RotateCcw, Swords, Ticket, X } from 'lucide-react';
import {
  FEED_PACK_AMOUNT,
  FEED_PACK_COST,
  MAX_TICKET_PRICE,
  MIN_TICKET_PRICE,
  STAFF_CONFIGS,
  TICKET_PRICE_STEP,
} from '../game/config';
import { GameSnapshot, StaffRole } from '../game/types';

interface ManagementModalProps {
  open: boolean;
  snapshot: GameSnapshot;
  onClose: () => void;
  onHireStaff: (role: StaffRole) => void;
  onFireStaff: (role: StaffRole) => void;
  onBuyFeed: () => void;
  onToggleAutoBuyFeed: () => void;
  onInspectDino: (dinoId: number, speciesType: number) => void;
  onFeedDino: (dinoId: number) => void;
  onSetTicketPrice: (price: number) => void;
  onOpenGateSettings: () => void;
  onOpenAnalytics: () => void;
  onOpenResearchLab: () => void;
  onOpenArena: () => void;
  onResetSave: () => void;
}

export const ManagementModal: React.FC<ManagementModalProps> = ({
  open,
  snapshot,
  onClose,
  onHireStaff,
  onFireStaff,
  onBuyFeed,
  onToggleAutoBuyFeed,
  onInspectDino,
  onFeedDino,
  onSetTicketPrice,
  onOpenGateSettings,
  onOpenAnalytics,
  onOpenResearchLab,
  onOpenArena,
  onResetSave,
}) => {
  const [confirmReset, setConfirmReset] = useState(false);
  if (!open) return null;

  const curRev =
    snapshot.currentCycleFinance.gateRevenue +
    snapshot.currentCycleFinance.ticketRevenue +
    snapshot.currentCycleFinance.shopRevenue;
  const lastRev =
    snapshot.lastCycleFinance.gateRevenue +
    snapshot.lastCycleFinance.ticketRevenue +
    snapshot.lastCycleFinance.shopRevenue;
  const lastExp =
    snapshot.lastCycleFinance.staffWages +
    snapshot.lastCycleFinance.facilityUpkeep +
    snapshot.lastCycleFinance.dinoUpkeep +
    snapshot.lastCycleFinance.feedCost;
  const lastNet = lastRev - lastExp;

  const roles: StaffRole[] = ['cleaner', 'keeper', 'security'];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-[min(960px,96vw)] max-h-[88vh] rounded-2xl bg-slate-900 border border-white/15 shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-white/10 bg-slate-950/60">
          <div>
            <h2 className="text-base font-extrabold text-white">園區經營管理與財務中心</h2>
            <p className="text-xs text-slate-400">
              每 20 秒自動結算員工薪資與設施營運費用（距離下次結算：{snapshot.cycleTimeLeft} 秒）
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={() => {
                onClose();
                onOpenResearchLab();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/35 border border-emerald-400/50 text-emerald-200 text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FlaskConical className="w-3.5 h-3.5" />
              <span>研究實驗室</span>
            </button>
            <button
              onClick={() => {
                onClose();
                onOpenArena();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/35 border border-rose-400/50 text-rose-200 text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Swords className="w-3.5 h-3.5" />
              <span>恐龍競技場</span>
            </button>
            <button
              onClick={() => {
                onClose();
                onOpenAnalytics();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/35 border border-sky-400/50 text-sky-200 text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LineChart className="w-3.5 h-3.5" />
              <span>分析儀錶板</span>
            </button>
            {confirmReset ? (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    onResetSave();
                    setConfirmReset(false);
                    onClose();
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-extrabold cursor-pointer whitespace-nowrap"
                >
                  確認清除重開
                </button>
                <button
                  onClick={() => setConfirmReset(false)}
                  className="px-2 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 text-xs font-bold cursor-pointer"
                >
                  取消
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmReset(true)}
                title="清除本地存檔並重新開始"
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-red-500/20 border border-white/15 hover:border-red-400/40 text-slate-300 hover:text-red-200 text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>重置存檔</span>
              </button>
            )}
            <button
              onClick={() => {
                setConfirmReset(false);
                onClose();
              }}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-red-500/30 text-slate-200 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto custom-scroll flex flex-col gap-5">
          {/* Top 2 Columns: Finance + Staff & Feed */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Financial Ledger */}
            <div className="rounded-xl bg-white/5 border border-white/10 p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <h3 className="text-sm font-bold text-amber-300">營運營收與支出報表</h3>
                <span className="text-xs text-slate-400 font-mono-num">
                  現有資金 ${snapshot.money.toLocaleString()}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-slate-950/50 rounded-lg p-3 flex flex-col gap-1.5">
                  <div className="text-slate-400 font-bold mb-0.5">本週期即時營收</div>
                  <div className="flex justify-between">
                    <span>大門入園門票</span>
                    <span className="text-amber-300 font-mono-num">
                      +${snapshot.currentCycleFinance.gateRevenue}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>恐龍觀賞收益</span>
                    <span className="text-yellow-300 font-mono-num">
                      +${snapshot.currentCycleFinance.ticketRevenue}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>商店餐飲禮品</span>
                    <span className="text-emerald-300 font-mono-num">
                      +${snapshot.currentCycleFinance.shopRevenue}
                    </span>
                  </div>
                  <div className="flex justify-between pt-1.5 border-t border-white/10 font-bold">
                    <span>本週期累計</span>
                    <span className="text-white font-mono-num">+${curRev}</span>
                  </div>
                </div>

                <div className="bg-slate-950/50 rounded-lg p-3 flex flex-col gap-1.5">
                  <div className="text-slate-400 font-bold mb-0.5">上週期完整損益</div>
                  <div className="flex justify-between">
                    <span>總營收</span>
                    <span className="text-emerald-300 font-mono-num">+${lastRev}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>員工薪資</span>
                    <span className="text-rose-300 font-mono-num">
                      -${snapshot.lastCycleFinance.staffWages}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>設施與恐龍維護</span>
                    <span className="text-rose-300 font-mono-num">
                      -${snapshot.lastCycleFinance.facilityUpkeep + snapshot.lastCycleFinance.dinoUpkeep}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>飼料採購費</span>
                    <span className="text-rose-300 font-mono-num">
                      -${snapshot.lastCycleFinance.feedCost}
                    </span>
                  </div>
                  <div className="flex justify-between pt-1.5 border-t border-white/10 font-bold">
                    <span>上期淨利</span>
                    <span
                      className={`font-mono-num ${
                        lastNet >= 0 ? 'text-emerald-400' : 'text-red-400'
                      }`}
                    >
                      {lastNet >= 0 ? `+$${lastNet}` : `-$${Math.abs(lastNet)}`}
                    </span>
                  </div>
                </div>
              </div>

              {/* Park Quality Indices */}
              <div className="grid grid-cols-3 gap-2 pt-1 text-center text-xs">
                <div className="bg-slate-950/40 rounded-lg py-2 px-2">
                  <div className="text-slate-400 text-[11px]">安全防護評級</div>
                  <div className="text-sm font-extrabold text-sky-300 font-mono-num">
                    {snapshot.safetyRating}%
                  </div>
                </div>
                <div className="bg-slate-950/40 rounded-lg py-2 px-2">
                  <div className="text-slate-400 text-[11px]">園區整潔度</div>
                  <div className="text-sm font-extrabold text-emerald-300 font-mono-num">
                    {snapshot.cleanlinessRating}%
                  </div>
                </div>
                <div className="bg-slate-950/40 rounded-lg py-2 px-2">
                  <div className="text-slate-400 text-[11px]">待清理垃圾</div>
                  <div className="text-sm font-extrabold text-amber-300 font-mono-num">
                    {snapshot.litterCount} 處
                  </div>
                </div>
              </div>

              {/* Quick Gate & Ticket Price Controls */}
              <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-950/50 px-3 py-2.5 rounded-lg border border-white/10">
                <div className="text-xs min-w-0">
                  <div className="font-bold text-amber-300 flex items-center gap-1.5">
                    <Ticket className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">大門名稱：{snapshot.parkName}</span>
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono-num">
                    參考合理票價：${snapshot.fairTicketPrice}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => onSetTicketPrice(snapshot.ticketPrice - TICKET_PRICE_STEP)}
                    disabled={snapshot.ticketPrice <= MIN_TICKET_PRICE}
                    className="p-1.5 rounded bg-white/10 hover:bg-white/20 disabled:opacity-30 border border-white/15 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="px-2 text-xs font-extrabold text-yellow-300 font-mono-num">
                    ${snapshot.ticketPrice}
                  </span>
                  <button
                    onClick={() => onSetTicketPrice(snapshot.ticketPrice + TICKET_PRICE_STEP)}
                    disabled={snapshot.ticketPrice >= MAX_TICKET_PRICE}
                    className="p-1.5 rounded bg-white/10 hover:bg-white/20 disabled:opacity-30 border border-white/15 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      onClose();
                      onOpenGateSettings();
                    }}
                    className="ml-1 px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/35 border border-amber-400/50 text-amber-200 text-xs font-bold cursor-pointer"
                  >
                    改名 / 調價
                  </button>
                </div>
              </div>
            </div>

            {/* Staff & Feed Control */}
            <div className="rounded-xl bg-white/5 border border-white/10 p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <h3 className="text-sm font-bold text-amber-300">員工聘僱與飼料倉儲</h3>
                <span className="text-xs text-orange-300 font-bold font-mono-num">
                  飼料存量：{snapshot.feedStock} 單位
                </span>
              </div>

              <div className="flex flex-col gap-2">
                {roles.map((role) => {
                  const cfg = STAFF_CONFIGS[role];
                  const count = snapshot.staffCounts[role];
                  return (
                    <div
                      key={role}
                      className="flex items-center justify-between gap-3 bg-slate-950/50 px-3 py-2 rounded-lg"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-white flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-sm inline-block"
                            style={{ backgroundColor: cfg.colorHex }}
                          />
                          <span>{cfg.name}</span>
                          <span className="text-slate-400 font-normal font-mono-num">
                            聘僱 ${cfg.hireCost} · 薪資 ${cfg.wagePerCycle}/期
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 truncate">{cfg.desc}</div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => onFireStaff(role)}
                          disabled={count === 0}
                          className="px-2 py-1 rounded bg-red-500/20 hover:bg-red-500/35 disabled:opacity-30 border border-red-400/40 text-xs font-bold cursor-pointer disabled:cursor-not-allowed"
                        >
                          -
                        </button>
                        <span className="w-6 text-center text-xs font-extrabold font-mono-num">
                          {count}
                        </span>
                        <button
                          onClick={() => onHireStaff(role)}
                          className="px-2 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/35 border border-emerald-400/40 text-xs font-bold cursor-pointer"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Feed Controls */}
              <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-950/50 px-3 py-2.5 rounded-lg">
                <div className="text-xs">
                  <div className="font-bold text-slate-200">恐龍飼料補給</div>
                  <div className="text-[11px] text-slate-400">
                    每次投餵消耗 10 單位，維持恐龍表現與遊客滿意度
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={onToggleAutoBuyFeed}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border cursor-pointer ${
                      snapshot.autoBuyFeed
                        ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200'
                        : 'bg-white/10 border-white/20 text-slate-300'
                    }`}
                  >
                    自動補貨：{snapshot.autoBuyFeed ? '開啟' : '關閉'}
                  </button>
                  <button
                    onClick={onBuyFeed}
                    className="px-3 py-1.5 rounded-lg bg-amber-500/25 hover:bg-amber-500/40 border border-amber-400 text-amber-200 text-xs font-bold cursor-pointer whitespace-nowrap"
                  >
                    採購 +{FEED_PACK_AMOUNT} (${FEED_PACK_COST})
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Active Dinosaurs Performance & Popularity Table */}
          <div className="rounded-xl bg-white/5 border border-white/10 p-4">
            <h3 className="text-sm font-bold text-amber-300 mb-2">
              園區恐龍受歡迎程度與表現清單 ({snapshot.dinoCount} 隻)
            </h3>
            {snapshot.dinosaurs.length === 0 ? (
              <div className="text-xs text-slate-400 py-4 text-center">
                園區內尚未放置任何恐龍，請先在底部選單培育恐龍放入圍欄內。
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="text-slate-400 border-b border-white/10">
                      <th className="py-2 pr-3">恐龍名稱</th>
                      <th className="py-2 px-2">食性</th>
                      <th className="py-2 px-2">受歡迎度</th>
                      <th className="py-2 px-2">成長 / 戰績</th>
                      <th className="py-2 px-2">飽食度</th>
                      <th className="py-2 px-2">即時表現狀態</th>
                      <th className="py-2 px-2">累計觀賞 / 創收</th>
                      <th className="py-2 pl-2 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.dinosaurs.map((d) => (
                      <tr key={d.id} className="border-b border-white/5 hover:bg-white/5">
                        <td className="py-2 pr-3 font-bold text-white flex items-center gap-2">
                          <span
                            className="w-3 h-3 rounded-sm inline-block shrink-0"
                            style={{ backgroundColor: d.hex }}
                          />
                          <span>{d.name}</span>
                        </td>
                        <td className="py-2 px-2 text-slate-300">{d.diet}</td>
                        <td className="py-2 px-2 font-mono-num text-amber-300 font-bold">
                          {d.popularity} / 100
                        </td>
                        <td className="py-2 px-2 font-mono-num">
                          <span className={d.growth >= 100 ? 'text-sky-300 font-bold' : 'text-slate-300'}>
                            {d.growth}%
                          </span>
                          {d.arenaWins > 0 && (
                            <span className="text-amber-300 ml-1">· {d.arenaWins}勝</span>
                          )}
                        </td>
                        <td className="py-2 px-2 font-mono-num">
                          <span className={d.satiety < 35 ? 'text-red-400 font-bold' : 'text-emerald-300'}>
                            {d.satiety}%
                          </span>
                        </td>
                        <td className="py-2 px-2 text-slate-200">{d.performanceStatus}</td>
                        <td className="py-2 px-2 font-mono-num text-yellow-300">
                          {d.totalViews} 次 · ${d.totalRevenue}
                        </td>
                        <td className="py-2 pl-2 text-right whitespace-nowrap">
                          <button
                            onClick={() => onFeedDino(d.id)}
                            className="px-2 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/35 border border-emerald-400/40 text-emerald-200 mr-1.5 cursor-pointer"
                          >
                            餵食
                          </button>
                          <button
                            onClick={() => {
                              onClose();
                              onInspectDino(d.id, d.type);
                            }}
                            className="px-2 py-1 rounded bg-sky-500/20 hover:bg-sky-500/35 border border-sky-400/40 text-sky-200 cursor-pointer"
                          >
                            3D 展示
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
