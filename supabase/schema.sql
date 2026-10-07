-- Optional two-person cloud backend. Run once in a fresh Supabase SQL editor.
begin;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.library_members (
  slot smallint primary key check (slot between 1 and 2),
  email text not null unique check (email = lower(trim(email)) and position('@' in email) > 1)
);
revoke all on private.library_members from public, anon, authenticated;

-- Uses verified Auth data, never user-editable profile metadata, for authorization.
create function public.is_library_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users u
    join private.library_members m on m.email = lower(u.email)
    where u.id = auth.uid() and u.email_confirmed_at is not null
      and exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'google'
        and lower(i.identity_data->>'email') = m.email
        and i.identity_data->>'email_verified' = 'true')
  );
$$;
revoke all on function public.is_library_member() from public, anon;
grant execute on function public.is_library_member() to authenticated;

create function private.valid_tags(tags text[]) returns boolean
language sql immutable set search_path = '' as $$
  select cardinality(tags) <= 30 and not exists (
    select 1 from unnest(tags) tag where tag is null or length(trim(tag)) not between 1 and 60
  );
$$;

create table public.artworks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 200),
  url text not null check (length(url) <= 4096 and url ~ '^https?://[^[:space:]]+'),
  creator text not null default '' check (length(creator) <= 200),
  kind text not null check (kind in ('illustration', 'video', 'photo', 'design')),
  tags text[] not null default '{}' check (private.valid_tags(tags)),
  description text not null default '' check (length(description) <= 5000),
  notes text not null default '' check (length(notes) <= 20000),
  collection text not null default '' check (length(collection) <= 100),
  favorite boolean not null default false,
  status text not null default 'inbox' check (status in ('inbox', 'reviewing', 'reviewed')),
  image_url text check (image_url is null or (length(image_url) <= 4096 and image_url ~ '^https?://[^[:space:]]+')),
  position_x double precision not null default 0 check (position_x between -100000 and 100000),
  position_y double precision not null default 0 check (position_y between -100000 and 100000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  revision integer not null default 1 check (revision > 0)
);
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  artwork_id uuid not null references public.artworks(id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 5000),
  author_id uuid not null default auth.uid() references auth.users(id),
  author_name text not null default '',
  created_at timestamptz not null default now()
);
create index comments_artwork_id on public.comments(artwork_id);
create index artworks_created_at on public.artworks(created_at desc);

create function private.stamp_artwork() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid(); new.created_at := now(); new.revision := 1;
  else
    new.id := old.id; new.created_by := old.created_by; new.created_at := old.created_at;
    new.revision := old.revision + 1;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger stamp_artwork before insert or update on public.artworks for each row execute function private.stamp_artwork();

create function private.stamp_comment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.author_id := auth.uid(); new.created_at := now();
  select left(coalesce(nullif(u.raw_user_meta_data->>'full_name',''), split_part(u.email,'@',1), 'メンバー'), 200)
    into new.author_name from auth.users u where u.id = auth.uid();
  return new;
end;
$$;
create trigger stamp_comment before insert on public.comments for each row execute function private.stamp_comment();

alter table public.artworks enable row level security;
alter table public.comments enable row level security;
create policy artworks_read on public.artworks for select to authenticated using ((select public.is_library_member()));
create policy artworks_insert on public.artworks for insert to authenticated with check ((select public.is_library_member()) and created_by = (select auth.uid()));
create policy artworks_update on public.artworks for update to authenticated using ((select public.is_library_member())) with check ((select public.is_library_member()));
create policy artworks_delete on public.artworks for delete to authenticated using ((select public.is_library_member()));
create policy comments_read on public.comments for select to authenticated using ((select public.is_library_member()));
create policy comments_insert on public.comments for insert to authenticated with check ((select public.is_library_member()) and author_id = (select auth.uid()));
create policy comments_delete on public.comments for delete to authenticated using ((select public.is_library_member()) and author_id = (select auth.uid()));

revoke all on public.artworks, public.comments from public, anon, authenticated;
grant select, delete on public.artworks to authenticated;
grant insert (id,title,url,creator,kind,tags,description,notes,collection,favorite,status,image_url,position_x,position_y) on public.artworks to authenticated;
grant update (title,url,creator,kind,tags,description,notes,collection,favorite,status,image_url,position_x,position_y) on public.artworks to authenticated;
grant select, delete on public.comments to authenticated;
grant insert (id,artwork_id,body) on public.comments to authenticated;

-- One transaction; copies are appended, existing rows are never overwritten.
create function public.import_library(artwork_rows jsonb, comment_rows jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
declare item jsonb;
begin
  if not public.is_library_member() then raise exception 'Not a library member'; end if;
  if jsonb_typeof(artwork_rows) <> 'array' or jsonb_typeof(comment_rows) <> 'array'
    or jsonb_array_length(artwork_rows) > 5000 or jsonb_array_length(comment_rows) > 20000 then
    raise exception 'Invalid import';
  end if;
  for item in select value from jsonb_array_elements(artwork_rows) loop
    insert into public.artworks (id,title,url,creator,kind,tags,description,notes,collection,favorite,status,image_url,position_x,position_y)
      values ((item->>'id')::uuid,item->>'title',item->>'url',item->>'creator',item->>'kind',
        array(select jsonb_array_elements_text(item->'tags')), item->>'description',item->>'notes',item->>'collection',
        (item->>'favorite')::boolean,item->>'status',item->>'image_url',(item->>'position_x')::double precision,(item->>'position_y')::double precision);
  end loop;
  for item in select value from jsonb_array_elements(comment_rows) loop
    insert into public.comments (id,artwork_id,body) values ((item->>'id')::uuid,(item->>'artwork_id')::uuid,item->>'body');
  end loop;
end;
$$;
revoke all on function public.import_library(jsonb,jsonb) from public, anon;
grant execute on function public.import_library(jsonb,jsonb) to authenticated;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='artworks') then
    alter publication supabase_realtime add table public.artworks;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='comments') then
    alter publication supabase_realtime add table public.comments;
  end if;
end $$;
commit;

-- Admin SQL only: replace with the two exact Google email addresses.
-- Do NOT commit real addresses to a public repository.
-- insert into private.library_members(slot,email) values
--   (1,'you@example.com'), (2,'friend@example.com');
