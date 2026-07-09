-- Run this in the Supabase SQL Editor for the shared WBL/Field Experience project
-- (https://bsgrkpykysvqcdqikcym.supabase.co) to add partner testimonial support.

create table if not exists testimonials (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  quote text not null,
  author_name text,
  subtitle text,
  photo_url text,
  is_active boolean default true
);

alter table testimonials enable row level security;

create policy "allow_all" on testimonials
  for all
  using (true)
  with check (true);
