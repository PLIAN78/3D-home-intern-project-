import { mat, chrome } from "../render/materials";
import { B } from "../world/props";

/**
 * Furniture for interiors you can walk into: built from boxes, cylinders and
 * spheres but with the parts that make them read as real things (legs,
 * cushions, frames, shelves with goods, lamps that glow). Each sits on the
 * floor at y = 0 of its group and faces +z unless noted.
 */
type G = { position?: [number, number, number]; rotation?: number };
const at = (p?: [number, number, number]) => p ?? [0, 0, 0];

export function Sofa({ position, rotation = 0, width = 2.2, color = "#6f7d86" }: G & { width?: number; color?: string }) {
  const seats = width > 1.6 ? 3 : 2, sw = (width - 0.3) / seats;
  return (
    <group position={at(position)} rotation={[0, rotation, 0]}>
      <B size={[width, 0.3, 0.92]} position={[0, 0.27, 0]} color={color} />
      {Array.from({ length: seats }, (_, i) => <B key={i} size={[sw - 0.04, 0.16, 0.7]} position={[-width / 2 + 0.15 + sw * (i + 0.5), 0.5, 0.08]} color={color} />)}
      {Array.from({ length: seats }, (_, i) => <B key={"b" + i} size={[sw - 0.06, 0.5, 0.2]} position={[-width / 2 + 0.15 + sw * (i + 0.5), 0.72, -0.33]} color={color} />)}
      {[-1, 1].map((s) => <B key={s} size={[0.16, 0.62, 0.92]} position={[s * (width / 2 - 0.08), 0.43, 0]} color={color} />)}
      {[-1, 1].flatMap((a) => [-1, 1].map((b) => <B key={a + "-" + b} size={[0.06, 0.12, 0.06]} position={[a * (width / 2 - 0.12), 0.06, b * 0.38]} color="#2a2420" />))}
      <B size={[0.42, 0.36, 0.12]} position={[-width / 2 + 0.45, 0.72, -0.15]} color="#d9c9a3" />
    </group>
  );
}

export function Armchair({ position, rotation = 0, color = "#8c5e46" }: G & { color?: string }) {
  return (
    <group position={at(position)} rotation={[0, rotation, 0]}>
      <B size={[0.86, 0.28, 0.84]} position={[0, 0.3, 0]} color={color} />
      <B size={[0.62, 0.14, 0.62]} position={[0, 0.51, 0.06]} color={color} />
      <B size={[0.86, 0.55, 0.18]} position={[0, 0.7, -0.33]} color={color} />
      {[-1, 1].map((s) => <B key={s} size={[0.14, 0.45, 0.84]} position={[s * 0.36, 0.5, 0]} color={color} />)}
      {[-1, 1].flatMap((a) => [-1, 1].map((b) => <B key={a + "-" + b} size={[0.05, 0.16, 0.05]} position={[a * 0.36, 0.08, b * 0.35]} color="#2a2420" />))}
    </group>
  );
}

export function Table({ position, rotation = 0, w = 1.2, d = 0.7, h = 0.75, top = "#9a7350", legs = "#2b2f34" }: G & { w?: number; d?: number; h?: number; top?: string; legs?: string }) {
  return (
    <group position={at(position)} rotation={[0, rotation, 0]}>
      <B size={[w, 0.05, d]} position={[0, h - 0.025, 0]} color={top} />
      {[-1, 1].flatMap((a) => [-1, 1].map((b) => <B key={a + "-" + b} size={[0.05, h - 0.05, 0.05]} position={[a * (w / 2 - 0.06), (h - 0.05) / 2, b * (d / 2 - 0.06)]} color={legs} />))}
    </group>
  );
}

export function Chair({ position, rotation = 0, color = "#3d4a52", frame = "#2b2f34" }: G & { color?: string; frame?: string }) {
  return (
    <group position={at(position)} rotation={[0, rotation, 0]}>
      <B size={[0.44, 0.05, 0.42]} position={[0, 0.46, 0]} color={color} />
      <B size={[0.44, 0.42, 0.04]} position={[0, 0.7, -0.2]} color={color} />
      {[-1, 1].flatMap((a) => [-1, 1].map((b) => <B key={a + "-" + b} size={[0.03, 0.45, 0.03]} position={[a * 0.19, 0.225, b * 0.18]} color={frame} />))}
    </group>
  );
}

/** A table with chairs round it (2 or 4). */
export function DiningSet({ position, rotation = 0, seats = 4, top = "#9a7350", chair = "#3d4a52" }: G & { seats?: 2 | 4; top?: string; chair?: string }) {
  return (
    <group position={at(position)} rotation={[0, rotation, 0]}>
      <Table w={seats === 4 ? 1.4 : 0.8} d={0.8} top={top} />
      <Chair position={[0, 0, 0.62]} rotation={Math.PI} color={chair} />
      <Chair position={[0, 0, -0.62]} color={chair} />
      {seats === 4 && <><Chair position={[0.95, 0, 0]} rotation={-Math.PI / 2} color={chair} /><Chair position={[-0.95, 0, 0]} rotation={Math.PI / 2} color={chair} /></>}
    </group>
  );
}

export function Rug({ position, w = 2.6, d = 1.8, color = "#9a6b52", border = "#e2d6bf" }: G & { w?: number; d?: number; color?: string; border?: string }) {
  return (
    <group position={at(position)}>
      <B size={[w, 0.012, d]} position={[0, 0.006, 0]} color={border} cast={false} />
      <B size={[w - 0.25, 0.014, d - 0.25]} position={[0, 0.008, 0]} color={color} cast={false} />
    </group>
  );
}

export function Plant({ position, h = 1.4, pot = "#b9b2a6", leaf = "#3e6b3a" }: G & { h?: number; pot?: string; leaf?: string }) {
  return (
    <group position={at(position)}>
      <mesh position={[0, 0.22, 0]} material={mat(pot)} castShadow><cylinderGeometry args={[0.22, 0.17, 0.44, 12]} /></mesh>
      <mesh position={[0, 0.45, 0]} material={mat("#3a2c22")}><cylinderGeometry args={[0.2, 0.2, 0.02, 12]} /></mesh>
      <mesh position={[0, 0.45 + h * 0.35, 0]} material={mat("#5a4632")}><cylinderGeometry args={[0.03, 0.04, h * 0.7, 6]} /></mesh>
      {[[0, h * 0.78, 0, 0.42], [0.18, h * 0.62, 0.1, 0.32], [-0.16, h * 0.66, -0.12, 0.3], [0.05, h * 0.95, -0.1, 0.28]].map(([x, y, z, r], i) => (
        <mesh key={i} position={[x, 0.45 + y, z]} material={mat(i % 2 ? leaf : "#4f7d45", { rough: 0.9 })} castShadow><icosahedronGeometry args={[r, 1]} /></mesh>
      ))}
    </group>
  );
}

export function FloorLamp({ position }: G) {
  return (
    <group position={at(position)}>
      <mesh position={[0, 0.02, 0]} material={mat("#2b2f34")}><cylinderGeometry args={[0.18, 0.2, 0.04, 12]} /></mesh>
      <mesh position={[0, 0.8, 0]} material={chrome()}><cylinderGeometry args={[0.015, 0.015, 1.6, 6]} /></mesh>
      <mesh position={[0, 1.62, 0]} material={mat("#f3e7c9", { emissive: "#ffe3a6", emissiveIntensity: 1.2 })}><cylinderGeometry args={[0.16, 0.24, 0.3, 14, 1, true]} /></mesh>
    </group>
  );
}

export function Bookshelf({ position, rotation = 0, w = 1.6, h = 2, wood = "#7a5a3e" }: G & { w?: number; h?: number; wood?: string }) {
  const shelves = Math.max(3, Math.floor(h / 0.42));
  const colours = ["#8c1d18", "#1d3b6a", "#2e5a3b", "#c9a54f", "#5b4a6b", "#d8d2c4", "#a3542b"];
  return (
    <group position={at(position)} rotation={[0, rotation, 0]}>
      <B size={[w, h, 0.04]} position={[0, h / 2, -0.17]} color={wood} />
      {[-1, 1].map((s) => <B key={s} size={[0.04, h, 0.36]} position={[s * (w / 2 - 0.02), h / 2, 0]} color={wood} />)}
      {Array.from({ length: shelves + 1 }, (_, i) => <B key={i} size={[w, 0.03, 0.36]} position={[0, (i * h) / shelves + 0.015, 0]} color={wood} />)}
      {Array.from({ length: shelves }, (_, i) => {
        const n = Math.floor((w - 0.2) / 0.09);
        return Array.from({ length: n }, (_, k) => {
          const bh = 0.22 + ((i * 7 + k * 3) % 5) * 0.025;
          return (i * 3 + k) % 9 === 4 ? null : <B key={i + "-" + k} size={[0.07, bh, 0.24]} position={[-w / 2 + 0.12 + k * 0.09, (i * h) / shelves + 0.03 + bh / 2, 0.02]} color={colours[(i * 5 + k) % colours.length]} cast={false} />;
        });
      })}
    </group>
  );
}

export function Bed({ position, rotation = 0, w = 1.6, d = 2.1, duvet = "#d8d2c4" }: G & { w?: number; d?: number; duvet?: string }) {
  return (
    <group position={at(position)} rotation={[0, rotation, 0]}>
      <B size={[w + 0.1, 0.3, d + 0.1]} position={[0, 0.2, 0]} color="#5a4632" />
      <B size={[w, 0.22, d]} position={[0, 0.46, 0]} color="#f1efe9" />
      <B size={[w + 0.04, 0.1, d * 0.65]} position={[0, 0.6, d * 0.17]} color={duvet} />
      {[-1, 1].map((s) => <B key={s} size={[w * 0.42, 0.14, 0.4]} position={[s * w * 0.23, 0.64, -d / 2 + 0.3]} color="#ffffff" />)}
      <B size={[w + 0.2, 1, 0.1]} position={[0, 0.65, -d / 2 - 0.03]} color="#6c5641" />
      {[-1, 1].map((s) => (
        <group key={"n" + s} position={[s * (w / 2 + 0.38), 0, -d / 2 + 0.25]}>
          <B size={[0.5, 0.5, 0.42]} position={[0, 0.25, 0]} color="#6c5641" />
          <mesh position={[0, 0.72, 0]} material={mat("#f3e7c9", { emissive: "#ffe3a6", emissiveIntensity: 0.9 })}><cylinderGeometry args={[0.1, 0.14, 0.2, 12, 1, true]} /></mesh>
          <mesh position={[0, 0.56, 0]} material={mat("#2b2f34")}><cylinderGeometry args={[0.07, 0.08, 0.12, 10]} /></mesh>
        </group>
      ))}
    </group>
  );
}

/** A run of kitchen: base cabinets with a stone top, sink, hob, upper cabinets and a fridge at the end. */
export function Kitchen({ position, rotation = 0, w = 3.6 }: G & { w?: number }) {
  return (
    <group position={at(position)} rotation={[0, rotation, 0]}>
      <B size={[w, 0.86, 0.62]} position={[0, 0.43, 0]} color="#e8e4da" />
      <B size={[w + 0.04, 0.04, 0.66]} position={[0, 0.88, 0.01]} color="#4a4f55" />
      {Array.from({ length: Math.floor(w / 0.6) }, (_, i) => <B key={i} size={[0.02, 0.7, 0.01]} position={[-w / 2 + 0.6 * (i + 1), 0.43, 0.315]} color="#b9b4aa" cast={false} />)}
      <B size={[0.55, 0.03, 0.4]} position={[-w * 0.15, 0.9, 0]} color="#9aa1a8" />
      <mesh position={[-w * 0.15, 1.05, -0.22]} material={chrome()}><cylinderGeometry args={[0.015, 0.015, 0.3, 6]} /></mesh>
      {[-1, 1].flatMap((a) => [-1, 1].map((b) => <mesh key={a + "-" + b} position={[w * 0.22 + a * 0.15, 0.905, b * 0.12]} material={mat("#1b1d20")}><cylinderGeometry args={[0.09, 0.09, 0.01, 16]} /></mesh>))}
      <B size={[w, 0.7, 0.36]} position={[0, 1.9, -0.13]} color="#e8e4da" />
      <B size={[0.75, 2, 0.68]} position={[w / 2 + 0.4, 1, 0]} color="#c9ccd1" />
      <B size={[0.02, 0.5, 0.02]} position={[w / 2 + 0.1, 1.3, 0.35]} color="#6c727a" />
    </group>
  );
}

export function TV({ position, rotation = 0, w = 1.4 }: G & { w?: number }) {
  return (
    <group position={at(position)} rotation={[0, rotation, 0]}>
      <B size={[w * 1.1, 0.45, 0.42]} position={[0, 0.225, 0]} color="#3a3027" />
      <B size={[w, w * 0.58, 0.05]} position={[0, 0.5 + w * 0.29, 0]} color="#101214" />
      <B size={[w - 0.06, w * 0.58 - 0.06, 0.01]} position={[0, 0.5 + w * 0.29, 0.03]} color="#1c2733" emissive="#0d1a26" />
    </group>
  );
}

export function WallArt({ position, rotation = 0, w = 1.2, h = 0.8, color = "#c9744f" }: G & { w?: number; h?: number; color?: string }) {
  return (
    <group position={at(position)} rotation={[0, rotation, 0]}>
      <B size={[w + 0.08, h + 0.08, 0.04]} position={[0, 0, 0]} color="#2b2f34" cast={false} />
      <B size={[w, h, 0.02]} position={[0, 0, 0.02]} color="#efe9dc" cast={false} />
      <B size={[w * 0.6, h * 0.5, 0.01]} position={[-w * 0.1, h * 0.05, 0.035]} color={color} cast={false} />
      <B size={[w * 0.3, h * 0.3, 0.01]} position={[w * 0.25, -h * 0.15, 0.04]} color="#2f6f86" cast={false} />
    </group>
  );
}

/** Desk with a monitor, keyboard and an office chair. */
export function Workstation({ position, rotation = 0 }: G) {
  return (
    <group position={at(position)} rotation={[0, rotation, 0]}>
      <Table w={1.6} d={0.75} top="#d8d2c4" legs="#6c727a" />
      <B size={[0.62, 0.38, 0.03]} position={[0, 1.02, -0.2]} color="#15171a" />
      <B size={[0.58, 0.34, 0.01]} position={[0, 1.02, -0.18]} color="#25415a" emissive="#0f2233" />
      <B size={[0.06, 0.14, 0.06]} position={[0, 0.82, -0.22]} color="#2b2f34" />
      <B size={[0.44, 0.02, 0.15]} position={[0, 0.77, 0.08]} color="#2b2f34" />
      <group position={[0, 0, 0.7]} rotation={[0, Math.PI, 0]}>
        <B size={[0.5, 0.08, 0.48]} position={[0, 0.48, 0]} color="#22262b" />
        <B size={[0.48, 0.55, 0.06]} position={[0, 0.82, -0.22]} color="#22262b" />
        <mesh position={[0, 0.24, 0]} material={chrome()}><cylinderGeometry args={[0.03, 0.03, 0.44, 8]} /></mesh>
        <mesh position={[0, 0.05, 0]} material={mat("#22262b")}><cylinderGeometry args={[0.3, 0.3, 0.04, 5]} /></mesh>
      </group>
    </group>
  );
}

/** Reception or service counter: a solid front, a stone top, a screen and a bell. */
export function Counter({ position, rotation = 0, w = 3, front = "#e8e4da", top = "#4a4f55", sign }: G & { w?: number; front?: string; top?: string; sign?: string }) {
  return (
    <group position={at(position)} rotation={[0, rotation, 0]}>
      <B size={[w, 1.05, 0.7]} position={[0, 0.525, 0]} color={front} />
      <B size={[w + 0.1, 0.05, 0.8]} position={[0, 1.08, 0]} color={top} />
      <B size={[w - 0.2, 0.08, 0.06]} position={[0, 0.9, 0.36]} color={sign ?? "#c9a54f"} />
      <B size={[0.4, 0.28, 0.03]} position={[w * 0.25, 1.28, -0.15]} color="#15171a" />
      <mesh position={[-w * 0.3, 1.13, 0.1]} material={chrome()}><sphereGeometry args={[0.05, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2]} /></mesh>
    </group>
  );
}

/** Shop shelving: a gondola of shelves stocked with coloured goods. */
export function ShopShelf({ position, rotation = 0, w = 2.4, h = 1.8, goods = ["#c94a3c", "#2f8f9d", "#e0a43a", "#5b7f3a", "#e8e4da"] }: G & { w?: number; h?: number; goods?: string[] }) {
  const shelves = 4;
  return (
    <group position={at(position)} rotation={[0, rotation, 0]}>
      <B size={[w, h, 0.08]} position={[0, h / 2, 0]} color="#d9d5cc" />
      {Array.from({ length: shelves }, (_, i) => (
        <group key={i}>
          <B size={[w, 0.03, 0.9]} position={[0, 0.15 + (i * (h - 0.2)) / (shelves - 1), 0]} color="#c9c4b9" />
          {Array.from({ length: Math.floor(w / 0.22) }, (_, k) => {
            const c = goods[(i * 3 + k) % goods.length], gh = 0.18 + ((i + k) % 3) * 0.05;
            return [-1, 1].map((s) => <B key={k + "-" + s} size={[0.16, gh, 0.22]} position={[-w / 2 + 0.14 + k * 0.22, 0.165 + (i * (h - 0.2)) / (shelves - 1) + gh / 2, s * 0.24]} color={c} cast={false} />);
          })}
        </group>
      ))}
    </group>
  );
}

export function Bench({ position, rotation = 0, w = 1.8 }: G & { w?: number }) {
  return (
    <group position={at(position)} rotation={[0, rotation, 0]}>
      <B size={[w, 0.06, 0.45]} position={[0, 0.45, 0]} color="#9a7350" />
      <B size={[w, 0.4, 0.05]} position={[0, 0.72, -0.2]} color="#9a7350" />
      {[-1, 1].map((s) => <B key={s} size={[0.06, 0.45, 0.42]} position={[s * (w / 2 - 0.1), 0.225, 0]} color="#2b2f34" />)}
    </group>
  );
}

/** A long planter box with shrubs. */
export function Planter({ position, rotation = 0, w = 3 }: G & { w?: number }) {
  return (
    <group position={at(position)} rotation={[0, rotation, 0]}>
      <B size={[w, 0.55, 0.8]} position={[0, 0.275, 0]} color="#b9b2a6" />
      <B size={[w - 0.12, 0.04, 0.68]} position={[0, 0.56, 0]} color="#3a2c22" cast={false} />
      {Array.from({ length: Math.max(2, Math.floor(w / 0.7)) }, (_, i) => (
        <mesh key={i} position={[-w / 2 + 0.4 + i * 0.7, 0.85, ((i % 2) - 0.5) * 0.15]} material={mat(i % 2 ? "#3e6b3a" : "#4f7d45", { rough: 0.9 })} castShadow><icosahedronGeometry args={[0.36, 1]} /></mesh>
      ))}
    </group>
  );
}

/** Lift doors in a wall: brushed steel with a call button and a floor indicator. */
export function LiftDoors({ position, rotation = 0 }: G) {
  return (
    <group position={at(position)} rotation={[0, rotation, 0]}>
      <B size={[1.9, 2.5, 0.12]} position={[0, 1.25, 0]} color="#5f6b73" />
      {[-1, 1].map((s) => <B key={s} size={[0.88, 2.3, 0.04]} position={[s * 0.45, 1.15, 0.07]} color="#aeb5ba" />)}
      <B size={[0.12, 0.2, 0.03]} position={[1.15, 1.2, 0.07]} color="#22262b" />
      <B size={[0.5, 0.16, 0.03]} position={[0, 2.62, 0.07]} color="#15171a" emissive="#5a2a10" />
    </group>
  );
}

/** A cafe table with two chairs. */
export function CafeTable({ position, rotation = 0, top = "#e8e4da" }: G & { top?: string }) {
  return (
    <group position={at(position)} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.74, 0]} material={mat(top)} castShadow><cylinderGeometry args={[0.38, 0.38, 0.04, 18]} /></mesh>
      <mesh position={[0, 0.37, 0]} material={mat("#2b2f34")}><cylinderGeometry args={[0.03, 0.03, 0.72, 8]} /></mesh>
      <mesh position={[0, 0.02, 0]} material={mat("#2b2f34")}><cylinderGeometry args={[0.22, 0.22, 0.03, 12]} /></mesh>
      <Chair position={[0, 0, 0.6]} rotation={Math.PI} color="#b5553c" />
      <Chair position={[0, 0, -0.6]} color="#b5553c" />
    </group>
  );
}
