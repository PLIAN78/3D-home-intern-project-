import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { TextSprite } from "@/components/community/TextSprite";
import { BLUEPRINTS, inPen } from "../game/collectibles";
import { currentStep, NPC_SPOTS, stepTarget, type NpcId } from "../game/missions";
import { runtime, type GoatState } from "../game/runtime";
import { useGame } from "../game/store";
import { Character, Goat, mat, OUTFITS, type Outfit } from "../player/models";
import { angleDelta } from "../player/physics";
import { PEN, TOWER } from "../world/map";

/** An NPC that turns to face you and waves when you come close. */
function Npc({ id, people, label = true }: { id: NpcId; people: { outfit: Outfit; offset: [number, number]; scale?: number }[]; label?: boolean }) {
  const spot = NPC_SPOTS[id];
  const ref = useRef<THREE.Group>(null);
  const near = useRef(false);
  useFrame((_, dt) => {
    const b = runtime.body;
    const dx = b.x - spot.position[0];
    const dz = b.z - spot.position[1];
    near.current = Math.hypot(dx, dz) < 12;
    const g = ref.current;
    if (!g) return;
    const want = near.current ? Math.atan2(dz, dx) : spot.facing;
    const cur = -g.rotation.y;
    g.rotation.y = -(cur + angleDelta(cur, want) * Math.min(1, dt * 4));
  });
  return (
    <group position={[spot.position[0], 0, spot.position[1]]}>
      <group ref={ref} rotation={[0, -spot.facing, 0]}>
        {people.map((p, i) => (
          <group key={i} position={[p.offset[0], 0, p.offset[1]]} scale={p.scale ?? 1}>
            <Character outfit={p.outfit} wave={i === 0 && id !== "gail"} />
          </group>
        ))}
      </group>
      {label && <TextSprite text={spot.name} position={[0, 2.35, 0]} size={0.018} />}
    </group>
  );
}

export function Npcs() {
  const heroRevealed = useGame((s) => s.heroRevealed);
  return (
    <group name="Npcs">
      <Npc id="maya" people={[{ outfit: OUTFITS.maya, offset: [0, 0] }]} />
      <Npc
        id="patels"
        people={[
          { outfit: OUTFITS.priya, offset: [0, -0.5] },
          { outfit: OUTFITS.arjun, offset: [0, 0.5] },
        ]}
      />
      <Npc id="raj" people={[{ outfit: OUTFITS.raj, offset: [0, 0] }]} />
      <Npc id="gail" people={[{ outfit: OUTFITS.gail, offset: [0, 0] }]} />
      {heroRevealed && (
        <Npc
          id="nguyens"
          people={[
            { outfit: OUTFITS.nguyenA, offset: [0, -0.7] },
            { outfit: OUTFITS.nguyenB, offset: [0, 0.6] },
            { outfit: OUTFITS.kid, offset: [0.4, -0.05], scale: 0.62 },
          ]}
        />
      )}
    </group>
  );
}

/** Wander, follow the player, or settle in the pen. */
function updateGoat(g: GoatState, dt: number, t: number) {
  const b = runtime.body;
  let tx = g.tx;
  let tz = g.tz;
  let speed = 1.2;
  if (g.home) {
    if (Math.hypot(g.tx - g.x, g.tz - g.z) < 0.5 || !inPen(g.tx, g.tz)) {
      g.tx = PEN.centre[0] + (Math.random() - 0.5) * PEN.half * 1.4;
      g.tz = PEN.centre[1] + (Math.random() - 0.5) * PEN.half * 1.4;
    }
    speed = 0.6;
  } else if (g.following) {
    const i = runtime.goats.filter((o) => o.following).indexOf(g);
    const back = 2.5 + i * 1.6;
    tx = b.x - Math.cos(b.heading) * back;
    tz = b.z - Math.sin(b.heading) * back;
    const d = Math.hypot(tx - g.x, tz - g.z);
    speed = d > 1 ? Math.min(14, d * 2.2) : 0;
  } else if (Math.hypot(g.tx - g.x, g.tz - g.z) < 0.5 || Math.sin(t * 0.37 + g.x) > 0.995) {
    g.tx = g.x + (Math.random() - 0.5) * 16;
    g.tz = g.z + (Math.random() - 0.5) * 16;
  }
  const dx = (g.home || !g.following ? g.tx : tx) - g.x;
  const dz = (g.home || !g.following ? g.tz : tz) - g.z;
  const d = Math.hypot(dx, dz);
  if (d > 0.05 && speed > 0) {
    const step = Math.min(d, speed * dt);
    g.x += (dx / d) * step;
    g.z += (dz / d) * step;
    g.heading += angleDelta(g.heading, Math.atan2(dz, dx)) * Math.min(1, dt * 6);
  }
  return speed > 0 && d > 0.05 ? speed : 0;
}

function GoatActor({ index }: { index: number }) {
  const ref = useRef<THREE.Group>(null);
  const gait = useRef(0);
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    const g = runtime.goats[index];
    gait.current = updateGoat(g, dt, runtime.time) / 3;
    const grp = ref.current;
    if (grp) {
      grp.position.set(g.x, 0, g.z);
      grp.rotation.y = -g.heading;
    }
  });
  return (
    <group ref={ref}>
      <Goat gait={() => gait.current} />
    </group>
  );
}

export function Goats() {
  return (
    <group name="Goats">
      {runtime.goats.map((g, i) => (
        <GoatActor key={g.id} index={i} />
      ))}
    </group>
  );
}

/** Rolled-up blueprints: spin, bob, and vanish once collected. */
export function Blueprints() {
  const collected = useGame((s) => s.blueprints);
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    ref.current?.children.forEach((c, i) => {
      c.rotation.y = runtime.time * 1.5 + i;
      c.position.y = BLUEPRINTS[i].position[1] + Math.sin(runtime.time * 2 + i) * 0.15;
    });
  });
  return (
    <group ref={ref} name="Blueprints">
      {BLUEPRINTS.map((bp) => (
        <group key={bp.id} position={bp.position} visible={!collected.includes(bp.id)}>
          <mesh rotation={[0, 0, Math.PI / 2]} material={mat("#2563eb", { emissive: "#1d4ed8" })} castShadow>
            <cylinderGeometry args={[0.16, 0.16, 0.9, 10]} />
          </mesh>
          {[-0.3, 0.3].map((x) => (
            <mesh key={x} position={[x, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={mat("#ffffff")}>
              <cylinderGeometry args={[0.17, 0.17, 0.06, 10]} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

/** The yellow objective beacon, GTA-style. */
export function ObjectiveMarker() {
  const progress = useGame((s) => s.progress);
  const step = currentStep(progress);
  const ring = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!ring.current) return;
    ring.current.children[1]?.position.setY((ring.current.userData.top as number) + Math.sin(runtime.time * 3) * 0.3);
    ring.current.rotation.y = runtime.time;
  });
  if (!step) return null;
  const [x, z] = stepTarget(step);
  const radius = step.kind === "goto" ? Math.min(step.radius, 6) : step.kind === "climb" ? 2.5 : 1.2;
  const y = step.kind === "climb" ? TOWER.deckY : 0;
  const top = step.kind === "talk" ? 3.1 : y + 3.6;
  return (
    <group ref={ring} position={[x, 0, z]} userData={{ top }}>
      {step.kind !== "talk" ? (
        <mesh position={[0, y + 1.2, 0]} material={beaconMaterial}>
          <cylinderGeometry args={[radius, radius, 2.4, 32, 1, true]} />
        </mesh>
      ) : (
        <group />
      )}
      <mesh position={[0, top, 0]} rotation={[Math.PI, 0, 0]} material={mat("#facc15", { emissive: "#f59e0b" })}>
        <coneGeometry args={[0.45, 0.9, 4]} />
      </mesh>
    </group>
  );
}

const beaconMaterial = new THREE.MeshBasicMaterial({ color: "#facc15", transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false });
