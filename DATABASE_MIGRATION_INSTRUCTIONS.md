# データベースマイグレーション手順

## 問題
設定画面で「Could not find the 'exam_date' column of 'profiles' in the schema cache」というエラーが表示されています。

## 解決方法

1. Supabaseダッシュボードにアクセス
   - https://supabase.com/dashboard にログイン
   - プロジェクトを選択

2. SQL Editorを開く
   - 左メニューから「SQL Editor」をクリック

3. 以下のSQLを実行

```sql
-- profilesテーブルに試験日（exam_date）カラムを追加
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS exam_date DATE;

-- 既存のユーザーにはデフォルトで2026年2月1日を設定（必要に応じて変更）
UPDATE profiles 
SET exam_date = '2026-02-01' 
WHERE exam_date IS NULL;
```

4. 実行後、アプリをリロードしてください
