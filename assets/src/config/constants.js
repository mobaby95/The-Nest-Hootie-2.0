const COLORS = {
  burgundy: 0x702D46,
  crimson: 0xA34465,
  charcoal: 0x29232B,
  silver: 0xB9AEB6,
  rose: 0xC18A9E
};

const FOOTER = "Hootie 2.0 • Where the night owls thrive 🖤";

const LEVELS = [
  { name: "Midnight Hatchling", emoji: "🐣", points: 0, image: "midnight-hatchling.png" },
  { name: "Moonlit Familiar", emoji: "🌙", points: 100, image: "moonlit-familiar.png" },
  { name: "Velvet Night Owl", emoji: "🦉", points: 250, image: "velvet-night-owl.png" },
  { name: "Crimson Oracle", emoji: "🔮", points: 500, image: "crimson-oracle.png" },
  { name: "Shadow Guardian", emoji: "🖤", points: 1000, image: "shadow-guardian.png" },
  { name: "Elder of the Hollow", emoji: "👑", points: 2000, image: "elder-of-the-hollow.png" }
];

const BADGES = [
  ["first_checkin", "First Confession", "Complete your first check-in."],
  ["streak_7", "Week of Wings", "Reach a seven-day check-in streak."],
  ["streak_30", "Moonlit Month", "Reach a thirty-day check-in streak."],
  ["water_10", "Hydration Familiar", "Log water on ten different days."],
  ["steps_10", "Wandering Owl", "Log steps on ten different days."],
  ["sleep_10", "Dream Keeper", "Log sleep on ten different days."],
  ["selfcare_10", "Ritual of Rest", "Log self-care ten times."],
  ["workout_10", "Strength of the Hollow", "Log ten movement sessions."],
  ["challenge_1", "Challenge Seeker", "Complete a weekly challenge."],
  ["checkin_30", "Keeper of Confessions", "Complete thirty rewarded check-ins."]
];

const CHALLENGE_TEMPLATES = [
  {
    id: "water_week",
    title: "The Moonwell",
    description: "Drink 42.3 cups of water this week.",
    type: "water",
    target: 42.3,
    reward: 25
  },
  {
    id: "steps_week",
    title: "Wander the Hollow",
    description: "Walk 35,000 steps this week.",
    type: "steps",
    target: 35000,
    reward: 25
  },
  {
    id: "sleep_week",
    title: "Dream Beneath the Stars",
    description: "Log 35 hours of sleep this week.",
    type: "sleep",
    target: 35,
    reward: 25
  },
  {
    id: "selfcare_week",
    title: "A Little Ritual",
    description: "Complete 3 self-care activities this week.",
    type: "selfcare",
    target: 3,
    reward: 25
  },
  {
    id: "checkin_week",
    title: "Five Nights, Five Wings",
    description: "Complete 5 daily check-ins this week.",
    type: "checkin",
    target: 5,
    reward: 25
  },
  {
    id: "workout_week",
    title: "Strength of the Hollow",
    description: "Log 3 movement sessions this week.",
    type: "workout",
    target: 3,
    reward: 25
  }
];

const TIMEZONES = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Europe/London",
  "Europe/Paris",
  "Asia/Tokyo",
  "Australia/Sydney",
  "UTC"
];

const RARITY_SPAWN_WEIGHTS = [
  { rarity: "Common", weight: 50 },
  { rarity: "Uncommon", weight: 25 },
  { rarity: "Rare", weight: 15 },
  { rarity: "Ultra Rare", weight: 7 },
  { rarity: "Legendary", weight: 2 },
  { rarity: "Mythic", weight: 1 }
];

const CREATURE_ACHIEVEMENTS = [
  ["first_catch", "First Catch", "Catch your very first wild creature in the Hollow."],
  ["catch_10", "Hollow Scout", "Collect 10 total creatures."],
  ["catch_50", "Night Tamer", "Collect 50 total creatures."],
  ["speed_demon", "Speed Demon", "Catch a wild creature in under 1.50 seconds."],
  ["lightning_owl", "Lightning Reflexes", "Catch a wild creature in under 0.80 seconds."],
  ["unique_6", "Halfway Index", "Discover 6 different Hollow species."],
  ["unique_12", "Master of the Hollow", "Collect all 12 Hollow creature species."],
  ["mythic_tamer", "Diva's Favorite", "Catch or claim a Mythic creature."],
  ["generous_owl", "Generous Owl", "Gift a creature to another member."]
];

const SPAWN_MIN_MS = 20 * 60 * 1000;
const SPAWN_MAX_MS = 40 * 60 * 1000;
const SPAWN_LIFETIME_MS = 5 * 60 * 1000;

const MADLIBS_TEMPLATES = [
  {
    id: "midnight_banquet",
    title: "The Midnight Banquet of the Hollow",
    prompts: [
      "an adjective",
      "a nocturnal creature or animal",
      "a plural noun",
      "a type of beverage",
      "a verb ending in -ing",
      "a spooky or cozy place",
      "an adverb (ending in -ly)",
      "a piece of clothing or accessory",
      "a silly sound effect",
      "a food item",
      "another adjective",
      "a plural body part or object",
      "a verb (past tense)",
      "an exclamation",
      "a magical or mysterious object"
    ],
    build(a) {
      return (
        `Under a **${a[0]}** moon in the deepest corner of The Nest, a **${a[1]}** hosted an urgent midnight banquet. ` +
        `Every guest arrived carrying **${a[2]}** and a warm goblet of **${a[3]}**.\n\n` +
        `Before anyone could sit down, Hootie started **${a[4]}** right in the middle of the **${a[5]}**. ` +
        `The crowd gasped **${a[6]}** as the host adjusted their **${a[7]}** and let out a loud “**${a[8]}**!”\n\n` +
        `For the main course, platters of enchanted **${a[9]}** floated across the table, giving off a **${a[10]}** glow. ` +
        `Suddenly, everyone’s **${a[11]}** began to shimmer, and the oldest owl in the room **${a[12]}** onto the chandelier.\n\n` +
        `“**${a[13]}**!” echoed through the rafters as someone accidentally dropped a **${a[14]}** into the punch bowl—officially making it the greatest night in Hollow history.`
      );
    }
  },
  {
    id: "cursed_library",
    title: "Mystery in the Velvet Archives",
    prompts: [
      "an adjective",
      "a profession or role",
      "a plural noun",
      "a smell or scent",
      "a verb (base form)",
      "a number",
      "a strange creature",
      "an adjective",
      "a musical instrument",
      "a verb ending in -ing",
      "a food or snack",
      "a color",
      "a place in a castle or forest",
      "an exclamation",
      "a noun"
    ],
    build(a) {
      return (
        `Late one **${a[0]}** evening, a wandering **${a[1]}** sneaked into the Velvet Archives searching for lost **${a[2]}**. ` +
        `The air smelled strongly of **${a[3]}**, which was the first sign something was about to **${a[4]}**.\n\n` +
        `On shelf number **${a[5]}**, a tiny **${a[6]}** was guarding a **${a[7]}** spellbook while playing a **${a[8]}**. ` +
        `Instead of running away, the intruder began **${a[9]}** and offered a handful of **${a[10]}** as a peace offering.\n\n` +
        `In a flash of **${a[11]}** smoke, the bookshelves slid open to reveal a secret **${a[12]}**. ` +
        `“**${a[13]}**!” cried Hootie from the rafters, swooping down to claim the legendary **${a[14]}** before anyone else could touch it.`
      );
    }
  },
  {
    id: "hollow_expedition",
    title: "The Great Moonwell Expedition",
    prompts: [
      "an adjective",
      "a vehicle or mode of transport",
      "a plural noun",
      "a weather condition",
      "a verb (past tense)",
      "an animal",
      "an adverb (ending in -ly)",
      "a liquid",
      "an adjective",
      "a piece of furniture",
      "a verb ending in -ing",
      "a snack",
      "a body part",
      "an exclamation",
      "a plural noun"
    ],
    build(a) {
      return (
        `Armed with only a **${a[0]}** lantern and a borrowed **${a[1]}**, the night owls set out to find the fabled Moonwell. ` +
        `Their backpacks were stuffed with **${a[2]}** in case the **${a[3]}** got worse.\n\n` +
        `Halfway through the forest, a giant **${a[4]}** right across their path! A passing **${a[5]}** watched **${a[6]}** as the group accidentally spilled **${a[7]}** all over their **${a[8]}** map.\n\n` +
        `At last, they reached a clearing containing a velvet **${a[9]}** and a fountain that was **${a[10]}** non-stop. ` +
        `After sharing some **${a[11]}**, every traveler felt a tingle in their **${a[12]}**.\n\n` +
        `“**${a[13]}**!” shouted the lookout, realizing the true treasure of the Hollow had been **${a[14]}** all along.`
      );
    }
  }
];

const STORY_PROMPTS = [
  "Beneath a silver eclipse, a mysterious letter arrived at the gates of The Nest with no return address...",
  "At the stroke of midnight, the lanterns in the Hollow all turned crimson at the exact same moment...",
  "Someone left an unhatched obsidian egg on the Velvet Archives desk with a note reading: 'Do not let it get cold...'",
  "Deep inside the Whispering Woods, a hidden door appeared in the trunk of the oldest hollow oak...",
  "Tonight was supposed to be a quiet evening at the Midnight Arcade—until one of the machines started printing prophecies...",
  "A traveler from beyond the mist knocked three times on Hootie's window carrying a locked music box..."
];

module.exports = {
  COLORS,
  FOOTER,
  LEVELS,
  BADGES,
  CHALLENGE_TEMPLATES,
  TIMEZONES,
  RARITY_SPAWN_WEIGHTS,
  CREATURE_ACHIEVEMENTS,
  SPAWN_MIN_MS,
  SPAWN_MAX_MS,
  SPAWN_LIFETIME_MS,
  MADLIBS_TEMPLATES,
  STORY_PROMPTS
};
