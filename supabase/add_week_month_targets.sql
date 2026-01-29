-- 目標学習時間関連のカラムを追加
-- 既存のデータベースに実行してください

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS weekday_target_minutes INTEGER,
ADD COLUMN IF NOT EXISTS weekend_target_minutes INTEGER,
ADD COLUMN IF NOT EXISTS today_target_minutes INTEGER,
ADD COLUMN IF NOT EXISTS today_target_date DATE,
ADD COLUMN IF NOT EXISTS week_target_minutes INTEGER,
ADD COLUMN IF NOT EXISTS week_target_date DATE,
ADD COLUMN IF NOT EXISTS month_target_minutes INTEGER,
ADD COLUMN IF NOT EXISTS month_target_date DATE;
