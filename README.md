# AIトリアージ【オープンキャンパス用】

来院前の電話音声を文字起こしし、医師・管理者に渡すための主観的情報（S）/客観的情報（O）メモを作るデモアプリです。

## 起動

PowerShellでこのフォルダへ移動し、OpenAI APIキーを設定して起動します。

```powershell
$env:OPENAI_API_KEY="sk-..."
node server.mjs
```

ブラウザで `http://localhost:3000` を開きます。

## 公開方法

このアプリはOpenAI APIキーをサーバ側で使うため、GitHub Pagesだけでは安全に公開できません。GitHubにコードを置き、Render、Railway、Azure App ServiceなどのNode.jsサーバ対応サービスにデプロイしてください。

デプロイ先では環境変数 `OPENAI_API_KEY` を設定します。必要に応じて以下も設定できます。

- `OPENAI_SUMMARY_MODEL`: 要約モデル。既定値は `gpt-4.1-mini`
- `OPENAI_TRANSCRIBE_MODEL`: 文字起こしモデル。既定値は `gpt-4o-mini-transcribe`

## 使い方

- 録音ボタンでマイク音声を録音します。
- 停止ボタンで音声をOpenAI APIへ送り、文字起こし後にS/O形式の医師向けメモを作ります。
- メモ欄は編集できます。
- 印刷ボタンで編集後のメモを印刷できます。

## メモ作成のコツ

※患者様の発言を繰り返すことで、質の高いメモを作ることができるようになります。
