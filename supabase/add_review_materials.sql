-- ============================================
-- 単語帳機能（復習カード）の独立化
-- 学習時間（study_logs）から復習カード（review_materials）を分離するためのSQL
-- ============================================

-- 1. 新しい「復習カード（review_materials）」テーブルを作成
CREATE TABLE IF NOT EXISTS review_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reference_book_id UUID REFERENCES reference_books(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS (Row Level Security) の有効化
ALTER TABLE review_materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own review materials"
  ON review_materials FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own review materials"
  ON review_materials FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own review materials"
  ON review_materials FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own review materials"
  ON review_materials FOR DELETE
  USING (auth.uid() = user_id);

-- 更新日時の自動更新トリガー
CREATE TRIGGER update_review_materials_updated_at
  BEFORE UPDATE ON review_materials
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- インデックスの作成
CREATE INDEX IF NOT EXISTS idx_review_materials_user_id ON review_materials(user_id);


-- 2. 復習タスク（review_tasks）の参照先を変更するための準備
ALTER TABLE review_tasks 
ADD COLUMN IF NOT EXISTS review_material_id UUID REFERENCES review_materials(id) ON DELETE CASCADE;

-- 既存のstudy_log_idカラムを「NULL許容」に変更する（新しいタスクはstudy_log_idを持たなくなるため）
ALTER TABLE review_tasks ALTER COLUMN study_log_id DROP NOT NULL;


-- 3. （データ移行）既存の学習記録（study_logs）の中でメモ（note）があるものを、新しい復習カードに移植する
DO $$
DECLARE
  rec RECORD;
  new_material_id UUID;
BEGIN
  FOR rec IN (
    SELECT id, user_id, reference_book_id, subject, note, started_at, created_at
    FROM study_logs
    WHERE note IS NOT NULL AND note != ''
  ) LOOP
    -- 新しい review_materials にデータをコピー
    INSERT INTO review_materials (user_id, reference_book_id, subject, content, created_at, updated_at)
    VALUES (rec.user_id, rec.reference_book_id, rec.subject, rec.note, rec.started_at, rec.created_at)
    RETURNING id INTO new_material_id;

    -- 古い review_tasks （まだ完了していないものなど）があった場合、新しい review_material_id に紐付け直す
    UPDATE review_tasks
    SET review_material_id = new_material_id
    WHERE study_log_id = rec.id;
  END LOOP;
END;
$$;


-- 4. （クリーンアップ）復習カードとして抽出された学習記録のメモを空にする
UPDATE study_logs
SET note = NULL
WHERE note IS NOT NULL AND note != '';

-- 学習時間が「0分」のダミー記録（手動で削除されたがメモがあるため残っていたものなど）を完全に削除
DELETE FROM study_logs
WHERE study_minutes = 0;
