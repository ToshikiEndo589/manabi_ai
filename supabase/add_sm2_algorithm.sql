-- ============================================
-- SM-2スペースドリペティションアルゴリズム対応
-- review_materialsテーブルにSM-2状態カラムを追加
-- ============================================

-- SM-2 の状態を review_materials に追加
ALTER TABLE review_materials
  ADD COLUMN IF NOT EXISTS sm2_interval    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sm2_ease_factor REAL    NOT NULL DEFAULT 2.5,
  ADD COLUMN IF NOT EXISTS sm2_repetitions INTEGER NOT NULL DEFAULT 0;

-- コメント
COMMENT ON COLUMN review_materials.sm2_interval    IS 'SM-2: 前回の復習から次の復習までの日数';
COMMENT ON COLUMN review_materials.sm2_ease_factor IS 'SM-2: 易しさの係数（初期値2.5、最低1.3）';
COMMENT ON COLUMN review_materials.sm2_repetitions IS 'SM-2: 連続正解回数（苦手を選ぶとリセット）';
