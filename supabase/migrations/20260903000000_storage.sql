-- Phase 5 트랙1 — Storage 버킷 (사진 Blob 실 바이트)
-- 근거: _workspace/50_plan-reviewer_spec_Phase5_TeamSync.md §3-6 (blobs 테이블 주석),
--       Q60(비차단, ASSUMPTIONS V7) — 렌더본+썸네일만 올린다. 원본은 기기에만 남긴다.
--
-- 경로 규칙: blobs/{teamId}/{projectId}/{key}  (key = 로컬 blobKey, uuid라 충돌 없음, S6)
-- ⚠️ idempotent — 재실행해도 안전하다.

insert into storage.buckets (id, name, public)
values ('blobs', 'blobs', false)
on conflict (id) do nothing;

-- RLS — records/blobs 테이블과 같은 규칙: 내 팀({teamId})이 첫 경로 조각일 때만 접근 가능
-- storage.foldername(name) 은 경로를 '/'로 나눈 배열을 준다 — [1]이 teamId (1-based index)
drop policy if exists blobs_storage_select on storage.objects;
create policy blobs_storage_select on storage.objects for select
  using (bucket_id = 'blobs' and (storage.foldername(name))[1] = public.my_team_id()::text);

drop policy if exists blobs_storage_insert on storage.objects;
create policy blobs_storage_insert on storage.objects for insert
  with check (bucket_id = 'blobs' and (storage.foldername(name))[1] = public.my_team_id()::text);

-- 재업로드(자르기·주석 재합성 등)로 같은 key를 덮어쓸 수 있어야 한다
drop policy if exists blobs_storage_update on storage.objects;
create policy blobs_storage_update on storage.objects for update
  using (bucket_id = 'blobs' and (storage.foldername(name))[1] = public.my_team_id()::text);
