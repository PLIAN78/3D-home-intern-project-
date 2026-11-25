import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { panel, shopGlass } from "../render/architecture";
import { mat } from "../render/materials";
import { Decal } from "../render/decal";
import { B } from "./props";
import { ANCHOR_GAP, ANCHOR_X, BAYS, LOST_BEAR, MALL, MALL_DOORS, MALL_STORES, OPENING, ROW } from "./mall";
import { Bench, Bookshelf, CafeTable, Counter, Planter, Plant, ShopShelf, Table, TV } from "../models/furniture";
import { useV6 } from "../story/v6Store";

const mid = (b: [number, number]) => (b[0] + b[1]) / 2;

/** The mall's outer shell with real doorways (replaces the old solid block), roof and parapet. */
export function MallShell() {
  const { x0, x1, z0, z1, h, wall } = MALL;
  const skin = panel("#d3cec3");
  const walls: [number, number, number, number, number, number][] = [
    // x0, z0, x1, z1, y0, height
    [x0, z0, MALL_DOORS.front[0], z0 + wall, 0, h],
    [MALL_DOORS.front[1], z0, x1, z0 + wall, 0, h],
    [MALL_DOORS.front[0], z0, MALL_DOORS.front[1], z0 + wall, 3.6, h - 3.6],
    [x0, z1 - wall, MALL_DOORS.back[0], z1, 0, h],
    [MALL_DOORS.back[1], z1 - wall, x1, z1, 0, h],
    [MALL_DOORS.back[0], z1 - wall, MALL_DOORS.back[1], z1, 3.2, h - 3.2],
    [x0, z0, x0 + wall, z1, 0, h],
    [x1 - wall, z0, x1, z1, 0, h],
  ];
  return (
    <group name="Mall shell">
      {walls.map(([a, b, c, d, y, hh], i) => (
        <mesh key={i} position={[(a + c) / 2, y + hh / 2, (b + d) / 2]} material={skin} castShadow receiveShadow>
          <boxGeometry args={[c - a, hh, d - b]} />
        </mesh>
      ))}
      <mesh position={[(x0 + x1) / 2, h - 0.2, (z0 + z1) / 2]} material={mat("#bdb8ae", { rough: 0.8 })} castShadow receiveShadow>
        <boxGeometry args={[x1 - x0, 0.4, z1 - z0]} />
      </mesh>
      {/* Glass doors in each doorway (open sliding leaves at the sides). */}
      {[[MALL_DOORS.front, z0 - 0.05, 3.6], [MALL_DOORS.back, z1 + 0.05, 3.2]].map(([d, z, hh], i) => {
        const [a, b] = d as [number, number];
        return (
          <group key={i}>
            {[a + 0.8, b - 0.8].map((x) => <mesh key={x} position={[x, (hh as number) / 2, z as number]} material={shopGlass()}><boxGeometry args={[1.4, (hh as number) - 0.2, 0.06]} /></mesh>)}
            <B size={[b - a, 0.25, 0.3]} position={[(a + b) / 2, (hh as number) - 0.1, z as number]} color="#2a2e33" />
          </group>
        );
      })}
    </group>
  );
}

/** Everything inside: floor, ceiling and lights, shop fronts with signs, shop fit-outs, anchors, food court, info desk. */
export function MallInterior() {
  const { x0, x1, z0, z1, ceiling } = MALL;
  const lights = useMemo(() => {
    const out: [number, number][] = [];
    for (let x = x0 + 5; x < x1 - 3; x += 8) for (let z = z0 + 5; z < z1 - 3; z += 8) out.push([x, z]);
    return out;
  }, [x0, x1, z0, z1]);
  const storefront = mat("#a9bcc6", { rough: 0.05, metal: 0.1 });
  return (
    <group name="Mall interior">
      {/* Polished floor with a darker inlay down the concourse. */}
      <B size={[x1 - x0 - 1, 0.04, z1 - z0 - 1]} position={[(x0 + x1) / 2, 0.02, (z0 + z1) / 2]} color="#d8d4cb" cast={false} />
      <B size={[ANCHOR_X.east - ANCHOR_X.west - 4, 0.045, 6]} position={[215, 0.025, 372]} color="#b9b2a6" cast={false} />
      <B size={[8, 0.046, ROW.south - ROW.north]} position={[215, 0.026, 372]} color="#b9b2a6" cast={false} />
      {/* Ceiling, light panels and a skylight down the middle. */}
      <mesh position={[(x0 + x1) / 2, ceiling, (z0 + z1) / 2]} rotation={[Math.PI / 2, 0, 0]} material={mat("#efeee9", { rough: 0.9 })}><planeGeometry args={[x1 - x0, z1 - z0]} /></mesh>
      {lights.map(([x, z], i) => <mesh key={i} position={[x, ceiling - 0.02, z]} rotation={[Math.PI / 2, 0, 0]} material={mat("#ffffff", { emissive: "#fff4e0", emissiveIntensity: 1.1 })}><planeGeometry args={[1.4, 1.4]} /></mesh>)}
      <mesh position={[215, ceiling - 0.03, 372]} rotation={[Math.PI / 2, 0, 0]} material={mat("#dff1ff", { emissive: "#cfe8ff", emissiveIntensity: 0.9 })}><planeGeometry args={[ANCHOR_X.east - ANCHOR_X.west - 6, 5]} /></mesh>
      <pointLight position={[215, ceiling - 1, 372]} intensity={40} distance={60} decay={1.2} color="#fff3dd" />
      <pointLight position={[176, ceiling - 1, 372]} intensity={18} distance={30} decay={1.2} color="#fff3dd" />
      <pointLight position={[254, ceiling - 1, 372]} intensity={18} distance={30} decay={1.2} color="#fff3dd" />

      {/* Anchor walls with their openings, and the store names over them. */}
      {[ANCHOR_X.west, ANCHOR_X.east].map((x, i) => (
        <group key={x}>
          <B size={[MALL.wall, ceiling, ANCHOR_GAP[0] - z0]} position={[x, ceiling / 2, (z0 + ANCHOR_GAP[0]) / 2]} color="#e4e0d6" />
          <B size={[MALL.wall, ceiling, z1 - ANCHOR_GAP[1]]} position={[x, ceiling / 2, (ANCHOR_GAP[1] + z1) / 2]} color="#e4e0d6" />
          <B size={[MALL.wall, ceiling - 4, ANCHOR_GAP[1] - ANCHOR_GAP[0]]} position={[x, 4 + (ceiling - 4) / 2, 372]} color="#e4e0d6" />
          <Decal text={i ? "HOME + GARDEN" : "MARKET HALL"} color="#2b2f34" position={[x + (i ? -0.25 : 0.25), 5.2, 372]} rotation={[0, i ? -Math.PI / 2 : Math.PI / 2, 0]} size={[8, 0.9]} />
        </group>
      ))}

      {/* Shop partitions, glass fronts with an opening, and the sign over each. */}
      {([["north", ROW.north, z0], ["south", ROW.south, z1]] as const).map(([row, rowZ, outer]) => (
        <group key={row}>
          {[196, 209, 221, 234].map((x) => <B key={x} size={[0.2, ceiling, Math.abs(outer - rowZ)]} position={[x, ceiling / 2, (outer + rowZ) / 2]} color="#e4e0d6" />)}
          {BAYS.map((bay, i) => {
            const c = mid(bay), store = MALL_STORES.filter((s) => s.row === row)[i], face = row === "north" ? 1 : -1;
            return (
              <group key={i}>
                {[[bay[0], c - OPENING / 2], [c + OPENING / 2, bay[1]]].map(([a, b]) => (
                  <mesh key={a} position={[(a + b) / 2, 1.6, rowZ]} material={storefront}><boxGeometry args={[b - a, 3.2, 0.06]} /></mesh>
                ))}
                <B size={[bay[1] - bay[0], ceiling - 3.2, 0.3]} position={[c, 3.2 + (ceiling - 3.2) / 2, rowZ]} color={store.colour} />
                <Decal text={store.name} color="#f6efe0" position={[c, 4.4, rowZ + face * 0.16]} rotation={[0, face > 0 ? 0 : Math.PI, 0]} size={[Math.min(10, store.name.length * 0.62), 0.9]} />
                <ShopFitout id={store.id} bay={bay} row={row} />
              </group>
            );
          })}
        </group>
      ))}

      {/* Counters for every shop, the anchors and the info desk. */}
      {MALL_STORES.map((s) => {
        const along = s.row === "west" || s.row === "east";
        const rot = s.row === "north" ? 0 : s.row === "south" ? Math.PI : s.row === "west" ? Math.PI / 2 : s.row === "east" ? -Math.PI / 2 : 0;
        return <Counter key={s.id} position={[s.counter[0], 0, s.counter[1]]} rotation={rot} w={s.row === "centre" ? 4 : along ? 3 : 3} front={s.row === "centre" ? "#f1efe9" : "#e8e4da"} sign={s.colour} />;
      })}
      <Decal text="INFORMATION" color="#2b2f34" position={[215, 2.2, 362.5]} rotation={[0, 0, 0]} size={[3.4, 0.5]} />
      <B size={[0.12, 2.6, 0.12]} position={[207, 1.3, 364]} color="#2b2f34" />
      <B size={[3.2, 1.2, 0.08]} position={[207, 3, 364]} color="#1f3a5f" />
      <Decal text="MALL DIRECTORY" color="#f4ead2" position={[207, 3.2, 364.05]} rotation={[0, 0, 0]} size={[2.8, 0.4]} />

      {/* Food court in front of the Noodle Bar and Pizza Slice. */}
      {[[192, 380], [198, 376], [204, 381], [190, 374], [228, 380], [234, 376], [240, 381], [226, 374]].map(([x, z], i) => <CafeTable key={i} position={[x, 0, z]} rotation={i % 2 ? 0.4 : -0.3} top={i % 3 ? "#e8e4da" : "#d9c79a"} />)}
      {/* Planters, benches and a central fountain-planter. */}
      <Planter position={[215, 0, 372]} w={6} />
      {[[200, 366], [230, 366]].map(([x, z]) => <Planter key={x} position={[x, 0, z]} w={4} rotation={Math.PI / 2} />)}
      {[[205, 368], [225, 368], [205, 384], [225, 384]].map(([x, z], i) => <Bench key={i} position={[x, 0, z]} rotation={i < 2 ? Math.PI : 0} />)}
      {[[186, 360], [244, 360], [186, 385], [244, 385]].map(([x, z], i) => <Plant key={i} position={[x, 0, z]} h={1.8} />)}
      <TV position={[215, 0, 385.5]} rotation={Math.PI} w={2.4} />

      {/* Market Hall: grocery aisles, produce tables and a bakery case. */}
      {[352, 358, 386, 392].map((z) => <ShopShelf key={z} position={[174, 0, z]} w={12} goods={["#c94a3c", "#e0a43a", "#5b7f3a", "#e8e4da", "#a3542b"]} />)}
      {[[171, 366], [178, 366], [171, 378], [178, 378]].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <Table w={2.2} d={1.2} h={0.85} top="#7a5a3e" />
          {Array.from({ length: 10 }, (_, k) => <mesh key={k} position={[-0.9 + (k % 5) * 0.45, 0.95, (k < 5 ? -0.25 : 0.25)]} material={mat(["#c94a3c", "#e0a43a", "#5b7f3a", "#d9a441"][(i + k) % 4])} castShadow><sphereGeometry args={[0.16, 10, 8]} /></mesh>)}
        </group>
      ))}
      {/* Home + Garden: tool and paint shelving, potted plants and patio furniture. */}
      {[352, 358, 386, 392].map((z) => <ShopShelf key={z} position={[256, 0, z]} w={12} goods={["#2f6f86", "#e8e4da", "#d9c79a", "#6c727a", "#8c5e46"]} />)}
      {[[252, 366], [256, 366], [260, 366], [252, 378], [256, 378]].map(([x, z], i) => <Plant key={i} position={[x, 0, z]} h={1.2 + (i % 3) * 0.4} pot={i % 2 ? "#a3542b" : "#b9b2a6"} />)}
      <Table position={[259, 0, 378]} w={1.2} d={1.2} top="#e8e4da" legs="#e8e4da" />
      <LostBear />
    </group>
  );
}

/** Each shop's own fit-out behind its counter. */
function ShopFitout({ id, bay, row }: { id: string; bay: [number, number]; row: "north" | "south" }) {
  const c = mid(bay), back = row === "north" ? MALL.z0 + 0.6 : MALL.z1 - 0.6, face = row === "north" ? 0 : Math.PI;
  const side = (k: number) => [bay[0] + 1.2, bay[1] - 1.2][k];
  const zMid = row === "north" ? (MALL.z0 + ROW.north) / 2 + 1.5 : (MALL.z1 + ROW.south) / 2 - 1.5;
  if (id === "mall-books") return <group>{[-4, 0, 4].map((dx) => <Bookshelf key={dx} position={[c + dx, 0, back + 0.2]} rotation={face} w={3.4} h={2.4} />)}<Table position={[c, 0, zMid + 2]} w={2.4} d={1.2} top="#7a5a3e" /></group>;
  if (id === "mall-gadgets") return <group>{[-3.5, 3.5].map((dx) => <TV key={dx} position={[c + dx, 0, back + 0.4]} rotation={face} w={1.6} />)}<Table position={[c, 0, zMid + 2]} w={3} d={1} top="#f1efe9" legs="#f1efe9" />{[-1, 0, 1].map((k) => <B key={k} size={[0.3, 0.02, 0.6]} position={[c + k * 0.8, 0.77, zMid + 2]} color="#15171a" />)}</group>;
  if (id === "mall-style" || id === "mall-sports") return (
    <group>
      {[0, 1].map((k) => (
        <group key={k} position={[side(k), 0, zMid + 1]}>
          <B size={[0.06, 1.6, 2.4]} position={[0, 1.6, 0]} color="#2b2f34" />
          {Array.from({ length: 8 }, (_, i) => <B key={i} size={[0.45, 0.8, 0.06]} position={[0, 1.15, -1.05 + i * 0.3]} color={id === "mall-style" ? ["#8c3b5e", "#1d3b6a", "#e8e4da", "#4b5258"][i % 4] : ["#c94a3c", "#2f8f9d", "#e0a43a", "#22262b"][i % 4]} cast={false} />)}
        </group>
      ))}
      {id === "mall-sports" && [0, 1, 2].map((k) => <mesh key={k} position={[c - 1 + k, 0.3, zMid + 3]} material={mat(["#e8e4da", "#c94a3c", "#e0a43a"][k])} castShadow><sphereGeometry args={[0.3, 14, 10]} /></mesh>)}
    </group>
  );
  if (id === "mall-noodles" || id === "mall-pizza") return (
    <group>
      <B size={[bay[1] - bay[0] - 1, 2.2, 0.6]} position={[c, 1.1, back + 0.3]} color="#9aa1a8" />
      <B size={[bay[1] - bay[0] - 2, 0.7, 0.05]} position={[c, 2.6, back + 0.62]} color="#15171a" emissive="#2a1f0f" />
      {id === "mall-pizza" && <mesh position={[c + 3, 1, back + 1]} material={mat("#a3542b")}><sphereGeometry args={[0.9, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2]} /></mesh>}
    </group>
  );
  if (id === "mall-toys") return <group>{[-3, 3].map((dx) => <ShopShelf key={dx} position={[c + dx, 0, zMid]} rotation={Math.PI / 2} w={4} h={1.4} goods={["#2f8f9d", "#e0a43a", "#c94a3c", "#8c3b5e"]} />)}</group>;
  return <group>{[-3, 3].map((dx) => <TV key={dx} position={[c + dx, 0, back + 0.4]} rotation={face} w={1.2} />)}<Table position={[c, 0, zMid]} w={2} d={1} /></group>;
}

/** The teddy bear lost in Home + Garden, there while the info desk's job is open. */
function LostBear() {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    const g = useV6.getState().gig;
    if (ref.current) ref.current.visible = g?.id === "mall-bear" && g.step === 0;
  });
  return (
    <group ref={ref} position={[LOST_BEAR[0], 0, LOST_BEAR[1]]} name="Lost teddy bear" visible={false}>
      <mesh position={[0, 0.25, 0]} material={mat("#a0703f")} castShadow><sphereGeometry args={[0.22, 12, 10]} /></mesh>
      <mesh position={[0, 0.55, 0]} material={mat("#a0703f")} castShadow><sphereGeometry args={[0.16, 12, 10]} /></mesh>
      {[-1, 1].map((s) => <mesh key={s} position={[s * 0.11, 0.69, 0]} material={mat("#7a5230")}><sphereGeometry args={[0.06, 8, 6]} /></mesh>)}
      <mesh position={[0, 1.6, 0]} material={mat("#facc15", { emissive: "#facc15", emissiveIntensity: 1.2 })}><octahedronGeometry args={[0.25]} /></mesh>
    </group>
  );
}
