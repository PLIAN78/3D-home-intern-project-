import { useMemo } from "react";
import * as THREE from "three";
import { TextSprite } from "@/components/community/TextSprite";
import { mat } from "../player/models";
import { GEAR_GARAGE, MACHINES, POUR_SPOT, SURVEY_STAKES } from "../game/missions";
import { useGame } from "../game/store";
import { LANDMARKS, PEN, TOWER, TOWER_LEGS } from "./map";

function B({ size, position, color, rotation, emissive, cast = true }: { size: [number, number, number]; position: [number, number, number]; color: string; rotation?: [number, number, number]; emissive?: string; cast?: boolean }) {
  return (
    <mesh position={position} rotation={rotation} material={mat(color, { emissive })} castShadow={cast} receiveShadow>
      <boxGeometry args={size} />
    </mesh>
  );
}

function Label({ text, at, accent = false }: { text: string; at: [number, number, number]; accent?: boolean }) {
  return <TextSprite text={text} position={at} size={accent ? 0.026 : 0.02} background={accent ? "#f59e0b" : "rgba(20,28,40,0.78)"} color="#ffffff" bold />;
}

function SalesCentre() {
  const [x, z] = LANDMARKS.sales.position;
  const [w, d, h] = LANDMARKS.sales.size;
  return (
    <group name="SalesCentre">
      <B size={[w, h, d]} position={[x, h / 2, z]} color="#eef0f2" />
      {/* glass front facing the boulevard (north, −z) */}
      <B size={[w - 6, h - 2.2, 0.2]} position={[x, (h - 2.2) / 2 + 0.4, z - d / 2 - 0.05]} color="#6f9fc4" />
      <B size={[w + 3, 0.5, d + 4]} position={[x, h + 0.25, z - 1]} color="#1f3a5f" />
      <B size={[3, 2.6, 0.3]} position={[x, 1.3, z - d / 2 - 0.15]} color="#20365c" />
      {/* parking lot */}
      <B size={[56, 0.04, 16]} position={[x + 6, 0.02, z - d / 2 - 11]} color="#5a5c60" cast={false} />
      {[-18, -12, -6, 0, 6, 12, 18, 24].map((dx) => (
        <B key={dx} size={[0.15, 0.05, 5]} position={[x + dx, 0.045, z - d / 2 - 13]} color="#f3f3f3" cast={false} />
      ))}
      {[-8, 8].map((dx) => (
        <group key={dx}>
          <mesh position={[x + dx, 5, z - d / 2 - 4]} material={mat("#c9ccd1", { metal: 0.5 })} castShadow>
            <cylinderGeometry args={[0.08, 0.08, 10, 6]} />
          </mesh>
          <B size={[0.05, 1.1, 1.8]} position={[x + dx, 9.3, z - d / 2 - 4 + 0.95]} color={dx < 0 ? "#d52b1e" : "#1f3a5f"} />
        </group>
      ))}
      <Label text="CAIVAN SALES CENTRE" at={[x, h + 2.5, z]} accent />
    </group>
  );
}

function GearGarage() {
  const [x, z] = GEAR_GARAGE;
  return (
    <group name="GearGarage">
      <B size={[3.6, 2.6, 2.6]} position={[x + 1.5, 1.3, z + 2]} color="#2b3a4a" />
      <B size={[4.4, 0.25, 3.6]} position={[x + 1.5, 2.85, z + 1.6]} color="#f59e0b" />
      <B size={[3.4, 0.9, 0.3]} position={[x + 1.5, 1.1, z + 0.65]} color="#f59e0b" />
      <Label text="GEAR GARAGE" at={[x + 1.5, 4.2, z + 1.6]} accent />
    </group>
  );
}

function Factory() {
  const [x, z] = LANDMARKS.factory.position;
  const [w, d, h] = LANDMARKS.factory.size;
  const machineStep = useGame((s) => (s.progress.mission === 2 ? s.progress.step - 2 : s.progress.mission > 2 ? 3 : -1));
  return (
    <group name="Factory">
      <B size={[w, h, d]} position={[x, h / 2, z]} color="#b8c0c8" />
      {/* sawtooth roof */}
      {[-24, -12, 0, 12, 24].map((dx) => (
        <B key={dx} size={[10, 3, d]} position={[x + dx, h + 1.2, z]} rotation={[0, 0, 0.45]} color="#8d99a6" />
      ))}
      <B size={[w + 0.2, 1.6, d + 0.2]} position={[x, h - 1.4, z]} color="#1f3a5f" />
      {[-18, 0, 18].map((dx) => (
        <B key={dx} size={[8, 6, 0.3]} position={[x + dx, 3, z + d / 2 + 0.1]} color="#5d6d7e" />
      ))}
      {/* yard */}
      <B size={[w, 0.04, 22]} position={[x, 0.02, z + d / 2 + 11]} color="#a3a09a" cast={false} />
      {/* stacked wall panels */}
      {[0, 1, 2].map((i) => (
        <B key={i} size={[6, 0.35, 2.6]} position={[x - 24, 0.2 + i * 0.36, z + d / 2 + 14]} color="#d9b47c" />
      ))}
      {[0, 1, 2, 3].map((i) => (
        <B key={i} size={[6, 0.35, 2.6]} position={[x + 26, 0.2 + i * 0.36, z + d / 2 + 14]} color="#c49d68" />
      ))}
      {MACHINES.map(([mx, mz], i) => {
        const fixed = machineStep > i;
        const active = machineStep === i;
        return (
          <group key={i} position={[mx, 0, mz]}>
            <B size={[2.4, 1.8, 1.6]} position={[0, 0.9, 0]} color="#4b5563" />
            <B size={[1.0, 0.5, 1.0]} position={[0, 2.05, 0]} color="#374151" />
            <mesh position={[0, 2.55, 0]} material={mat(fixed ? "#22c55e" : active ? "#facc15" : "#ef4444", { emissive: fixed ? "#22c55e" : active ? "#facc15" : "#ef4444" })}>
              <sphereGeometry args={[0.22, 10, 8]} />
            </mesh>
          </group>
        );
      })}
      <Label text="CAIVAN PANEL FACTORY" at={[x, h + 6, z]} accent />
    </group>
  );
}

function WaterTower() {
  const [x, z] = LANDMARKS.tower.position;
  const legs = TOWER_LEGS;
  return (
    <group name="WaterTower" position={[x, 0, z]}>
      {legs.map(([lx, lz], i) => (
        <mesh key={i} position={[lx, TOWER.tankBottom / 2, lz]} material={mat("#9aa5b1", { metal: 0.4 })} castShadow>
          <cylinderGeometry args={[0.35, 0.45, TOWER.tankBottom, 8]} />
        </mesh>
      ))}
      {[8, 16].map((y) => (
        <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, Math.PI / 4]} material={mat("#9aa5b1", { metal: 0.4 })}>
          <torusGeometry args={[4.6, 0.12, 6, 4]} />
        </mesh>
      ))}
      <mesh position={[0, TOWER.tankBottom + (TOWER.deckY - TOWER.tankBottom) / 2, 0]} material={mat("#e8edf2", { metal: 0.2, rough: 0.5 })} castShadow receiveShadow>
        <cylinderGeometry args={[TOWER.tankRadius, TOWER.tankRadius - 0.8, TOWER.deckY - TOWER.tankBottom, 24]} />
      </mesh>
      <mesh position={[0, TOWER.tankBottom + 4.5, 0]} material={mat("#1f3a5f")}>
        <cylinderGeometry args={[TOWER.tankRadius + 0.03, TOWER.tankRadius + 0.03, 1.4, 24, 1, true]} />
      </mesh>
      <mesh position={[0, TOWER.deckY + 0.6, 0]} rotation={[Math.PI / 2, 0, 0]} material={mat("#f59e0b")}>
        <torusGeometry args={[TOWER.tankRadius - 0.2, 0.06, 6, 32]} />
      </mesh>
      <Label text="CAIVAN RIDGE" at={[0, TOWER.deckY + 3, 0]} />
    </group>
  );
}

function Farm() {
  const [x, z] = LANDMARKS.farm.position;
  const [w, d, h] = LANDMARKS.farm.size;
  const roof = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-d / 2 - 0.6, 0);
    s.lineTo(0, 3.6);
    s.lineTo(d / 2 + 0.6, 0);
    s.lineTo(-d / 2 - 0.6, 0);
    const g = new THREE.ExtrudeGeometry(s, { depth: w + 1, bevelEnabled: false });
    g.translate(0, 0, -(w + 1) / 2);
    g.rotateY(Math.PI / 2);
    return g;
  }, [w, d]);
  const [px, pz] = PEN.centre;
  const posts: [number, number][] = [];
  for (let t = -PEN.half; t <= PEN.half; t += 3.5) {
    posts.push([px + t, pz - PEN.half], [px + t, pz + PEN.half], [px - PEN.half, pz + t], [px + PEN.half, pz + t]);
  }
  return (
    <group name="Farm">
      <B size={[w, h, d]} position={[x, h / 2, z]} color="#a33a2b" />
      <mesh geometry={roof} position={[x, h, z]} material={mat("#4a3b33")} castShadow />
      <B size={[3.4, 4.2, 0.2]} position={[x, 2.1, z + d / 2 + 0.05]} color="#f4f1e8" />
      {posts.map(([fx, fz], i) => (
        <B key={i} size={[0.18, 1.3, 0.18]} position={[fx, 0.65, fz]} color="#8b6b4a" />
      ))}
      {[0.5, 1.05].map((y) => (
        <group key={y}>
          <B size={[PEN.half * 2, 0.1, 0.08]} position={[px, y, pz - PEN.half]} color="#a07a52" cast={false} />
          <B size={[PEN.half * 2, 0.1, 0.08]} position={[px, y, pz + PEN.half]} color="#a07a52" cast={false} />
          <B size={[0.08, 0.1, PEN.half * 2]} position={[px - PEN.half, y, pz]} color="#a07a52" cast={false} />
          <B size={[0.08, 0.1, PEN.half * 2]} position={[px + PEN.half, y, pz]} color="#a07a52" cast={false} />
        </group>
      ))}
      {[
        [4, -6],
        [-6, 5],
        [7, 7],
      ].map(([dx, dz], i) => (
        <mesh key={i} position={[px + dx, 0.55, pz + dz]} rotation={[Math.PI / 2, 0, 0.4 * i]} material={mat("#e0c068")} castShadow>
          <cylinderGeometry args={[0.6, 0.6, 1.2, 10]} />
        </mesh>
      ))}
      <Label text="HILLSIDE GOAT FARM" at={[px, 4, pz]} accent />
    </group>
  );
}

function Park() {
  const [x, z] = LANDMARKS.park.position;
  return (
    <group name="Park">
      <mesh position={[x + 10, 0.03, z + 5]} rotation={[-Math.PI / 2, 0, 0]} material={mat("#4f8fbf", { rough: 0.15, metal: 0.1 })} receiveShadow>
        <circleGeometry args={[11, 32]} />
      </mesh>
      <mesh position={[x + 10, 0.025, z + 5]} rotation={[-Math.PI / 2, 0, 0]} material={mat("#cbbf9f")}>
        <ringGeometry args={[11, 12.6, 32]} />
      </mesh>
      {/* playground */}
      <B size={[0.2, 2.2, 0.2]} position={[x - 18, 1.1, z - 6]} color="#e84a5f" />
      <B size={[0.2, 2.2, 0.2]} position={[x - 14, 1.1, z - 6]} color="#e84a5f" />
      <B size={[4.4, 0.2, 0.2]} position={[x - 16, 2.2, z - 6]} color="#e84a5f" />
      <B size={[1.4, 0.15, 3.6]} position={[x - 12, 1, z + 2]} color="#2a9d8f" rotation={[0.5, 0, 0]} />
      <B size={[1.4, 2, 1.4]} position={[x - 12, 1, z - 0.4]} color="#f4a261" />
      {[-6, 6].map((dx) => (
        <group key={dx}>
          <B size={[2.4, 0.12, 0.6]} position={[x + dx - 4, 0.5, z - 14]} color="#8b6b4a" />
          <B size={[2.4, 0.6, 0.12]} position={[x + dx - 4, 0.85, z - 14.3]} color="#8b6b4a" />
        </group>
      ))}
      <Label text="RIDGE PARK" at={[x, 3, z - 14]} />
    </group>
  );
}

/** Survey stakes, foundation forms: props the story's jobs happen at. */
function JobSiteProps() {
  const stages = useGame((s) => s.stages);
  const poured = stages["lot-207"] === "foundation";
  return (
    <group name="JobSiteProps">
      {SURVEY_STAKES.map(([sx, sz], i) => (
        <group key={i} position={[sx, 0, sz]}>
          <B size={[0.08, 1.2, 0.08]} position={[0, 0.6, 0]} color="#d9b47c" />
          <B size={[0.04, 0.22, 0.32]} position={[0, 1.08, 0.16]} color="#ff5e1a" />
        </group>
      ))}
      {!poured && (
        <group position={[POUR_SPOT[0], 0, POUR_SPOT[1]]}>
          {/* cement mixer truck waiting at the dig */}
          <group position={[-9, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
            <B size={[5.5, 0.6, 2.2]} position={[0, 0.8, 0]} color="#e0e0e0" />
            <B size={[1.6, 1.4, 2.1]} position={[2.2, 1.6, 0]} color="#f59e0b" />
            <mesh position={[-0.9, 2.0, 0]} rotation={[0, 0, Math.PI / 2 + 0.25]} material={mat("#d1d5db", { metal: 0.3 })} castShadow>
              <cylinderGeometry args={[0.9, 1.2, 3.2, 12]} />
            </mesh>
          </group>
        </group>
      )}
    </group>
  );
}

export function Landmarks() {
  return (
    <group name="Landmarks">
      <SalesCentre />
      <GearGarage />
      <Factory />
      <WaterTower />
      <Farm />
      <Park />
      <JobSiteProps />
    </group>
  );
}
