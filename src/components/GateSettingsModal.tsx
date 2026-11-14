import React, { useEffect, useState } from 'react';
import { Check, Minus, Plus, Tag, Ticket, X } from 'lucide-react';
import {
  DEFAULT_PARK_NAME,
  MAX_PARK_NAME_LENGTH,
  MAX_TICKET_PRICE,
  MIN_TICKET_PRICE,
  TICKET_PRICE_STEP,
} from '../game/config';
import { GameSnapshot } from '../game/types';

interface GateSettingsModalProps {
  open: boolean;
  snapshot: GameSnapshot;
  onClose: () => void;
  onSetParkName: (name: string) => void;
  onSetTicketPrice: (price: number) => void;
}

const PRESET_GATE_NAMES = [
  '侏羅紀恐龍公園',
  '失落世界樂園',
  '白堊紀奇蹟谷',
  '史前巨獸王國',
];

const PRESET_TICKET_PRICES = [25, 50, 80, 120, 180];

export const GateSettingsModal: React.FC<GateSettingsModalProps> = ({
  open,
  snapshot,
  onClose,
  onSetParkName,
  onSetTicketPrice,
}) => {
  const [draftName, setDraftName] = useState(snapshot.parkName);

  useEffect(() => {
    if (open) {
      setDraftName(snapshot.parkName);
    }
  }, [open, snapshot.parkName]);

  if (!open) return null;

  const feedbackMeta =
    snapshot.ticketFeedback === 'cheap'
      ? {
          label: '超值優惠・吸引大量遊客 (+6 滿意度)',
          className: 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200',
        }
      : snapshot.ticketFeedback === 'fair'
        ? {
            label: '定價合理・遊客入園穩定',
            className: 'bg-sky-500/20 border-sky-400/50 text-sky-200',
          }
        : {
            label: '票價偏高・遊客入園速度放緩並降低滿意度',
            className: 'bg-rose-500/20 border-rose-400/50 text-rose-200',
          };

  const handleApplyName = (e?: React.FormEvent) => {
    e?.preventDefault();
    const cleaned = draftName.trim().slice(0, MAX_PARK_NAME_LENGTH) || DEFAULT_PARK_NAME;
    setDraftName(cleaned);
    onSetParkName(cleaned);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4"
      onClick={onClose}
    >
      <div
        className="w-[min(520px,95vw)] rounded-2xl bg-slate-900 border border-white/15 shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 bg-slate-950/60">
          <div>
            <h2 className="text-base font-extrabold text-white">大門招牌名稱與入園門票設定</h2>
            <p className="text-xs text-slate-400">
              修改後將即時更新南側 3D 大門招牌與售票亭看板
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-red-500/30 text-slate-200 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 flex flex-col gap-5">
          {/* Park / Gate Name Editor */}
          <form onSubmit={handleApplyName} className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
                <Tag className="w-3.5 h-3.5" />
                <span>大門招牌名稱</span>
              </label>
              <span className="text-[11px] text-slate-400 font-mono-num">
                {draftName.length}/{MAX_PARK_NAME_LENGTH} 字
              </span>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                maxLength={MAX_PARK_NAME_LENGTH}
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder={DEFAULT_PARK_NAME}
                className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-white/15 focus:border-amber-400 focus:outline-none text-sm font-bold text-white"
              />
              <button
                type="submit"
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500/25 hover:bg-amber-500/40 border border-amber-400/60 text-amber-200 text-xs font-extrabold transition-colors cursor-pointer shrink-0"
              >
                <Check className="w-3.5 h-3.5" />
                <span>套用名稱</span>
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {PRESET_GATE_NAMES.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setDraftName(preset);
                    onSetParkName(preset);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                    snapshot.parkName === preset
                      ? 'bg-amber-500/25 border-amber-400 text-amber-200'
                      : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </form>

          <div className="border-t border-white/10" />

          {/* Ticket Price Editor */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-yellow-300">
                <Ticket className="w-3.5 h-3.5" />
                <span>入園門票價格（每位遊客通過大門收取）</span>
              </div>
              <span className="text-[11px] text-slate-400 font-mono-num">
                參考合理票價：${snapshot.fairTicketPrice}
              </span>
            </div>

            <div className="flex items-center justify-between gap-3 bg-slate-950/60 border border-white/10 rounded-xl p-3">
              <button
                type="button"
                onClick={() => onSetTicketPrice(snapshot.ticketPrice - TICKET_PRICE_STEP)}
                disabled={snapshot.ticketPrice <= MIN_TICKET_PRICE}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 border border-white/15 text-white cursor-pointer disabled:cursor-not-allowed"
              >
                <Minus className="w-4 h-4" />
              </button>

              <div className="flex flex-col items-center">
                <span className="text-2xl font-black text-yellow-300 font-mono-num">
                  ${snapshot.ticketPrice}
                </span>
                <span className="text-[11px] text-slate-400">
                  範圍 ${MIN_TICKET_PRICE} – ${MAX_TICKET_PRICE}
                </span>
              </div>

              <button
                type="button"
                onClick={() => onSetTicketPrice(snapshot.ticketPrice + TICKET_PRICE_STEP)}
                disabled={snapshot.ticketPrice >= MAX_TICKET_PRICE}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 border border-white/15 text-white cursor-pointer disabled:cursor-not-allowed"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <input
              type="range"
              min={MIN_TICKET_PRICE}
              max={MAX_TICKET_PRICE}
              step={TICKET_PRICE_STEP}
              value={snapshot.ticketPrice}
              onChange={(e) => onSetTicketPrice(Number(e.target.value))}
              className="w-full accent-amber-400 cursor-pointer"
            />

            <div className="grid grid-cols-5 gap-1.5">
              {PRESET_TICKET_PRICES.map((price) => (
                <button
                  key={price}
                  type="button"
                  onClick={() => onSetTicketPrice(price)}
                  className={`py-1.5 rounded-lg text-xs font-mono-num font-bold border transition-colors cursor-pointer ${
                    snapshot.ticketPrice === price
                      ? 'bg-yellow-500/25 border-yellow-400 text-yellow-200'
                      : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  ${price}
                </button>
              ))}
            </div>

            <div className={`px-3 py-2 rounded-xl border text-xs font-bold ${feedbackMeta.className}`}>
              市場反應：{feedbackMeta.label}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
