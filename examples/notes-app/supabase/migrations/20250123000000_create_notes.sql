-- Notes table for MCP demo
create table notes (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  content text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable RLS
alter table notes enable row level security;

-- Explicit policies for each operation
-- Note: wrapping auth.uid() in (select ...) ensures it's called once per query, not per row
create policy "Users can select their own notes"
  on notes for select
  using ((select auth.uid()) = user_id);

create policy "Users can insert their own notes"
  on notes for insert
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own notes"
  on notes for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own notes"
  on notes for delete
  using ((select auth.uid()) = user_id);

-- Index on user_id for RLS policy performance and FK lookups
create index notes_user_id_idx on notes(user_id);

-- Grant table access to authenticated users (RLS policies handle row-level filtering)
grant select, insert, update, delete on notes to authenticated;
