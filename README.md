# 申請承認ワークフロー

## プロジェクト概要
- **名称**: 申請承認ワークフロー
- **目的**: 見積もり・請求書の申請 → 承認 → 通知までを0円で実現するWebワークフローシステム
- **技術スタック**: Hono (TypeScript) + Cloudflare D1 (SQLite) + Tailwind CSS + Vanilla JS SPA

## アクセスURL
- **サンドボックス**: https://3000-ito5dw6lflli4i8xip2ly-02b9cc79.sandbox.novita.ai

## デモアカウント（パスワード: password123）
| ロール | メールアドレス | 名前 | 備考 |
|--------|---------------|------|------|
| 管理者 | admin@example.com | 岩野 管理者 | 全権限、承認STEP3 |
| 承認者 | suzuki@example.com | 鈴木 一郎 | 承認STEP1（経理担当） |
| 承認者 | takahashi@example.com | 高橋 部長 | 承認STEP2（事業部長） |
| 事務員 | yamamoto@example.com | 山本 事務 | 処理済み操作権限 |
| 申請者 | sato@example.com | 佐藤 花子 | 一般申請者 |
| 申請者 | tanaka@example.com | 田中 一郎 | 一般申請者 |

## 実装済み機能

### 認証・ユーザー管理
- メール/パスワードログイン（JWT HMAC-SHA256）
- 4ロール: applicant, approver, clerk, admin（複数兼務可）
- ユーザー招待・編集・無効化・削除・パスワードリセット

### PDFアップロード（見積書・請求書）
- **PDF形式のみ対応**（.pdf拡張子、application/pdf MIMEタイプ、マジックバイト検証）
- **1ファイル最大10MB、1申請最大10ファイル**
- ドラッグ＆ドロップまたはファイル選択でアップロード
- アップロード済みPDFのプレビュー（モーダル内iframe表示）
- PDFダウンロード
- ファイル削除（申請者・管理者のみ、承認中/差戻し状態のみ）
- D1 BLOBストレージによるバイナリデータ保存
- 新規申請時はPDF添付必須
- 再申請時に既存PDFの引き継ぎ・追加・削除が可能

### 申請ワークフロー
- 申請種別: 見積もり / 請求書
- 申請情報: 件名、取引先名、金額（税抜）、税率（10%/8%/0%）、税込金額自動計算、備考
- **PDFファイル添付**（見積書・請求書の実物PDF）
- 3段階順序付き承認フロー（経理担当 → 事業部長 → 管理部）
- 自己承認防止（申請者がステップに含まれる場合は自動スキップ）
- 二重承認防止（楽観ロック）
- 前ステップ完了チェック

### 差戻し・再申請・取下げ
- 差戻し: コメント必須、申請者に通知
- 再申請: 前回データプリセット、バージョン管理、PDFの引き継ぎ/差替え
- 取下げ: 承認中の申請のみ可

### 管理機能
- 承認者マスタ管理（追加・編集・並び替え・無効化・削除）
- 承認者振替（管理者がウェイティング中のステップの担当者を変更）
- システム設定（通知先メール、リマインド間隔・回数）
- 監査ログ（全操作記録、フィルタリング、ページネーション）
- CSV一括エクスポート

## APIエンドポイント一覧

### 認証 `/api/auth`
| メソッド | パス | 説明 |
|---------|------|------|
| POST | /login | ログイン |
| GET | /me | 現在のユーザー情報取得 |
| POST | /change-password | パスワード変更 |

### 申請 `/api/requests`
| メソッド | パス | 説明 |
|---------|------|------|
| GET | / | 申請一覧（?page=&status=&type=&keyword=） |
| GET | /:id | 申請詳細（ステップ・ファイル含む） |
| POST | / | 新規申請作成 |
| POST | /:id/withdraw | 取下げ |
| POST | /:id/resubmit | 再申請 |

### ファイル `/api/files`
| メソッド | パス | 説明 |
|---------|------|------|
| POST | /upload | PDFアップロード（multipart/form-data） |
| GET | /:fileId/download | PDFダウンロード |
| GET | /:fileId/preview | PDFプレビュー（iframe用、?token=対応） |
| POST | /:fileId/delete | ファイル削除 |
| GET | /list/:requestId | ファイル一覧（メタデータのみ） |

### 承認 `/api/approvals`
| メソッド | パス | 説明 |
|---------|------|------|
| POST | /approve | 承認 |
| POST | /reject | 差戻し |
| POST | /process | 処理済みに更新 |
| POST | /reassign | 承認者振替 |

### 管理 `/api/admin`
| メソッド | パス | 説明 |
|---------|------|------|
| GET/POST | /users/* | ユーザー管理 |
| GET/POST | /approvers/* | 承認者マスタ管理 |
| GET/POST | /settings | システム設定 |
| GET | /audit-logs | 監査ログ |
| GET | /export/requests | CSV出力 |

### ダッシュボード `/api/dashboard`
| メソッド | パス | 説明 |
|---------|------|------|
| GET | / | サマリー・承認待ち・最近の申請 |
| GET | /approver-candidates | 承認者候補リスト |
| GET | /active-users | アクティブユーザーリスト |

## データモデル
- **profiles**: ユーザー情報（email, display_name, password_hash, role, is_active）
- **requests**: 申請データ（type, title, client_name, amount, tax_rate, status, version）
- **approval_steps**: 承認ステップ（request_id, step_order, approver_id, status, comment）
- **request_files**: 添付PDF（file_name, file_size, mime_type, **file_data (BLOB)**）
- **approver_master**: 承認者マスタ（user_id, step_order, label, is_active）
- **notification_logs**: 通知ログ（recipient_email, notification_type, status）
- **audit_logs**: 監査ログ（user_id, action, target_table, detail）
- **settings**: システム設定（key-value）
- **sequences**: 採番（request_number）

## 画面構成
1. ログイン画面
2. ダッシュボード（サマリーカード、承認待ち一覧、最近の申請）
3. 新規申請フォーム（PDF添付必須）
4. 申請一覧（フィルタ・ページネーション）
5. 申請詳細（PDF表示・ダウンロード、承認進捗タイムライン、承認/差戻し操作）
6. 修正・再申請フォーム（PDF引き継ぎ/追加/削除）
7. ユーザー管理（管理者のみ）
8. 承認者設定（管理者のみ）
9. システム設定（管理者のみ）
10. 監査ログ（管理者のみ）

## UI/UXデザイン
- 白背景、ブルーアクセント
- Tailwind CSS（CDN）+ Font Awesome
- レスポンシブ対応（モバイルメニュー）
- トースト通知、モーダルダイアログ
- スケルトンローディング

## 技術詳細
| 項目 | 内容 |
|------|------|
| バックエンド | Hono (TypeScript) on Cloudflare Workers |
| データベース | Cloudflare D1 (SQLite) |
| PDFストレージ | D1 BLOB（request_files.file_data） |
| 認証 | HMAC-SHA256 JWT、SHA-256パスワードハッシュ |
| フロントエンド | Vanilla JS SPA + Tailwind CSS CDN |
| ビルド | Vite + @hono/vite-build/cloudflare-pages |
| 開発サーバー | wrangler pages dev (PM2管理) |

## 未実装・将来拡張
- SendGrid連携によるメール通知（スキーマ・API定義済み）
- Slack通知
- PDF帳票自動生成
- 承認条件分岐（金額閾値等）
- 追加申請種別
- pg_cronダミークエリによる停止対策
- Cloudflare R2へのファイルストレージ移行（大容量対応）
- ウイルス/マルウェアスキャン

## デプロイ
- **プラットフォーム**: Cloudflare Pages
- **ステータス**: サンドボックス稼働中
- **最終更新**: 2026-03-15
