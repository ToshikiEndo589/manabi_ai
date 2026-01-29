-- profilesテーブルに試験日（exam_date）カラムを追加
-- 2月1日を試験日として、年のみを保存（DATE型で保存）
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS exam_date DATE;

-- 既存のユーザーにはデフォルトで2026年2月1日を設定（必要に応じて変更）
UPDATE profiles 
SET exam_date = '2026-02-01' 
WHERE exam_date IS NULL;
