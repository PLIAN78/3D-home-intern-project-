// Turns the game's outfits (assets-src/characters/outfits.json) into Ara 3D Gen
// character files and builds them: realistic MakeHuman (CC0) people with the
// game rig, plus one shared animation library (CMU motion capture, retargeted
// by Ara). Run from the repo root:
//   node game/scripts/assets/characters.mjs <raw-out-dir>
// Needs the `ara3d` CLI (npm, MIT). The character files are written next to the
// outfits so the same people can be rebuilt later.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const here = resolve("game/assets-src/characters");
const out = resolve(process.argv[2] ?? "/home/claude/assets-raw/characters");
const ara = process.env.ARA3D_BIN ?? "ara3d";
const outfits = JSON.parse(readFileSync(join(here, "outfits.json"), "utf8"));
delete outfits._doc;

const hash = (s) => [...s].reduce((h, c) => (Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0), 2166136261);
const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const pick = (list, h, salt = 0) => list[(h >>> salt) % list.length];

/** The ethnic mix that best matches a skin colour (the skin texture is then picked from it). */
function heritage(skin) {
  const L = lum(skin);
  if (L < 0.33) return { african: 0.9, asian: 0.05, caucasian: 0.05 };
  if (L < 0.47) return { african: 0.4, asian: 0.35, caucasian: 0.25 };
  if (L < 0.6) return { african: 0.1, asian: 0.5, caucasian: 0.4 };
  return { african: 0, asian: 0.15, caucasian: 0.85 };
}

export function araParams(id, o) {
  const h = hash(id);
  const female = !!o.longHair;
  const worker = o.hat === "hardhat" || !!o.vest;
  const lightHair = lum(o.hair ?? "#222222") > 0.45;
  const p = {
    name: id,
    seed: h % 100000,
    gender: female ? 0 : 1,
    ...heritage(o.skin),
    muscle: worker ? 0.62 : 0.45 + ((h >> 3) % 20) / 100,
    weight: 0.4 + ((h >> 5) % 25) / 100,
    height: 0.4 + ((h >> 7) % 25) / 100,
    eyes: pick(["brown", "darkbrown", "blackbrown", "brownlight", "bluegreen", "grey"], h, 9),
    eyelashes: "none",
    teeth: "none",
    tongue: false,
    faceShapes: false,
    detail: "low",
    rig: "game_lite",
    restPose: "A",
    animations: false,
    hair: female ? pick(["long01", "ponytail01", "bob01", "braid01", "bob02"], h, 11) : pick(["short01", "short02", "short03", "short04", "buzz"], h, 11),
    hairTint: lightHair ? "#ffffff" : o.hair ?? "#222222",
    hairColor: o.hair ?? "#222222",
    facialHair: female || o.kid ? "none" : pick(["none", "stubble", "none", "short_beard", "mustache_stubble", "none"], h, 13),
    beardColor: o.hair ?? "#222222",
    outfit: "none",
    accessories: [],
    garmentStyles: {},
  };
  if (o.kid) p.ageYears = 13;
  else if (o.old) p.ageYears = 66 + (h % 8);
  else p.ageYears = 24 + (h % 22);
  // Each garment takes only some patterns: use its own default fabric, in the outfit's colour.
  const FABRIC = { oversized_tee: "jersey", uniform_shirt: "solid", uniform_shirt_long: "solid", camp_shirt: "linen", silk_blouse: "satin", cargo_pants: "solid", trousers: "solid", baggy_jeans: "denim", cargo_shorts: "solid", reflective_vest: "solid" };
  const style = (g, _pattern, color) => (p.garmentStyles[g] = { pattern: FABRIC[g] ?? "solid", color, color2: color });
  if (worker) {
    p.top = "uniform_shirt";
    style("uniform_shirt", "workwear", o.shirt);
    p.bottom = "cargo_pants";
    style("cargo_pants", "workwear", o.pants);
    p.shoes = "combat_boots";
    p.accessories.push("gloves");
    if (o.vest) {
      p.accessories.push("reflective_vest");
      style("reflective_vest", "solid", o.vest);
    }
  } else if (o.role === "office") {
    p.top = female ? "silk_blouse" : "uniform_shirt_long";
    style(p.top, female ? "satin" : "linen", o.shirt);
    p.bottom = "trousers";
    style(p.bottom, "suiting", o.pants);
    p.shoes = female ? pick(["heels", "loafers"], h, 15) : "oxfords";
    p.accessories.push(pick(["watch_silver", "watch", "watch_gold"], h, 17));
  } else if (o.kid) {
    p.top = "oversized_tee";
    style("oversized_tee", "jersey", o.shirt);
    p.bottom = "cargo_shorts";
    style("cargo_shorts", "solid", o.pants);
    p.shoes = "sneakers";
  } else {
    p.top = female ? pick(["silk_blouse", "oversized_tee", "camp_shirt"], h, 15) : pick(["oversized_tee", "camp_shirt", "uniform_shirt_long"], h, 15);
    style(p.top, p.top === "oversized_tee" ? "jersey" : p.top === "silk_blouse" ? "satin" : "linen", o.shirt);
    p.bottom = pick(["baggy_jeans", "trousers", "cargo_pants", "trousers"], h, 17);
    style(p.bottom, p.bottom === "baggy_jeans" ? "denim" : "solid", o.pants);
    p.shoes = pick(["sneakers", "shoes01", "loafers", "shoes03"], h, 19);
  }
  p.hat = o.hat === "hardhat" ? "hard_hat" : o.hat === "straw" ? "fedora01" : o.hat === "cap" ? "baseball_cap" : "none";
  return p;
}

/**
 * The player's wardrobe (shirt, trousers, shoes, skin and hair colours; hat; vest)
 * is shown by tinting: these variants are dressed in white with light skin and
 * hair, one per hat and hair length, and the game multiplies each region by the
 * colour the player picked (see models/PersonModel.tsx).
 */
const WHITE = "#f2f2f2";
export function playerVariant(hat, hair) {
  const p = araParams("player", { skin: "#f3d2b8", shirt: WHITE, pants: WHITE, shoes: WHITE, hair: "#d8d8d8", vest: WHITE, hat: hat === "none" ? undefined : hat });
  p.name = `player-${hat}-${hair}`;
  p.skin = "young_caucasian_male";
  p.skinTint = "#ffffff";
  p.hair = hair === "long" ? "long01" : "short02";
  p.hairTint = "#ffffff";
  p.hairColor = "#e6e6e6";
  p.facialHair = "stubble";
  p.beardColor = "#d0d0d0";
  p.garmentStyles.uniform_shirt.color = p.garmentStyles.uniform_shirt.color2 = WHITE;
  return p;
}

mkdirSync(out, { recursive: true });
const files = [];
for (const hat of ["none", "hardhat", "cap", "straw"]) for (const hair of ["short", "long"]) {
  const file = join(here, `player-${hat}-${hair}.ara.json`);
  writeFileSync(file, JSON.stringify({ kind: "ara-character", version: 1, params: playerVariant(hat, hair) }, null, 1) + "\n");
  files.push(file);
}
for (const [id, o] of Object.entries(outfits)) {
  const file = join(here, `${id}.ara.json`);
  writeFileSync(file, JSON.stringify({ kind: "ara-character", version: 1, params: araParams(id, o) }, null, 1) + "\n");
  files.push(file);
}
if (!process.env.SKIP_BUILD) {
  if (!process.env.CLIPS_ONLY) execFileSync(ara, ["export", ...files.flatMap((f) => ["--params", f]), "--no-animations", "--detail", "low", "--out", out], { stdio: "inherit" });
  // The shared animation library: the player, with every clip the game uses.
  const clips = "idle,walk,run,tread_water,swim_freestyle,sit_idle,wave,drive_car,ride_horse,ride_motorcycle,drive_boat,fly_helicopter,jump_air,look_around,talk_gestures,texting,phone_call,carry_walk,carry_idle,clap,cheer";
  const lib = join(out, "clips.ara.json");
  writeFileSync(lib, JSON.stringify({ kind: "ara-character", version: 1, params: { ...araParams("clips", outfits.player), name: "clips", animations: true } }));
  execFileSync(ara, ["export", "--params", lib, "--animations", clips, "--detail", "low", "--out", join(out, "clips")], { stdio: "inherit" });
}
console.log(`${files.length} characters -> ${out}`);
