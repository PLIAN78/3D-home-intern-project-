/** Every line of dialogue in the game. Family friendly, a little silly, and true to what Caivan's teams do. */

export type Speaker = "Maya" | "You" | "Priya Patel" | "Arjun Patel" | "Raj" | "Gail" | "The Nguyens" | "Phone";

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
  | "goat_home";

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
    { speaker: "Phone", text: "📞 Maya is calling…" },
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
    { speaker: "Phone", text: "📞 Raj from the Panel Factory is calling…" },
    { speaker: "Raj", text: "Hey! Three machines on the panel line are jammed and we've got walls to build. Can you come to the factory, east on Caivan Boulevard?" },
  ],
  raj_brief: [
    { speaker: "Raj", text: "We build wall panels here, indoors, so homes go up faster and better. But the line's stuck." },
    { speaker: "Raj", text: "Reset each machine: press Space when the needle hits the green. Three machines, glowing yellow." },
  ],
  maya_call_pour: [
    { speaker: "Phone", text: "📞 Maya is calling…" },
    { speaker: "Maya", text: "The panels are moving again, thanks to you! Now it's pour day on Maple Run, Lot 207." },
    { speaker: "Maya", text: "Fill the foundation forms with concrete. Hold Space, and let go when it's in the green band. Not too much!" },
  ],
  pour_done: [{ speaker: "Maya", text: "Beautiful pour! That's a foundation a family will stand on for a hundred years." }],
  maya_call_opening: [
    { speaker: "Phone", text: "📞 Maya is calling…" },
    { speaker: "Maya", text: "It's here: Grand Opening day! The Nguyen family's home on Lot 42 is finished." },
    { speaker: "Maya", text: "Head to Ridgeview Crescent and hand them their keys. You've earned this one." },
  ],
  nguyen_keys: [
    { speaker: "The Nguyens", text: "Is that… our house? It's even better than the 3D preview!" },
    { speaker: "You", text: "Welcome home! Here are your keys." },
    { speaker: "The Nguyens", text: "Thank you! The kids already picked their rooms. Twice." },
  ],
  maya_call_photo: [
    { speaker: "Phone", text: "📞 Maya is calling…" },
    { speaker: "Maya", text: "Bonus paid! One last thing: the Grand Opening photo is taken from the top of the water tower." },
    { speaker: "Maya", text: "Only one way up there. Treat yourself to a SkyHopper jetpack at the Sales Centre Gear Garage, then fly up and smile!" },
  ],
  gail_goats: [
    { speaker: "Gail", text: "Oh thank goodness, a builder! Three of my goats escaped and they keep wandering onto the job sites." },
    { speaker: "Gail", text: "Walk up to a goat and press E. They'll follow you. Bring them back to the pen. I'll pay $300 a goat!" },
  ],
  goat_home: [{ speaker: "Gail", text: "Welcome home, you little rascal! Here's your reward." }],
};
