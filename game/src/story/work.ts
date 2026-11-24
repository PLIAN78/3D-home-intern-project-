/**
 * Jobs you can do for money besides the story: desk work at the Caivan office
 * (estimating math, a trivia lunch-and-learn and a build-schedule puzzle), and
 * shifts at the two restaurants. Content and scoring only; the UI is in
 * ui/WorkGames.tsx.
 */

// ── Office: ranks and pay ────────────────────────────────────────────────

export const RANKS = [
  { title: "Site coordinator", tasks: 0, pay: 1 },
  { title: "Senior coordinator", tasks: 3, pay: 1.25 },
  { title: "Project lead", tasks: 8, pay: 1.5 },
  { title: "Operations manager", tasks: 15, pay: 2 },
];

/** The rank you've earned with this many finished tasks (promotion still needs a chat with the manager). */
export function earnedRank(tasks: number) {
  let r = 0;
  RANKS.forEach((rank, i) => {
    if (tasks >= rank.tasks) r = i;
  });
  return r;
}

export const PAY = {
  mathCorrect: 45,
  mathFast: 15,
  triviaCorrect: 50,
  schedulePerfect: 200,
  scheduleMistake: 25,
  scheduleMin: 60,
  orderCorrect: 35,
  orderTip: 10,
};

// ── Estimating desk: quick construction math ────────────────────────────

export interface Question {
  prompt: string;
  choices: string[];
  answer: number;
  /** One line on how to get it. */
  explain: string;
}

/** Small deterministic random generator, so a seed gives the same questions (tests). */
export function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T,>(r: () => number, xs: T[]) => xs[Math.floor(r() * xs.length)];
const int = (r: () => number, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));

/** Four distinct choices around the right answer, shuffled; returns choices and the answer's index. */
function choicesFor(r: () => number, right: number, spread: number[], fmt: (n: number) => string) {
  const set = new Set<number>([right]);
  for (const d of spread) {
    if (set.size >= 4) break;
    const v = right + d;
    if (v > 0) set.add(v);
  }
  let k = 1;
  while (set.size < 4) set.add(right + k++ * Math.max(1, Math.round(right * 0.1)));
  const list = [...set];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return { choices: list.map(fmt), answer: list.indexOf(right) };
}

const n = (v: number) => v.toLocaleString("en-CA");
const dollars = (v: number) => `$${v.toLocaleString("en-CA")}`;

type Maker = (r: () => number) => Question;

const MAKERS: Maker[] = [
  // Studs in a wall: one every 0.4 m, plus one at the end.
  (r) => {
    const len = int(r, 3, 12) * 0.8;
    const right = Math.floor(len / 0.4) + 1;
    return { prompt: `A ${len.toFixed(1)} m wall has studs every 0.4 m, with one at each end. How many studs?`, ...choicesFor(r, right, [-1, 1, 2, -2], n), explain: `${len.toFixed(1)} ÷ 0.4 = ${right - 1} spaces, plus 1 = ${right} studs.` };
  },
  // Concrete for a slab.
  (r) => {
    const l = int(r, 6, 14);
    const w = int(r, 4, 10);
    const d = pick(r, [0.1, 0.15, 0.2]);
    const tenths = Math.round(l * w * d * 10);
    const right = tenths / 10;
    return {
      prompt: `How much concrete for a ${l} m × ${w} m slab, ${Math.round(d * 1000)} mm thick?`,
      ...choicesFor(r, tenths, [-10, 10, 20, -20, 15], (v) => `${(v / 10).toFixed(1)} m³`),
      explain: `${l} × ${w} × ${d} = ${right.toFixed(1)} m³.`,
    };
  },
  // Drywall sheets: 1.2 m × 2.4 m = 2.88 m², round up.
  (r) => {
    const area = int(r, 18, 60);
    const right = Math.ceil(area / 2.88);
    return { prompt: `Drywall sheets are 1.2 m × 2.4 m (2.88 m²). How many to cover ${area} m² of wall, with no waste?`, ...choicesFor(r, right, [-1, 1, 2, -2], n), explain: `${area} ÷ 2.88 = ${(area / 2.88).toFixed(1)}, round up to ${right}.` };
  },
  // Material cost.
  (r) => {
    const qty = int(r, 12, 60);
    const price = pick(r, [6, 8, 12, 15, 24, 35]);
    const right = qty * price;
    return { prompt: `${qty} lengths of lumber at ${dollars(price)} each. Total cost?`, ...choicesFor(r, right, [-price, price, price * 2, -price * 2, 10], dollars), explain: `${qty} × ${dollars(price)} = ${dollars(right)}.` };
  },
  // Ontario HST.
  (r) => {
    const base = int(r, 4, 40) * 100;
    const right = Math.round(base * 0.13);
    return { prompt: `What's 13% HST on a ${dollars(base)} invoice?`, ...choicesFor(r, right, [-13, 13, 26, -26, 50], dollars), explain: `${dollars(base)} × 0.13 = ${dollars(right)}.` };
  },
  // Floor area.
  (r) => {
    const a = int(r, 6, 12);
    const b = int(r, 5, 10);
    const c = int(r, 3, 6);
    const d = int(r, 2, 5);
    const right = a * b + c * d;
    return { prompt: `An L-shaped floor is a ${a} × ${b} m room plus a ${c} × ${d} m nook. Total area?`, ...choicesFor(r, right, [-c, c, d, -d, 4], (v) => `${v} m²`), explain: `${a}×${b} + ${c}×${d} = ${right} m².` };
  },
];

export function mathRound(seed: number, count = 5): Question[] {
  const r = rng(seed);
  return Array.from({ length: count }, (_, i) => MAKERS[(i + Math.floor(r() * MAKERS.length)) % MAKERS.length](r));
}

// ── Lunch and learn: homebuilding trivia ────────────────────────────────

export const TRIVIA: Question[] = [
  { prompt: "What does OSB stand for?", choices: ["Oriented strand board", "Outdoor sheathing board", "Original solid beam", "Overlay structural base"], answer: 0, explain: "Oriented strand board: wood strands pressed in layers, used for sheathing." },
  { prompt: "What does HVAC stand for?", choices: ["Heating, ventilation and air conditioning", "High-voltage alternating current", "House vapour and air control", "Heat, vents and cooling"], answer: 0, explain: "Heating, ventilation and air conditioning." },
  { prompt: "Which comes first on a new home?", choices: ["Foundation", "Framing", "Roofing", "Drywall"], answer: 0, explain: "The foundation goes in before any framing." },
  { prompt: "What is a footing?", choices: ["The wide concrete base under a foundation wall", "The bottom step of a staircase", "A floor tile pattern", "The lowest roof shingle"], answer: 0, explain: "Footings spread the load of the walls into the soil." },
  { prompt: "What does an insulation R-value measure?", choices: ["Resistance to heat flow", "Fire resistance", "Weight per square metre", "Sound absorption"], answer: 0, explain: "Higher R-value means it resists heat flow better." },
  { prompt: "Concrete gets hard because it…", choices: ["Reacts chemically with water", "Dries out in the sun", "Freezes overnight", "Absorbs carbon from the air"], answer: 0, explain: "Curing is hydration: cement reacts with water. Keeping it damp helps." },
  { prompt: "What is a roof truss?", choices: ["A prefabricated triangulated frame that supports the roof", "A gutter bracket", "A type of shingle", "A ridge vent"], answer: 0, explain: "Trusses are built in a factory and lifted onto the walls." },
  { prompt: "What is the slope of a roof called?", choices: ["Pitch", "Rake", "Pane", "Span"], answer: 0, explain: "Pitch: how many units it rises per unit of run." },
  { prompt: "What does a GFCI outlet protect against?", choices: ["Electric shock from ground faults", "Power surges from lightning", "Overheating wires", "Water leaks"], answer: 0, explain: "A ground fault circuit interrupter cuts power in milliseconds." },
  { prompt: "What is a sump pump for?", choices: ["Pumping groundwater out of the basement", "Boosting shower pressure", "Circulating hot water", "Draining the dishwasher"], answer: 0, explain: "It empties the sump pit before water reaches the floor." },
  { prompt: "What is the soffit?", choices: ["The underside of the roof overhang", "The top of a chimney", "A window sill", "The basement floor"], answer: 0, explain: "Soffit vents let air into the attic." },
  { prompt: "What is a header?", choices: ["A beam over a door or window opening", "The top plate of a wall", "A roof's ridge board", "The first row of bricks"], answer: 0, explain: "Headers carry the load around the opening." },
  { prompt: "What is a load-bearing wall?", choices: ["A wall that supports the structure above it", "Any exterior wall", "A wall with plumbing inside", "A wall made of concrete"], answer: 0, explain: "Removing one needs a beam and an engineer." },
  { prompt: "In a cold climate, which side of the insulation does the vapour barrier go?", choices: ["The warm, inside side", "The cold, outside side", "Both sides", "Neither side"], answer: 0, explain: "It stops warm, moist indoor air reaching cold surfaces." },
  { prompt: "What is grading?", choices: ["Shaping the ground so water drains away from the house", "Inspecting lumber quality", "Sanding hardwood floors", "Marking lot boundaries"], answer: 0, explain: "Good grading keeps basements dry." },
  { prompt: "Who issues building permits?", choices: ["The municipality", "The homebuilder", "The bank", "The electrician"], answer: 0, explain: "The city or town reviews plans and inspects the work." },
  { prompt: "Typical spacing for wall studs in Canadian framing?", choices: ["16 inches (406 mm) on centre", "8 inches on centre", "36 inches on centre", "48 inches on centre"], answer: 0, explain: "16 inches on centre is standard; 24 is used in some walls." },
  { prompt: "What does the panel factory in Caivan Ridge build?", choices: ["Wall panels", "Roof shingles", "Windows", "Kitchen cabinets"], answer: 0, explain: "Building walls indoors makes homes faster and better." },
  { prompt: "What's the fascia?", choices: ["The board along the roof edge where gutters attach", "A decorative front door", "The attic floor", "A type of siding"], answer: 0, explain: "Fascia caps the rafter ends." },
  { prompt: "What does a spirit level check?", choices: ["That a surface is level or plumb", "Wall thickness", "Moisture in wood", "Electrical voltage"], answer: 0, explain: "The bubble centres when it's true." },
];

/** A shuffled trivia round (choices shuffled too, so the answer isn't always first). */
export function triviaRound(seed: number, count = 6): Question[] {
  const r = rng(seed);
  const pool = [...TRIVIA];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count).map((q) => {
    const order = q.choices.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    return { ...q, choices: order.map((i) => q.choices[i]), answer: order.indexOf(q.answer) };
  });
}

// ── Build schedule: put the stages in order ─────────────────────────────

export const SCHEDULE = ["Permits", "Excavation", "Foundation", "Framing", "Roof and windows", "Rough-ins (plumbing, electrical, HVAC)", "Insulation", "Drywall", "Finishes and final inspection"];

export function schedulePay(mistakes: number, mult = 1) {
  return Math.round(Math.max(PAY.scheduleMin, PAY.schedulePerfect - mistakes * PAY.scheduleMistake) * mult);
}

// ── Restaurant shifts: build the order ──────────────────────────────────

export type Kitchen = "subs" | "burger" | "shawarma";

export const INGREDIENTS: Record<Kitchen, { id: string; label: string; color: string }[]> = {
  subs: [
    { id: "white", label: "White bread", color: "#e9d6a8" },
    { id: "wheat", label: "Wheat bread", color: "#b98a52" },
    { id: "turkey", label: "Turkey", color: "#e7c3a5" },
    { id: "ham", label: "Ham", color: "#e59a9a" },
    { id: "veggie", label: "Veggie patty", color: "#7a9a52" },
    { id: "cheese", label: "Cheese", color: "#f2c94c" },
    { id: "lettuce", label: "Lettuce", color: "#8fc46a" },
    { id: "tomato", label: "Tomato", color: "#d9493e" },
    { id: "cucumber", label: "Cucumber", color: "#4f8a4a" },
    { id: "onion", label: "Onion", color: "#e8dbe8" },
    { id: "mayo", label: "Mayo", color: "#f4efdc" },
    { id: "mustard", label: "Mustard", color: "#d9a520" },
  ],
  burger: [
    { id: "bun", label: "Bun", color: "#d79b4e" },
    { id: "beef", label: "Beef patty", color: "#6b3d24" },
    { id: "veggie", label: "Veggie patty", color: "#7a9a52" },
    { id: "cheese", label: "Cheese", color: "#f2c94c" },
    { id: "bacon", label: "Bacon", color: "#b3473a" },
    { id: "lettuce", label: "Lettuce", color: "#8fc46a" },
    { id: "tomato", label: "Tomato", color: "#d9493e" },
    { id: "onion", label: "Onion", color: "#e8dbe8" },
    { id: "pickles", label: "Pickles", color: "#6f8f3a" },
    { id: "ketchup", label: "Ketchup", color: "#c0281f" },
  ],
  shawarma: [
    { id: "pita", label: "Pita", color: "#e2c48a" },
    { id: "chicken", label: "Chicken", color: "#d9a35f" },
    { id: "beef", label: "Beef", color: "#7a4a2e" },
    { id: "falafel", label: "Falafel", color: "#8a6a32" },
    { id: "garlic", label: "Garlic sauce", color: "#f4efe0" },
    { id: "tahini", label: "Tahini", color: "#d8c49a" },
    { id: "turnip", label: "Pickled turnip", color: "#d0569a" },
    { id: "lettuce", label: "Lettuce", color: "#8fc46a" },
    { id: "tomato", label: "Tomato", color: "#d9493e" },
    { id: "onion", label: "Onion", color: "#e8dbe8" },
    { id: "hot", label: "Hot sauce", color: "#c23b1c" },
  ],
};

/** Each kitchen's bases and fillings (an order is one base, one filling, then toppings). */
const BASES: Record<Kitchen, string[]> = { subs: ["white", "wheat"], burger: ["bun"], shawarma: ["pita"] };
const FILLINGS: Record<Kitchen, string[]> = { subs: ["turkey", "ham", "veggie"], burger: ["beef", "beef", "veggie"], shawarma: ["chicken", "chicken", "beef", "falafel"] };

export const CUSTOMERS = ["Ava", "Noah", "Olivia", "Liam", "Maya", "Ethan", "Zoe", "Arjun", "Chloe", "Mateo", "Leah", "Owen"];

/** One customer's order: a base (bread or bun), a filling, and toppings, in the order they go on. */
export function makeOrder(kitchen: Kitchen, r: () => number) {
  const all = INGREDIENTS[kitchen];
  const base = pick(r, BASES[kitchen]);
  const filling = pick(r, FILLINGS[kitchen]);
  const toppings = all.map((i) => i.id).filter((id) => !BASES[kitchen].includes(id) && !FILLINGS[kitchen].includes(id));
  const count = int(r, 2, 4);
  const chosen: string[] = [];
  while (chosen.length < count) {
    const t = pick(r, toppings);
    if (!chosen.includes(t)) chosen.push(t);
  }
  return { customer: pick(r, CUSTOMERS), items: [base, filling, ...chosen] };
}

// ── Meals: boosts ───────────────────────────────────────────────────────

export type BoostKind = "run" | "fuel" | "both";

export const MEALS: Record<Kitchen, { name: string; price: number; boost: BoostKind; blurb: string }> = {
  subs: { name: "Footlong combo", price: 12, boost: "run", blurb: "Fresh and light: run 35% faster for 3 minutes." },
  burger: { name: "Double burger meal", price: 14, boost: "fuel", blurb: "Big lunch: the jetpack's fuel lasts 60% longer for 3 minutes." },
  shawarma: { name: "Shawarma plate", price: 16, boost: "both", blurb: "The works: run faster and the jetpack lasts longer, for 3 minutes." },
};

export const KITCHEN_NAMES: Record<Kitchen, string> = { subs: "Crossroads Subs", burger: "Flat Top Burgers", shawarma: "Owawa Shawarma" };

// ── Co-op student hiring: résumés ────────────────────────────────────────

export interface Resume {
  name: string;
  program: string;
  points: string[];
  /** The best fit for the panel factory. */
  best: boolean;
  note: string;
}

export const RESUMES: Resume[] = [
  {
    name: "Jamie Lee",
    program: "Grade 12, music and drama",
    points: ["Lead role in the school musical", "Wants a co-op at a recording studio", "Never worked in a shop"],
    best: false,
    note: "Jamie would be great somewhere else, but this co-op is building wall panels.",
  },
  {
    name: "Sam Okafor",
    program: "Grade 11, construction technology",
    points: ["WHMIS and working-at-heights certificates", "Built a shed with the school's tech class", "Perfect attendance this year; asks good questions"],
    best: true,
    note: "Sam has the training, the safety tickets and the attitude. A great fit for the factory.",
  },
  {
    name: "Riley Chen",
    program: "Grade 12, computer science",
    points: ["Builds video games in their spare time", "Wants to work on software", "Available two afternoons a week"],
    best: false,
    note: "Riley's skills fit Home Studio's software team better than the panel line.",
  },
  {
    name: "Taylor Brooks",
    program: "Grade 11, construction technology",
    points: ["Some framing experience", "No safety training yet", "Missed 14 days this term"],
    best: false,
    note: "Taylor has potential, but safety training and showing up matter most on a factory floor.",
  },
];

export const COOP_PAY = 1000;

// ── Elias's fishing and the crane ───────────────────────────────────────

export const ELIAS_REWARD = 1200;
/** Per fish caught after Elias teaches you. */
export const FISH_PAY = 40;
/** Per load landed with the tower crane. */
export const CRANE_PAY = 90;

// ── The land quest at Owawa City Hall ───────────────────────────────────

export const PARCEL_PRICES: Record<string, number> = { "lot-246": 4000, "lot-247": 5500, "lot-347": 7000 };
/** Stages Caivan's crew takes your house through, one every `LAND_STAGE_SECONDS` of play. */
export const LAND_STAGES = ["excavation", "foundation", "framing", "roofing", "drywall", "finishes"] as const;
export const LAND_STAGE_SECONDS = 45;
/** Rent your finished house pays, every `RENT_SECONDS`. */
export const RENT = 250;
export const RENT_SECONDS = 120;

export const BOOST_SECONDS = 180;
export const BOOST = { run: 1.35, fuelBurn: 0.625 };
