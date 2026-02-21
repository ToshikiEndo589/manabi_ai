-- Create a table to store deletion reasons anonymously
create table if not exists deletion_reasons (
  id uuid primary key default gen_random_uuid(),
  reason text not null,
  created_at timestamptz default now()
);

-- Enable RLS
alter table deletion_reasons enable row level security;

-- Allow anyone (even unauthenticated, though we'll call it before delete) to insert
-- Actually, we are calling it as the user *before* they are deleted, so they are authenticated.
create policy "Users can insert deletion reasons"
  on deletion_reasons for insert
  with check (true);

-- Only admins can view (service_role), so no select policy for normal users
-- create policy "Admins can view deletion reasons" ... (omitted, default deny for select)

-- Update the delete_user function to accept a reason
create or replace function delete_user(reason text)
returns void
language plpgsql
security definer
as $$
begin
  -- Insert the reason
  insert into deletion_reasons (reason) values (reason);
  
  -- Delete the user
  delete from auth.users where id = auth.uid();
end;
$$;
