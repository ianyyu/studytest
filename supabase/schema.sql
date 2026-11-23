-- Study quiz database. Paste this whole file into Supabase → SQL Editor → Run.
-- Safe to re-run.

-- ── Tables ──────────────────────────────────────────────────────────────
create table if not exists public.participants (
  id           bigint generated always as identity primary key,  -- the test taker's number
  token        uuid not null default gen_random_uuid() unique,    -- secret the browser uses to save answers
  started_at   timestamptz not null default now(),
  completed_at timestamptz,
  last_page    int not null default 0,
  user_agent   text
);

create table if not exists public.responses (
  participant_id    bigint not null references public.participants(id) on delete cascade,
  page              int  not null check (page between 1 and 8),
  question          int  not null check (question between 1 and 4),
  choice            text not null check (choice in ('A','B','C','D')),
  seconds_to_answer numeric,   -- seconds from page open to their final pick
  page_seconds      numeric,   -- seconds spent on the whole page
  saved_at          timestamptz not null default now(),
  primary key (participant_id, page, question)
);

create table if not exists public.answer_key (
  page     int  not null,
  question int  not null,
  correct  text not null check (correct in ('A','B','C','D')),
  primary key (page, question)
);

-- Emails allowed into admin.html (add yours after creating the user).
create table if not exists public.admins (
  email text primary key
);

-- ── Security: lock every table; only admins can read ───────────────────
alter table public.participants enable row level security;
alter table public.responses    enable row level security;
alter table public.answer_key   enable row level security;
alter table public.admins       enable row level security;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where lower(email) = lower(auth.jwt() ->> 'email'));
$$;

drop policy if exists "admin read participants" on public.participants;
create policy "admin read participants" on public.participants for select to authenticated using (public.is_admin());
drop policy if exists "admin delete participants" on public.participants;
create policy "admin delete participants" on public.participants for delete to authenticated using (public.is_admin());
drop policy if exists "admin read responses" on public.responses;
create policy "admin read responses" on public.responses for select to authenticated using (public.is_admin());
drop policy if exists "admin read key" on public.answer_key;
create policy "admin read key" on public.answer_key for select to authenticated using (public.is_admin());

-- ── Functions the public quiz page calls (the only write path) ──────────
create or replace function public.start_quiz(p_user_agent text default null)
returns table (participant_number bigint, participant_token uuid)
language plpgsql security definer set search_path = public as $$
begin
  return query
    insert into public.participants (user_agent) values (left(p_user_agent, 300))
    returning participants.id, participants.token;
end $$;

create or replace function public.save_page(p_token uuid, p_page int, p_answers jsonb, p_page_seconds numeric)
returns void
language plpgsql security definer set search_path = public as $$
declare
  pid bigint;
  a   jsonb;
begin
  select id into pid from public.participants where token = p_token and completed_at is null;
  if pid is null then raise exception 'Session not found or already finished'; end if;

  for a in select * from jsonb_array_elements(p_answers) loop
    insert into public.responses (participant_id, page, question, choice, seconds_to_answer, page_seconds)
    values (pid, p_page, (a->>'question')::int, a->>'choice', (a->>'seconds')::numeric, p_page_seconds)
    on conflict (participant_id, page, question) do update
      set choice = excluded.choice,
          seconds_to_answer = excluded.seconds_to_answer,
          page_seconds = excluded.page_seconds,
          saved_at = now();
  end loop;

  update public.participants set last_page = greatest(last_page, p_page) where id = pid;
end $$;

create or replace function public.finish_quiz(p_token uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.participants set completed_at = now()
  where token = p_token and completed_at is null;
end $$;

revoke all on function public.start_quiz(text)                      from public;
revoke all on function public.save_page(uuid, int, jsonb, numeric)  from public;
revoke all on function public.finish_quiz(uuid)                     from public;
grant execute on function public.start_quiz(text)                     to anon, authenticated;
grant execute on function public.save_page(uuid, int, jsonb, numeric) to anon, authenticated;
grant execute on function public.finish_quiz(uuid)                    to anon, authenticated;
