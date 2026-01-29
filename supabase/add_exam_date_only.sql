-- 既存のテーブルにexam_dateカラムを追加するだけのSQL
-- 既にテーブルとポリシーが存在する場合に使用

-- profilesテーブルに試験日（exam_date）カラムを追加
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS exam_date DATE;

-- 既存のユーザーにはデフォルトで2025年2月1日を設定（必要に応じて変更）
UPDATE profiles 
SET exam_date = '2026-02-01' 
WHERE exam_date IS NULL;
