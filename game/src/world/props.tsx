import { useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Decal } from "../render/decal";
import { windowGlass } from "../render/architecture";
import { groundAsphalt, mat } from "../render/materials";

/** A plain box with a flat colour. */
export function B({ size, position, color, rotation, emissive, cast = true }: { size: [number, number, number]; position: [number, number, number]; color: string; rotation?: [number, number, number]; emissive?: string; cast?: boolean }) {
  return (
    <mesh position={position} rotation={rotation} material={mat(color, { emissive })} castShadow={cast} receiveShadow>
      <boxGeometry args={size} />
    </mesh>
  );
}

/**
 * A monument sign: a concrete plinth with a dark name panel, lettered on both
 * faces. `heading` is the game heading the front faces (forward = cos, sin).
 */
export function Sign({ text, at, heading, width = 5, sub }: { text: string; at: [number, number]; heading: number; width?: number; sub?: string }) {
  const h = sub ? 1.5 : 1.25;
  return (
    <group position={[at[0], 0, at[1]]} rotation={[0, -heading + Math.PI / 2, 0]}>
      <B size={[width + 0.5, 0.35, 0.7]} position={[0, 0.175, 0]} color="#bdb8ae" />
      <B size={[width, h, 0.36]} position={[0, 0.35 + h / 2, 0]} color="#22262b" />
      <B size={[width + 0.1, 0.08, 0.42]} position={[0, 0.35 + h + 0.04, 0]} color="#bdb8ae" />
      {[1, -1].map((side) => (
        <group key={side} rotation={[0, side > 0 ? 0 : Math.PI, 0]}>
          <Decal text={text} color="#f3f1ea" position={[0, 0.35 + h * (sub ? 0.64 : 0.5), 0.185]} rotation={[0, 0, 0]} size={[width * 0.9, 0.42]} />
          {sub && <Decal text={sub} color="#d9a441" position={[0, 0.35 + h * 0.28, 0.185]} rotation={[0, 0, 0]} size={[width * 0.7, 0.26]} />}
        </group>
      ))}
    </group>
  );
}

/**
 * Window panes on one wall of a box building, as one merged mesh of glass and
 * one of frames. The wall faces `face` (+x, −x, +z or −z) at distance `offset`
 * from (cx, cz); windows run along the wall every `spacing` metres on each floor.
 */
export function Windows({
  centre,
  face,
  offset,
  length,
  floors,
  size = [1.8, 1.5],
  spacing = 3.2,
  skip = [],
}: {
  centre: [number, number];
  face: "+x" | "-x" | "+z" | "-z";
  offset: number;
  length: number;
  floors: number[];
  size?: [number, number];
  spacing?: number;
  /** Ranges along the wall (from its centre) to leave solid, e.g. for an entrance. */
  skip?: [number, number][];
}) {
  const geo = useMemo(() => {
    const panes: THREE.BufferGeometry[] = [];
    const frames: THREE.BufferGeometry[] = [];
    const n = Math.floor((length - 2) / spacing);
    const start = -((n - 1) * spacing) / 2;
    for (const y of floors)
      for (let i = 0; i < n; i++) {
        const t = start + i * spacing;
        if (skip.some(([a, b]) => t > a - size[0] / 2 && t < b + size[0] / 2)) continue;
        const pane = new THREE.BoxGeometry(size[0], size[1], 0.06);
        const frame = new THREE.BoxGeometry(size[0] + 0.22, size[1] + 0.22, 0.05);
        const sill = new THREE.BoxGeometry(size[0] + 0.4, 0.08, 0.18);
        sill.translate(0, -size[1] / 2 - 0.12, 0.06);
        const mullion = new THREE.BoxGeometry(0.06, size[1], 0.04);
        mullion.translate(0, 0, 0.04);
        for (const g of [pane, frame, sill, mullion]) {
          g.translate(0, 0, g === pane ? 0.04 : 0);
          if (face === "+z" || face === "-z") {
            if (face === "-z") g.rotateY(Math.PI);
            g.translate(centre[0] + t, y, centre[1] + (face === "+z" ? offset : -offset));
          } else {
            g.rotateY(face === "+x" ? Math.PI / 2 : -Math.PI / 2);
            g.translate(centre[0] + (face === "+x" ? offset : -offset), y, centre[1] + t);
          }
        }
        panes.push(pane);
        frames.push(frame, sill, mullion);
      }
    return { panes: panes.length ? mergeGeometries(panes, false) : null, frames: frames.length ? mergeGeometries(frames, false) : null };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <>
      {geo.panes && <mesh geometry={geo.panes} material={windowGlass()} />}
      {geo.frames && <mesh geometry={geo.frames} material={mat("#ece9e2", { rough: 0.5 })} castShadow />}
    </>
  );
}

/** An asphalt lot with painted stalls in rows along x. Stalls are 2.7 m wide, 5.5 m deep. */
export function ParkingLot({ x0, z0, x1, z1, rows }: { x0: number; z0: number; x1: number; z1: number; rows: number[] }) {
  const lines = useMemo(() => {
    const parts: THREE.BufferGeometry[] = [];
    for (const rz of rows)
      for (let x = x0 + 2; x <= x1 - 2; x += 2.7) {
        const g = new THREE.BoxGeometry(0.12, 0.012, 5.2);
        g.translate(x, 0.048, rz);
        parts.push(g);
      }
    return parts.length ? mergeGeometries(parts, false) : null;
  }, [x0, x1, rows]);
  return (
    <group>
      <mesh position={[(x0 + x1) / 2, 0.02, (z0 + z1) / 2]} material={groundAsphalt()} receiveShadow>
        <boxGeometry args={[x1 - x0, 0.04, z1 - z0]} />
      </mesh>
      {lines && <mesh geometry={lines} material={mat("#efeee9", { rough: 0.7 })} receiveShadow />}
    </group>
  );
}
