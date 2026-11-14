import React, { useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Camera,
  Download,
  Eye,
  Images,
  LogOut,
  Trash2,
} from 'lucide-react';
import { GameSnapshot } from '../game/types';

export interface CapturedPhoto {
  id: number;
  dataUrl: string;
  clockLabel: string;
  weatherLabel: string;
}

interface FirstPersonOverlayProps {
  snapshot: GameSnapshot;
  photos: CapturedPhoto[];
  onExitFirstPerson: () => void;
  onCapturePhoto: () => void;
  onMoveStep: (forward: number, strafe: number) => void;
  onDeletePhoto: (id: number) => void;
}

export const FirstPersonOverlay: React.FC<FirstPersonOverlayProps> = ({
  snapshot,
  photos,
  onExitFirstPerson,
  onCapturePhoto,
  onMoveStep,
  onDeletePhoto,
}) => {
  const [flashActive, setFlashActive] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(true);

  const handleShutter = () => {
    setFlashActive(true);
    onCapturePhoto();
    window.setTimeout(() => setFlashActive(false), 180);
  };

  return (
    <>
      {/* Subtle Camera Flash Effect */}
      {flashActive && (
        <div className="fixed inset-0 z-40 bg-white/70 pointer-events-none transition-opacity duration-150" />
      )}

      {/* Minimalist Viewfinder Crosshair */}
      <div className="fixed inset-0 z-10 pointer-events-none flex items-center justify-center">
        <div className="w-6 h-6 border border-white/40 rounded-full flex items-center justify-center">
          <div className="w-1 h-1 bg-white/70 rounded-full" />
        </div>
      </div>

      {/* Top Visitor Mode Bar */}
      <header className="fixed top-3 left-1/2 -translate-x-1/2 z-20 flex flex-wrap items-center justify-center gap-4 px-5 py-2.5 rounded-2xl bg-slate-950/90 border border-white/15 shadow-2xl max-w-[96vw]">
        <div className="flex items-center gap-2 pr-3 border-r border-white/15">
          <Eye className="w-4 h-4 text-sky-300" />
          <div className="flex flex-col">
            <span className="text-xs font-extrabold text-white whitespace-nowrap">
              第一人稱遊客漫步視角
            </span>
            <span className="text-[11px] text-slate-400 whitespace-nowrap">
              {snapshot.parkName} · {snapshot.clockLabel}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <div>
            <span className="text-slate-400 mr-1.5">在園遊客</span>
            <span className="font-bold font-mono-num text-slate-100">{snapshot.visitorCount} 人</span>
          </div>
          <div>
            <span className="text-slate-400 mr-1.5">滿意度</span>
            <span className="font-bold font-mono-num text-sky-300">{snapshot.satisfaction}%</span>
          </div>
        </div>

        <button
          onClick={onExitFirstPerson}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/35 border border-amber-400/50 text-amber-200 text-xs font-extrabold transition-colors cursor-pointer whitespace-nowrap"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>返回俯瞰視角 (ESC)</span>
        </button>
      </header>

      {/* Bottom Controls: Movement Pad + Camera Shutter */}
      <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-20 flex flex-wrap items-end justify-center gap-4 max-w-[96vw]">
        {/* Walk Controls & Key Hint */}
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-slate-950/90 border border-white/15 shadow-2xl">
          <div className="grid grid-cols-3 gap-1">
            <div />
            <button
              onClick={() => onMoveStep(1, 0)}
              title="往前走 (W)"
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 text-slate-100 cursor-pointer"
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
            <div />
            <button
              onClick={() => onMoveStep(0, -1)}
              title="向左平移 (A)"
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 text-slate-100 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onMoveStep(-1, 0)}
              title="往後退 (S)"
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 text-slate-100 cursor-pointer"
            >
              <ArrowDown className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onMoveStep(0, 1)}
              title="向右平移 (D)"
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 text-slate-100 cursor-pointer"
            >
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="text-[11px] text-slate-300 leading-relaxed">
            <div className="font-bold text-white">WASD / 方向鍵：穿梭步道</div>
            <div className="text-slate-400">左鍵拖曳畫面：自由環顧四周</div>
          </div>
        </div>

        {/* Prominent Camera Shutter Button */}
        <button
          onClick={handleShutter}
          className="flex items-center gap-2.5 px-5 py-3.5 rounded-2xl bg-sky-500 hover:bg-sky-400 border border-sky-200/60 text-slate-950 font-extrabold text-sm shadow-2xl transition-colors cursor-pointer whitespace-nowrap"
        >
          <Camera className="w-5 h-5" />
          <span>拍照紀錄景色</span>
        </button>

        {/* Gallery Toggle Badge */}
        {photos.length > 0 && (
          <button
            onClick={() => setGalleryOpen((v) => !v)}
            className="flex items-center gap-1.5 px-3.5 py-3.5 rounded-2xl bg-slate-950/90 hover:bg-slate-900 border border-white/15 text-slate-200 text-xs font-bold shadow-2xl cursor-pointer whitespace-nowrap"
          >
            <Images className="w-4 h-4 text-amber-300" />
            <span className="font-mono-num">相簿 ({photos.length})</span>
          </button>
        )}
      </div>

      {/* Captured Photos Strip */}
      {photos.length > 0 && galleryOpen && (
        <aside className="fixed right-4 bottom-24 z-20 w-64 max-h-[55vh] rounded-2xl bg-slate-950/95 border border-white/15 shadow-2xl p-3 flex flex-col gap-2.5 overflow-y-auto custom-scroll">
          <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
            <span className="text-xs font-extrabold text-white">園區攝影相簿</span>
            <span className="text-[11px] font-mono-num text-slate-400">{photos.length} 張</span>
          </div>
          {photos.map((photo) => (
            <div
              key={photo.id}
              className="rounded-xl overflow-hidden border border-white/15 bg-slate-900 flex flex-col"
            >
              <img
                src={photo.dataUrl}
                alt={`園區照片 ${photo.clockLabel}`}
                className="w-full h-28 object-cover"
              />
              <div className="flex items-center justify-between px-2.5 py-1.5 text-[11px]">
                <span className="text-slate-300 font-mono-num">
                  {photo.clockLabel} · {photo.weatherLabel}
                </span>
                <div className="flex items-center gap-1">
                  <a
                    href={photo.dataUrl}
                    download={`dino-park-${photo.id}.png`}
                    title="下載 PNG 照片"
                    className="p-1 rounded bg-sky-500/20 hover:bg-sky-500/35 text-sky-200"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </a>
                  <button
                    onClick={() => onDeletePhoto(photo.id)}
                    title="刪除照片"
                    className="p-1 rounded bg-red-500/20 hover:bg-red-500/35 text-red-200 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </aside>
      )}
    </>
  );
};
