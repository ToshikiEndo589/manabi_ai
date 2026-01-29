-- reference_booksテーブルの作成（参考書・動画授業）
CREATE TABLE IF NOT EXISTS reference_books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  image_url TEXT,
  type TEXT NOT NULL DEFAULT 'book', -- 'book' or 'video'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- study_logsテーブルにreference_book_idカラムを追加
ALTER TABLE study_logs 
ADD COLUMN IF NOT EXISTS reference_book_id UUID REFERENCES reference_books(id) ON DELETE SET NULL;

-- 既存のstudy_logsのsubjectカラムは残す（後方互換性のため）
-- 新しい記録はreference_book_idを使用

-- RLS (Row Level Security) の有効化
ALTER TABLE reference_books ENABLE ROW LEVEL SECURITY;

-- reference_booksテーブルのRLSポリシー
CREATE POLICY "Users can view own reference books"
  ON reference_books FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own reference books"
  ON reference_books FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own reference books"
  ON reference_books FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own reference books"
  ON reference_books FOR DELETE
  USING (auth.uid() = user_id);

-- インデックスの作成
CREATE INDEX IF NOT EXISTS idx_reference_books_user_id ON reference_books(user_id);
CREATE INDEX IF NOT EXISTS idx_study_logs_reference_book_id ON study_logs(reference_book_id);
