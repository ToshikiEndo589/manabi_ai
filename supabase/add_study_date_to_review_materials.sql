-- review_materials テーブルにユーザーが選択した学習日を保存するカラムを追加
-- これにより、カード作成日時（created_at）ではなく、ユーザーが指定した学習日が表示されるようになります

ALTER TABLE review_materials
ADD COLUMN IF NOT EXISTS study_date timestamptz;

-- 既存のレコードには created_at を初期値として設定
UPDATE review_materials
SET study_date = created_at
WHERE study_date IS NULL;
