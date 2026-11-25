import { useFrame } from "@react-three/fiber";
import { useV6, v6Offer } from "./v6Store";
import { BLUEPRINTS, inPen } from "./collectibles";
import { GEAR } from "./economy";
import { alreadySatisfied, currentStep, GEAR_GARAGE, NPC_SPOTS } from "./missions";
import { runtime } from "../core/runtime";
import { useGame } from "./store";
import { sfx } from "../core/sfx";
import { endFrame, wasPressed } from "../core/input";
import { host } from "../core/simHost";
import { VEHICLES } from "../sim/vehicle";
import type { Ride } from "../sim/simulation";
import { canRide, isBusy } from "../entities/Player";
import { PLACE_IDS, PLACES } from "./places";
import { MY_SEAT, STAFF, type StaffId } from "../world/office";
import type { DialogId } from "./dialogs";
import { DEPOT, DROP_RADIUS, PICKUPS, ROSA } from "./sidequests";
import { CRANE_REACH, CRANES, CREW, ELIAS, MARCO, SAM_WAIT, TACKLE_REACH, tackleAt, TRAN } from "./quests";
import { lotFront } from "../world/map";

/** The stage set last handed to the physics (so house colliders follow your land's progress). */
let appliedStages = -1;

function rideName(r: Ride) {
  if (r.kind === "heli") return "Fly the Skylark";
  if (r.kind === "boat") return r.id?.endsWith("ship")?"Board the motor ship":"Take the motorboat";
  if(r.kind==="plane")return "Fly the "+r.id+" - F to board";
  if (r.kind === "vehicle" && r.id === "bus") return "Drive the school bus";
  if (r.kind === "animal") return r.id === "horse" ? "Ride Biscuit" : "Ride Peanut";
  return `Get in the ${VEHICLES[r.id].name}`;
}

const REACH = 3.2;

function dist2d(x: number, z: number, p: [number, number]) {
  return Math.hypot(x - p[0], z - p[1]);
}

/** Office conversations: a first chat (some with a question), then short lines; Daniel handles promotions. */
function talkToStaff(id: StaffId) {
  const g = useGame.getState();
  if (id === "daniel") {
    const promoted = g.promote();
    g.openDialog(promoted ? "daniel_promote" : g.office.rank >= 3 ? "daniel_top" : "daniel_hello");
    return;
  }
  const first: Record<Exclude<StaffId, "daniel">, DialogId> = { jordan: "jordan_welcome", mei: "mei_tips", lucas: "lucas_chat", sofia: "sofia_chat" };
  const again: Record<Exclude<StaffId, "daniel">, DialogId> = { jordan: "jordan_again", mei: "mei_again", lucas: "lucas_again", sofia: "sofia_again" };
  const met = g.office.met.includes(id);
  g.meetStaff(id);
  g.openDialog(met ? again[id] : first[id]);
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
    const busy = isBusy(g);
    if (host.sim) {
      g.tickBank(host.sim.time);
      g.tickLand(host.sim.time);
      if (g.stagesVersion !== appliedStages) {
        appliedStages = g.stagesVersion;
        host.sim.setStages(g.stages);
      }
    }
    const v6 = useV6.getState();
    if (v6.ride !== null && !v6.panel) { const v=v6Offer(); g.setPrompt(v?.text ?? null); if(wasPressed("KeyE"))v?.run(); endFrame();return; }
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

    const extra=v6Offer();if(extra){g.setPrompt(extra.text);if(e)extra.run();endFrame();return;}

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

    // Shops and services: walk up to the door.
    const onFoot0 = b.control.kind === "foot";
    if (onFoot0)
      for (const id of PLACE_IDS) {
        const p = PLACES[id];
        if (dist2d(b.x, b.z, p.door) < REACH + 0.8) offer(p.verb, () => g.setPanel(id));
      }

    // The Caivan office: your desk, and the people who work there.
    if (onFoot0 && dist2d(b.x, b.z, MY_SEAT.at) < 1.5) offer("Sit at your desk", () => g.setPanel("desk"));
    if (onFoot0)
      for (const id of Object.keys(STAFF) as StaffId[]) {
        const st = STAFF[id];
        if (dist2d(b.x, b.z, st.at) < (st.sitting ? 2.0 : 2.6)) offer(`Talk to ${st.name}`, () => talkToStaff(id));
      }

    // Rosa and Peanut, up in the hills
    const sim = host.sim;
    const onFoot = b.control.kind === "foot";
    if (dist2d(b.x, b.z, ROSA.position) < REACH + 2.5 && onFoot) offer(g.elephant === "found" ? "Say hi to Rosa" : "Talk to Rosa", () => g.askAboutElephant());
    if (g.elephant !== "found" && sim?.animals.elephant) {
      const pe = sim.animals.elephant;
      if (Math.hypot(b.x - pe.x, b.z - pe.z) < pe.spec.radius + REACH + 1 && onFoot) {
        offer(g.elephant === "asked" ? "Calm Peanut down" : "Say hello to the elephant", () => {
          if (g.elephant === "asked") {
            g.openDialog("peanut_found");
            g.findElephant();
          } else g.toast("She seems lost. Someone in the cottage up the hill might know her.");
        });
      }
    }

    // Delivery runs from the factory dock (pickups only)
    const inPickup = b.control.kind === "vehicle" && PICKUPS.includes(b.control.id);
    const now = sim?.time ?? 0;
    if (!g.delivery && dist2d(b.x, b.z, DEPOT) < DROP_RADIUS + 2) {
      if (inPickup) offer("Load panels for a delivery", () => g.startDelivery(now));
      else if (onFoot) offer("Ask Raj about deliveries", () => g.openDialog("depot_intro"));
    }
    if (g.delivery && dist2d(b.x, b.z, g.delivery.drop.at) < DROP_RADIUS) {
      if (inPickup) offer(`Unload panels at ${g.delivery.drop.label}`, () => g.finishDelivery(now));
      else if (!prompt) prompt = "i|Bring a pickup to unload the panels";
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

    sideQuests(g, offer, (text) => {
      if (!prompt) prompt = text;
    });

    // Getting in and out (F). Shown only when nothing else is on offer.
    if (!prompt && sim) {
      const ride = sim.nearestRide((r) => canRide(r, g));
      const c = sim.control;
      if (ride) prompt = `F|${rideName(ride)}`;
      else if (c.kind === "heli" && b.grounded) prompt = "F|Climb out";
      else if (c.kind !== "foot" && c.kind !== "heli" && Math.abs(b.speed) < 2) prompt = `F|${c.kind === "animal" || c.kind === "boat" ? "Get off" : "Get out"}`;
    }

    g.setPrompt(prompt);
    if (e && action) (action as () => void)();
    endFrame();
  }, -10);
  return null;
}

type Offer = (text: string, fn: () => void) => void;

/** Elias and his tackle box, the co-op student, the crane crews, and your land. */
function sideQuests(g: ReturnType<typeof useGame.getState>, offer: Offer, info: (text: string) => void) {
  const sim = host.sim;
  if (!sim) return;
  const b = runtime.body;
  const c = sim.control;
  const onFoot = c.kind === "foot";
  const now = sim.time;
  const near = (p: [number, number], r: number) => dist2d(b.x, b.z, p) < r;

  // Elias, fishing on the island.
  if (onFoot && near(ELIAS.at, 2.8)) {
    if (g.elias === "none")
      offer("Talk to Elias", () => {
        g.setElias("asked");
        g.openDialog("elias_intro");
      });
    else if (g.elias === "asked") offer("Talk to Elias", () => g.openDialog("elias_waiting"));
    else if (g.elias === "found") offer("Give Elias his tackle box", () => g.openDialog("elias_found", false, () => g.startJob("fishing")));
    else offer("Fish with Elias", () => g.openDialog("elias_again", false, () => g.startJob("fishing")));
  }
  if (g.elias === "asked" && c.kind === "boat") {
    const [tx, tz] = tackleAt(runtime.time);
    if (Math.hypot(sim.boat.x - tx, sim.boat.z - tz) < TACKLE_REACH) {
      g.setElias("found");
      sfx("pickup");
      g.toast("Got Elias's tackle box! Take it back to him on the island.");
    }
  }

  // The co-op student: Ms. Tran at the school, Sam at the bus, Raj at the factory.
  if (onFoot && near(TRAN.at, 2.8)) {
    if (g.coop === "none")
      offer("Talk to Ms. Tran", () =>
        g.openDialog("tran_coop", false, () => {
          g.setCoop("reviewing");
          g.setPanel("resumes");
        }),
      );
    else if (g.coop === "reviewing") offer("Review the résumés", () => g.setPanel("resumes"));
    else offer("Talk to Ms. Tran", () => g.openDialog(g.coop === "done" ? "tran_done" : "tran_waiting"));
  }
  if (onFoot && g.coop === "hired" && near(SAM_WAIT.at, 2.6)) offer("Talk to Sam", () => g.openDialog("sam_hello"));
  if (g.coop === "hired" && c.kind === "vehicle" && c.id === "bus") {
    g.setCoop("riding");
    sfx("pickup");
    g.toast("Sam hopped on. Drive to the factory dock, east on Caivan Boulevard.");
  }
  if (g.coop === "riding" && near(DEPOT, DROP_RADIUS + 5)) {
    if (c.kind === "vehicle" && c.id === "bus") {
      if (Math.abs(b.speed) < 3) offer("Drop Sam off with Raj", () => g.openDialog("raj_coop", false, () => g.finishCoop()));
      else info("i|Stop the bus to let Sam off");
    } else info("i|Bring the bus (Sam's on it) to the dock");
  }

  // The east phase: Marco, the crew and the two tower cranes.
  if (onFoot && near(MARCO.at, 2.8)) offer("Talk to Marco", () => g.openDialog(g.talk("marco") ? "marco_intro" : "marco_again"));
  if (onFoot)
    for (const w of CREW) {
      const d = w.dialog;
      if (d && near(w.at, 2.4)) offer("Talk to the crew", () => g.openDialog(d));
    }
  if (onFoot)
    for (const cr of CRANES)
      if (near([cr.x, cr.z], CRANE_REACH))
        offer("Climb into the crane cab", () => {
          if (g.talk("crane")) g.toast("Land each load on the green mark. Space to lower it.");
          g.startJob("crane");
        });

  // Your land: walk the parcel to survey it.
  if (g.land.step === "bought" && g.land.lot && onFoot && near(lotFront(g.land.lot, 6), 7)) offer("Survey your parcel", () => g.surveyParcel(now));
}
