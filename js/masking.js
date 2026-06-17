/**
 * masking.js
 * 한국어 조사 분리 기반 단계별 텍스트 마스킹
 * (sponge-bible-nextjs/src/lib/highlight.ts 포팅)
 *
 * stage 0 : 전체 보기
 * stage 1 : 명사 가리기 (조사 앞 어근 숨김)
 * stage 2 : 어구 가리기 (2어절씩 번갈아 숨김)
 * stage 3 : 전체 가리기
 */

const PTCL = /^(.+?)(에서|에게|으로부터|으로|로부터|께서|이라도|이라고|이라는|이라|이랑|이며|이고|이나|까지|부터|보다|처럼|만큼|대로|마다|을|를|이|가|은|는|의|에|로|과|와|도|만|야|아)$/;

/**
 * 텍스트를 {t: string, h: boolean}[] 세그먼트 배열로 분해.
 * h=true 인 세그먼트가 화면에서 가려진다.
 */
function makeSegs(text, stage) {
  if (stage === 0) return [{ t: text, h: false }];
  if (stage === 3) return [{ t: text, h: true }];

  const tokens = text.trim().split(' ');
  const out = [];

  tokens.forEach((tok, i) => {
    if (i > 0) out.push({ t: ' ', h: false });

    if (stage === 1) {
      const m = tok.match(PTCL);
      if (m && m[1].length >= 1) {
        out.push({ t: m[1], h: true  });
        out.push({ t: m[2], h: false });
      } else {
        out.push({ t: tok, h: false });
      }
    } else {
      // stage 2: 2어절 단위로 번갈아 숨김
      out.push({ t: tok, h: Math.floor(i / 2) % 2 === 0 });
    }
  });

  return out;
}

/** HTML 특수문자 이스케이프 */
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * 마스킹 결과를 HTML 문자열로 반환.
 * isRevealed=true 이면 stage 무관하게 전체 표시.
 */
function renderMasked(text, stage, isRevealed) {
  if (stage === 0 || isRevealed) return esc(text);
  if (stage === 3) return `<span class="fullmask">${esc(text)}</span>`;
  return makeSegs(text, stage)
    .map(s => s.h ? `<span class="masked">${esc(s.t)}</span>` : esc(s.t))
    .join('');
}
