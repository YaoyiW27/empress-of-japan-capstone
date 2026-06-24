"use client";

import { Suspense, useMemo } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera, useTexture } from "@react-three/drei";
import * as THREE from "three";

const deg = THREE.MathUtils.degToRad;

export type PanoramaSource = {
  title: string;
  /** Photo under /public. Omit to render a procedural placeholder. */
  photoSrc?: string;
  /** Horizontal coverage in degrees (default 360 — a full panorama). */
  hFovDeg?: number;
  /** Vertical coverage in degrees (default 180 — a full panorama). */
  vFovDeg?: number;
};

/**
 * Magic-window viewer: maps a photo onto the inside of a sphere segment and lets
 * the visitor look around by dragging. A full 360x180 panorama spins freely; a
 * partial photo is clamped so edges never show. Changing the `scene` prop swaps
 * the texture in place — the Canvas/camera persist (no remount).
 *
 * The 3D tree only renders client-side (R3F's <Canvas> doesn't render children
 * during SSR), so browser-only calls (document, WebGL) are safe here.
 */
export default function PanoramaScene({ scene }: { scene: PanoramaSource }) {
  const hFovDeg = scene.hFovDeg ?? 360;
  const vFovDeg = scene.vFovDeg ?? 180;

  return (
    <Canvas>
      <Suspense fallback={null}>
        {scene.photoSrc ? (
          <PhotoSphereImage
            src={scene.photoSrc}
            hFovDeg={hFovDeg}
            vFovDeg={vFovDeg}
          />
        ) : (
          <PhotoSpherePlaceholder
            label={scene.title}
            hFovDeg={hFovDeg}
            vFovDeg={vFovDeg}
          />
        )}
      </Suspense>
      <LookControls hFovDeg={hFovDeg} vFovDeg={vFovDeg} />
    </Canvas>
  );
}

/** Real photo path. `useTexture` suspends, so it lives in its own component. */
function PhotoSphereImage({
  src,
  hFovDeg,
  vFovDeg,
}: {
  src: string;
  hFovDeg: number;
  vFovDeg: number;
}) {
  const texture = useTexture(src);
  return <PhotoMesh texture={texture} hFovDeg={hFovDeg} vFovDeg={vFovDeg} />;
}

/** Photoless path: a procedural placeholder so the scene works before its photo lands. */
function PhotoSpherePlaceholder({
  label,
  hFovDeg,
  vFovDeg,
}: {
  label: string;
  hFovDeg: number;
  vFovDeg: number;
}) {
  const texture = usePlaceholderTexture(label);
  return <PhotoMesh texture={texture} hFovDeg={hFovDeg} vFovDeg={vFovDeg} />;
}

function PhotoMesh({
  texture,
  hFovDeg,
  vFovDeg,
}: {
  texture: THREE.Texture;
  hFovDeg: number;
  vFovDeg: number;
}) {
  const phiLen = deg(hFovDeg);
  const thetaLen = deg(vFovDeg);
  // Center the segment on -Z, which is where the camera looks initially.
  const phiStart = (3 * Math.PI) / 2 - phiLen / 2;
  const thetaStart = Math.PI / 2 - thetaLen / 2;

  // Clone before configuring: useTexture's result must not be mutated directly.
  // We view the sphere from the inside (BackSide), which mirrors the texture
  // left-right, so flip it horizontally to make the photo read correctly.
  const map = useMemo(() => {
    const t = texture.clone();
    t.wrapS = THREE.RepeatWrapping;
    t.repeat.x = -1;
    t.offset.x = 1;
    t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  }, [texture]);

  return (
    <mesh>
      <sphereGeometry
        args={[10, 120, 80, phiStart, phiLen, thetaStart, thetaLen]}
      />
      <meshBasicMaterial map={map} side={THREE.BackSide} toneMapped={false} />
    </mesh>
  );
}

/**
 * Fits the camera to the photo and clamps drag-to-look to its coverage. The
 * camera sits at the sphere center and OrbitControls rotates the view in place
 * (zoom/pan off). A full axis (>=360 h / >=180 v) gets free look on that axis.
 */
function LookControls({
  hFovDeg,
  vFovDeg,
}: {
  hFovDeg: number;
  vFovDeg: number;
}) {
  const { size } = useThree();
  const aspect = size.width / Math.max(1, size.height);
  const photoHFov = deg(hFovDeg);
  const photoVFov = deg(vFovDeg);

  const fullH = hFovDeg >= 360;
  const fullV = vFovDeg >= 180;

  // A comfortable viewing FOV, shrunk only when the photo is too narrow on an
  // axis to fill it. (Skip the fit for full axes — tan(180°/...) would blow up.)
  let vFov = deg(70);
  if (!fullV) vFov = Math.min(vFov, photoVFov * 0.95);
  if (!fullH) {
    const vFovToFillH = 2 * Math.atan(Math.tan(photoHFov / 2) / aspect);
    vFov = Math.min(vFov, vFovToFillH * 0.95);
  }
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);

  const azLimit = Math.max(0, photoHFov / 2 - hFov / 2);
  const polLimit = Math.max(0, photoVFov / 2 - vFov / 2);

  return (
    <>
      <PerspectiveCamera
        makeDefault
        position={[0, 0, 0.1]}
        fov={THREE.MathUtils.radToDeg(vFov)}
      />
      <OrbitControls
        makeDefault
        enableZoom={false}
        enablePan={false}
        enableDamping
        dampingFactor={0.1}
        rotateSpeed={-0.4}
        minAzimuthAngle={fullH ? -Infinity : -azLimit}
        maxAzimuthAngle={fullH ? Infinity : azLimit}
        minPolarAngle={fullV ? 0.01 : Math.PI / 2 - polLimit}
        maxPolarAngle={fullV ? Math.PI - 0.01 : Math.PI / 2 + polLimit}
      />
    </>
  );
}

/** A labeled grid texture drawn on a canvas — stand-in until a real photo exists. */
function usePlaceholderTexture(label: string): THREE.CanvasTexture {
  return useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext("2d")!;

    ctx.fillStyle = "#1c2e4a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = "#3a4a66";
    ctx.lineWidth = 2;
    for (let x = 0; x <= canvas.width; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y <= canvas.height; y += 64) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#b8860b";
    ctx.font = "bold 48px serif";
    ctx.fillText(label, canvas.width / 2, canvas.height / 2 - 24);
    ctx.fillStyle = "#f4ecd8";
    ctx.font = "24px sans-serif";
    ctx.fillText("photo coming soon", canvas.width / 2, canvas.height / 2 + 36);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, [label]);
}
