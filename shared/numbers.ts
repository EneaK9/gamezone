// Finds candidate numbers in a message ("200", "two hundred and fifty", "50 mon").
// Code finds the candidates; when there are several, Jev picks which one is the offer.

const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, a: 1, an: 1,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

export interface NumberCandidate {
  value: number;
  /** The text the number was read from, as written. */
  text: string;
  index: number;
}

export function extractNumbers(message: string): NumberCandidate[] {
  const found: NumberCandidate[] = [];
  const digitRe = /\d[\d,]*(?:\.\d+)?/g;
  for (const m of message.matchAll(digitRe)) {
    const value = Number(m[0].replace(/,/g, ""));
    if (Number.isFinite(value)) found.push({ value, text: m[0], index: m.index ?? 0 });
  }

  // Spelled-out numbers: a run of number words, e.g. "two hundred and fifty".
  const wordRe = /[a-z]+/gi;
  let run: { words: string[]; start: number; end: number } | null = null;
  const flush = () => {
    if (!run) return;
    const value = wordsToNumber(run.words);
    const onlyArticle = run.words.length === 1 && (run.words[0] === "a" || run.words[0] === "an");
    if (value !== null && !onlyArticle) {
      found.push({ value, text: message.slice(run.start, run.end), index: run.start });
    }
    run = null;
  };
  for (const m of message.matchAll(wordRe)) {
    const w = m[0].toLowerCase();
    const isNumberWord = w in UNITS || w in TENS || w === "hundred" || w === "thousand";
    const joiner = w === "and" && run !== null;
    if (isNumberWord || joiner) {
      const start = m.index ?? 0;
      if (!run) run = { words: [], start, end: start };
      run.words.push(w);
      run.end = start + w.length;
    } else {
      flush();
    }
  }
  flush();
  found.sort((a, b) => a.index - b.index);
  return found;
}

function wordsToNumber(words: string[]): number | null {
  let total = 0;
  let current = 0;
  let any = false;
  for (const w of words) {
    if (w === "and") continue;
    if (w in UNITS) {
      current += UNITS[w];
      any = true;
    } else if (w in TENS) {
      current += TENS[w];
      any = true;
    } else if (w === "hundred") {
      current = (current || 1) * 100;
      any = true;
    } else if (w === "thousand") {
      total += (current || 1) * 1000;
      current = 0;
      any = true;
    }
  }
  return any ? total + current : null;
}
