/** Every line of dialogue in the game. Family friendly, a little silly, and true to what Caivan's teams do. */

export type Speaker = "Maya" | "You" | "Priya Patel" | "Arjun Patel" | "Raj" | "Gail" | "The Nguyens" | "Rosa" | "Jordan" | "Daniel" | "Mei" | "Lucas" | "Sofia" | "Phone" | "Elias" | "Ms. Tran" | "Sam" | "Marco" | "Crew" | "Clerk";

export interface Choice {
  text: string;
  /** Helpful, honest answers earn a bonus. */
  good: boolean;
  reply: string;
}

export interface Line {
  speaker: Speaker;
  text: string;
  choices?: Choice[];
}

export type DialogId =
  | "maya_welcome"
  | "stake_1"
  | "stake_2"
  | "stake_3"
  | "maya_call_patels"
  | "patels_chat"
  | "raj_call"
  | "raj_brief"
  | "maya_call_pour"
  | "pour_done"
  | "maya_call_opening"
  | "nguyen_keys"
  | "maya_call_photo"
  | "gail_goats"
  | "goat_home"
  | "rosa_elephant"
  | "rosa_thanks"
  | "peanut_found"
  | "depot_intro"
  | "jordan_welcome"
  | "jordan_again"
  | "daniel_hello"
  | "daniel_promote"
  | "daniel_top"
  | "mei_tips"
  | "mei_again"
  | "lucas_chat"
  | "lucas_again"
  | "sofia_chat"
  | "sofia_again"
  | "elias_intro"
  | "elias_waiting"
  | "elias_found"
  | "elias_again"
  | "tran_coop"
  | "tran_waiting"
  | "tran_done"
  | "sam_hello"
  | "raj_coop"
  | "marco_intro"
  | "marco_again"
  | "crew_1"
  | "crew_2"
  | "crew_3"
  | "clerk_permit";

export const DIALOGS: Record<DialogId, Line[]> = {
  maya_welcome: [
    { speaker: "Maya", text: "Welcome to Caivan Ridge! I'm Maya, project lead. Families move in this summer and we need every hand." },
    { speaker: "Maya", text: "First job: Lot 113 on Ridgeview Crescent was just surveyed. Check the three survey stakes before we dig." },
    { speaker: "Maya", text: "Press 2 to hop in the company truck. Follow the yellow marker on your map. Go get 'em!" },
  ],
  stake_1: [{ speaker: "You", text: "Front-left stake: right where the plan says. Setback looks good." }],
  stake_2: [{ speaker: "You", text: "Front-right stake: a gopher moved it a bit. Nudged it back. Sorry, buddy." }],
  stake_3: [{ speaker: "You", text: "Rear stake: perfect. This lot is ready to excavate!" }],
  maya_call_patels: [
    { speaker: "Phone", text: "Incoming call: Maya" },
    { speaker: "Maya", text: "Great work on the stakes! Next: the Patel family is touring our model home on Maple Run, Lot 204." },
    { speaker: "Maya", text: "They have questions. Be honest and helpful. That's the Caivan way." },
  ],
  patels_chat: [
    { speaker: "Priya Patel", text: "Hi! We love this house. Can we pick our own brick and siding colours?" },
    {
      speaker: "Arjun Patel",
      text: "So… can we?",
      choices: [
        { text: "Yes! You choose your finishes at the Design Studio, and you can preview them in 3D.", good: true, reply: "A 3D preview? Amazing!" },
        { text: "Nope, everything is beige.", good: false, reply: "Oh… we'd heard otherwise. Maybe double-check?" },
        { text: "Only if you can beat me at rock-paper-scissors.", good: false, reply: "Ha! Seriously though?" },
      ],
    },
    {
      speaker: "Priya Patel",
      text: "When could we move in?",
      choices: [
        { text: "I'll get you the real construction schedule. You can follow every stage online.", good: true, reply: "Love that we can watch it being built!" },
        { text: "Tomorrow. Probably. Maybe.", good: false, reply: "That sounds… optimistic." },
        { text: "When the goats say so.", good: false, reply: "The… goats?" },
      ],
    },
    {
      speaker: "Arjun Patel",
      text: "Is there a park nearby for the kids?",
      choices: [
        { text: "Ridge Park is a two-minute walk, right by the water tower.", good: true, reply: "The kids will be thrilled!" },
        { text: "The kids can play in the factory.", good: false, reply: "Hmm, maybe not the factory." },
        { text: "What kids?", good: false, reply: "…our kids. Right here." },
      ],
    },
    { speaker: "Priya Patel", text: "Thank you! We're going to talk to Maya about Lot 206." },
  ],
  raj_call: [
    { speaker: "Phone", text: "Incoming call: Raj, Panel Factory" },
    { speaker: "Raj", text: "Hey! Three machines on the panel line are jammed and we've got walls to build. Can you come to the factory, east on Caivan Boulevard?" },
  ],
  raj_brief: [
    { speaker: "Raj", text: "We build wall panels here, indoors, so homes go up faster and better. But the line's stuck." },
    { speaker: "Raj", text: "Reset each machine: press Space when the needle hits the green. Three machines, glowing yellow." },
  ],
  maya_call_pour: [
    { speaker: "Phone", text: "Incoming call: Maya" },
    { speaker: "Maya", text: "The panels are moving again, thanks to you! Now it's pour day on Maple Run, Lot 207." },
    { speaker: "Maya", text: "Fill the foundation forms with concrete. Hold Space, and let go when it's in the green band. Not too much!" },
  ],
  pour_done: [{ speaker: "Maya", text: "Beautiful pour! That's a foundation a family will stand on for a hundred years." }],
  maya_call_opening: [
    { speaker: "Phone", text: "Incoming call: Maya" },
    { speaker: "Maya", text: "It's here: Grand Opening day! The Nguyen family's home on Lot 42 is finished." },
    { speaker: "Maya", text: "Head to Ridgeview Crescent and hand them their keys. You've earned this one." },
  ],
  nguyen_keys: [
    { speaker: "The Nguyens", text: "Is that… our house? It's even better than the 3D preview!" },
    { speaker: "You", text: "Welcome home! Here are your keys." },
    { speaker: "The Nguyens", text: "Thank you! The kids already picked their rooms. Twice." },
  ],
  maya_call_photo: [
    { speaker: "Phone", text: "Incoming call: Maya" },
    { speaker: "Maya", text: "Bonus paid! One last thing: the Grand Opening photo is taken from the top of the water tower." },
    { speaker: "Maya", text: "Only one way up there. Treat yourself to a SkyHopper jetpack at the Sales Centre Gear Garage, then fly up and smile!" },
  ],
  gail_goats: [
    { speaker: "Gail", text: "Oh thank goodness, a builder! Three of my goats escaped and they keep wandering onto the job sites." },
    { speaker: "Gail", text: "Walk up to a goat and press E. They'll follow you. Bring them back to the pen. I'll pay $300 a goat!" },
  ],
  goat_home: [{ speaker: "Gail", text: "Welcome home, you little rascal! Here's your reward." }],
  rosa_elephant: [
    { speaker: "Rosa", text: "You drove all the way up here? Bless you. I'm Rosa. I run the old sanctuary cottage." },
    { speaker: "Rosa", text: "My elephant, Peanut, followed a herd of deer into the hills this morning and hasn't come back." },
    {
      speaker: "Rosa",
      text: "She's gentle but she gets shy. How would you approach her?",
      choices: [
        { text: "Slowly, and talk to her calmly so she knows I'm a friend.", good: true, reply: "Exactly right. She'll trust you." },
        { text: "Honk the horn until she comes back.", good: false, reply: "Oh dear, no. She'd run to the next valley." },
        { text: "Bribe her with a sandwich.", good: false, reply: "Peanut only eats apples and hay, I'm afraid." },
      ],
    },
    { speaker: "Rosa", text: "I've marked where I last saw her on your map, west of here. Find her, and she's yours to ride whenever you like." },
  ],
  rosa_thanks: [{ speaker: "Rosa", text: "Peanut hasn't stopped humming since you brought her home. Visit any time!" }],
  peanut_found: [
    { speaker: "You", text: "There you are, Peanut. Everyone's been looking for you." },
    { speaker: "You", text: "She lowered her trunk and let me climb on. I think we're friends now." },
  ],
  depot_intro: [
    { speaker: "Raj", text: "Got a pickup? Good. Back up to the dock and I'll load a pallet of wall panels." },
    { speaker: "Raj", text: "Deliveries pay $400, plus $150 if you're quick. Drive carefully, but not too carefully." },
  ],
  jordan_welcome: [
    { speaker: "Jordan", text: "Welcome to the Caivan office! You must be the new site coordinator. Your desk is the first one on the left." },
    { speaker: "Jordan", text: "Sit down and pick a task: estimating, the lunch-and-learn quiz, or a build schedule. Every task pays, and Daniel notices hard work." },
  ],
  jordan_again: [{ speaker: "Jordan", text: "Coffee's fresh in the kitchen. Daniel's in the glass office if you need him." }],
  daniel_hello: [
    { speaker: "Daniel", text: "Good to see you. Keep finishing tasks at your desk and we'll talk about a promotion." },
  ],
  daniel_promote: [
    { speaker: "Daniel", text: "I've seen your work this week: accurate estimates and schedules that hold. That's exactly what we need." },
    { speaker: "Daniel", text: "Congratulations, you're promoted. Your desk work pays more from today." },
  ],
  daniel_top: [{ speaker: "Daniel", text: "Operations manager already. Honestly, I should be asking you for advice." }],
  mei_tips: [
    { speaker: "Mei", text: "Estimating tip: studs go every 400 mm, and don't forget the one at the end." },
    {
      speaker: "Mei",
      text: "Quick check. If a wall needs 9.6 sheets of drywall, how many do you order?",
      choices: [
        { text: "Ten. You always round up, and a little extra covers waste.", good: true, reply: "Exactly. Nobody wants to stop work for one sheet." },
        { text: "Nine. Round to the nearest.", good: false, reply: "Then the last bit of wall stays bare!" },
        { text: "9.6. The supplier can cut one.", good: false, reply: "Ha. They won't, trust me." },
      ],
    },
  ],
  mei_again: [{ speaker: "Mei", text: "Measure twice, order once." }],
  lucas_chat: [
    { speaker: "Lucas", text: "I design the floor plans buyers preview in 3D at the Design Studio." },
    {
      speaker: "Lucas",
      text: "A family asks for a bigger kitchen. What's the best first step?",
      choices: [
        { text: "Ask how they cook and live, then show options in 3D.", good: true, reply: "Yes. Start with how they live, not with the walls." },
        { text: "Knock down a wall and see what happens.", good: false, reply: "The engineers would faint." },
        { text: "Tell them kitchens are all the same size.", good: false, reply: "That's not the Caivan way." },
      ],
    },
  ],
  lucas_again: [{ speaker: "Lucas", text: "Plan 36 is still my favourite. That roofline!" }],
  sofia_chat: [
    { speaker: "Sofia", text: "I help families choose their home and lot. Honest answers sell homes." },
    {
      speaker: "Sofia",
      text: "A buyer asks when their home will be ready, and the schedule isn't confirmed. What do you say?",
      choices: [
        { text: "Give the current estimate, say it can change, and promise updates.", good: true, reply: "That's how you earn trust." },
        { text: "Pick an early date so they're happy.", good: false, reply: "And unhappy later. Never do that." },
        { text: "Change the subject to countertops.", good: false, reply: "They'll notice!" },
      ],
    },
  ],
  sofia_again: [{ speaker: "Sofia", text: "Three closings this week. The neighbourhood is filling up!" }],
  elias_intro: [
    { speaker: "Elias", text: "Ah, a visitor. Not many folks row out to my little island. I'm Elias. I've fished Heron Lake for sixty years." },
    { speaker: "Elias", text: "This morning a gust took my old tackle box clean off the jetty. Last I saw, it was bobbing west, toward the reeds." },
    {
      speaker: "Elias",
      text: "My knees won't take the boat any more. Before you go, tell me: what's the first rule out on the water?",
      choices: [
        { text: "Wear a life jacket and keep an eye on the weather.", good: true, reply: "Ha! You'll do just fine." },
        { text: "Go as fast as the boat will go.", good: false, reply: "That's how you meet the bottom of the lake." },
        { text: "Fish don't like rules.", good: false, reply: "Fish don't. Lakes do." },
      ],
    },
    { speaker: "Elias", text: "Take the Lakerunner from the dock. Steer close to the box and it'll float right to you. I've marked the west shore on your map." },
  ],
  elias_waiting: [{ speaker: "Elias", text: "No luck yet? Look by the reeds on the west shore. It's red, you can't miss it." }],
  elias_found: [
    { speaker: "Elias", text: "My tackle box! Every lure in there has a story. Thank you, friend." },
    { speaker: "Elias", text: "Now, let me teach you something worth more than lures. Sit. Watch the float. When it dips, strike, then keep the line from snapping." },
  ],
  elias_again: [{ speaker: "Elias", text: "The bass are biting today. Grab the spare rod if you've got a minute." }],
  tran_coop: [
    { speaker: "Ms. Tran", text: "Hi! I'm Ms. Tran, the co-op counsellor. Caivan's panel factory has offered one of our students a co-op placement." },
    { speaker: "Ms. Tran", text: "I have four résumés. Can you pick the student who fits the factory best? Safety training and showing up count for a lot." },
  ],
  tran_waiting: [{ speaker: "Ms. Tran", text: "Sam's waiting by the school bus. Drive the bus to the factory dock and introduce Sam to Raj. It's beside the school, keys are in it." }],
  tran_done: [{ speaker: "Ms. Tran", text: "Sam hasn't stopped talking about the panel line. Thank you for giving a student a real start." }],
  sam_hello: [{ speaker: "Sam", text: "Hi! I'm Sam. I brought my safety boots and my hard hat. Is that the bus? Let's go!" }],
  raj_coop: [
    { speaker: "Raj", text: "You must be Sam! Welcome to the panel line. We build walls indoors here, so homes go up faster." },
    { speaker: "Sam", text: "Thanks! I can't wait to see the nailing bridge." },
    {
      speaker: "Raj",
      text: "Quick question for the person who brought Sam. What's the first thing a new co-op student does here?",
      choices: [
        { text: "A safety orientation, with a mentor who shows them the line.", good: true, reply: "Exactly. Safety first, then the fun stuff." },
        { text: "Drive the forklift.", good: false, reply: "Maybe in a few years!" },
        { text: "Make the coffee.", good: false, reply: "Ha. Sam's here to learn the trade." },
      ],
    },
    { speaker: "Raj", text: "Thanks for bringing Sam. Caivan pays a hiring bonus for every co-op placement." },
  ],
  marco_intro: [
    { speaker: "Marco", text: "Welcome to the east phase! I'm Marco, the site foreman. Forty-eight homes going up on Maple Run and Birch Lane." },
    { speaker: "Marco", text: "The two tower cranes lift roof trusses and wall panels onto the frames. We're short an operator today." },
    {
      speaker: "Marco",
      text: "Before you swing a load, what do you check?",
      choices: [
        { text: "The wind, the load's weight, and that nobody is standing under it.", good: true, reply: "That's an operator talking. The cab's yours." },
        { text: "That the radio is loud enough.", good: false, reply: "Music's nice. Safety's nicer." },
        { text: "Nothing, cranes are strong.", good: false, reply: "Cranes are strong. Gravity's stronger." },
      ],
    },
    { speaker: "Marco", text: "Walk up to the base of either crane and press E to climb into the cab. Each load you land on the mark pays." },
  ],
  marco_again: [{ speaker: "Marco", text: "Trusses on Birch Lane need lifting. The cranes are free if you are." }],
  crew_1: [{ speaker: "Crew", text: "Morning! Keep your hard hat on. Things fall from cranes sometimes. Not often. But sometimes." }],
  crew_2: [{ speaker: "Crew", text: "Three houses framed this week. These panels from the factory go up like Lego." }],
  crew_3: [{ speaker: "Crew", text: "Marco, the foreman, is up on Maple Run with his clipboard. He's looking for a crane operator." }],
  clerk_permit: [
    { speaker: "Clerk", text: "Building permit application for your lot. Your survey's on file. Just one question before I stamp it." },
    {
      speaker: "Clerk",
      text: "Why does the city check plans before a house is built?",
      choices: [
        { text: "So homes are safe, follow the building code and fit the neighbourhood.", good: true, reply: "Exactly right. Stamped and approved." },
        { text: "To collect stamps.", good: false, reply: "We do love stamps. But no. Approved anyway; read the code, please." },
        { text: "No reason, really.", good: false, reply: "Every reason, actually. Approved, but do read up on it." },
      ],
    },
    { speaker: "Clerk", text: "Your permit is approved. Caivan's crew will start digging right away." },
  ],
};
