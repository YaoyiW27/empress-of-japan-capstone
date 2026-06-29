"use client";

import { useGLTF } from "@react-three/drei";

/**
 * The 3D ship for the hub. Swap candidates by changing this one constant:
 *   /models/empress_trellis.glb        (current)
 *   /models/empress_trellis_web.glb    (smaller, web-optimized)
 *   /models/empress_hunyuan3d.glb / _web.glb
 *
 * Transform/framing is handled by the <Bounds>/<Center> wrappers in Scene.tsx.
 */
const SHIP_MODEL = "/models/empress_hunyuan3d.glb";

export default function ShipModel() {
  const { scene } = useGLTF(SHIP_MODEL);
  return <primitive object={scene} />;
}

useGLTF.preload(SHIP_MODEL);
