-- Einmaleins: Klassen, Kinder-Logins und Übungsstand
-- In Supabase unter «SQL Editor» einfügen und auf «Run» klicken. Mehrmals ausführen schadet nicht.
-- Läuft im selben Projekt wie Vokaboom: eigene Tabellen (einmaleins_…), an Vokaboom wird nichts geändert.
--
-- Die Lehrperson legt Klassen an, trägt Vorname + ersten Buchstaben des Nachnamens ein und wählt die Reihen.
-- Kinder melden sich mit Benutzername (z. B. Baum34) und drei Bildern an – ohne E-Mail und ohne Supabase-Konto.
-- Alles, was Kinder tun, läuft über die Funktionen unten (security definer) und prüft dort den Anmelde-Schlüssel.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.einmaleins_classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  -- {"reihen": [2,5,10], "ops": {"mul": true, "div": true, "gap": false}, "choose": true}
  settings jsonb not null default '{}' check (jsonb_typeof(settings) = 'object' and octet_length(settings::text) <= 20000),
  created_at timestamptz not null default now()
);
create index if not exists einmaleins_classes_teacher on public.einmaleins_classes (teacher_id);

create table if not exists public.einmaleins_students (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.einmaleins_classes (id) on delete cascade,
  first_name text not null check (char_length(first_name) between 1 and 40),
  last_initial text not null default '' check (char_length(last_initial) <= 1),
  username text not null unique check (username ~ '^[a-z]+[0-9]{2,4}$'),
  pics text not null check (pics ~ '^([0-9]|1[01]),([0-9]|1[01]),([0-9]|1[01])$'),
  created_at timestamptz not null default now()
);
create index if not exists einmaleins_students_class on public.einmaleins_students (class_id);

-- Jeder Benutzername wird nur einmal vergeben, auch wenn das Kind später gelöscht wird
create table if not exists public.einmaleins_usernames (username text primary key);

create table if not exists public.einmaleins_sessions (
  token uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.einmaleins_students (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
create index if not exists einmaleins_sessions_student on public.einmaleins_sessions (student_id);

-- Übungsstand eines Kindes: welche Rechnungen wie oft, wie oft falsch, wie schnell, häufige falsche Antworten
create table if not exists public.einmaleins_progress (
  student_id uuid primary key references public.einmaleins_students (id) on delete cascade,
  data jsonb not null default '{}' check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 300000),
  updated_at timestamptz not null default now()
);

create table if not exists public.einmaleins_login_fails (
  username text primary key,
  fails integer not null default 0,
  last_at timestamptz not null default now()
);

-- Zugriffsregeln: Die Lehrperson sieht nur ihre eigenen Klassen, Kinder und deren Übungsstand.
alter table public.einmaleins_classes enable row level security;
alter table public.einmaleins_students enable row level security;
alter table public.einmaleins_usernames enable row level security;
alter table public.einmaleins_sessions enable row level security;
alter table public.einmaleins_progress enable row level security;
alter table public.einmaleins_login_fails enable row level security;

revoke all on public.einmaleins_classes, public.einmaleins_students, public.einmaleins_usernames,
  public.einmaleins_sessions, public.einmaleins_progress, public.einmaleins_login_fails from anon, authenticated;
grant select, insert, delete on public.einmaleins_classes to authenticated;
grant update (name, settings) on public.einmaleins_classes to authenticated;
grant select, delete on public.einmaleins_students to authenticated;
grant update (first_name, last_initial, pics) on public.einmaleins_students to authenticated;
grant select on public.einmaleins_progress to authenticated;

drop policy if exists "einmaleins klassen eigene" on public.einmaleins_classes;
create policy "einmaleins klassen eigene" on public.einmaleins_classes for all to authenticated
  using ((select auth.uid()) = teacher_id) with check ((select auth.uid()) = teacher_id);

drop policy if exists "einmaleins kinder lesen" on public.einmaleins_students;
drop policy if exists "einmaleins kinder ändern" on public.einmaleins_students;
drop policy if exists "einmaleins kinder löschen" on public.einmaleins_students;
create policy "einmaleins kinder lesen" on public.einmaleins_students for select to authenticated
  using (exists (select 1 from public.einmaleins_classes c where c.id = class_id and c.teacher_id = (select auth.uid())));
create policy "einmaleins kinder ändern" on public.einmaleins_students for update to authenticated
  using (exists (select 1 from public.einmaleins_classes c where c.id = class_id and c.teacher_id = (select auth.uid())))
  with check (exists (select 1 from public.einmaleins_classes c where c.id = class_id and c.teacher_id = (select auth.uid())));
create policy "einmaleins kinder löschen" on public.einmaleins_students for delete to authenticated
  using (exists (select 1 from public.einmaleins_classes c where c.id = class_id and c.teacher_id = (select auth.uid())));

drop policy if exists "einmaleins übungsstand lesen" on public.einmaleins_progress;
create policy "einmaleins übungsstand lesen" on public.einmaleins_progress for select to authenticated
  using (exists (select 1 from public.einmaleins_students s join public.einmaleins_classes c on c.id = s.class_id
    where s.id = student_id and c.teacher_id = (select auth.uid())));

-- Lehrperson: Kinder hinzufügen. Erzeugt eindeutige Benutzernamen und ein Bilder-Passwort.
-- p_students: [{"first": "Lena", "initial": "M"}, …]
create or replace function public.einmaleins_add_students(p_class uuid, p_students jsonb)
returns setof public.einmaleins_students
language plpgsql security definer set search_path = '' as $$
declare
  words text[] := array['baum', 'sonne', 'mond', 'stern', 'fisch', 'katze', 'hund', 'apfel', 'blume', 'wolke', 'pilz', 'vogel', 'fuchs', 'igel', 'frosch', 'biene', 'ball', 'boot', 'haus', 'herz', 'drache', 'pferd', 'maus', 'eule', 'wal', 'hase', 'kuh', 'panda', 'tiger', 'zebra', 'rakete', 'zug', 'auto', 'kirsche', 'birne', 'banane', 'keks', 'pizza', 'torte', 'krone', 'schiff', 'blitz', 'feuer', 'berg', 'insel', 'muschel', 'schnecke', 'raupe', 'kaktus', 'palme', 'ballon', 'gitarre', 'trommel', 'buch', 'stift', 'uhr', 'schuh', 'hut'];
  s jsonb; u text; tries integer; p text; fname text;
begin
  if not exists (select 1 from public.einmaleins_classes c where c.id = p_class and c.teacher_id = auth.uid()) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if jsonb_typeof(p_students) <> 'array' or jsonb_array_length(p_students) > 60 then
    raise exception 'too_many' using errcode = '22023';
  end if;
  if (select count(*) from public.einmaleins_students st where st.class_id = p_class) + jsonb_array_length(p_students) > 60 then
    raise exception 'class_full' using errcode = '22023';
  end if;
  for s in select * from jsonb_array_elements(p_students) loop
    fname := left(btrim(coalesce(s->>'first', '')), 40);
    continue when fname = '';
    tries := 0;
    loop
      tries := tries + 1;
      u := words[1 + floor(random() * array_length(words, 1))::integer]
        || (case when tries <= 40 then 10 + floor(random() * 90)::integer
                 when tries <= 120 then 100 + floor(random() * 900)::integer
                 else 1000 + floor(random() * 9000)::integer end)::text;
      exit when not exists (select 1 from public.einmaleins_usernames x where x.username = u);
      if tries > 400 then raise exception 'no_username'; end if;
    end loop;
    insert into public.einmaleins_usernames (username) values (u);
    select string_agg(x::text, ',' order by r) into p
      from (select x, random() as r from generate_series(0, 11) as x order by random() limit 3) t;
    return query insert into public.einmaleins_students (class_id, first_name, last_initial, username, pics)
      values (p_class, fname, upper(left(btrim(coalesce(s->>'initial', '')), 1)), u, p)
      returning *;
  end loop;
end;
$$;

-- Kind: anmelden. Liefert einen Anmelde-Schlüssel oder null (falsch). Nach 8 Fehlversuchen 5 Minuten Pause.
create or replace function public.einmaleins_student_login(p_username text, p_pics text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  st public.einmaleins_students; f public.einmaleins_login_fails; tok uuid;
begin
  p_username := lower(btrim(coalesce(p_username, '')));
  select * into f from public.einmaleins_login_fails x where x.username = p_username;
  if found and f.fails >= 8 and f.last_at > now() - interval '5 minutes' then
    raise exception 'too_many_attempts' using errcode = 'P0001';
  end if;
  select * into st from public.einmaleins_students x where x.username = p_username;
  if not found or st.pics is distinct from p_pics then
    insert into public.einmaleins_login_fails as lf (username, fails, last_at) values (p_username, 1, now())
      on conflict (username) do update set
        fails = case when lf.last_at < now() - interval '5 minutes' then 1 else lf.fails + 1 end,
        last_at = now();
    return null;
  end if;
  delete from public.einmaleins_login_fails x where x.username = p_username;
  delete from public.einmaleins_sessions x where x.student_id = st.id and x.last_seen < now() - interval '180 days';
  insert into public.einmaleins_sessions (student_id) values (st.id) returning token into tok;
  return jsonb_build_object('token', tok);
end;
$$;

-- Kind: Klasse (Name, Reihen) und eigenen Übungsstand holen
create or replace function public.einmaleins_student_data(p_token uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  st public.einmaleins_students; cl public.einmaleins_classes; pr jsonb;
begin
  select s.* into st from public.einmaleins_sessions x join public.einmaleins_students s on s.id = x.student_id where x.token = p_token;
  if not found then raise exception 'session_invalid' using errcode = 'P0001'; end if;
  update public.einmaleins_sessions set last_seen = now() where token = p_token;
  select * into cl from public.einmaleins_classes c where c.id = st.class_id;
  select p.data into pr from public.einmaleins_progress p where p.student_id = st.id;
  return jsonb_build_object(
    'student', jsonb_build_object('first', st.first_name, 'initial', st.last_initial, 'username', st.username),
    'class', jsonb_build_object('name', cl.name, 'settings', cl.settings),
    'progress', coalesce(pr, '{}'::jsonb)
  );
end;
$$;

-- Kind: Übungsstand speichern
create or replace function public.einmaleins_student_save(p_token uuid, p_data jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  sid uuid;
begin
  select x.student_id into sid from public.einmaleins_sessions x where x.token = p_token;
  if not found then raise exception 'session_invalid' using errcode = 'P0001'; end if;
  insert into public.einmaleins_progress as pr (student_id, data, updated_at) values (sid, p_data, now())
    on conflict (student_id) do update set data = excluded.data, updated_at = now();
  update public.einmaleins_sessions set last_seen = now() where token = p_token;
end;
$$;

-- Kind: abmelden
create or replace function public.einmaleins_student_logout(p_token uuid)
returns void
language sql security definer set search_path = '' as $$
  delete from public.einmaleins_sessions where token = p_token;
$$;

revoke execute on function public.einmaleins_add_students(uuid, jsonb) from public, anon;
grant execute on function public.einmaleins_add_students(uuid, jsonb) to authenticated;
revoke execute on function public.einmaleins_student_login(text, text), public.einmaleins_student_data(uuid),
  public.einmaleins_student_save(uuid, jsonb), public.einmaleins_student_logout(uuid) from public;
grant execute on function public.einmaleins_student_login(text, text), public.einmaleins_student_data(uuid),
  public.einmaleins_student_save(uuid, jsonb), public.einmaleins_student_logout(uuid) to anon, authenticated;
