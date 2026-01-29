# Supabaseデータベースセットアップ手順

## 手順

1. Supabaseダッシュボードにアクセス
   - https://supabase.com/dashboard にログイン
   - プロジェクト `repjlkcreysduccnpmvu` を選択

2. SQL Editorを開く
   - 左メニューから「SQL Editor」をクリック

3. 新しいクエリを作成
   - 「New query」ボタンをクリック

4. 以下のSQLをコピー＆ペーストして実行

```sql
-- profilesテーブルの作成
CREATE TABLE IF NOT EXISTS profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  school_name TEXT,
  current_deviation NUMERIC(4, 1),
  target_deviation NUMERIC(4, 1),
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
  study_minutes INTEGER NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS (Row Level Security) の有効化
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_logs ENABLE ROW LEVEL SECURITY;

-- profilesテーブルのRLSポリシー
-- ユーザーは自分のプロフィールのみ読み取り可能
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = user_id);

-- ユーザーは自分のプロフィールのみ作成可能
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ユーザーは自分のプロフィールのみ更新可能
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = user_id);

-- study_logsテーブルのRLSポリシー
-- ユーザーは自分の学習記録のみ読み取り可能
CREATE POLICY "Users can view own study logs"
  ON study_logs FOR SELECT
  USING (auth.uid() = user_id);

-- ユーザーは自分の学習記録のみ作成可能
CREATE POLICY "Users can insert own study logs"
  ON study_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ユーザーは自分の学習記録のみ更新可能
CREATE POLICY "Users can update own study logs"
  ON study_logs FOR UPDATE
  USING (auth.uid() = user_id);

-- ユーザーは自分の学習記録のみ削除可能
CREATE POLICY "Users can delete own study logs"
  ON study_logs FOR DELETE
  USING (auth.uid() = user_id);

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
```

5. 「Run」ボタンをクリックして実行

6. 実行が成功したら、「Success. No rows returned」というメッセージが表示されます

## 画像アップロード（アイコン）

アイコンを使う場合は、Supabase Storageに `avatars` バケットを作成してください。

## 確認方法

テーブルが正しく作成されたか確認するには：

1. 左メニューから「Table Editor」を開く
2. `profiles`と`study_logs`の2つのテーブルが表示されることを確認

## トラブルシューティング

### エラー: "relation already exists"
- テーブルが既に存在する場合は、`IF NOT EXISTS`によりスキップされます
- 問題ありません

### エラー: "permission denied"
- RLSポリシーの作成に失敗している可能性があります
- 各ポリシーを個別に実行してみてください
