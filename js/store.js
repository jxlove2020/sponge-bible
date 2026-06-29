/**
 * store.js
 * 앱 전역 상태 + localStorage 영속화
 */

const SIZES   = ['14px','16px','18px','20px','22px','24px','26px','28px'];
const LS_SIZE = 'sb-size';
const LS_STAT = 'sponge-status-v1';
const LS_POS  = 'sb-pos';

/** @type {{ ref: string, text: string }[]} */
let verses = [];

/** @type {{ [ref: string]: 'none'|'learning'|'memorized' }} */
let statMap = {};

let stage    = 0;
let revealed = new Set();
let sIdx     = 3;   // 기본 글자 크기 인덱스 (4단계 = 20px)

// ── verses ──────────────────────────────
function setVerses(list) { verses = list; }
function getVerses()     { return verses; }

// ── 암송 상태 ────────────────────────────
function getStat(ref)       { return statMap[ref] || 'none'; }
function cycleStat(ref) {
  const next = { none: 'learning', learning: 'memorized', memorized: 'none' };
  statMap[ref] = next[getStat(ref)];
  _saveStat();
}
function loadStat() {
  try { const d = localStorage.getItem(LS_STAT); if (d) statMap = JSON.parse(d); } catch (_) {}
}
function _saveStat() {
  try { localStorage.setItem(LS_STAT, JSON.stringify(statMap)); } catch (_) {}
}

// ── 마스킹 단계 ──────────────────────────
function getStage()   { return stage; }
function setStage(s)  { stage = s; revealed = new Set(); clearAllStage2Flips(); }

// ── 공개(reveal) 집합 ─────────────────────
function isRevealed(ref)    { return revealed.has(ref); }
function toggleReveal(ref) {
  if (revealed.has(ref)) {
    revealed.delete(ref);
    clearStage2Flip(ref);   // 다시 가릴 때 새 랜덤 패턴 적용
  } else {
    revealed.add(ref);
  }
}
function revealAll()        { verses.forEach(v => revealed.add(v.ref)); }
function hideAll()          { revealed = new Set(); clearAllStage2Flips(); }

// ── 위치 ─────────────────────────────────
function savePos(i) { try { localStorage.setItem(LS_POS, i); } catch (_) {} }
function loadPos()  { try { return parseInt(localStorage.getItem(LS_POS)) || 1; } catch (_) { return 1; } }

// ── 글자 크기 ─────────────────────────────
function getSizeIdx()  { return sIdx; }
function getSizes()    { return SIZES; }
function applySavedSize() {
  try {
    const saved = localStorage.getItem(LS_SIZE);
    if (saved) { const i = SIZES.indexOf(saved); if (i !== -1) sIdx = i; }
  } catch (_) {}
}
function setSize(i) {
  sIdx = Math.max(0, Math.min(SIZES.length - 1, i));
  document.documentElement.style.fontSize = SIZES[sIdx];
  try { localStorage.setItem(LS_SIZE, SIZES[sIdx]); } catch (_) {}
}
