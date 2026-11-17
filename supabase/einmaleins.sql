-- Einmaleins: Klassen, Kinder-Logins und Übungsstand
-- In Supabase unter «SQL Editor» einfügen und auf «Run» klicken. Mehrmals ausführen schadet nicht.
-- Läuft im selben Projekt wie Vokaboom: eigene Tabellen (einmaleins_…), an Vokaboom wird nichts geändert.
-- Klassen lassen sich mit Vokaboom verbinden (in beide Richtungen): Die Kinder haben dann in beiden Tools
-- dasselbe Login (ein Kärtchen). Dafür legt Einmaleins bei verbundenen Klassen auch Kinder in Vokaboom an.
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

-- Verknüpfung mit Vokaboom: übernommene Klassen und Kinder (gleicher Benutzername, gleiche Bilder wie in Vokaboom)
alter table public.einmaleins_classes add column if not exists vokaboom_class uuid;
alter table public.einmaleins_students add column if not exists vokaboom_id uuid;
create unique index if not exists einmaleins_students_vokaboom on public.einmaleins_students (vokaboom_id) where vokaboom_id is not null;

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

-- Neuer, noch nie vergebener Benutzername (z. B. baum34). Meidet auch die Benutzernamen von Vokaboom,
-- damit Vokaboom-Kinder später mit ihrem eigenen Benutzernamen übernommen werden können.
create or replace function public.einmaleins_new_username()
returns text
language plpgsql set search_path = '' as $$
declare
  words text[] := array['baum', 'sonne', 'mond', 'stern', 'fisch', 'katze', 'hund', 'apfel', 'blume', 'wolke', 'pilz', 'vogel', 'fuchs', 'igel', 'frosch', 'biene', 'ball', 'boot', 'haus', 'herz', 'drache', 'pferd', 'maus', 'eule', 'wal', 'hase', 'kuh', 'panda', 'tiger', 'zebra', 'rakete', 'zug', 'auto', 'kirsche', 'birne', 'banane', 'keks', 'pizza', 'torte', 'krone', 'schiff', 'blitz', 'feuer', 'berg', 'insel', 'muschel', 'schnecke', 'raupe', 'kaktus', 'palme', 'ballon', 'gitarre', 'trommel', 'buch', 'stift', 'uhr', 'schuh', 'hut'];
  u text; tries integer := 0; taken boolean;
  vb boolean := to_regclass('public.vokaboom_usernames') is not null;
begin
  loop
    tries := tries + 1;
    u := words[1 + floor(random() * array_length(words, 1))::integer]
      || (case when tries <= 40 then 10 + floor(random() * 90)::integer
               when tries <= 120 then 100 + floor(random() * 900)::integer
               else 1000 + floor(random() * 9000)::integer end)::text;
    taken := exists (select 1 from public.einmaleins_usernames x where x.username = u)
      or exists (select 1 from public.einmaleins_students x where x.username = u);
    if not taken and vb then
      execute 'select exists (select 1 from public.vokaboom_usernames where username = $1)' into taken using u;
    end if;
    exit when not taken;
    if tries > 400 then raise exception 'no_username'; end if;
  end loop;
  return u;
end;
$$;

-- ---------------------------------------------------------------------------
-- Verbindung mit Vokaboom (in beide Richtungen)
-- Eine Einmaleins-Klasse kann mit einer Vokaboom-Klasse verbunden sein. Dann hat jedes Kind in beiden Tools
-- denselben Benutzernamen und dieselben Bilder (ein Kärtchen). Neue Kinder auf der einen Seite kommen
-- automatisch auf die andere. Löscht die Lehrperson ein Kind nur in Einmaleins, steht es in settings.vbSkip
-- und wird nicht automatisch wieder geholt.

-- Hilfe: Einmaleins-Klasse, die mit dieser Vokaboom-Klasse verbunden ist (und dieses Kind nicht auslässt)
create or replace function public.einmaleins_linked_class(p_vclass uuid, p_vid uuid)
returns uuid
language plpgsql stable set search_path = '' as $$
begin
  return (select c.id from public.einmaleins_classes c
    join public.vokaboom_classes vc on vc.id = c.vokaboom_class and vc.teacher_id = c.teacher_id
    where c.vokaboom_class = p_vclass and not coalesce(c.settings -> 'vbSkip', '[]'::jsonb) ? p_vid::text
    order by c.created_at limit 1);
end;
$$;

-- Hilfe: Ein Vokaboom-Kind in eine Einmaleins-Klasse holen (gleicher Benutzername, gleiche Bilder).
-- Gibt es dort schon ein nicht verbundenes Kind mit gleichem Vornamen und gleichem Anfangsbuchstaben, wird dieses
-- verbunden (es bekommt das Vokaboom-Login, sein Übungsstand bleibt).
-- Liefert: linked (war schon verbunden), matched, same, newlogin (Benutzername hier vergeben), full, gone
create or replace function public.einmaleins_take_vokaboom_kid(p_class uuid, p_vid uuid)
returns text
language plpgsql set search_path = '' as $$
declare
  v record; e public.einmaleins_students; u text;
begin
  select s.id, s.first_name, s.last_initial, s.username, s.pics into v from public.vokaboom_students s where s.id = p_vid;
  if not found then return 'gone'; end if;
  if exists (select 1 from public.einmaleins_students x where x.vokaboom_id = p_vid) then return 'linked'; end if;
  select * into e from public.einmaleins_students x
    where x.class_id = p_class and x.vokaboom_id is null
      and lower(x.first_name) = lower(v.first_name) and x.last_initial = v.last_initial
    order by x.created_at limit 1;
  if found then
    u := case when exists (select 1 from public.einmaleins_students x where x.username = v.username and x.id <> e.id) then e.username else v.username end;
    insert into public.einmaleins_usernames (username) values (u) on conflict do nothing;
    update public.einmaleins_students x set vokaboom_id = v.id, username = u, pics = v.pics, first_name = v.first_name where x.id = e.id;
    return 'matched';
  end if;
  if (select count(*) from public.einmaleins_students x where x.class_id = p_class) >= 60 then return 'full'; end if;
  u := v.username;
  if exists (select 1 from public.einmaleins_students x where x.username = u) then u := public.einmaleins_new_username(); end if;
  insert into public.einmaleins_usernames (username) values (u) on conflict do nothing;
  insert into public.einmaleins_students (class_id, first_name, last_initial, username, pics, vokaboom_id)
    values (p_class, v.first_name, v.last_initial, u, v.pics, v.id);
  return case when u = v.username then 'same' else 'newlogin' end;
end;
$$;

-- Hilfe: Ein Einmaleins-Kind in der verbundenen Vokaboom-Klasse anlegen (gleicher Benutzername, gleiche Bilder).
-- Gibt es dort schon ein nicht verbundenes Kind mit gleichem Namen, werden die beiden verbunden.
-- Liefert: linked, pushed, matched, conflict (Benutzername in Vokaboom vergeben), full, gone
create or replace function public.einmaleins_push_kid(p_eid uuid, p_vclass uuid)
returns text
language plpgsql set search_path = '' as $$
declare
  e public.einmaleins_students; vid uuid;
begin
  select * into e from public.einmaleins_students x where x.id = p_eid;
  if not found or e.vokaboom_id is not null then return 'linked'; end if;
  if not exists (select 1 from public.vokaboom_classes c where c.id = p_vclass) then return 'gone'; end if;
  select s.id into vid from public.vokaboom_students s
    where s.class_id = p_vclass and lower(s.first_name) = lower(e.first_name) and s.last_initial = e.last_initial
      and not exists (select 1 from public.einmaleins_students x where x.vokaboom_id = s.id)
    order by s.created_at limit 1;
  if vid is not null then
    perform public.einmaleins_take_vokaboom_kid(e.class_id, vid);
    return 'matched';
  end if;
  if (select count(*) from public.vokaboom_students s where s.class_id = p_vclass) >= 60 then return 'full'; end if;
  if exists (select 1 from public.vokaboom_students s where s.username = e.username) then return 'conflict'; end if;
  insert into public.vokaboom_usernames (username) values (e.username) on conflict do nothing;
  insert into public.vokaboom_students (class_id, first_name, last_initial, username, pics)
    values (p_vclass, e.first_name, e.last_initial, e.username, e.pics) returning id into vid;
  update public.einmaleins_students set vokaboom_id = vid where id = e.id;
  return 'pushed';
end;
$$;

-- Lehrperson: Kinder hinzufügen. Erzeugt eindeutige Benutzernamen und ein Bilder-Passwort.
-- Ist die Klasse mit Vokaboom verbunden, bekommt das Kind dort dasselbe Login.
-- p_students: [{"first": "Lena", "initial": "M"}, …]
create or replace function public.einmaleins_add_students(p_class uuid, p_students jsonb)
returns setof public.einmaleins_students
language plpgsql security definer set search_path = '' as $$
declare
  s jsonb; u text; p text; fname text; nid uuid; vcls uuid;
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
  select c.vokaboom_class into vcls from public.einmaleins_classes c where c.id = p_class;
  if to_regclass('public.vokaboom_students') is null then vcls := null; end if;
  for s in select * from jsonb_array_elements(p_students) loop
    fname := left(btrim(coalesce(s->>'first', '')), 40);
    continue when fname = '';
    u := public.einmaleins_new_username();
    insert into public.einmaleins_usernames (username) values (u);
    select string_agg(x::text, ',' order by r) into p
      from (select x, random() as r from generate_series(0, 11) as x order by random() limit 3) t;
    insert into public.einmaleins_students (class_id, first_name, last_initial, username, pics)
      values (p_class, fname, upper(left(btrim(coalesce(s->>'initial', '')), 1)), u, p)
      returning id into nid;
    if vcls is not null then perform public.einmaleins_push_kid(nid, vcls); end if;
    return query select * from public.einmaleins_students x where x.id = nid;
  end loop;
end;
$$;

-- Lehrperson: Einmaleins-Klasse mit einer Vokaboom-Klasse verbinden und abgleichen (beide Richtungen).
-- p_force: auch Kinder holen, die vorher „nur in Einmaleins“ gelöscht wurden.
create or replace function public.einmaleins_sync_vokaboom(p_class uuid, p_vclass uuid, p_force boolean default false)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v record; e record; r text; skip jsonb;
  added integer := 0; same integer := 0; newlogin integer := 0; matched integer := 0; updated integer := 0;
  left_out integer := 0; full_e integer := 0; pushed integer := 0; conflicts integer := 0; full_v integer := 0;
begin
  if not exists (select 1 from public.einmaleins_classes c where c.id = p_class and c.teacher_id = auth.uid()) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if to_regclass('public.vokaboom_classes') is null then
    raise exception 'no_vokaboom' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.vokaboom_classes c where c.id = p_vclass and c.teacher_id = auth.uid()) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select case when p_force then '[]'::jsonb else coalesce(c.settings -> 'vbSkip', '[]'::jsonb) end into skip
    from public.einmaleins_classes c where c.id = p_class;
  update public.einmaleins_classes c set vokaboom_class = p_vclass,
    settings = case when p_force then c.settings - 'vbSkip' else c.settings end
    where c.id = p_class;
  -- Vokaboom → Einmaleins
  for v in select s.id, s.first_name, s.last_initial, s.pics from public.vokaboom_students s where s.class_id = p_vclass order by s.first_name loop
    if exists (select 1 from public.einmaleins_students x where x.vokaboom_id = v.id) then
      update public.einmaleins_students x set first_name = v.first_name, last_initial = v.last_initial, pics = v.pics
        where x.vokaboom_id = v.id and (x.first_name, x.last_initial, x.pics) is distinct from (v.first_name, v.last_initial, v.pics);
      if found then updated := updated + 1; end if;
      continue;
    end if;
    if skip ? v.id::text then left_out := left_out + 1; continue; end if;
    r := public.einmaleins_take_vokaboom_kid(p_class, v.id);
    if r in ('same', 'newlogin') then added := added + 1; end if;
    if r = 'same' then same := same + 1; elsif r = 'newlogin' then newlogin := newlogin + 1;
    elsif r = 'matched' then matched := matched + 1; elsif r = 'full' then full_e := full_e + 1; end if;
  end loop;
  -- Einmaleins → Vokaboom
  for e in select x.id from public.einmaleins_students x where x.class_id = p_class and x.vokaboom_id is null order by x.first_name loop
    r := public.einmaleins_push_kid(e.id, p_vclass);
    if r = 'pushed' then pushed := pushed + 1; elsif r = 'matched' then matched := matched + 1;
    elsif r = 'conflict' then conflicts := conflicts + 1; elsif r = 'full' then full_v := full_v + 1; end if;
  end loop;
  return jsonb_build_object('added', added, 'same', same, 'newlogin', newlogin, 'matched', matched, 'updated', updated,
    'left_out', left_out, 'skipped', full_e, 'pushed', pushed, 'conflicts', conflicts, 'full_v', full_v);
end;
$$;

-- Ältere Version (nur von Vokaboom nach Einmaleins); ruft jetzt den Abgleich in beide Richtungen auf
create or replace function public.einmaleins_import_vokaboom(p_class uuid, p_vclass uuid)
returns jsonb
language sql security definer set search_path = '' as $$
  select public.einmaleins_sync_vokaboom(p_class, p_vclass, true);
$$;

-- Kind: anmelden. Liefert einen Anmelde-Schlüssel oder null (falsch). Nach 8 Fehlversuchen 5 Minuten Pause.
-- Kinder aus einer verbundenen Vokaboom-Klasse, die hier noch fehlen, werden dabei übernommen.
create or replace function public.einmaleins_student_login(p_username text, p_pics text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  st public.einmaleins_students; f public.einmaleins_login_fails; tok uuid; vp text; vk record; ecls uuid;
begin
  p_username := lower(btrim(coalesce(p_username, '')));
  select * into f from public.einmaleins_login_fails x where x.username = p_username;
  if found and f.fails >= 8 and f.last_at > now() - interval '5 minutes' then
    raise exception 'too_many_attempts' using errcode = 'P0001';
  end if;
  select * into st from public.einmaleins_students x where x.username = p_username;
  if st.id is null and to_regclass('public.vokaboom_students') is not null then
    select s.id, s.class_id into vk from public.vokaboom_students s where s.username = p_username and s.pics = p_pics;
    if vk.id is not null then
      ecls := public.einmaleins_linked_class(vk.class_id, vk.id);
      if ecls is not null then
        perform public.einmaleins_take_vokaboom_kid(ecls, vk.id);
        select * into st from public.einmaleins_students x where x.vokaboom_id = vk.id;
      end if;
    end if;
  end if;
  -- Mit Vokaboom verbunden: Es gelten die aktuellen Bilder des Vokaboom-Kärtchens
  if st.id is not null and st.vokaboom_id is not null then
    select coalesce((select s.pics from public.vokaboom_students s where s.id = st.vokaboom_id), st.pics) into vp;
    st.pics := vp;
  end if;
  if st.id is null or st.pics is distinct from p_pics then
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

-- Kind: mit dem Anmelde-Schlüssel des einen Tools im anderen anmelden (gemeinsames Anmelden auf demselben
-- Gerät oder Knopf „zum anderen Tool“). p_from: 'vokaboom' oder 'einmaleins'.
-- Liefert {token, username} für das andere Tool oder null (Kind dort nicht vorhanden).
create or replace function public.einmaleins_kid_bridge(p_from text, p_token uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  vid uuid; sid uuid; ecls uuid; vcls uuid; est public.einmaleins_students; tok uuid; uname text;
begin
  if to_regclass('public.vokaboom_sessions') is null then return null; end if;
  if p_from = 'vokaboom' then
    select x.student_id into vid from public.vokaboom_sessions x where x.token = p_token;
    if vid is null then return null; end if;
    update public.vokaboom_sessions set last_seen = now() where token = p_token;
    select * into est from public.einmaleins_students e where e.vokaboom_id = vid;
    if est.id is null then
      select s.class_id into vcls from public.vokaboom_students s where s.id = vid;
      ecls := public.einmaleins_linked_class(vcls, vid);
      if ecls is null then return null; end if;
      perform public.einmaleins_take_vokaboom_kid(ecls, vid);
      select * into est from public.einmaleins_students e where e.vokaboom_id = vid;
      if est.id is null then return null; end if;
    end if;
    insert into public.einmaleins_sessions (student_id) values (est.id) returning token into tok;
    return jsonb_build_object('token', tok, 'username', est.username);
  elsif p_from = 'einmaleins' then
    select x.student_id into sid from public.einmaleins_sessions x where x.token = p_token;
    if sid is null then return null; end if;
    update public.einmaleins_sessions set last_seen = now() where token = p_token;
    select e.vokaboom_id into vid from public.einmaleins_students e where e.id = sid;
    select s.username into uname from public.vokaboom_students s where s.id = vid;
    if uname is null then return null; end if;
    insert into public.vokaboom_sessions (student_id) values (vid) returning token into tok;
    return jsonb_build_object('token', tok, 'username', uname);
  end if;
  return null;
end;
$$;

-- Kind: Gibt es mich auch im anderen Tool? (für den Knopf „zum anderen Tool“)
create or replace function public.einmaleins_kid_linked(p_from text, p_token uuid)
returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  vid uuid; sid uuid; vcls uuid;
begin
  if to_regclass('public.vokaboom_sessions') is null then return false; end if;
  if p_from = 'vokaboom' then
    select x.student_id into vid from public.vokaboom_sessions x where x.token = p_token;
    if vid is null then return false; end if;
    if exists (select 1 from public.einmaleins_students e where e.vokaboom_id = vid) then return true; end if;
    select s.class_id into vcls from public.vokaboom_students s where s.id = vid;
    return public.einmaleins_linked_class(vcls, vid) is not null;
  elsif p_from = 'einmaleins' then
    select x.student_id into sid from public.einmaleins_sessions x where x.token = p_token;
    if sid is null then return false; end if;
    select e.vokaboom_id into vid from public.einmaleins_students e where e.id = sid;
    return vid is not null and exists (select 1 from public.vokaboom_students s where s.id = vid);
  end if;
  return false;
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
    'student', jsonb_build_object('first', st.first_name, 'initial', st.last_initial, 'username', st.username, 'vokaboom', st.vokaboom_id is not null),
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

revoke execute on function public.einmaleins_new_username(), public.einmaleins_linked_class(uuid, uuid),
  public.einmaleins_take_vokaboom_kid(uuid, uuid), public.einmaleins_push_kid(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.einmaleins_add_students(uuid, jsonb), public.einmaleins_import_vokaboom(uuid, uuid),
  public.einmaleins_sync_vokaboom(uuid, uuid, boolean) from public, anon;
grant execute on function public.einmaleins_add_students(uuid, jsonb), public.einmaleins_import_vokaboom(uuid, uuid),
  public.einmaleins_sync_vokaboom(uuid, uuid, boolean) to authenticated;
revoke execute on function public.einmaleins_student_login(text, text), public.einmaleins_student_data(uuid),
  public.einmaleins_student_save(uuid, jsonb), public.einmaleins_student_logout(uuid),
  public.einmaleins_kid_bridge(text, uuid), public.einmaleins_kid_linked(text, uuid) from public;
grant execute on function public.einmaleins_student_login(text, text), public.einmaleins_student_data(uuid),
  public.einmaleins_student_save(uuid, jsonb), public.einmaleins_student_logout(uuid),
  public.einmaleins_kid_bridge(text, uuid), public.einmaleins_kid_linked(text, uuid) to anon, authenticated;
