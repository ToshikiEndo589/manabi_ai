-- Store per-theme follow-up questions and AI answers.

CREATE TABLE IF NOT EXISTS theme_qa_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  review_task_id UUID REFERENCES review_tasks(id) ON DELETE SET NULL,
  review_material_id UUID REFERENCES review_materials(id) ON DELETE SET NULL,
  reference_book_id UUID REFERENCES reference_books(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  theme TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT 'gpt-5-mini',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE theme_qa_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own theme QA logs" ON theme_qa_logs;
CREATE POLICY "Users can view own theme QA logs"
  ON theme_qa_logs FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own theme QA logs" ON theme_qa_logs;
CREATE POLICY "Users can insert own theme QA logs"
  ON theme_qa_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_theme_qa_logs_user_created_at
  ON theme_qa_logs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_theme_qa_logs_user_subject_theme
  ON theme_qa_logs(user_id, subject, theme);
