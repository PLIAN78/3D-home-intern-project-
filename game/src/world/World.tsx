import { useEffect, useMemo } from "react";
import { buildSite, GrowIn, type DrivewaySpec } from "@/components/viewer/CommunityScene";
import { House3D, useHouseGeometry } from "@/components/viewer/House3D";
import { ViewerContextProvider } from "@/components/viewer/ViewerContext";
import type { Lot } from "@/lib/models/community";
import { placeholderFor } from "@/lib/geometry/placeholderHouse";
import { buildSiteHomes } from "@/lib/geometry/siteGeometry";
import { PLAN_36 } from "@/lib/sample/plan36";
import { houseOffsetOnLot } from "@/lib/viewer/placement";
import { useSimVersion } from "../core/simVersion";
import { concreteSurface, groundAsphalt, groundConcrete, groundGrass, siteHomeMaterial } from "../render/materials";
import { useGame } from "../story/store";
import { Grass } from "./Grass";
import { Landmarks } from "./Landmarks";
import { CAIVAN_RIDGE, collisionBoxes, HERO_LOT_ID, lotById, progressFor } from "./map";
import { Countryside, RoadMarkings } from "./Countryside";
import { Vegetation } from "./Vegetation";
import { CottageScene } from "./Cottage";
import { District } from "./District";
import { StreetLights } from "./StreetLights";
import { Places } from "./Places";

/** Lawns, roads, curbs, sidewalks and driveways from Home Studio's community site builder, with PBR surfaces. */
function Ground() {
  const site = useMemo(() => {
    const driveways: DrivewaySpec[] = CAIVAN_RIDGE.lots.map((lot) => {
      const g = placeholderFor(lot);
      const off = houseOffsetOnLot(lot, g);
      return { lot, start: [g.garageDoor.x + off[0], g.garageDoor.y + off[2]], startY: 0.05, width: 5.4 };
    });
    return buildSite(CAIVAN_RIDGE, driveways);
  }, []);
  useEffect(() => () => Object.values(site).forEach((g) => g.dispose()), [site]);
  return (
    <group name="Ground">
      <mesh geometry={site.ground} material={groundGrass()} receiveShadow />
      <mesh geometry={site.asphalt} material={groundAsphalt()} receiveShadow />
      <mesh geometry={site.concrete} material={groundConcrete()} receiveShadow />
      <mesh geometry={site.curb} material={concreteSurface()} receiveShadow />
      <RoadMarkings />
    </group>
  );
}

/** Home Studio's build-stage houses for a set of lots, merged into a few draw calls. */
function HomeBatch({ lots, stages, skip, knockedDown = false }: { lots: Lot[]; stages: Record<string, string>; skip?: string; knockedDown?: boolean }) {
  const homes = useMemo(() => buildSiteHomes(lots, progressFor(stages as never), skip), [lots, stages, skip]);
  useEffect(() => () => homes.meshes.forEach((m) => m.geometry.dispose()), [homes]);
  // A knocked-down frame keeps only its dirt pad and floor deck (the walls are loose planks now).
  const deck = knockedDown && lots[0] ? frameDeck(lots[0], stages) : null;
  return (
    <>
      {homes.meshes.map((m) =>
        knockedDown && (m.surface === "lumber" || m.surface === "sheathing") ? null : (
          <mesh key={m.key} geometry={m.geometry} material={siteHomeMaterial(m.surface, m.color)} castShadow receiveShadow />
        ),
      )}
      {deck && (
        <mesh position={deck.position} material={siteHomeMaterial("sheathing")} castShadow receiveShadow>
          <boxGeometry args={deck.size} />
        </mesh>
      )}
    </>
  );
}

/** The floor deck left standing when a frame is knocked down (matches the physics deck collider). */
function frameDeck(lot: Lot, stages: Record<string, string>) {
  const b = collisionBoxes(stages as never).find((x) => x.id === lot.id);
  if (!b) return null;
  return { position: [(b.x0 + b.x1) / 2, 0.15, (b.z0 + b.z1) / 2] as [number, number, number], size: [b.x1 - b.x0, 0.3, b.z1 - b.z0] as [number, number, number] };
}

/**
 * Every home at its construction stage. Wood frames are drawn per lot so a
 * frame knocked flat by a vehicle can disappear (its studs become physics
 * planks) and reappear when the crew re-frames it.
 */
function Homes() {
  const stages = useGame((s) => s.stages);
  const heroRevealed = useGame((s) => s.heroRevealed);
  const broken = useSimVersion((s) => s.brokenFrames);
  const { solid, frames } = useMemo(() => {
    const frames = CAIVAN_RIDGE.lots.filter((l) => stages[l.id] === "framing");
    const solid = CAIVAN_RIDGE.lots.filter((l) => stages[l.id] !== "framing");
    return { solid, frames };
  }, [stages]);
  return (
    <group name="Homes">
      <HomeBatch lots={solid} stages={stages} skip={heroRevealed ? HERO_LOT_ID : undefined} />
      {frames.map((lot) => (
        <HomeBatch key={lot.id} lots={[lot]} stages={stages} knockedDown={broken.includes(lot.id)} />
      ))}
    </group>
  );
}

/** The Nguyens' Plan 36 home: Home Studio's full procedural house, revealed at the Grand Opening. */
function HeroHouse() {
  const heroRevealed = useGame((s) => s.heroRevealed);
  const geometry = useHouseGeometry(PLAN_36);
  const lot = lotById(HERO_LOT_ID);
  const offset = useMemo(() => houseOffsetOnLot(lot, geometry), [lot, geometry]);
  return (
    <ViewerContextProvider value={{ projectId: "", interactive: false }}>
      <group position={lot.position} rotation={lot.rotation} name="HeroHouse">
        <GrowIn visible={heroRevealed}>
          <group position={offset}>
            <House3D geometry={geometry} />
          </group>
        </GrowIn>
      </group>
    </ViewerContextProvider>
  );
}

export function World() {
  return (
    <group name="World">
      <Ground />
      <Countryside />
      <Homes />
      <HeroHouse />
      <Vegetation />
      <Grass />
      <Landmarks />
      <District />
      <Places />
      <CottageScene />
      <StreetLights />
    </group>
  );
}
