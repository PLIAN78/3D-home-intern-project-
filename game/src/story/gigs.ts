import { BUSINESSES, PORTS } from "../world/v6";
import { LOST_BEAR, MALL_STORES } from "../world/mall";
import type { V2 } from "../world/map";
import { CAMP_HOST, CAMPFIRE } from "../world/wilds";

/**
 * Side jobs handed out by Owawa's businesses, the mall's info desk and the
 * Pine Hollow camp host: walk
 * (or drive) to each step's spot in turn; the last step is back with whoever
 * gave you the job, and pays.
 */
export interface GigStep {
  at: V2;
  radius: number;
  /** While heading there. */
  hint: string;
  /** Toast when you arrive. */
  done: string;
  /** Instead of a place: this many different mall shops visited. */
  visits?: number;
  /** Instead of a place: this many of the ribboned campground trees chopped down. */
  chops?: number;
}
export interface Gig { id: string; title: string; giver: string; reward: number; steps: GigStep[] }

const door = (id: string) => BUSINESSES.find((b) => b.id === id)!.door;
const spot = (id: string) => MALL_STORES.find((s) => s.id === id)!.spot;
const quay = PORTS.find((p) => p.id === "river")!.shore;

export const GIGS: Gig[] = [
  {
    id: "patrol", title: "Community patrol", giver: "police", reward: 250, steps: [
      { at: quay, radius: 12, hint: "Check on Owawa River Quay", done: "All quiet at the quay. Report back to Division 1." },
      { at: door("police"), radius: 4, hint: "Report back to Owawa Police, Division 1", done: "Patrol report filed." },
    ],
  },
  { id: "courier-realty", title: "Courier: documents", giver: "jobs", reward: 120, steps: [{ at: door("realty"), radius: 4, hint: "Deliver the documents to Owawa Realty", done: "Documents signed for at Owawa Realty." }] },
  { id: "courier-mall", title: "Courier: parcel", giver: "jobs", reward: 220, steps: [{ at: spot("mall-desk"), radius: 3, hint: "Take the parcel to the info desk in Ridge Centre Mall", done: "Parcel delivered to Ridge Centre." }] },
  {
    id: "mall-bear", title: "Lost teddy bear", giver: "mall-desk", reward: 150, steps: [
      { at: LOST_BEAR, radius: 2.2, hint: "Find the lost teddy bear (someone saw it in Home + Garden)", done: "Found the teddy bear behind the planters." },
      { at: spot("mall-desk"), radius: 3, hint: "Bring the bear back to the info desk", done: "A very happy kid." },
    ],
  },
  {
    id: "mall-walker", title: "Mall walker survey", giver: "mall-desk", reward: 200, steps: [
      { at: spot("mall-desk"), radius: 0, visits: 4, hint: "Visit four different shops in the mall", done: "Survey complete: four shops visited." },
      { at: spot("mall-desk"), radius: 3, hint: "Hand the survey in at the info desk", done: "Survey handed in." },
    ],
  },
  {
    id: "mall-food", title: "Food court run", giver: "mall-desk", reward: 90, steps: [
      { at: spot("mall-noodles"), radius: 2.8, hint: "Collect a lunch order at the Noodle Bar", done: "Lunch order collected." },
      { at: spot("mall-security"), radius: 2.8, hint: "Take the lunch to Mall Security", done: "Lunch delivered to Mall Security." },
    ],
  },
  {
    id: "camp-firewood", title: "Firewood for Pine Hollow", giver: "camp", reward: 180, steps: [
      { at: CAMPFIRE, radius: 0, chops: 4, hint: "Chop down four of the trees marked with orange ribbons", done: "That's a good load of firewood." },
      { at: CAMP_HOST, radius: 3.5, hint: "Tell the camp host at Pine Hollow the wood is ready", done: "The campfire is stocked for the week." },
    ],
  },
];

export const gigById = (id: string) => GIGS.find((g) => g.id === id);
