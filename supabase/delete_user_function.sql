-- Function to allow a user to delete their own account
-- This will trigger CASCADE deletes for all related data (profiles, study_logs, etc.)

create or replace function delete_user()
returns void
language sql
security definer
as $$
  delete from auth.users where id = auth.uid();
$$;
