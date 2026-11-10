import {
  applyTap,
  buildShareText,
  currentStreak,
  falsePhrase,
  initialState,
  jstDateKey,
  puzzleIndex,
  visibleHints,
} from './logic.mjs';

const STORAGE_KEY = 'hazushita-ku.v1';
const DATA_PATHS = ['./puzzles.json', './meta.json', './calendar.json'];
const TIMES = '\u00D7';

const app = document.getElementById('app');

/** @type {object[]} */
let puzzles = [];
/** @type {{ daily: boolean, title: string }} */
let meta = { daily: false, title: '今日の句' };
/** @type {Record<string, string>} */
let calendarMap = {};
let dateKey = '';
let activeIndex = 0;
let isProduction = false;
/** @type {ReturnType<typeof initialState> | null} */
let state = null;
/** @type {{ version: number, clearedDates: string[], played: number, cleared: number } | null} */
let record = null;
let copyStatus = '';

/**
 * @param {string} tag
 * @param {Record<string, string | boolean | number | undefined>} [attrs]
 * @param {...(Node | string | null | undefined)} children
 */
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (key === 'class') {
      node.className = String(value);
    } else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value === true) {
      node.setAttribute(key, '');
    } else {
      node.setAttribute(key, String(value));
    }
  }
  for (const child of children) {
    if (child === null || child === undefined) continue;
    node.append(child);
  }
  return node;
}

function fail(message) {
  app.replaceChildren(el('p', { class: 'fail' }, message));
}

/**
 * @param {string} path
 */
async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error('load');
  return response.json();
}

function emptyRecord() {
  return { version: 1, clearedDates: [], played: 0, cleared: 0 };
}

function readRecord() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyRecord();
    const parsed = JSON.parse(raw);
    if (parsed.version !== 1 || !Array.isArray(parsed.clearedDates)) {
      return emptyRecord();
    }
    return {
      version: 1,
      clearedDates: parsed.clearedDates.map(String),
      played: Number(parsed.played) || 0,
      cleared: Number(parsed.cleared) || 0,
    };
  } catch {
    return null;
  }
}

function writeRecord(next) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

function recordFinish(success) {
  if (!meta.daily || !isProduction || record === null) return;
  if (record.clearedDates.includes(dateKey)) return;
  const next = {
    version: 1,
    clearedDates: [...record.clearedDates, dateKey],
    played: record.played + 1,
    cleared: record.cleared + (success ? 1 : 0),
  };
  if (writeRecord(next)) record = next;
}

function renderNavPhrase(puzzle) {
  const row = el('span', { class: 'nav-phrase' });
  for (const part of puzzle.phrase) {
    if (part === null) {
      row.append(el('span', { class: 'nav-hole' }, '\u00a0'));
    } else {
      row.append(document.createTextNode(part));
    }
  }
  return row;
}

function startPuzzle(index, production) {
  activeIndex = index;
  isProduction = production;
  state = initialState(puzzles[index]);
  copyStatus = '';
  render();
}

function onTap(character) {
  if (!state) return;
  const puzzle = puzzles[activeIndex];
  const next = applyTap(state, puzzle, character);
  const becameDone = !state.done && next.done;
  state = next;
  if (becameDone) recordFinish(next.success);
  render();
}

async function copyShare(text) {
  try {
    await navigator.clipboard.writeText(text);
    copyStatus = '写しました';
  } catch {
    copyStatus = '写せませんでした。下の文を選択して写せます';
  }
  render();
}

function renderPhrase(puzzle) {
  const filled = Boolean(state?.done && state.success);
  const row = el('div', { class: 'phrase' });
  for (const part of puzzle.phrase) {
    if (part === null) {
      row.append(
        el(
          'span',
          { class: filled ? 'phrase-char hole filled' : 'phrase-char hole' },
          filled ? puzzle.answer : '',
        ),
      );
    } else {
      row.append(el('span', { class: 'phrase-char' }, part));
    }
  }
  return row;
}

function renderHistory(puzzle) {
  if (!state || state.wrong.length === 0) return null;
  const list = el('ul', { class: 'history' });
  for (const character of state.wrong) {
    list.append(
      el(
        'li',
        {},
        el('span', { class: 'mark' }, TIMES),
        el('span', {}, falsePhrase(puzzle.phrase, character)),
      ),
    );
  }
  return list;
}

function renderHints(puzzle) {
  if (!state) return null;
  const hints = visibleHints(puzzle, state.wrong.length);
  if (hints.length === 0) return null;
  const box = el('div', { class: 'hints' });
  for (const hint of hints) {
    box.append(el('p', { class: 'hint' }, hint.text));
  }
  return box;
}

function renderCandidates() {
  if (!state) return null;
  const row = el('div', { class: 'candidates' });
  for (const character of state.remaining) {
    row.append(
      el(
        'button',
        {
          type: 'button',
          'aria-label': `${character} 穴に入れる`,
          disabled: state.done,
          onClick: () => onTap(character),
        },
        character,
      ),
    );
  }
  return row;
}

function renderResult(puzzle) {
  if (!state?.done) return null;
  const box = el('div', { class: 'result' });
  if (puzzle.meaning) {
    box.append(el('p', { class: 'meaning' }, puzzle.meaning));
  }
  if (puzzle.askedMeaning && puzzle.askedMeaning.otherLine) {
    box.append(el('p', { class: 'other-line' }, puzzle.askedMeaning.otherLine));
  }
  const calendarLine = calendarMap[dateKey];
  if (calendarLine) {
    box.append(el('p', { class: 'calendar-line' }, calendarLine));
  }
  const share = buildShareText({
    title: meta.title,
    dateKey,
    moves: state.moves,
    success: state.success,
    falsePhrases: state.wrong.map((character) => falsePhrase(puzzle.phrase, character)),
    calendar: calendarLine ?? '',
    answer: puzzle.answer,
    correctPhrase: falsePhrase(puzzle.phrase, puzzle.answer),
  });
  box.append(
    el('p', { class: 'share-label' }, '結果'),
    el('pre', { class: 'share', tabindex: '0' }, share),
    el(
      'div',
      { class: 'copy-row' },
      el('button', { type: 'button', onClick: () => copyShare(share) }, '写す'),
      copyStatus ? el('p', { class: 'copy-status' }, copyStatus) : null,
    ),
  );
  return box;
}

function renderNav() {
  if (puzzles.length === 0) return null;
  if (meta.daily) return null;
  if (puzzles.length <= 1) return null;
  const heading = 'ほかの句';
  const nav = el('nav', { class: 'nav' }, el('h2', {}, heading));
  const list = el('div', { class: 'nav-list' });
  puzzles.forEach((puzzle, index) => {
    list.append(
      el(
        'button',
        {
          type: 'button',
          onClick: () => startPuzzle(index, false),
        },
        renderNavPhrase(puzzle),
      ),
    );
  });
  nav.append(list);
  return nav;
}

function render() {
  const puzzle = puzzles[activeIndex];
  if (!puzzle || !state) {
    fail('問題データを読み込めませんでした。');
    return;
  }
  document.title = meta.title;
  const header = el('header', { class: 'header' }, el('h1', {}, meta.title));
  if (meta.daily) {
    header.append(el('p', { class: 'daily-label' }, '今日の1問'));
    if (record !== null) {
      const streak = currentStreak(dateKey, record.clearedDates);
      header.append(el('p', { class: 'streak' }, `連続 ${streak}`));
    }
  }
  const which =
    puzzle.askedMeaning && puzzle.askedMeaning.which
      ? el('p', { class: 'which' }, puzzle.askedMeaning.which)
      : null;
  const sheet = el(
    'div',
    { class: 'sheet' },
    ...[
      header,
      which,
      renderPhrase(puzzle),
      renderHistory(puzzle),
      renderHints(puzzle),
      renderResult(puzzle),
    ].filter(Boolean),
  );
  app.replaceChildren(...[sheet, renderCandidates(), renderNav()].filter(Boolean));
}

async function main() {
  try {
    const [loadedPuzzles, loadedMeta, loadedCalendar] = await Promise.all(
      DATA_PATHS.map((path) => loadJson(path)),
    );
    if (!Array.isArray(loadedPuzzles) || loadedPuzzles.length === 0) {
      fail('問題データを読み込めませんでした。');
      return;
    }
    puzzles = loadedPuzzles;
    meta = {
      daily: Boolean(loadedMeta?.daily),
      title: typeof loadedMeta?.title === 'string' ? loadedMeta.title : '今日の句',
    };
    calendarMap =
      loadedCalendar && typeof loadedCalendar === 'object' && !Array.isArray(loadedCalendar)
        ? loadedCalendar
        : {};
    dateKey = jstDateKey(Date.now());
    if (meta.daily) record = readRecord();
    const index = meta.daily ? puzzleIndex(dateKey, puzzles.length) : 0;
    startPuzzle(index, meta.daily);
  } catch {
    fail('問題データを読み込めませんでした。');
  }
}

main();
