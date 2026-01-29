# Vercelデプロイ手順

## 1. GitHubリポジトリの準備

### GitHubでリポジトリを作成
1. https://github.com/new にアクセス
2. リポジトリ名を入力（例: `ai-yobikou`）
3. **Public** または **Private** を選択
4. 「Create repository」をクリック

### ローカルからプッシュ
```powershell
# プロジェクトディレクトリに移動
cd c:\ai-yobikou

# Gitリポジトリを初期化（まだの場合）
git init

# すべてのファイルをステージング
git add .

# 初回コミット
git commit -m "Initial commit"

# GitHubリポジトリをリモートに追加（YOUR_USERNAMEとYOUR_REPO_NAMEを置き換え）
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git

# メインブランチを設定
git branch -M main

# GitHubにプッシュ
git push -u origin main
```

## 2. Vercelでのデプロイ

### アカウント作成とログイン
1. https://vercel.com にアクセス
2. 「Sign Up」をクリック
3. 「Continue with GitHub」を選択してGitHubアカウントでログイン

### プロジェクトのインポート
1. Vercelダッシュボードで「Add New...」→「Project」をクリック
2. GitHubリポジトリ一覧から `ai-yobikou` を選択
3. 「Import」をクリック

### プロジェクト設定
- **Framework Preset**: Next.js（自動検出されるはず）
- **Root Directory**: `./`（そのまま）
- **Build Command**: `npm run build`（自動設定されるはず）
- **Output Directory**: `.next`（自動設定されるはず）
- **Install Command**: `npm install`（自動設定されるはず）

### 環境変数の設定
「Environment Variables」セクションで以下を追加：

1. **NEXT_PUBLIC_SUPABASE_URL**
   - Value: `.env.local`の`NEXT_PUBLIC_SUPABASE_URL`の値

2. **NEXT_PUBLIC_SUPABASE_ANON_KEY**
   - Value: `.env.local`の`NEXT_PUBLIC_SUPABASE_ANON_KEY`の値

3. **OPENAI_API_KEY**
   - Value: `.env.local`の`OPENAI_API_KEY`の値
   - ⚠️ **Production, Preview, Development** すべてにチェックを入れる

### デプロイ実行
1. 「Deploy」ボタンをクリック
2. ビルドが完了するまで待つ（2-3分程度）
3. デプロイが成功すると、URLが表示されます（例: `https://ai-yobikou.vercel.app`）

## 3. 動作確認

デプロイされたURLにアクセスして以下を確認：

- [ ] ログイン画面が表示される
- [ ] サインアップができる
- [ ] ログインができる
- [ ] 各画面が正常に動作する
- [ ] AI Q&A機能が動作する

## 4. カスタムドメインの設定（オプション）

1. Vercelダッシュボードでプロジェクトを開く
2. 「Settings」→「Domains」をクリック
3. ドメイン名を入力して「Add」をクリック
4. DNS設定の指示に従って設定

## トラブルシューティング

### ビルドエラーが発生する場合
- Vercelのビルドログを確認
- ローカルで `npm run build` が成功するか確認
- 環境変数が正しく設定されているか確認

### 環境変数が反映されない場合
- 環境変数の設定後、再デプロイが必要
- 「Redeploy」ボタンで再デプロイ

### 認証が動作しない場合
- Supabaseの設定で、VercelのURLを「Redirect URLs」に追加
- Supabaseダッシュボード → Authentication → URL Configuration
