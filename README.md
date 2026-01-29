# まなびリズム

Next.jsのApp RouterとTypeScript、Tailwind CSS、Supabase、shadcn uiを使った学習管理アプリです。

## 機能

### 第1段階（実装済み）
- **認証**: Supabase Authによるメールアドレスとパスワード認証
- **保護ルーティング**: middlewareによる未ログインユーザーのリダイレクト
- **オンボーディング**: 初回登録時に志望校と現在偏差値を設定（目標偏差値は初期値として現在偏差値と同じ値）
- **ログイン後レイアウト**: ボトムナビゲーション付きのレイアウト
- **ホーム画面**: マスコット表示
- **設定**: プロフィール情報の更新とログアウト
- **型定義とDBアクセス関数**: study_logsの読み書き関数の土台

### 第2段階（実装予定）
- **学習記録**: ストップウォッチによるリアルタイム計測と過去分の手動入力
- **学習データ可視化**: GitHub風のヒートマップと科目別の学習時間内訳グラフ
- **AI Q&A**: OpenAI APIを使ったテキストと画像対応のAIチャット機能

## 技術スタック

- **フレームワーク**: Next.js 16.1.4 (App Router)
- **言語**: TypeScript
- **スタイリング**: Tailwind CSS
- **UIコンポーネント**: shadcn ui
- **認証・データベース**: Supabase
- **フォーム管理**: React Hook Form + Zod
- **グラフ**: Recharts
- **AI**: OpenAI API (GPT-4o / GPT-4o-mini)
- **日付処理**: date-fns

## セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 環境変数の設定

`.env.local`ファイルを作成し、以下の環境変数を設定してください：

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
OPENAI_API_KEY=your_openai_api_key
```

環境変数の値は、以下から取得できます：
- Supabase: https://supabase.com/dashboard/project/_/settings/api
- OpenAI: https://platform.openai.com/api-keys

### 3. Supabaseデータベースのセットアップ

SupabaseダッシュボードのSQL Editorで、`supabase/setup.sql`の内容を実行してください。

### 4. マスコット画像の配置

`public/images/mascot.png`にマスコット画像を配置してください。

### 5. 開発サーバーの起動

```bash
npm run dev
```

ブラウザで [http://localhost:3000](http://localhost:3000) を開いてください。

## プロジェクト構造

```
ai-yobikou/
├── app/
│   ├── api/
│   │   └── qa/              # AI Q&A API
│   ├── app/                 # ログイン後のルート
│   │   ├── home/            # ホーム画面
│   │   ├── study/           # 学習画面（ストップウォッチ、手動入力）
│   │   ├── qa/              # Q&A画面（AIチャット）
│   │   ├── log/             # 記録画面（ヒートマップ、科目別グラフ）
│   │   ├── settings/        # 設定画面
│   │   └── layout.tsx       # ログイン後レイアウト
│   ├── login/               # ログイン画面
│   ├── onboarding/          # オンボーディング画面
│   ├── layout.tsx           # ルートレイアウト
│   └── page.tsx             # ルートページ（/loginにリダイレクト）
├── components/
│   ├── ui/                  # shadcn uiコンポーネント
│   ├── bottom-nav.tsx       # ボトムナビゲーション
│   ├── heatmap.tsx          # ヒートマップコンポーネント
│   ├── subject-chart.tsx    # 科目別グラフコンポーネント
├── lib/
│   ├── supabase/            # Supabaseクライアント
│   ├── openai.ts            # OpenAI API クライアント（準備済み）
│   └── utils.ts             # ユーティリティ関数
├── types/
│   └── database.ts          # データベース型定義
├── public/
│   └── images/
│       └── mascot.png       # マスコット画像
└── middleware.ts            # ルーティング保護
```

## 機能詳細

### 学習記録機能
- **リアルタイム計測**: ストップウォッチで学習時間を計測
- **手動入力**: 過去の学習時間を手動で記録
- **科目選択**: 10種類の科目から選択可能

### 学習データ可視化
- **ヒートマップ**: 過去365日間の学習活動をGitHub風のヒートマップで表示
- **科目別グラフ**: 円グラフで科目ごとの学習時間の内訳を表示

### AI Q&A機能
- **テキスト質問**: テキストで質問するとAIが回答
- **画像対応**: 画像をアップロードして質問可能（GPT-4o使用）
- **会話履歴**: 過去の会話を保持して文脈を理解

## 動作確認チェックリスト（第1段階）

### 必須確認項目
- [ ] 未ログインで保護ルート（/app/*）に入ると/loginにリダイレクトされる
- [ ] ログイン後にprofilesがない場合は/onboardingにリダイレクトされる
- [ ] オンボーディング完了後は/app/homeに入れる
- [ ] ログアウトで再び/loginに戻る
- [ ] マスコットが/loginと/app/homeに表示される
- [ ] ボトムナビがログイン後の画面に表示される（5つのタブ）
- [ ] 設定画面で志望校名、現在偏差値、目標偏差値を更新できる

### 第2段階で確認予定
- [ ] 学習記録を保存できる
- [ ] ヒートマップと科目別グラフが表示される
- [ ] AI Q&Aで質問に回答が返ってくる
- [ ] 画像をアップロードして質問できる

## ライセンス

MIT
