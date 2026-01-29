# まなびリズム（ネイティブ版）

Expo (React Native) でiOS/Android向けに移植したアプリです。

## セットアップ

```bash
cd native
npm install
```

`.env` を作成して以下を設定してください:

```env
EXPO_PUBLIC_SUPABASE_URL=your_supabase_project_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
EXPO_PUBLIC_API_BASE_URL=https://your-web-backend.example.com
EXPO_PUBLIC_QA_ENDPOINT=https://your-web-backend.example.com/api/qa
```

## 起動

```bash
npm run start
```

## App Store向け

- `native/app.json` の `ios.bundleIdentifier` を実際のIDに変更してください。
- アイコンとスプラッシュ画像は `public/images/mascot.png` を仮利用しています。
- AI Q&Aは `EXPO_PUBLIC_QA_ENDPOINT` か `EXPO_PUBLIC_API_BASE_URL` の設定が必要です。
