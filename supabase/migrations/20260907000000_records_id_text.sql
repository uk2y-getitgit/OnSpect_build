-- 2026-09-07 — records.id 를 uuid → text 로 완화 (DECISIONS D44 · B안)
--
-- ⚠️⚠️ **사용자가 Supabase 대시보드 → SQL Editor 에 직접 붙여넣어 실행해야 적용된다.**
--        (기존 라운드와 같은 방식 — 이 저장소에는 supabase CLI 인증이 없다)
--
-- ## 왜 필요한가
--
-- 캔버스 표기 id 를 만들던 `apps/web/src/store.ts::runInput().makeId` 가 오랫동안
-- `n10-29up` 같은 **UUID 가 아닌** 문자열을 만들었다. 생성기 자체는 2026-09-07 에
-- `newId()`(crypto.randomUUID)로 고쳤지만, **이미 각 기기의 IndexedDB 에 저장된**
-- 결함·마크·라벨·메모는 옛 id 를 그대로 들고 있다. 그 레코드를 push 하면 서버가
--
--     invalid input syntax for type uuid  (SQLSTATE 22P02)
--
-- 로 거절하고, push 는 chunk 단위라 **정상 레코드까지 함께 실패**한다.
-- 클라이언트에서 옛 id 를 재발급(remap)하는 안(A안)은 결함↔사진↔마크 참조를 전부
-- 다시 잇고 삭제 로그·서버 기록까지 손봐야 해서 기각됐다. 서버가 문자열을 그대로
-- 받아 주는 쪽(B안)이 데이터를 하나도 건드리지 않는다.
--
-- ## 안전한가
--
-- · uuid → text 는 **값 손실이 없는 넓히기**다. 이미 들어간 진짜 uuid 행은
--   정규 소문자 표기(`8-4-4-4-12`) 문자열로 그대로 남는다.
-- · PK `(project_id, kind, id)` 의 인덱스는 ALTER TYPE 이 자동으로 다시 만든다.
-- · `records.id` 를 참조하는 외래키는 없다. `records_pull_cursor_idx` 는
--   `(project_id, server_seq)` 라 이 컬럼과 무관하다.
-- · `project_id` 는 **uuid 그대로 둔다** — 용역 id 는 언제나 `newId()` 가 만든 uuid 다.
-- · 클라이언트에는 "id 가 uuid 형식이어야 한다"고 검사하는 코드가 없다(확인 완료).
--
-- ## 되돌리려면
--
--   alter table public.records alter column id type uuid using id::uuid;
--
-- 단, 비-UUID 값이 한 행이라도 들어와 있으면 실패한다. 그때는 그 행을 지우고 실행한다.
--
-- ⚠️ 몇 번을 다시 실행해도 안전하다(idempotent) — 이미 text 면 아무것도 하지 않는다.

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'records'
      and column_name = 'id'
      and data_type = 'uuid'
  ) then
    alter table public.records alter column id type text using id::text;
  end if;
end
$$;
