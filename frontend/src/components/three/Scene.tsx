"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import SpinningCube from "./SpinningCube";

/**
 * Client-side R3F scene: the "hello world" for the 3D track.
 *
 * "use client" is the critical boundary — <Canvas> and three.js rely on
 * browser APIs and must run on the client. This is sufficient under the Next
 * App Router; no next/dynamic({ ssr: false }) is needed.
 *
 * <Canvas> fills its parent, so the route must give it a sized container.
 */
export default function Scene() {
  return (
    <Canvas camera={{ position: [3, 3, 3], fov: 50 }}>
      {/* meshStandardMaterial needs light to be visible; this also mirrors
          what real glTF models will need. */}
      <ambientLight intensity={0.85} />
      <directionalLight position={[5, 5, 5]} intensity={1.5} />
      <directionalLight position={[-4, 2, -3]} intensity={0.5} />

      <SpinningCube />

      <OrbitControls enableDamping />
    </Canvas>
  );
}
