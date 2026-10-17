/**
 * Keyword matching for OCR output.
 *
 * RDC uploads are stream VODs with a live-chat overlay, so a naive substring
 * match fires on chat lines like "you cant score on the big fish" or
 * "MVP des". Scoreboard column headers, on the other hand, are short
 * standalone OCR boxes. A keyword therefore only counts when an OCR line *is*
 * that keyword — give or take a trailing number ("NEXT MATCH IN 53") — or when
 * the line is made up entirely of keywords (engines that merge a header row
 * into one line, e.g. "SCORE GOALS ASSISTS SAVES SHOTS").
 */

const MAX_TRAILING_CHARS = 4;

export function normalizeOcrLine(line: string): string {
  return line
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function lineHasKeyword(line: string, keyword: string): boolean {
  if (line === keyword) return true;
  if (!line.startsWith(keyword + " ")) return false;
  // Allow short numeric/noise tails like countdowns ("NEXT MATCH IN 53").
  return line.length - keyword.length - 1 <= MAX_TRAILING_CHARS;
}

/**
 * Returns the subset of `keywords` (original casing, original order) that
 * appear as standalone tokens in the OCR `lines`.
 */
export function matchKeywords(
  lines: readonly string[],
  keywords: readonly string[],
  allowedNoise: readonly string[] = [],
): string[] {
  const normalized = lines.map(normalizeOcrLine).filter(Boolean);
  const upper = keywords.map((keyword) => normalizeOcrLine(keyword));
  const single = new Set(upper.filter((keyword) => !keyword.includes(" ")));
  const noise = new Set(allowedNoise.map(normalizeOcrLine));
  const hits = new Set<string>();

  for (const line of normalized) {
    upper.forEach((keyword) => {
      if (lineHasKeyword(line, keyword)) hits.add(keyword);
    });

    const words = line.split(" ");
    if (words.length < 2) continue;
    const isHeaderRow = words.every(
      (word) => single.has(word) || noise.has(word),
    );
    if (isHeaderRow)
      words.forEach((word) => {
        if (single.has(word)) hits.add(word);
      });
  }

  return keywords.filter((_, index) => hits.has(upper[index]));
}
