"use client";

import { Suspense, useMemo } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera, useTexture } from "@react-three/drei";
import * as THREE from "three";
import type { ExperienceScene } from "@/lib/scenes";

const deg = THREE.MathUtils.degToRad;

/**
 * Magic-window viewer: maps a (possibly partial) photo onto the inside of a
 * sphere segment and lets the visitor look around by dragging. The view is
 * clamped to the photo's angular coverage so edges/seam never show.
 *
 * The whole 3D tree only renders on the client (R3F's <Canvas> doesn't render
 * its children during SSR), so browser-only calls here (document, WebGL) are
 * safe under the App Router.
 */
export default function PanoramaScene({ scene }: { scene: ExperienceScene }) {
  return (
    <Canvas>
      <Suspense fallback={null}>
        {scene.photoSrc ? (
          <PhotoSphereImage scene={scene} />
        ) : (
          <PhotoSpherePlaceholder scene={scene} />
        )}
      </Suspense>
      <LookControls scene={scene} />
    </Canvas>
  );
}

/** Real photo path. `useTexture` suspends, so it lives in its own component. */
function PhotoSphereImage({ scene }: { scene: ExperienceScene }) {
  const texture = useTexture(scene.photoSrc!);
  return <PhotoMesh texture={texture} scene={scene} />;
}

/** Photoless path: a procedural placeholder so the scene works before its photo lands. */
function PhotoSpherePlaceholder({ scene }: { scene: ExperienceScene }) {
  const texture = usePlaceholderTexture(scene.title);
  return <PhotoMesh texture={texture} scene={scene} />;
}

function PhotoMesh({
  texture,
  scene,
}: {
  texture: THREE.Texture;
  scene: ExperienceScene;
}) {
  const phiLen = deg(scene.hFovDeg);
  const thetaLen = deg(scene.vFovDeg);
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
 * (zoom/pan off).
 *
 * We size the camera's FOV to the *tighter* of the two axes so the photo fills
 * the view without revealing empty space beyond its edges: a wide panorama
 * (deck) fills vertically and pans sideways; a near-square photo (cabin) fills
 * horizontally and pans a little vertically.
 */
function LookControls({ scene }: { scene: ExperienceScene }) {
  const { size } = useThree();
  const aspect = size.width / Math.max(1, size.height);
  const photoHFov = deg(scene.hFovDeg);
  const photoVFov = deg(scene.vFovDeg);

  // Full coverage on an axis (a 360x180 equirectangular panorama) → free look on
  // that axis. Partial photos get clamped so edges never show.
  const fullH = scene.hFovDeg >= 360;
  const fullV = scene.vFovDeg >= 180;

  // A comfortable viewing FOV, shrunk only when the photo is too narrow on an
  // axis to fill it. (Skip the fit for full axes — tan(180°/...) would blow up.)
  let vFov = deg(70);
  if (!fullV) vFov = Math.min(vFov, photoVFov * 0.95);
  if (!fullH) {
    const vFovToFillH = 2 * Math.atan(Math.tan(photoHFov / 2) / aspect);
    vFov = Math.min(vFov, vFovToFillH * 0.95);
  }
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);

  // Allowed look swing = half the photo coverage minus half the camera FOV.
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

    ctx.fillStyle = "#1c1917";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = "#44403c";
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
    ctx.fillStyle = "#fbbf24";
    ctx.font = "bold 48px sans-serif";
    ctx.fillText(label, canvas.width / 2, canvas.height / 2 - 24);
    ctx.fillStyle = "#a8a29e";
    ctx.font = "24px sans-serif";
    ctx.fillText("photo coming soon", canvas.width / 2, canvas.height / 2 + 36);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, [label]);
}
