// Shared, framework-free parsing primitives used by the Form 106 parser and
// the DocumentExtractionService. Kept dependency-free so it can be unit-tested.

/**
 * Parse a money token into a number, handling both US and EU grouping:
 *   "166,189" -> 166189   (separator + 3 digits = thousands separator)
 *   "12,345.67" -> 12345.67
 *   "12.345,67" -> 12345.67
 *   "27.00" -> 27
 * Rule: the last separator followed by exactly 3 digits is a thousands
 * separator; otherwise it is the decimal point.
 */
export function toNumber(raw: string): number {
  const s = raw.replace(/[^\d.,-]/g, "").trim();
  if (!s) return 0;
  const lastSep = Math.max(s.lastIndexOf(","), s.lastIndexOf("."));
  if (lastSep === -1) return parseFloat(s) || 0;
  const decimals = s.length - lastSep - 1;
  if (decimals === 3) {
    return parseFloat(s.replace(/[.,]/g, "")) || 0;
  }
  const sepChar = s[lastSep];
  const other = sepChar === "," ? "." : ",";
  const normalized = s.split(other).join("").replace(sepChar, ".");
  return parseFloat(normalized) || 0;
}

// Israeli forms print the field code as a combined "NNN/NNN" token in its own
// column (e.g. "172/158", "042/042"). Strip it before reading money so code
// digits are never mistaken for an amount.
export const CODE_COLUMN_RE = /\d{1,3}\s*\/\s*\d{1,3}/g;
export const MONEY_RE =
  /-?\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|-?\d+(?:[.,]\d{1,2})?/g;

/** Pull positive money values from a string, ignoring NNN/NNN code columns. */
export function moneyTokens(s: string): number[] {
  return (s.replace(CODE_COLUMN_RE, " ").match(MONEY_RE) ?? [])
    .map(toNumber)
    .filter((n) => n > 0);
}

/**
 * Find the money value associated with one of the given numeric field codes.
 * Prefers the amount on the code's own line; falls back to the next two lines
 * only if the code line has no usable amount (handles wrapped OCR output).
 */
export function findByCodes(
  text: string,
  codes: string[]
): { value: number; code?: string } {
  const lines = text.split(/\r?\n/);
  for (const code of codes) {
    const codeRe = new RegExp(`(?:^|[^\\d])${code}(?:[^\\d]|$)`);
    for (let i = 0; i < lines.length; i++) {
      if (!codeRe.test(lines[i])) continue;
      const sameLine = moneyTokens(lines[i]);
      if (sameLine.length) return { value: Math.max(...sameLine), code };
      const windowNums = moneyTokens(
        [lines[i + 1], lines[i + 2]].filter(Boolean).join(" ")
      );
      if (windowNums.length) return { value: Math.max(...windowNums), code };
    }
  }
  return { value: 0 };
}

// Israeli "אישור ניכוי מס" forms (e.g. Form 867 interest certificate) lay each
// amount out as: "<description> <rate>% * שדה <code> <amount>". The PDF text
// layer is sorted by x-position, so within an RTL row the code and amount can
// surface in either order. Identify a row by the שדה marker + the code, then
// strip the marker, that exact code, and the rate% — what remains is the amount.
const MARKER_RE = /שדה|הדש/; // הדש = reversed שדה (RTL output)
const PERCENT_RE = /\d{1,3}\s*%|%\s*\d{1,3}/g;

/** Amount on a field row, ignoring the שדה marker, the field code, and the rate%. */
function valueForFieldCode(line: string, code: string): number {
  const codeRe = new RegExp(`(^|\\D)0*${code}(\\D|$)`, "g");
  const cleaned = line
    .replace(PERCENT_RE, " ")
    .replace(/שדה|הדש/g, " ")
    .replace(codeRe, "$1 $2");
  const nums = moneyTokens(cleaned);
  return nums.length ? Math.max(...nums) : 0;
}

/**
 * Sum the amounts of several "שדה <code>" field rows (e.g. the per-rate
 * interest buckets 076/078/126/142/053, or the tax-withheld field 043). A row
 * only qualifies if it carries the שדה marker, so account numbers / national
 * IDs that merely contain the digits are never picked up. First row per code wins.
 */
export function sumByFieldCodes(text: string, codes: string[]): number {
  const lines = normalizeText(text).split(/\r?\n/);
  let sum = 0;
  for (const code of codes) {
    const codeRe = new RegExp(`(?:^|\\D)0*${code}(?:\\D|$)`);
    for (const line of lines) {
      if (MARKER_RE.test(line) && codeRe.test(line)) {
        sum += valueForFieldCode(line, code);
        break;
      }
    }
  }
  return sum;
}

// ---- Hebrew / RTL helpers -------------------------------------------------

const RTL_MARKS = /[‎‏‪-‮؜]/g;

export const reverseStr = (s: string): string => [...s].reverse().join("");

/** Normalize whitespace and strip bidi control marks for robust matching. */
export function normalizeText(text: string): string {
  return text.replace(RTL_MARKS, "").replace(/[ \t]+/g, " ");
}

/**
 * Hebrew can come out of pdf.js/OCR either correctly or reversed (RTL handling
 * varies). Match a phrase against the text in both orientations.
 */
export function hasPhrase(text: string, phrase: string): boolean {
  const t = normalizeText(text);
  return t.includes(phrase) || t.includes(reverseStr(phrase));
}

export function hasAnyPhrase(text: string, phrases: string[]): boolean {
  return phrases.some((p) => hasPhrase(text, p));
}

/**
 * True when every word is present somewhere in the text (any order). The PDF
 * text layer is sorted by x-position, which reverses RTL *word* order (e.g.
 * "אישור ניכוי מס" → "מס ניכוי אישור") while keeping each word's own
 * characters intact — so multi-word phrase matching fails but per-word does not.
 */
export function hasWords(text: string, words: string[]): boolean {
  return words.every((w) => hasPhrase(text, w));
}

/**
 * Find the largest money value on (or just after) a line that contains any of
 * the given keywords, in either RTL orientation. Returns 0 if nothing matches.
 */
export function valueNearKeyword(text: string, keywords: string[]): number {
  const lines = normalizeText(text).split(/\r?\n/);
  const variants = keywords.flatMap((k) => [k, reverseStr(k)]);
  let best = 0;
  for (let i = 0; i < lines.length; i++) {
    if (!variants.some((v) => lines[i].includes(v))) continue;
    // Prefer a value on the keyword's own line; only look at the next line
    // when the keyword line carries no number (avoids stealing the value of
    // an adjacent row).
    let nums = moneyTokens(lines[i]);
    if (!nums.length) nums = moneyTokens(lines[i + 1] ?? "");
    if (nums.length) best = Math.max(best, ...nums);
  }
  return best;
}

// ponytail: assert-based self-check; run with `tsx src/utils/parse.ts`.
export function demo() {
  // Logical-order text (as the PDF stores it).
  const logical = [
    "אלימלך תומר יעקב 209640101",
    "הכנסה חייבת מריבית על פקדונות וחסכונות 10% * שדה 076",
    "הכנסה חייבת מריבית על פקדונות וחסכונות 15% * שדה 078 4,203",
    'סה"כ המס שנוכה במקור (לפני החזרים ממס הכנסה) * שדה 043 631',
  ].join("\n");

  // x-sorted text (as extractTextLayer emits it): amount/code/marker reordered.
  const visual = [
    "209640101 יעקב תומר אלימלך",
    "10% 076 שדה * וחסכונות פקדונות על מריבית חייבת הכנסה",
    "4,203 078 שדה * וחסכונות פקדונות על מריבית חייבת הכנסה 15%",
    '631 043 שדה * הכנסה ממס החזרים לפני במקור שנוכה המס כ"סה',
  ].join("\n");

  for (const [name, form] of [["logical", logical], ["visual", visual]] as const) {
    console.assert(
      sumByFieldCodes(form, ["076", "078", "126", "142", "053"]) === 4203,
      `${name}: interest buckets sum to 4203`
    );
    console.assert(sumByFieldCodes(form, ["043"]) === 631, `${name}: tax 043 → 631`);
    // The national ID 209640101 must NOT be read as exempt-interest field 209.
    console.assert(sumByFieldCodes(form, ["209"]) === 0, `${name}: ID is not field 209`);
  }
  console.log("parse demo ok");
}

const _argv = (globalThis as { process?: { argv?: string[] } }).process?.argv;
if (_argv && import.meta.url === `file://${_argv[1]}`) demo();
