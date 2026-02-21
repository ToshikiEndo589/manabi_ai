-- Drop columns that were used only in the Web App and are no longer needed for the Native App
-- Please run this in the Supabase SQL Editor

ALTER TABLE profiles DROP COLUMN IF EXISTS school_name;
ALTER TABLE profiles DROP COLUMN IF EXISTS current_deviation;
ALTER TABLE profiles DROP COLUMN IF EXISTS target_deviation;
ALTER TABLE profiles DROP COLUMN IF EXISTS exam_date;
ALTER TABLE profiles DROP COLUMN IF EXISTS avatar_url;
