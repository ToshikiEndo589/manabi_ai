-- ============================================
-- 単語帳モードの復習履歴（完璧/うろ覚え/苦手）を記録するテーブル
-- ============================================

CREATE TABLE IF NOT EXISTS flashcard_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  review_material_id UUID REFERENCES review_materials(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  content TEXT NOT NULL,
  rating TEXT NOT NULL CHECK (rating IN ('perfect', 'good', 'hard')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE flashcard_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own flashcard attempts"
  ON flashcard_attempts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own flashcard attempts"
  ON flashcard_attempts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_flashcard_attempts_user_id ON flashcard_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_flashcard_attempts_created_at ON flashcard_attempts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_flashcard_attempts_review_material_id ON flashcard_attempts(review_material_id);
