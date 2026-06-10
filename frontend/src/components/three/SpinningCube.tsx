"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Mesh } from "three";

/**
 * Placeholder mesh for the 3D track: a gently auto-rotating cube.
 * The spin proves the R3F render loop runs; OrbitControls (in Scene) proves
 * pointer interaction. This will be swapped for real glTF models later.
 */
export default function SpinningCube() {
  const meshRef = useRef<Mesh>(null);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    // Frame-rate-independent rotation (radians/sec scaled by delta).
    mesh.rotation.x += delta * 0.3;
    mesh.rotation.y += delta * 0.4;
  });

  return (
    <mesh ref={meshRef}>
      <boxGeometry args={[1, 1, 1]} />
      {/* amber-400 (#fbbf24) to match the brand accent on the home page */}
      <meshStandardMaterial color="#fbbf24" />
    </mesh>
  );
}
