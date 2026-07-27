"use client";

import { Suspense, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import {
  OrbitControls,
  Bounds,
  Center,
  Environment,
  Html,
  useGLTF,
} from "@react-three/drei";
import * as THREE from "three";
import ShipModel, { SHIP_MODEL } from "./ShipModel";
import type { Scene as ExperienceScene, ShipSpot } from "@/lib/scenes";

/**
 * The hub's 3D ship. The glTF's scale/position is unknown, so <Bounds fit> +
 * <Center> frame it to the view automatically. Drag to rotate; a gentle
 * auto-rotate showcases the model.
 *
 * Pass `scenes` to pin each one on the hull as a glowing marker: click a dot
 * to select that scene, and the selected scene's dot stays highlighted.
 *
 * Zoom/pan are opt-out: pages that embed the canvas beside other UI (the hub)
 * turn them off so the wheel keeps scrolling the page and a stray two-finger
 * drag can't push the ship out of frame. <Bounds fit> already frames the model,
 * so neither gesture is needed to see it.
 *
 * "use client" is the boundary — <Canvas> + three.js run on the client only
 * (R3F doesn't render Canvas children during SSR), so useGLTF here is safe.
 */
export default function Scene({
  scenes,
  selectedSceneId = null,
  onSelectScene,
  enableZoom = true,
  enablePan = true,
}: {
  /** Scenes to pin on the hull (omit for a plain, marker-less model). */
  scenes?: ExperienceScene[];
  selectedSceneId?: string | null;
  onSelectScene?: (id: string) => void;
  enableZoom?: boolean;
  enablePan?: boolean;
} = {}) {
  return (
    <Canvas camera={{ position: [3, 2, 4], fov: 50 }} dpr={[1, 2]}>
      {/* Bright, even lighting + image-based lighting so PBR materials (which
          render dark without an environment) read properly. */}
      <ambientLight intensity={1} />
      <hemisphereLight args={["#ffffff", "#c8c8c8", 0.8]} />
      <directionalLight position={[5, 6, 5]} intensity={1.6} />
      <directionalLight position={[-4, 2, -3]} intensity={0.6} />

      <Suspense fallback={null}>
        <Bounds fit clip observe margin={1.2}>
          <Center>
            <ShipModel />
            {scenes && scenes.length > 0 && (
              <SceneMarkers
                scenes={scenes}
                selectedId={selectedSceneId}
                onSelect={onSelectScene}
              />
            )}
          </Center>
        </Bounds>
        {/* IBL for reflective/PBR surfaces (preset HDR fetched by drei). */}
        <Environment preset="city" environmentIntensity={1} />
      </Suspense>

      <OrbitControls
        makeDefault
        enableDamping
        autoRotate
        autoRotateSpeed={0.5}
        enableZoom={enableZoom}
        enablePan={enablePan}
      />
    </Canvas>
  );
}

/**
 * Glowing scene markers pinned to the hull. Positions come from each scene's
 * fractional `shipSpot`, resolved against the model's bounding box at runtime
 * (the glb's scale/orientation is unknown, and the markers share the
 * primitive's local space inside the same <Center>). The length axis is
 * whichever horizontal bbox axis is longer. Rendered as DOM via <Html> so the
 * dots glow through the hull — most scenes are interior spaces.
 */
function SceneMarkers({
  scenes,
  selectedId,
  onSelect,
}: {
  scenes: ExperienceScene[];
  selectedId: string | null;
  onSelect?: (id: string) => void;
}) {
  const { scene: ship } = useGLTF(SHIP_MODEL);

  const frame = useMemo(() => {
    const box = new THREE.Box3().setFromObject(ship);
    const size = box.getSize(new THREE.Vector3());
    const lengthAxis: "x" | "z" = size.x >= size.z ? "x" : "z";
    const beamAxis: "x" | "z" = lengthAxis === "x" ? "z" : "x";
    return { box, size, lengthAxis, beamAxis };
  }, [ship]);

  function toPosition(spot: ShipSpot): [number, number, number] {
    const { box, size, lengthAxis, beamAxis } = frame;
    const pos = new THREE.Vector3();
    pos[lengthAxis] = box.min[lengthAxis] + size[lengthAxis] * spot.length;
    pos.y = box.min.y + size.y * spot.height;
    pos[beamAxis] =
      box.min[beamAxis] + size[beamAxis] * (0.5 + (spot.beam ?? 0) / 2);
    return [pos.x, pos.y, pos.z];
  }

  return (
    <>
      {scenes.map((scene) => {
        const active = scene.id === selectedId;
        return (
          <Html
            key={scene.id}
            position={toPosition(scene.shipSpot)}
            center
            zIndexRange={[20, 0]}
          >
            <button
              type="button"
              onClick={() => onSelect?.(scene.id)}
              aria-label={`Select scene: ${scene.title}`}
              aria-pressed={active}
              className="group relative block cursor-pointer"
            >
              <span
                className={`block rounded-full border transition-all duration-200 ${
                  active
                    ? "h-4 w-4 animate-pulse border-ivory bg-[#8fd0ff] shadow-[0_0_14px_5px_rgba(96,180,255,0.9)]"
                    : "h-3 w-3 border-ivory/70 bg-[#4a9fe3] shadow-[0_0_4px_1px_rgba(74,159,227,0.4)] group-hover:scale-125 group-hover:shadow-[0_0_8px_2px_rgba(74,159,227,0.7)]"
                }`}
              />
              <span
                className={`absolute left-full top-1/2 ml-2 -translate-y-1/2 whitespace-nowrap rounded-sm border border-brass/40 bg-card/95 px-2 py-0.5 text-[0.65rem] font-semibold text-navy shadow-md ${
                  active ? "block" : "hidden group-hover:block"
                }`}
              >
                {scene.title}
              </span>
            </button>
          </Html>
        );
      })}
    </>
  );
}
