"use client";

import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Bounds, Center, Environment } from "@react-three/drei";
import ShipModel from "./ShipModel";

/**
 * The hub's 3D ship. The glTF's scale/position is unknown, so <Bounds fit> +
 * <Center> frame it to the view automatically. Drag to rotate, scroll to zoom;
 * a gentle auto-rotate showcases the model.
 *
 * "use client" is the boundary — <Canvas> + three.js run on the client only
 * (R3F doesn't render Canvas children during SSR), so useGLTF here is safe.
 */
export default function Scene() {
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
      />
    </Canvas>
  );
}
