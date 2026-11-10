/**
 * 今日の句の純関数。DOM、localStorage、fetch、Date.now は参照しない。
 */

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const BASE_YEAR = 2026;
const BASE_MONTH = 1;
const BASE_DAY = 1;
const TIMES = '\u00D7';

/**
 * @param {string} dateKey
 * @returns {{ y: number, m: number, d: number }}
 */
function parseDateKey(dateKey) {
  const [year, month, day] = dateKey.split('-');
  return { y: Number(year), m: Number(month), d: Number(day) };
}

/**
 * @param {number} y
 * @param {number} m
 * @param {number} d
 * @returns {number}
 */
function utcDays(y, m, d) {
  return Date.UTC(y, m - 1, d) / MS_PER_DAY;
}

/**
 * @param {string} dateKey
 * @param {number} delta
 * @returns {string}
 */
function addDays(dateKey, delta) {
  const { y, m, d } = parseDateKey(dateKey);
  const next = new Date(Date.UTC(y, m - 1, d) + delta * MS_PER_DAY);
  const year = next.getUTCFullYear();
  const month = String(next.getUTCMonth() + 1).padStart(2, '0');
  const day = String(next.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * @param {string} text
 * @param {string} answer
 * @param {string} correctPhrase
 * @returns {boolean}
 */
function shouldOmitLine(text, answer, correctPhrase) {
  if (text === correctPhrase) return true;
  if (answer && text.includes(answer)) return true;
  return false;
}

/**
 * @param {object} puzzle
 * @param {{ text: string, kind: string }} hint
 * @returns {string}
 */
function resolveHintText(puzzle, hint) {
  if (hint.text) return hint.text;
  if (hint.kind === 'reading') return puzzle.reading ?? '';
  if (hint.kind === 'meaning') return puzzle.meaning ?? '';
  return '';
}

/**
 * @param {number} epochMs
 * @returns {string}
 */
export function jstDateKey(epochMs) {
  const shifted = new Date(epochMs + JST_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * @param {string} dateKey
 * @param {number} length
 * @returns {number}
 */
export function puzzleIndex(dateKey, length) {
  if (length <= 0) return 0;
  const { y, m, d } = parseDateKey(dateKey);
  const ordinal = utcDays(y, m, d) - utcDays(BASE_YEAR, BASE_MONTH, BASE_DAY);
  let index = ordinal % length;
  if (index < 0) index += length;
  return index;
}

/**
 * @param {string[]} candidates
 * @returns {string[]}
 */
export function displayOrder(candidates) {
  return [...candidates].sort((a, b) => a.codePointAt(0) - b.codePointAt(0));
}

/**
 * @param {Array<string | null>} phrase
 * @param {string} character
 * @returns {string}
 */
export function falsePhrase(phrase, character) {
  return phrase.map((part) => (part === null ? character : part)).join('');
}

/**
 * @param {{ candidates: string[] }} puzzle
 * @returns {{ remaining: string[], wrong: string[], moves: number, done: boolean, success: boolean }}
 */
export function initialState(puzzle) {
  return {
    remaining: displayOrder(puzzle.candidates),
    wrong: [],
    moves: 0,
    done: false,
    success: false,
  };
}

/**
 * @param {{ remaining: string[], wrong: string[], moves: number, done: boolean, success: boolean }} state
 * @param {{ answer: string, maxWrong: number }} puzzle
 * @param {string} tapped
 */
export function applyTap(state, puzzle, tapped) {
  if (state.done || !state.remaining.includes(tapped)) {
    return state;
  }
  const moves = state.moves + 1;
  if (tapped === puzzle.answer) {
    return {
      remaining: state.remaining,
      wrong: state.wrong,
      moves,
      done: true,
      success: true,
    };
  }
  const remaining = state.remaining.filter((character) => character !== tapped);
  const wrong = [...state.wrong, tapped];
  const failed = wrong.length === puzzle.maxWrong;
  return {
    remaining,
    wrong,
    moves,
    done: failed,
    success: false,
  };
}

/**
 * @param {{ hints: Array<{ afterWrong: number, kind: string, text: string }>, reading: string, meaning: string }} puzzle
 * @param {number} wrongCount
 * @returns {Array<{ afterWrong: number, kind: string, text: string }>}
 */
export function visibleHints(puzzle, wrongCount) {
  if (wrongCount === 0) return [];
  const visible = [];
  for (const hint of puzzle.hints) {
    if (hint.afterWrong > wrongCount) continue;
    const text = resolveHintText(puzzle, hint);
    if (text === '') continue;
    visible.push({
      afterWrong: hint.afterWrong,
      kind: hint.kind,
      text,
    });
  }
  return visible;
}

/**
 * @param {{
 *   title: string,
 *   dateKey: string,
 *   moves: number,
 *   success: boolean,
 *   falsePhrases: string[],
 *   calendar: string | null | undefined,
 *   answer: string,
 *   correctPhrase: string,
 * }} input
 * @returns {string}
 */
export function buildShareText(input) {
  const processLine = input.success ? `${input.moves}手` : '当たらず';
  const lines = [input.title, input.dateKey, processLine];
  const phrases = input.falsePhrases ?? [];
  for (let i = 0; i < phrases.length; i += 1) {
    const phrase = phrases[i];
    if (shouldOmitLine(phrase, input.answer, input.correctPhrase)) continue;
    lines.push(`${i + 1} ${TIMES} ${phrase}`);
  }
  if (
    input.calendar &&
    !shouldOmitLine(input.calendar, input.answer, input.correctPhrase)
  ) {
    lines.push(`暦 ${input.calendar}`);
  }
  return `${lines.join('\n')}\n`;
}

/**
 * @param {string} todayKey
 * @param {string[]} clearedDates
 * @returns {number}
 */
export function currentStreak(todayKey, clearedDates) {
  const set = new Set(clearedDates);
  let cursor;
  if (set.has(todayKey)) {
    cursor = todayKey;
  } else {
    const yesterday = addDays(todayKey, -1);
    if (!set.has(yesterday)) return 0;
    cursor = yesterday;
  }
  let streak = 0;
  while (set.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}
