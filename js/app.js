/**
 * app.js
 * DOM 렌더링 · 이벤트 바인딩 · 데이터 초기화
 * 의존: masking.js, store.js
 */

// ── 상태 레이블 / 클래스 (VerseList.tsx 동일) ──
const STATUS_LABEL = { none: '−', learning: '학습중', memorized: '완료' };
const STATUS_CLASS = { none: 's-none', learning: 's-learning', memorized: 's-memorized' };

// ── DOM 참조 ────────────────────────────────────
const $loading     = document.getElementById('loading');
const $app         = document.getElementById('app');
const $verseList   = document.getElementById('verse-list');
const $progress    = document.getElementById('progress');
const $revealAll   = document.getElementById('reveal-all');
const $fdn         = document.getElementById('fdn');
const $fup         = document.getElementById('fup');
const $slider      = document.getElementById('verse-slider');
const $sliderLabel = document.getElementById('slider-label');

// ── 구절 목록 렌더링 ────────────────────────────
function renderList() {
  const verses = getVerses();
  const stg    = getStage();
  const done   = verses.filter(v => getStat(v.ref) === 'memorized').length;

  $progress.textContent = `완료 ${done}/${verses.length}`;

  $verseList.innerHTML = verses.map(v => {
    const st  = getStat(v.ref);
    const rev = isRevealed(v.ref);
    const txt = renderMasked(v.text, stg, rev);
    const clk = stg > 0 ? ' click' : '';
    return `<li class="verse-row">
      <span class="verse-ref">${esc(v.ref)}</span>
      <div class="verse-body">
        <span class="verse-text${clk}" data-r="${esc(v.ref)}">${txt}</span>
        <button class="status-btn ${STATUS_CLASS[st]}" data-st="${esc(v.ref)}">${STATUS_LABEL[st]}</button>
      </div>
    </li>`;
  }).join('');
}

// ── 단계 변경 ───────────────────────────────────
function changeStage(s) {
  setStage(s);
  document.querySelectorAll('.stage-btn')
    .forEach(b => b.classList.toggle('on', +b.dataset.s === s));
  $revealAll.style.display = s > 0 ? 'inline' : 'none';
  renderList();
}

// ── 위치 슬라이더 ───────────────────────────────
function scrollToVerse(n) {
  const items = $verseList.querySelectorAll('li');
  const target = items[n - 1];
  if (!target) return;
  const headerH = document.querySelector('.header').offsetHeight;
  const ctrlH   = document.querySelector('.ctrl-wrap').offsetHeight;
  const top = target.getBoundingClientRect().top + window.scrollY - headerH - ctrlH - 8;
  const behavior = navigator.maxTouchPoints > 0 ? 'instant' : 'smooth';
  window.scrollTo({ top, behavior });
}

// 드래그 중: 숫자만 업데이트
$slider.addEventListener('input', () => {
  $sliderLabel.textContent = `${$slider.value} / ${$slider.max}`;
});

// 손 놓을 때: 스크롤 + 저장
$slider.addEventListener('change', () => {
  const n = +$slider.value;
  savePos(n);
  scrollToVerse(n);
});

// ── 글자 크기 버튼 ──────────────────────────────
function refreshFontBtns() {
  const i = getSizeIdx();
  $fdn.disabled = i === 0;
  $fup.disabled = i === getSizes().length - 1;
}

$fdn.addEventListener('click', () => { setSize(getSizeIdx() - 1); refreshFontBtns(); });
$fup.addEventListener('click', () => { setSize(getSizeIdx() + 1); refreshFontBtns(); });

// ── 단계 버튼 ────────────────────────────────────
document.querySelectorAll('.stage-btn')
  .forEach(b => b.addEventListener('click', () => changeStage(+b.dataset.s)));

$revealAll.addEventListener('click', () => { revealAll(); renderList(); });

// ── 구절 목록 클릭 이벤트 위임 ─────────────────
$verseList.addEventListener('click', e => {
  const tEl = e.target.closest('[data-r]');
  const sEl = e.target.closest('[data-st]');

  if (tEl && getStage() > 0) {
    toggleReveal(tEl.dataset.r);
    renderList();
    return;
  }
  if (sEl) {
    cycleStat(sEl.dataset.st);
    renderList();
  }
});

// ── 초기화 ──────────────────────────────────────
async function init() {
  try {
    const [bRes, b100Res] = await Promise.all([
      fetch('data/bible.json'),
      fetch('data/bible_100.json'),
    ]);
    const bibleData = await bRes.json();
    const refs      = await b100Res.json();

    setVerses(
      refs
        .map(ref => ({ ref, text: (bibleData[ref] || '').trim() }))
        .filter(v => v.text)
    );

    applySavedSize();
    setSize(getSizeIdx());
    refreshFontBtns();

    loadStat();

    $loading.style.display = 'none';
    $app.style.display = '';
    renderList();

    const total = getVerses().length;
    $slider.max = total;
    const pos = loadPos();
    $slider.value = pos;
    $sliderLabel.textContent = `${pos} / ${total}`;
    if (pos > 1) setTimeout(() => scrollToVerse(pos), 100);
  } catch (err) {
    $loading.innerHTML =
      '❌ 데이터를 불러올 수 없습니다.<br>' +
      '<small>로컬 서버가 필요합니다: <code>python -m http.server</code></small>';
  }
}

init();
