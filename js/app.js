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
const $phraseRow   = document.getElementById('phrase-row');
const $playAllBtn  = document.getElementById('play-all');
const $playResetBtn = document.getElementById('play-reset');

let phraseSize = 1;

// ── 오디오 재생 상태 ────────────────────────────
let audioPlayer = null;
let audioPlayingFile = '';
let isPlaylistActive = false;
let playlistIdx = 0;
let playlistVerses = [];
let repeatFile = '';

// SW 캐시를 미리 워밍: 별도 Audio 엘리먼트 없이 fetch로 캐싱만 함
function preloadFile(audioFile) {
  fetch(`sound/${audioFile}`).catch(() => {});
}

function playAudioFile(audioFile, onEnded) {
  if (audioPlayer) {
    audioPlayer.onended = null; // 이전 ended 핸들러 제거 (엘리먼트 재사용 시 중복 호출 방지)
    audioPlayer.pause();
    const prev = $verseList.querySelector(`.audio-btn[data-audio="${CSS.escape(audioPlayingFile)}"]`);
    if (prev) { prev.textContent = '▶'; prev.classList.remove('playing'); }
  }

  audioPlayingFile = audioFile;

  if (onEnded && audioPlayer) {
    // 플레이리스트: 같은 엘리먼트의 src만 교체 → 오디오 파이프라인 유지 → 처음 뭉개짐 없음
    audioPlayer.src = `sound/${audioFile}`;
    audioPlayer.loop = false;
  } else {
    // 개별 재생 또는 첫 재생: 새 엘리먼트 생성
    audioPlayer = new Audio(`sound/${audioFile}`);
    audioPlayer.preload = 'auto';
    audioPlayer.loop = (repeatFile === audioFile && !onEnded);
  }

  const btn = $verseList.querySelector(`.audio-btn[data-audio="${CSS.escape(audioFile)}"]`);
  if (btn) { btn.textContent = '⏸'; btn.classList.add('playing'); }

  const doPlay = () => {
    if (audioPlayingFile === audioFile) audioPlayer.play().catch(() => {});
  };
  audioPlayer.addEventListener('canplay', doPlay, { once: true });

  audioPlayer.onended = () => {
    if (audioPlayingFile === audioFile) {
      audioPlayingFile = '';
      const b = $verseList.querySelector(`.audio-btn[data-audio="${CSS.escape(audioFile)}"]`);
      if (b) { b.textContent = '▶'; b.classList.remove('playing'); }
    }
    if (onEnded) onEnded();
  };
}

function updatePlayBtnState() {
  const hasResume = playlistIdx > 0 && playlistIdx < playlistVerses.length;
  $playAllBtn.textContent = hasResume ? '▶ 이어서' : '▶ 전체';
  $playResetBtn.style.display = hasResume ? 'inline' : 'none';
}

function stopPlaylist() {
  isPlaylistActive = false;
  if (audioPlayingFile && playlistIdx > 0) {
    playlistIdx--;
  }
  updatePlayBtnState();
  if (audioPlayer) {
    audioPlayer.onended = null;
    audioPlayer.pause();
    const prev = $verseList.querySelector(`.audio-btn[data-audio="${CSS.escape(audioPlayingFile)}"]`);
    if (prev) { prev.textContent = '▶'; prev.classList.remove('playing'); }
    audioPlayer = null;
    audioPlayingFile = '';
  }
}

function playNextInPlaylist() {
  if (!isPlaylistActive || playlistIdx >= playlistVerses.length) {
    stopPlaylist();
    return;
  }
  const v = playlistVerses[playlistIdx];
  playlistIdx++;

  const fullIdx = getVerses().findIndex(gv => gv.ref === v.ref);
  if (fullIdx >= 0) scrollToVerse(fullIdx + 1);

  playAudioFile(v.audio, () => { if (isPlaylistActive) playNextInPlaylist(); });

  if (playlistIdx < playlistVerses.length) {
    preloadFile(playlistVerses[playlistIdx].audio);
  }
}

$playResetBtn.addEventListener('click', () => {
  playlistIdx = 0;
  $slider.value = 1;
  $sliderLabel.textContent = `1 / ${$slider.max}`;
  savePos(1);
  scrollToVerse(1);
  updatePlayBtnState();
});

$playAllBtn.addEventListener('click', () => {
  if (isPlaylistActive) {
    stopPlaylist();
    return;
  }
  playlistVerses = getVerses().filter(v => v.audio);
  const hasResume = playlistIdx > 0 && playlistIdx < playlistVerses.length;
  if (!hasResume) {
    const startVerse = getVerses()[+$slider.value - 1];
    if (startVerse) {
      const idx = playlistVerses.findIndex(v => v.ref === startVerse.ref);
      playlistIdx = idx >= 0 ? idx : 0;
    } else {
      playlistIdx = 0;
    }
  }
  isPlaylistActive = true;
  $playAllBtn.textContent = '⏹ 정지';

  if (playlistIdx < playlistVerses.length) {
    preloadFile(playlistVerses[playlistIdx].audio);
  }
  playNextInPlaylist();
});

function handleAudio(btn) {
  const audioFile = btn.dataset.audio;
  if (!audioFile) return;

  if (isPlaylistActive) stopPlaylist();

  if (audioPlayingFile === audioFile && audioPlayer) {
    if (audioPlayer.paused) {
      audioPlayer.play();
      btn.textContent = '⏸';
      btn.classList.add('playing');
    } else {
      audioPlayer.pause();
      btn.textContent = '▶';
      btn.classList.remove('playing');
    }
    return;
  }

  playAudioFile(audioFile, null);
}

// ── 구절 목록 렌더링 ────────────────────────────
let isRendering = false;
function renderList() {
  isRendering = true;
  requestAnimationFrame(() => { isRendering = false; });
  const verses = getVerses();
  const stg    = getStage();
  const done   = verses.filter(v => getStat(v.ref) === 'memorized').length;

  $progress.textContent = `완료 ${done}`;

  $verseList.innerHTML = verses.map(v => {
    const st  = getStat(v.ref);
    const rev = isRevealed(v.ref);
    const txt = renderMasked(v.text, stg, rev, v.ref, phraseSize);
    const clk = stg > 0 ? ' click' : '';
    const audioBtn = v.audio
      ? `<button class="audio-btn" data-audio="${esc(v.audio)}" title="듣기">▶</button>`
      : '';
    const repeatBtn = v.audio
      ? `<button class="repeat-btn${repeatFile === v.audio ? ' active' : ''}" data-repeat="${esc(v.audio)}" title="반복">↺</button>`
      : '';
    return `<li class="verse-row">
      <div class="verse-header">
        <span class="verse-ref">${esc(v.ref)}</span>
        <div class="verse-actions">
          ${audioBtn}${repeatBtn}
          <button class="status-btn ${STATUS_CLASS[st]}" data-st="${esc(v.ref)}">${STATUS_LABEL[st]}</button>
        </div>
      </div>
      <span class="verse-text${clk}" data-r="${esc(v.ref)}">${txt}</span>
    </li>`;
  }).join('');

  if (audioPlayingFile && audioPlayer && !audioPlayer.paused) {
    const btn = $verseList.querySelector(`.audio-btn[data-audio="${CSS.escape(audioPlayingFile)}"]`);
    if (btn) { btn.textContent = '⏸'; btn.classList.add('playing'); }
  }
}

// ── 단계 변경 ───────────────────────────────────
function changeStage(s) {
  setStage(s);
  document.querySelectorAll('.stage-btn')
    .forEach(b => b.classList.toggle('on', +b.dataset.s === s));
  $revealAll.style.display = s > 0 ? 'inline' : 'none';
  $revealAll.textContent = '🫣 전체 공개';
  $phraseRow.style.display = s === 2 ? 'flex' : 'none';
  renderList();
}

// ── 2단계 어절 단위 토글 ─────────────────────────
document.querySelectorAll('.phrase-btn').forEach(b => {
  b.addEventListener('click', () => {
    phraseSize = +b.dataset.ps;
    document.querySelectorAll('.phrase-btn')
      .forEach(x => x.classList.toggle('on', +x.dataset.ps === phraseSize));
    clearAllStage2Flips();
    renderList();
  });
});

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

function seekPlaylistTo(n) {
  const startVerse = getVerses()[n - 1];
  if (!startVerse) return;
  const idx = playlistVerses.findIndex(v => v.ref === startVerse.ref);
  if (idx < 0 || idx === playlistIdx - 1) return;
  if (audioPlayer) {
    audioPlayer.onended = null;
    audioPlayer.pause();
    const prev = $verseList.querySelector(`.audio-btn[data-audio="${CSS.escape(audioPlayingFile)}"]`);
    if (prev) { prev.textContent = '▶'; prev.classList.remove('playing'); }
    audioPlayer = null;
    audioPlayingFile = '';
  }
  playlistIdx = idx;
  playNextInPlaylist();
}

// 손 놓을 때: 스크롤 + 저장 (재생 중이면 해당 위치부터 재생)
$slider.addEventListener('change', () => {
  const n = +$slider.value;
  savePos(n);
  scrollToVerse(n);
  if (isPlaylistActive) seekPlaylistTo(n);
});

// 스크롤 → 슬라이더 연동
let scrollTicking = false;
let scrollSeekTimer = null;
window.addEventListener('scroll', () => {
  if (scrollTicking || isRendering) return;
  scrollTicking = true;
  requestAnimationFrame(() => {
    const items = $verseList.querySelectorAll('li');
    const headerH = document.querySelector('.header').offsetHeight;
    const ctrlH   = document.querySelector('.ctrl-wrap').offsetHeight;
    const threshold = headerH + ctrlH + 20;
    let current = 1;
    for (let i = 0; i < items.length; i++) {
      if (items[i].getBoundingClientRect().top <= threshold) current = i + 1;
      else break;
    }
    $slider.value = current;
    $sliderLabel.textContent = `${current} / ${$slider.max}`;
    savePos(current);
    scrollTicking = false;

    if (isPlaylistActive) {
      clearTimeout(scrollSeekTimer);
      scrollSeekTimer = setTimeout(() => seekPlaylistTo(current), 1000);
    }
  });
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

$revealAll.addEventListener('click', () => {
  const allRevealed = getVerses().every(v => isRevealed(v.ref));
  if (allRevealed) {
    hideAll();
    $revealAll.textContent = '🫣 전체 공개';
  } else {
    revealAll();
    $revealAll.textContent = '🙈 다시 가리기';
  }
  renderList();
});

// ── 구절 목록 클릭 이벤트 위임 ─────────────────
$verseList.addEventListener('click', e => {
  const aEl = e.target.closest('.audio-btn');
  const rEl = e.target.closest('.repeat-btn');
  const tEl = e.target.closest('[data-r]');
  const sEl = e.target.closest('[data-st]');

  if (aEl) {
    handleAudio(aEl);
    return;
  }
  if (rEl) {
    const file = rEl.dataset.repeat;
    if (repeatFile === file) {
      repeatFile = '';
      if (audioPlayer && audioPlayingFile === file) audioPlayer.loop = false;
      rEl.classList.remove('active');
    } else {
      const old = $verseList.querySelector(`.repeat-btn[data-repeat="${CSS.escape(repeatFile)}"]`);
      if (old) old.classList.remove('active');
      repeatFile = file;
      if (audioPlayer && audioPlayingFile === file) audioPlayer.loop = true;
      rEl.classList.add('active');
    }
    return;
  }
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
    const verses = await fetch(`data/verses.json?v=${Date.now()}`).then(r => r.json());
    setVerses(verses);

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
