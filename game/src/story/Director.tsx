import { useFrame } from "@react-three/fiber";
import { BLUEPRINTS, inPen } from "./collectibles";
import { GEAR } from "./economy";
import { alreadySatisfied, currentStep, GEAR_GARAGE, NPC_SPOTS } from "./missions";
import { runtime } from "../core/runtime";
import { useGame } from "./store";
import { sfx } from "../core/sfx";
import { endFrame, wasPressed } from "../core/input";
import { host } from "../core/simHost";
import { VEHICLES } from "../sim/vehicle";

const REACH = 3.2;

function dist2d(x: number, z: number, p: [number, number]) {
  return Math.hypot(x - p[0], z - p[1]);
}

/**
 * Per-frame game rules: mission steps, the "Press E" prompt, pickups and
 * goats. Runs after the player and camera each frame (frame priority −10) and
 * clears the frame's one-shot input when done.
 */
export function Director() {
  useFrame(() => {
    const g = useGame.getState();
    const b = runtime.body;
    const busy = g.phase !== "playing" || g.dialog !== null || g.minigame !== null || g.shopOpen;
    if (busy) {
      endFrame();
      return;
    }
    const e = wasPressed("KeyE");
    let prompt: string | null = null;
    let action: (() => void) | null = null;
    const offer = (text: string, fn: () => void) => {
      if (prompt) return;
      prompt = text;
      action = fn;
    };

    // Story step
    const step = currentStep(g.progress);
    if (step) {
      if (alreadySatisfied(step, g.owned)) {
        if (step.kind === "own") g.toast(`You already own the ${GEAR[step.gear].name}. Nice saving!`);
        g.completeStep();
      } else if (step.kind === "goto" && dist2d(b.x, b.z, step.at) < step.radius) g.completeStep();
      else if (step.kind === "climb" && dist2d(b.x, b.z, step.at) < step.radius && b.y >= step.minY) g.completeStep();
      else if (step.kind === "talk" && dist2d(b.x, b.z, NPC_SPOTS[step.npc].position) < REACH + 2) {
        offer(`Talk to ${NPC_SPOTS[step.npc].name.split(" · ")[0]}`, () => g.openDialog(step.dialog, true));
      } else if (step.kind === "inspect" && dist2d(b.x, b.z, step.at) < REACH) {
        offer("Inspect the survey stake", () => g.openDialog(step.dialog, true));
      } else if (step.kind === "minigame" && dist2d(b.x, b.z, step.at) < REACH + (step.game === "pour" ? 3 : 0)) {
        offer(step.title, () => g.openMinigame(step.game, step.title));
      }
    }

    // Shops and side quests (any time)
    if (dist2d(b.x, b.z, GEAR_GARAGE) < REACH + 1.5) offer("Open the Gear Garage", () => g.setShop(true));
    if (dist2d(b.x, b.z, NPC_SPOTS.gail.position) < REACH + 1) {
      const allHome = g.goatsHome.length === runtime.goats.length;
      offer(allHome ? "Say hi to Gail" : "Talk to Gail", () => {
        g.meetGail();
        g.openDialog(allHome ? "goat_home" : "gail_goats");
      });
    }
    for (const goat of runtime.goats) {
      if (goat.home || goat.following) continue;
      if (Math.hypot(b.x - goat.x, b.z - goat.z) < REACH + 0.5 && b.y < 2) {
        offer(`Lead ${goat.name} the goat home`, () => {
          goat.following = true;
          sfx("pickup");
          g.toast(`${goat.name} is following you. Take them to Gail's pen (west).`);
        });
      }
    }

    // Goats that reach the pen
    for (const goat of runtime.goats) {
      if (goat.following && inPen(goat.x, goat.z)) {
        goat.following = false;
        goat.home = true;
        goat.tx = goat.x;
        goat.tz = goat.z;
        g.goatHome(goat.id);
      }
    }

    // Blueprints: just touch them
    for (const bp of BLUEPRINTS) {
      if (g.blueprints.includes(bp.id)) continue;
      const [x, y, z] = bp.position;
      if (Math.hypot(b.x - x, b.z - z) < 2.2 && Math.abs(b.y + 1 - y) < 2.4) g.collectBlueprint(bp.id);
    }

    // Getting in and out (F). Shown only when nothing else is on offer.
    const sim = host.sim;
    if (!prompt && sim) {
      const ride = sim.nearestRide();
      if (ride) prompt = `F|${ride.kind === "horse" ? "Ride Biscuit" : `Get in the ${VEHICLES[ride.id].name}`}`;
      else if (sim.control.kind !== "foot" && Math.abs(b.speed) < 2) prompt = `F|${sim.control.kind === "horse" ? "Get off" : "Get out"}`;
    }

    g.setPrompt(prompt);
    if (e && action) (action as () => void)();
    endFrame();
  }, -10);
  return null;
}
