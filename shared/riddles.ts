// Kūkai's riddles. Answers are judged by meaning (Jev), so "your reflection",
// "a mirror" and "the still pond" can all be right for the first one.

export interface RiddleDef {
  id: string;
  text: string;
  /** What a correct answer means. Sent to Jev as the reference answer. */
  acceptedAnswer: string;
  /** Words the offline keyword fallback accepts. */
  keywords: string[];
  hint: string;
}

export const RIDDLES: RiddleDef[] = [
  {
    id: "reflection",
    text: "I live in the still pond but never get wet. I copy your every bow, yet I have no body of my own. What am I?",
    acceptedAnswer: "A reflection (your reflection in the water, or a mirror image)",
    keywords: ["reflection", "mirror", "image", "reflect"],
    hint: "Kneel beside the shrine pond and look down.",
  },
  {
    id: "silence",
    text: "Speak my name and I vanish at once. Temples keep me, and snow brings me to the whole valley. What am I?",
    acceptedAnswer: "Silence (quiet, stillness)",
    keywords: ["silence", "quiet", "stillness", "hush"],
    hint: "Even saying the answer breaks it.",
  },
  {
    id: "footsteps",
    text: "The more of me you take, the more of me you leave behind on the road. What am I?",
    acceptedAnswer: "Footsteps (steps, footprints)",
    keywords: ["footstep", "footsteps", "steps", "footprint", "footprints", "step"],
    hint: "You have been making them all day, walking up this hill.",
  },
];

export const RIDDLE_BY_ID: Record<string, RiddleDef> = Object.fromEntries(RIDDLES.map((r) => [r.id, r]));
