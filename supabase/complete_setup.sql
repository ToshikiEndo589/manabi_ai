-- ============================================
-- まなびリズム 完全セットアップSQL
-- ============================================

-- profilesテーブルの作成
CREATE TABLE IF NOT EXISTS profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  school_name TEXT,
  current_deviation NUMERIC(4, 1),
  target_deviation NUMERIC(4, 1),
  weekday_target_minutes INTEGER,
  weekend_target_minutes INTEGER,
  today_target_minutes INTEGER,
  today_target_date DATE,
  week_target_minutes INTEGER,
  week_target_date DATE,
  month_target_minutes INTEGER,
  month_target_date DATE,
  avatar_url TEXT,
  onboarding_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- study_logsテーブルの作成
CREATE TABLE IF NOT EXISTS study_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  note TEXT,
  study_minutes INTEGER NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS (Row Level Security) の有効化
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_logs ENABLE ROW LEVEL SECURITY;

-- review_tasksテーブルの作成（復習タスク）
CREATE TABLE IF NOT EXISTS review_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  study_log_id UUID NOT NULL REFERENCES study_logs(id) ON DELETE CASCADE,
  due_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- quiz_attemptsテーブルの作成（復習クイズ結果）
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  review_task_id UUID NOT NULL REFERENCES review_tasks(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  choices TEXT[] NOT NULL,
  correct_index INTEGER NOT NULL,
  selected_index INTEGER NOT NULL,
  is_correct BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE review_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_attempts ENABLE ROW LEVEL SECURITY;

-- profilesテーブルのRLSポリシー
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = user_id);

-- study_logsテーブルのRLSポリシー
CREATE POLICY "Users can view own study logs"
  ON study_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own study logs"
  ON study_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own study logs"
  ON study_logs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own study logs"
  ON study_logs FOR DELETE
  USING (auth.uid() = user_id);

-- review_tasksテーブルのRLSポリシー
CREATE POLICY "Users can view own review tasks"
  ON review_tasks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own review tasks"
  ON review_tasks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own review tasks"
  ON review_tasks FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own review tasks"
  ON review_tasks FOR DELETE
  USING (auth.uid() = user_id);

-- quiz_attemptsテーブルのRLSポリシー
CREATE POLICY "Users can view own quiz attempts"
  ON quiz_attempts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own quiz attempts"
  ON quiz_attempts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- updated_atを自動更新する関数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- profilesテーブルのupdated_atを自動更新するトリガー
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- インデックスの作成（パフォーマンス向上のため）
CREATE INDEX IF NOT EXISTS idx_study_logs_user_id ON study_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_study_logs_started_at ON study_logs(started_at DESC);

-- ============================================
-- 試験日（exam_date）カラムの追加
-- ============================================

-- profilesテーブルに試験日（exam_date）カラムを追加
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS exam_date DATE;

-- 週・月の目標上書き設定
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS week_target_minutes INTEGER,
ADD COLUMN IF NOT EXISTS week_target_date DATE,
ADD COLUMN IF NOT EXISTS month_target_minutes INTEGER,
ADD COLUMN IF NOT EXISTS month_target_date DATE,
ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 既存のユーザーにはデフォルトで2026年2月1日を設定
UPDATE profiles 
SET exam_date = '2026-02-01' 
WHERE exam_date IS NULL;

-- ============================================
-- 参考書機能（reference_books）の追加
-- ============================================

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

-- reference_booksテーブルのupdated_atを自動更新するトリガー
CREATE TRIGGER update_reference_books_updated_at
  BEFORE UPDATE ON reference_books
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- インデックスの作成
CREATE INDEX IF NOT EXISTS idx_reference_books_user_id ON reference_books(user_id);
CREATE INDEX IF NOT EXISTS idx_study_logs_reference_book_id ON study_logs(reference_book_id);

-- ============================================
-- Storageポリシー（参考書画像用）
-- 注意: この部分は、Storageバケット「reference-books」を作成した後に実行してください
-- ============================================

-- 既存のポリシーを削除（存在する場合）
DROP POLICY IF EXISTS "Users can upload own images" ON storage.objects;
DROP POLICY IF EXISTS "Users can view own images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own images" ON storage.objects;

-- ユーザーは自分の画像のみアップロード可能
CREATE POLICY "Users can upload own images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'reference-books' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- ユーザーは自分の画像のみ読み取り可能
CREATE POLICY "Users can view own images"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'reference-books' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- ユーザーは自分の画像のみ削除可能
CREATE POLICY "Users can delete own images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'reference-books' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );
