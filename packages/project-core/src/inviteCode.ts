/**
 * 초대코드 문자열 — D53(초대코드 가입) 스코프.
 *
 * 서버(Postgres)는 이 문자열을 해석하지 않는다. `invite_codes.code` 컬럼에 그대로 들어가는
 * 텍스트 키일 뿐이다 — 여기서는 **화면에서 사람이 손으로 옮겨 적기 쉬운 형태**로만 만든다.
 *
 * 헷갈리는 문자(0/O, 1/I/L 등)는 알파벳에서 아예 뺐다 — 오타로 인한 "코드가 안 먹는다" 문의를
 * 줄이는 게 목적이지, 보안 강도를 위한 설계가 아니다(추측 방지는 길이 8자 · 팀장만 발급·조회
 * 가능한 RLS가 담당한다).
 */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 0/O, 1/I/L 제외
const LENGTH = 8;

/** `rand()` 는 테스트에서 결정론적으로 주입할 수 있게 인자로 뺐다. 기본은 `Math.random`. */
export function generateInviteCode(rand: () => number = Math.random): string {
  let out = '';
  for (let i = 0; i < LENGTH; i++) {
    out += ALPHABET[Math.floor(rand() * ALPHABET.length)];
  }
  return out;
}

/** 가입 폼 입력값 정리 — 대소문자·공백 무시(사람이 손으로 옮겨 적으므로) */
export function normalizeInviteCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '');
}
