import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { X } from 'lucide-react';
import { DINO_SPECIES } from '../game/config';
import { createDinosaur, setDinosaurAnimationState } from '../game/dinosaurFactory';
import { GameSnapshot } from '../game/types';

interface ShowcaseModalProps {
  open: boolean;
  speciesType: number;
  inspectedDinoId: number | null;
  snapshot: GameSnapshot;
  onClose: () => void;
  onChangeSpecies: (speciesType: number) => void;
  onFeedDino: (dinoId: number) => void;
  onSellDino: (dinoId: number) => void;
}

export const ShowcaseModal: React.FC<ShowcaseModalProps> = ({
  open,
  speciesType,
  inspectedDinoId,
  snapshot,
  onClose,
  onChangeSpecies,
  onFeedDino,
  onSellDino,
}) => {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dinoGroupRef = useRef<THREE.Group | null>(null);
  const eatTimerRef = useRef<number | null>(null);

  const cfg = DINO_SPECIES[speciesType] || DINO_SPECIES[1];
  const activeEntity =
    inspectedDinoId !== null
      ? snapshot.dinosaurs.find((d) => d.id === inspectedDinoId) || null
      : null;

  useEffect(() => {
    if (!open || !stageRef.current) return;
    const container = stageRef.current;
    const w = Math.max(container.clientWidth, 300);
    const h = Math.max(container.clientHeight, 280);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 50);
    camera.position.set(2.8, 2.2, 3.6);
    camera.lookAt(0, 0.85, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // 3-point showcase lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.65));
    const keyLight = new THREE.DirectionalLight(0xfffbeb, 1.15);
    keyLight.position.set(4, 6, 5);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.55);
    rimLight.position.set(-4, 4, -4);
    scene.add(rimLight);

    // Pedestal
    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(1.35, 1.5, 0.24, 24),
      new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.45, metalness: 0.35 })
    );
    pedestal.position.y = -0.12;
    scene.add(pedestal);

    const dinoGroup = createDinosaur(speciesType);
    dinoGroup.rotation.y = 0.5;
    dinoGroupRef.current = dinoGroup;
    scene.add(dinoGroup);

    let isDragging = false;
    let prevX = 0;
    let rotY = 0.5;

    const onDown = (e: PointerEvent) => {
      isDragging = true;
      prevX = e.clientX;
    };
    const onMove = (e: PointerEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - prevX;
      prevX = e.clientX;
      rotY += dx * 0.012;
    };
    const onUp = () => {
      isDragging = false;
    };

    const dom = renderer.domElement;
    dom.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);

    let frameId = 0;
    let last = performance.now();
    let phase = 0;

    const tick = () => {
      frameId = requestAnimationFrame(tick);
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      phase += dt * 3.5;

      if (!isDragging) {
        rotY += dt * 0.55;
      }
      dinoGroup.rotation.y = rotY;

      if (dinoGroup.userData.mixer) {
        (dinoGroup.userData.mixer as THREE.AnimationMixer).update(dt);
      }

      const parts = dinoGroup.userData.animParts as {
        bodyRig: THREE.Group;
        wings: THREE.Object3D[];
        flippers?: THREE.Object3D[];
        tailMesh: THREE.Object3D | null;
      };
      if (!dinoGroup.userData.mixer && parts) {
        if (dinoGroup.userData.isFlying) {
          parts.bodyRig.position.y = 1.45 + Math.sin(phase) * 0.12;
          if (parts.wings.length === 2) {
            const flap = Math.sin(phase * 1.4) * 0.4;
            parts.wings[0].rotation.z = flap;
            parts.wings[1].rotation.z = -flap;
          }
        } else if (dinoGroup.userData.isAquatic) {
          parts.bodyRig.position.y = 0.42 + Math.sin(phase * 0.9) * 0.06;
          if (parts.flippers && parts.flippers.length === 4) {
            const paddle = Math.sin(phase * 1.2) * 0.25;
            parts.flippers[0].rotation.z = -0.18 + paddle;
            parts.flippers[1].rotation.z = 0.18 - paddle;
            parts.flippers[2].rotation.z = -0.15 - paddle;
            parts.flippers[3].rotation.z = 0.15 + paddle;
          }
          if (parts.tailMesh) {
            parts.tailMesh.rotation.y = Math.sin(phase * 1.3) * 0.25;
          }
        } else {
          if (parts.tailMesh) {
            parts.tailMesh.rotation.y = Math.sin(phase * 0.8) * 0.12;
          }
          if (parts.bodyRig) {
            parts.bodyRig.position.y = Math.sin(phase * 0.8) * 0.025;
          }
        }
      }

      renderer.render(scene, camera);
    };
    tick();

    return () => {
      cancelAnimationFrame(frameId);
      if (eatTimerRef.current) {
        window.clearTimeout(eatTimerRef.current);
        eatTimerRef.current = null;
      }
      dinoGroupRef.current = null;
      dom.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      renderer.dispose();
    };
  }, [open, speciesType]);

  if (!open) return null;

  const displayPopularity = activeEntity ? activeEntity.popularity : cfg.basePopularity;
  const starCount = Math.max(1, Math.min(5, Math.round(displayPopularity / 20)));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4"
      onClick={onClose}
    >
      <div
        className="w-[min(880px,95vw)] max-h-[88vh] rounded-2xl bg-slate-900 border border-white/15 shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 bg-slate-950/60">
          <div>
            <h2 className="text-base font-extrabold text-white">
              {cfg.name} ({cfg.en}) — 3D 恐龍介紹與詳細展示
            </h2>
            <p className="text-xs text-slate-400">
              滑鼠可於左側展示台左右拖曳 360° 旋轉觀察模型細節
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-red-500/30 text-slate-200 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto custom-scroll flex flex-col gap-4">
          {/* Species Switcher */}
          <div className="flex flex-wrap gap-1.5">
            {Object.values(DINO_SPECIES).map((item) => (
              <button
                key={item.id}
                onClick={() => onChangeSpecies(item.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                  item.id === speciesType
                    ? 'bg-amber-500/25 border-amber-400 text-amber-200'
                    : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                }`}
              >
                {item.id}. {item.name}
              </button>
            ))}
          </div>

          {/* 3D Turntable + Info Details */}
          <div className="grid grid-cols-1 md:grid-cols-[310px_1fr] gap-5 items-start">
            <div className="relative w-full h-72 rounded-2xl overflow-hidden border border-white/15 bg-gradient-to-b from-slate-800 to-slate-950 cursor-grab active:cursor-grabbing">
              <div ref={stageRef} className="w-full h-full" />
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-black/55 text-[11px] text-slate-300 pointer-events-none whitespace-nowrap">
                拖曳旋轉 3D 模型
              </div>
            </div>

            <div className="flex flex-col gap-3 text-sm">
              {/* Metadata line (clean unboxed text with separators) */}
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
                <span className="font-bold text-amber-300">{cfg.diet}恐龍</span>
                <span aria-hidden="true">·</span>
                <span>{cfg.era}</span>
                <span aria-hidden="true">·</span>
                <span>體長 {cfg.length}</span>
                <span aria-hidden="true">·</span>
                <span>體重 {cfg.weight}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono-num text-yellow-300">單次觀賞 +${cfg.income}</span>
              </div>

              <p className="text-xs leading-relaxed text-slate-200 bg-white/5 rounded-xl p-3 border border-white/10 m-0">
                {cfg.intro}
              </p>

              <div className="text-xs leading-relaxed text-sky-200 bg-sky-500/10 rounded-xl p-3 border border-sky-400/25">
                <span className="font-bold">區域共處規定：</span>
                {cfg.coexistTip}
              </div>

              {/* Popularity */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300 font-bold">恐龍受歡迎程度</span>
                  <span className="text-amber-300 font-bold font-mono-num">
                    {'★'.repeat(starCount)}
                    {'☆'.repeat(5 - starCount)} ({displayPopularity}/100)
                  </span>
                </div>
                <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-400 rounded-full transition-all duration-300"
                    style={{ width: `${displayPopularity}%` }}
                  />
                </div>
              </div>

              {/* Active Individual Performance (when inspecting a placed dinosaur) */}
              {activeEntity ? (
                <div className="bg-slate-950/60 border border-white/10 rounded-xl p-3 flex flex-col gap-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-emerald-300">
                      場內個體即時表現：{activeEntity.performanceStatus}
                    </span>
                    <span className="font-mono-num text-slate-300">
                      表現評分 {activeEntity.performanceScore}%
                    </span>
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                      <span>飽食度</span>
                      <span className="font-mono-num">{activeEntity.satiety}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          activeEntity.satiety < 35 ? 'bg-red-500' : 'bg-emerald-400'
                        }`}
                        style={{ width: `${activeEntity.satiety}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 text-xs">
                    <span className="text-slate-400 font-mono-num">
                      累計吸引 {activeEntity.totalViews} 人次 · 創收 ${activeEntity.totalRevenue}
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          onFeedDino(activeEntity.id);
                          if (dinoGroupRef.current) {
                            setDinosaurAnimationState(dinoGroupRef.current, 'eating', 0.2);
                            if (eatTimerRef.current) window.clearTimeout(eatTimerRef.current);
                            eatTimerRef.current = window.setTimeout(() => {
                              if (dinoGroupRef.current) {
                                setDinosaurAnimationState(dinoGroupRef.current, 'idle', 0.3);
                              }
                            }, 2500);
                          }
                        }}
                        className="px-3 py-1 rounded-lg bg-emerald-500/25 hover:bg-emerald-500/40 border border-emerald-400/50 text-emerald-200 font-bold cursor-pointer"
                      >
                        立即餵食 (-10飼料)
                      </button>
                      <button
                        onClick={() => {
                          onSellDino(activeEntity.id);
                          onClose();
                        }}
                        className="px-3 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/35 border border-red-400/40 text-red-200 font-bold cursor-pointer"
                      >
                        回收轉讓
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-400 bg-white/5 rounded-xl p-3 border border-white/10">
                  提示：切換至「觀察 / 檢視」模式並點擊草地上的恐龍，即可查看該隻恐龍的即時表現、飽食度與累計創收數據。
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
