import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { host } from "../core/simHost";
import { mat } from "../render/materials";
import { OWAWA_ROADS } from "./owawa";
import { CITY_Y } from "./terrain";
import { NORTH_ROADS } from "./v6";
import { signalAt, signalPoints, type SignalState } from "./signals";

/**
 * Traffic lights at Owawa's junctions: a pole on two opposite corners, each
 * with a head for east–west and one for north–south traffic. The lamps follow
 * the same clock as the traffic (sim/town.ts), which stops on red.
 */
const OFF = new THREE.Color("#1d1f22");
const ON = { red: new THREE.Color("#ff3b2f"), amber: new THREE.Color("#ffb020"), green: new THREE.Color("#3dff7a") };
const lit = (s: SignalState, eastWest: boolean): "red" | "amber" | "green" => (eastWest ? (s === "ew" ? "green" : s === "ew-amber" ? "amber" : "red") : s === "ns" ? "green" : s === "ns-amber" ? "amber" : "red");

export function TrafficLights() {
  const points = useMemo(() => signalPoints([...NORTH_ROADS, ...OWAWA_ROADS.map((r) => ({ ...r, from: r.from as [number, number], to: r.to as [number, number] }))]), []);
  // Two poles per junction, two heads per pole (east–west, north–south), three lamps per head.
  const heads = useMemo(() => points.flatMap(([x, z]) => [[1, -1], [-1, 1]].flatMap(([sx, sz]) => [
    { x: x + sx * 6.6, z: z + sz * 6.6, eastWest: true, junction: [x, z] as [number, number], face: [sx, 0] as [number, number] },
    { x: x + sx * 6.6, z: z + sz * 6.6, eastWest: false, junction: [x, z] as [number, number], face: [0, sz] as [number, number] },
  ])), [points]);
  const poles = useRef<THREE.InstancedMesh>(null), boxes = useRef<THREE.InstancedMesh>(null), lamps = useRef<THREE.InstancedMesh>(null);
  const lampMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ffffff" }), []);
  const geos = useMemo(() => ({ pole: new THREE.CylinderGeometry(0.09, 0.11, 5.4, 8), box: new THREE.BoxGeometry(0.36, 1.05, 0.36), lamp: new THREE.SphereGeometry(0.1, 8, 6) }), []);
  useEffect(() => () => { Object.values(geos).forEach((g) => g.dispose()); lampMat.dispose(); }, [geos, lampMat]);
  useEffect(() => {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1);
    let i = 0;
    points.forEach(([x, z]) => [[1, -1], [-1, 1]].forEach(([sx, sz]) => poles.current?.setMatrixAt(i++, m.compose(new THREE.Vector3(x + sx * 6.6, CITY_Y + 2.7, z + sz * 6.6), q, s))));
    heads.forEach((h, k) => {
      // Heads sit at the top of the pole, nudged out toward the traffic they face.
      const hx = h.x + h.face[0] * 0.3, hz = h.z + h.face[1] * 0.3;
      boxes.current?.setMatrixAt(k, m.compose(new THREE.Vector3(hx, CITY_Y + 4.6, hz), q, s));
      [0.32, 0, -0.32].forEach((dy, j) => lamps.current?.setMatrixAt(k * 3 + j, m.compose(new THREE.Vector3(hx + h.face[0] * 0.19, CITY_Y + 4.6 + dy, hz + h.face[1] * 0.19), q, s)));
    });
    for (const r of [poles, boxes, lamps]) if (r.current) r.current.instanceMatrix.needsUpdate = true;
  }, [points, heads]);
  const last = useRef(-1);
  useFrame(() => {
    const t = host.sim?.cityTown?.clock ?? 0, l = lamps.current;
    if (!l || Math.abs(t - last.current) < 0.25) return;
    last.current = t;
    heads.forEach((h, k) => {
      const on = lit(signalAt(t, h.junction[0], h.junction[1]), h.eastWest);
      (["red", "amber", "green"] as const).forEach((c, j) => l.setColorAt(k * 3 + j, on === c ? ON[c] : OFF));
    });
    if (l.instanceColor) l.instanceColor.needsUpdate = true;
  });
  return (
    <group name="Traffic lights">
      <instancedMesh ref={poles} args={[geos.pole, mat("#2b2f34", { metal: 0.4, rough: 0.5 }), points.length * 2]} castShadow />
      <instancedMesh ref={boxes} args={[geos.box, mat("#1d2023"), heads.length]} castShadow />
      <instancedMesh ref={lamps} args={[geos.lamp, lampMat, heads.length * 3]} />
    </group>
  );
}
