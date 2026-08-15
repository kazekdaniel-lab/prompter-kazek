-- Prompter - baza skryptów w Supabase.
-- Wklej całość do SQL Editora w panelu Supabase i uruchom (Run).
-- Dostęp mają wyłącznie adresy z listy w funkcji tp_allowed() - obydwa widzą tę samą bibliotekę.

create table if not exists public.scripts (
  id          text primary key,
  name        text    not null default '',
  body        text    not null default '',
  pos         integer not null default 0,
  updated_at  bigint  not null default 0,   -- czas edycji w ms (do scalania zmian)
  deleted     boolean not null default false
);

alter table public.scripts enable row level security;

create or replace function public.tp_allowed()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) in (
    'kaziu1804@gmail.com',
    'kazekdaniel@gmail.com'
  );
$$;

drop policy if exists tp_all on public.scripts;
create policy tp_all on public.scripts
  for all
  to authenticated
  using (public.tp_allowed())
  with check (public.tp_allowed());

-- Szybki test po zalogowaniu w apce: powinno zwrócić true dla dozwolonego konta.
-- select public.tp_allowed();
