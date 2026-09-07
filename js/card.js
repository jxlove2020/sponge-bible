/**
 * card.js
 * 성경 구절 카드 형태 보기 (스와이프 플래시카드) 로직
 * 의존: masking.js, store.js
 */

const STATUS_LABEL = { none: '−', learning: '학습중', memorized: '완료' };
const STATUS_CLASS = { none: 's-none', learning: 's-learning', memorized: 's-memorized' };

// ── DOM 참조 ────────────────────────────────────
const $loading = document.getElementById('loading');
const $app = document.getElementById('app');
const $cardWrapper = document.getElementById('card-wrapper');
const $cardViewport = document.getElementById('card-viewport');
const $slider = document.getElementById('card-slider');
const $sliderLabel = document.getElementById('card-slider-label');
const $progress = document.getElementById('card-progress');
const $phraseRow = document.getElementById('phrase-row');
const $fdn = document.getElementById('fdn');
const $fup = document.getElementById('fup');
const $btnPrev = document.getElementById('btn-prev');
const $btnNext = document.getElementById('btn-next');
const $btnReveal = document.getElementById('btn-reveal');

let currentIdx = 0;
let phraseSize = 1;
let audioPlayer = null;
let isAudioPlaying = false;
let isRepeatActive = false;
let isTransitioning = false;

// ── 모바일 햅틱 진동 피드백 (버튼 클릭감) ─────────
function triggerHaptic(duration = 15) {
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(duration);
    }
  } catch (_) {}
}

// ── 데이터 로드 & 초기화 ────────────────────────
async function init() {
  loadStat();
  loadStage();
  applySavedSize();
  refreshFontBtns();

  try {
    const res = await fetch('data/verses.json');
    const data = await res.json();
    setVerses(data);
  } catch (err) {
    console.error('데이터 로드 실패:', err);
    $loading.textContent = '❌ 데이터를 불러오지 못했습니다.';
    return;
  }

  const list = getVerses();
  if ($slider) $slider.max = list.length;

  // 저장된 위치 복원
  const savedPos = loadPos();
  currentIdx = Math.max(0, Math.min(list.length - 1, savedPos - 1));

  $loading.style.display = 'none';
  $app.style.display = 'flex';

  const st = getStage();
  document.querySelectorAll('.stage-btn[data-s]').forEach(x => x.classList.toggle('on', +x.dataset.s === st));
  $phraseRow.style.display = st === 2 ? 'flex' : 'none';

  renderCard();
  bindEvents();
}

// ── 카드 렌더링 ─────────────────────────────────
function renderCard(direction = 0) {
  const list = getVerses();
  if (!list.length) return;

  const v = list[currentIdx];
  const st = getStage();
  const revealed = isRevealed(v.ref);

  // 마스킹 텍스트 계산
  const htmlText = renderMasked(v.text, st, revealed, v.ref, phraseSize);

  // 상단/외부 진행 및 슬라이더 동기화
  if ($slider) $slider.value = currentIdx + 1;
  if ($sliderLabel) $sliderLabel.textContent = `${currentIdx + 1} / ${list.length}`;
  updateProgress();

  // 하단 버튼 상태
  $btnPrev.disabled = currentIdx === 0;
  $btnNext.disabled = currentIdx === list.length - 1;

  if ($btnReveal) {
    if (st === 0) {
      $btnReveal.disabled = true;
      $btnReveal.textContent = '📖 전체 보기';
      $btnReveal.classList.remove('revealed');
    } else {
      $btnReveal.disabled = false;
      $btnReveal.textContent = revealed ? '🙈 다시 가리기' : '🫣 정답 확인';
      $btnReveal.classList.toggle('revealed', revealed);
    }
  }

  // 카드 DOM 생성
  const card = document.createElement('div');
  card.className = 'bible-card';
  card.id = 'current-card';

  // 글자 크기 적용
  const curSize = getSizes()[getSizeIdx()];

  const stat = getStat(v.ref);
  const memorized = list.filter(item => getStat(item.ref) === 'memorized').length;

  card.innerHTML = `
    <div class="card-header-bar">
      <div class="card-ref-group">
        <span class="card-idx-badge">#${currentIdx + 1}</span>
        <span class="card-ref-text">${escapeHtml(v.ref)}</span>
      </div>
      <div class="card-actions">
        ${
          v.audio
            ? `
          <button class="card-audio-btn ${isAudioPlaying ? 'playing' : ''}" id="card-audio-btn" title="낭독 듣기">${isAudioPlaying ? '⏸' : '▶'}</button>
          <button class="card-repeat-btn ${isRepeatActive ? 'active' : ''}" id="card-repeat-btn" title="반복 듣기">↺</button>
        `
            : ''
        }
        <button class="card-stat-btn ${STATUS_CLASS[stat]}" id="card-stat-btn">${STATUS_LABEL[stat]}</button>
      </div>
    </div>
    <div class="card-body" style="font-size: ${curSize}">
      <div class="verse-center-box">
        <div class="verse-text">${htmlText}</div>
      </div>
    </div>
    <div class="card-slider-box" id="card-slider-box">
      <input type="range" class="card-inline-slider" id="card-inline-slider" min="1" max="${list.length}" value="${currentIdx + 1}" />
      <div class="card-slider-labels">
        <span class="card-slider-cur" id="card-slider-cur">${currentIdx + 1} / ${list.length}</span>
        <span class="card-slider-stat" id="card-slider-stat">완료 ${memorized}</span>
      </div>
    </div>
  `;

  // 진입 애니메이션 (슬라이드 전환 효과)
  if (direction !== 0) {
    card.style.transform = `translateX(${direction * 70}px) scale(0.95)`;
    card.style.opacity = '0.2';
    $cardWrapper.innerHTML = '';
    $cardWrapper.appendChild(card);

    // 강제 리플로우 후 정상 위치로 부드럽게 복귀
    card.offsetHeight;
    card.style.transition = 'transform 0.24s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.22s ease-out';
    card.style.transform = 'translateX(0) scale(1)';
    card.style.opacity = '1';
  } else {
    $cardWrapper.innerHTML = '';
    $cardWrapper.appendChild(card);
  }

  // 카드 내 이벤트 바인딩
  setupCardEvents(card, v);
  savePos(currentIdx + 1);
}

function updateProgress() {
  const list = getVerses();
  const memorized = list.filter(v => getStat(v.ref) === 'memorized').length;
  if ($progress) $progress.textContent = `완료 ${memorized}`;
  const statEl = document.getElementById('card-slider-stat');
  if (statEl) statEl.textContent = `완료 ${memorized}`;
}

// ── 카드 내 개별 이벤트 바인딩 ────────────────────
function setupCardEvents(card, v) {
  const audioBtn = card.querySelector('#card-audio-btn');
  if (audioBtn) {
    audioBtn.addEventListener('click', e => {
      e.stopPropagation();
      triggerHaptic(15);
      toggleAudio(v.audio);
    });
  }

  const repeatBtn = card.querySelector('#card-repeat-btn');
  if (repeatBtn) {
    repeatBtn.addEventListener('click', e => {
      e.stopPropagation();
      triggerHaptic(15);
      isRepeatActive = !isRepeatActive;
      repeatBtn.classList.toggle('active', isRepeatActive);
      if (audioPlayer) {
        audioPlayer.loop = isRepeatActive;
      } else if (isRepeatActive && v.audio) {
        toggleAudio(v.audio);
      }
    });
  }

  const statBtn = card.querySelector('#card-stat-btn');
  if (statBtn) {
    statBtn.addEventListener('click', e => {
      e.stopPropagation();
      triggerHaptic(15);
      cycleStat(v.ref);
      const nextStat = getStat(v.ref);
      statBtn.className = `card-stat-btn ${STATUS_CLASS[nextStat]}`;
      statBtn.textContent = STATUS_LABEL[nextStat];
      updateProgress();
    });
  }

  // ── 카드 하단 슬라이더 인터랙션 ──
  const slider = card.querySelector('#card-inline-slider');
  const sliderCur = card.querySelector('#card-slider-cur');
  if (slider) {
    const list = getVerses();
    updateSliderTrack(slider, currentIdx + 1, list.length);

    slider.addEventListener('input', () => {
      const val = +slider.value;
      if (sliderCur) sliderCur.textContent = `${val} / ${list.length}`;
      updateSliderTrack(slider, val, list.length);
    });

    slider.addEventListener('change', () => {
      const targetIdx = +slider.value - 1;
      if (targetIdx !== currentIdx && !isTransitioning) {
        triggerHaptic(10);
        stopAudio();
        const dir = targetIdx > currentIdx ? -1 : 1;
        currentIdx = targetIdx;
        renderCard(dir);
      }
    });
  }

  // ── 카드 본문 클릭 (사라졌다 ↔ 보였다 정답 토글) ──
  const cardBody = card.querySelector('.card-body');
  if (cardBody) {
    cardBody.addEventListener('click', e => {
      if (
        e.target.closest('#card-audio-btn') ||
        e.target.closest('#card-repeat-btn') ||
        e.target.closest('#card-stat-btn') ||
        e.target.closest('.card-slider-box')
      )
        return;
      if (isSwipeMoved) return;
      handleCardTap(v);
    });
  }

  // 스와이프 제스처 (터치 + 마우스 드래그)
  bindSwipeGesture(card, v);
}

function updateSliderTrack(slider, value, max) {
  const pct = max > 1 ? ((value - 1) / (max - 1)) * 100 : 0;
  slider.style.background = `linear-gradient(to right, #2563eb 0%, #2563eb ${pct}%, #e2e8f0 ${pct}%, #e2e8f0 100%)`;
}

// ── 스와이프 제스처 & 클릭 통합 제어 ──────────────
let isSwipeMoved = false;
let lastTapTime = 0;

function handleCardTap(v) {
  if (getStage() === 0) return;
  const now = Date.now();
  if (now - lastTapTime < 250) return; // 중복 호출 방지 (mouseup + click 중복 방어)
  lastTapTime = now;

  triggerHaptic(20);
  toggleReveal(v.ref);
  renderCard(0);
}

function bindSwipeGesture(card, v) {
  let startX = 0;
  let startY = 0;
  let currentX = 0;
  let currentY = 0;
  let isDragging = false;
  let isHorizontalMove = false;

  const onStart = (clientX, clientY) => {
    startX = clientX;
    startY = clientY;
    currentX = clientX;
    currentY = clientY;
    isDragging = true;
    isHorizontalMove = false;
    isSwipeMoved = false;
    card.classList.add('swiping');
  };

  const onMove = (clientX, clientY, e) => {
    if (!isDragging) return;
    currentX = clientX;
    currentY = clientY;

    const diffX = currentX - startX;
    const diffY = currentY - startY;

    if (!isHorizontalMove) {
      if (Math.abs(diffX) > 10 && Math.abs(diffX) > Math.abs(diffY)) {
        isHorizontalMove = true;
      }
    }

    if (isHorizontalMove) {
      isSwipeMoved = true;
      if (e && e.cancelable) {
        e.preventDefault();
      }

      // 경계 저항감 부여
      let moveX = diffX;
      if ((currentIdx === 0 && diffX > 0) || (currentIdx === getVerses().length - 1 && diffX < 0)) {
        moveX = diffX * 0.3;
      }
      const rotate = moveX * 0.04;
      card.style.transform = `translateX(${moveX}px) rotate(${rotate}deg)`;
      card.style.opacity = `${Math.max(0.65, 1 - Math.abs(moveX) / 800)}`;
    }
  };

  const onEnd = () => {
    if (!isDragging) return;
    isDragging = false;
    card.classList.remove('swiping');

    const diffX = currentX - startX;
    const diffY = currentY - startY;
    const list = getVerses();

    // 1) 수평 스와이프 완료 (> 60px)
    if (isHorizontalMove && Math.abs(diffX) > 60) {
      if (diffX < 0 && currentIdx < list.length - 1) {
        slideOutAndMove(card, -1);
        return;
      } else if (diffX > 0 && currentIdx > 0) {
        slideOutAndMove(card, 1);
        return;
      }
    }

    // 제자리 복귀
    card.style.transform = 'translateX(0) rotate(0deg)';
    card.style.opacity = '1';

    // 2) 거의 움직이지 않은 경우 (단순 탭 / 클릭)
    if (!isHorizontalMove && Math.abs(diffX) < 15 && Math.abs(diffY) < 15) {
      handleCardTap(v);
    }

    if (isSwipeMoved) {
      setTimeout(() => {
        isSwipeMoved = false;
      }, 100);
    }
  };

  // 터치 이벤트 (모바일)
  card.addEventListener(
    'touchstart',
    e => {
      if (
        e.target.closest('#card-audio-btn') ||
        e.target.closest('#card-repeat-btn') ||
        e.target.closest('#card-stat-btn') ||
        e.target.closest('.card-slider-box')
      )
        return;
      if (e.touches.length === 1) onStart(e.touches[0].clientX, e.touches[0].clientY);
    },
    { passive: true },
  );

  card.addEventListener(
    'touchmove',
    e => {
      if (e.touches.length === 1) onMove(e.touches[0].clientX, e.touches[0].clientY, e);
    },
    { passive: false },
  );

  card.addEventListener('touchend', onEnd);
  card.addEventListener('touchcancel', onEnd);

  // 마우스 드래그 이벤트 (PC 대응)
  const onMouseMove = e => {
    if (isDragging) onMove(e.clientX, e.clientY, e);
  };
  const onMouseUp = () => {
    if (isDragging) {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      onEnd();
    }
  };

  card.addEventListener('mousedown', e => {
    if (
      e.target.closest('#card-audio-btn') ||
      e.target.closest('#card-repeat-btn') ||
      e.target.closest('#card-stat-btn') ||
      e.target.closest('.card-slider-box')
    )
      return;
    if (e.button === 0) {
      onStart(e.clientX, e.clientY);
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    }
  });
}

function slideOutAndMove(card, dir) {
  if (isTransitioning) return;
  isTransitioning = true;

  // dir: -1 (다음으로 이동: 카드가 왼쪽으로 퇴장), 1 (이전으로 이동: 카드가 오른쪽으로 퇴장)
  stopAudio();
  triggerHaptic(20);
  card.style.transition = 'transform 0.22s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.22s ease-in';
  card.style.transform = `translateX(${dir * 120}%) rotate(${dir * 10}deg)`;
  card.style.opacity = '0';

  setTimeout(() => {
    currentIdx += dir === -1 ? 1 : -1;
    renderCard(-dir);
    isTransitioning = false;
  }, 220);
}

// ── 전역 버튼 및 키보드 이벤트 바인딩 ─────────────
function bindEvents() {
  // 이전 / 다음 버튼 (스와이프와 동일한 부드러운 슬라이드 효과)
  $btnPrev.addEventListener('click', () => {
    if (currentIdx > 0 && !isTransitioning) {
      const card = document.getElementById('current-card');
      if (card) {
        slideOutAndMove(card, 1);
      } else {
        stopAudio();
        currentIdx--;
        renderCard(-1);
      }
    }
  });

  $btnNext.addEventListener('click', () => {
    if (currentIdx < getVerses().length - 1 && !isTransitioning) {
      const card = document.getElementById('current-card');
      if (card) {
        slideOutAndMove(card, -1);
      } else {
        stopAudio();
        currentIdx++;
        renderCard(1);
      }
    }
  });

  // 정답 확인 / 다시 가리기 (버튼 존재 시)
  if ($btnReveal) {
    $btnReveal.addEventListener('click', () => {
      const list = getVerses();
      const v = list[currentIdx];
      if (!v) return;
      triggerHaptic(15);
      toggleReveal(v.ref);
      renderCard(0);
    });
  }

  // 하단 외부 슬라이더 조작 (존재 시)
  if ($slider) {
    $slider.addEventListener('input', () => {
      if ($sliderLabel) $sliderLabel.textContent = `${$slider.value} / ${$slider.max}`;
    });

    $slider.addEventListener('change', () => {
      const targetIdx = +$slider.value - 1;
      if (targetIdx !== currentIdx) {
        triggerHaptic(10);
        stopAudio();
        const dir = targetIdx > currentIdx ? 1 : -1;
        currentIdx = targetIdx;
        renderCard(dir);
      }
    });
  }

  // 단계 버튼 (0~3)
  document.querySelectorAll('.stage-btn[data-s]').forEach(b => {
    b.addEventListener('click', () => {
      triggerHaptic(12);
      const s = +b.dataset.s;
      setStage(s);
      document.querySelectorAll('.stage-btn[data-s]').forEach(x => x.classList.toggle('on', +x.dataset.s === s));
      $phraseRow.style.display = s === 2 ? 'flex' : 'none';
      renderCard(0);
    });
  });

  // 2단계 어절 버튼 (1 / 2)
  document.querySelectorAll('.phrase-btn').forEach(b => {
    b.addEventListener('click', () => {
      triggerHaptic(12);
      phraseSize = +b.dataset.ps;
      document.querySelectorAll('.phrase-btn').forEach(x => x.classList.toggle('on', +x.dataset.ps === phraseSize));
      clearAllStage2Flips();
      renderCard(0);
    });
  });

  // 글자 크기
  $fdn.addEventListener('click', () => {
    triggerHaptic(12);
    setSize(getSizeIdx() - 1);
    refreshFontBtns();
    updateCardFontSize();
  });

  $fup.addEventListener('click', () => {
    triggerHaptic(12);
    setSize(getSizeIdx() + 1);
    refreshFontBtns();
    updateCardFontSize();
  });

  // 키보드 좌우 방향키
  window.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') {
      if (currentIdx > 0 && !isTransitioning) {
        const card = document.getElementById('current-card');
        if (card) {
          slideOutAndMove(card, 1);
        } else {
          stopAudio();
          currentIdx--;
          renderCard(-1);
        }
      }
    } else if (e.key === 'ArrowRight') {
      if (currentIdx < getVerses().length - 1 && !isTransitioning) {
        const card = document.getElementById('current-card');
        if (card) {
          slideOutAndMove(card, -1);
        } else {
          stopAudio();
          currentIdx++;
          renderCard(1);
        }
      }
    } else if (e.key === ' ' || e.key === 'Enter') {
      const v = getVerses()[currentIdx];
      if (v && getStage() > 0) {
        e.preventDefault();
        toggleReveal(v.ref);
        renderCard(0);
      }
    }
  });
}

function updateCardFontSize() {
  const cardBody = document.querySelector('.card-body');
  if (cardBody) {
    cardBody.style.fontSize = getSizes()[getSizeIdx()];
    cardBody.scrollTop = 0;
  }
}

function refreshFontBtns() {
  const i = getSizeIdx();
  $fdn.disabled = i === 0;
  $fup.disabled = i === getSizes().length - 1;
}

// ── 오디오 제어 ─────────────────────────────────
function toggleAudio(audioFile) {
  if (!audioFile) return;

  if (isAudioPlaying && audioPlayer) {
    stopAudio();
    return;
  }

  stopAudio();
  audioPlayer = new Audio(`sound/${audioFile}`);
  audioPlayer.loop = isRepeatActive;
  isAudioPlaying = true;

  const btn = document.getElementById('card-audio-btn');
  if (btn) {
    btn.textContent = '⏸';
    btn.classList.add('playing');
  }

  audioPlayer.play().catch(() => {
    stopAudio();
  });

  audioPlayer.onended = () => {
    if (!audioPlayer || !audioPlayer.loop) {
      stopAudio();
    }
  };
}

function stopAudio() {
  if (audioPlayer) {
    audioPlayer.pause();
    audioPlayer.onended = null;
    audioPlayer = null;
  }
  isAudioPlaying = false;
  const btn = document.getElementById('card-audio-btn');
  if (btn) {
    btn.textContent = '▶';
    btn.classList.remove('playing');
  }
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── 앱 시작 ─────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
