# 申請承認ワークフローシステム

## プロジェクト概要

見積もり・請求書の申請から承認・通知までの一連のワークフローをWebアプリとしてシステム化するツール。
紙・口頭・メールでの属人的なやり取りを排除し、申請の透明性・追跡可能性・業務効率を確保する。

## 技術スタック

| レイヤー | 技術 |
|---|---|
| フレームワーク | Hono (TypeScript) |
| フロントエンド | Vanilla JS + Tailwind CSS (CDN) |
| データベース | Cloudflare D1 (SQLite) |
| ホスティング | Cloudflare Pages |
| 認証 | JWT (HMAC-SHA256) |

## 実装済み機能

### 認証
- メール + パスワードによるログイン
- JWT トークンベースのセッション管理
- パスワード変更機能

### 申請機能
- 新規申請（見積もり / 請求書）
- 申請入力: 種別、件名、取引先名、金額(税抜)、税率(10%/8%/0%)、税込金額(自動計算)、備考
- 取下げ（pending時のみ）
- 差戻し後の再申請（既存値プリセット + バージョン管理）

### 承認機能
- 3段階承認チェーン（経理 → 事業部長 → 管理部）
- 順序保証（前ステップ承認後のみ次ステップ操作可）
- 承認コメント（任意）/ 差戻しコメント（必須）
- 自己承認防止（申請者が承認者に含まれる場合は自動スキップ）
- 二重承認防止（WHERE status = 'waiting'）
- クイック承認（ダッシュボードから直接）

### 管理機能（admin のみ）
- ユーザー管理: 招待、ロール変更、無効化/有効化、パスワードリセット、削除
- 承認者マスタ管理: 追加、順序変更、ラベル編集、無効化/削除
- システム設定: 通知先メール、システム名、リマインド設定
- 監査ログ: 全操作履歴の閲覧（フィルタ・ページネーション付き）
- 承認者振替（進行中申請の承認者変更）
- CSVエクスポート

### ロール・権限
- **applicant**: 全ユーザーの基本ロール（申請作成・閲覧・取下げ）
- **approver**: 担当ステップの承認/差戻し
- **clerk**: completed → processed への更新
- **admin**: 全操作・管理画面アクセス

### ステータスフロー
```
pending → approved(各ステップ) → completed → processed
pending → rejected（差戻し）→ 修正して再申請 → pending
pending → withdrawn（取下げ）
```

## 画面一覧（URI）

| パス | 画面 | ロール |
|---|---|---|
| `/login` | ログイン | 全員 |
| `/` | ダッシュボード | 全員 |
| `/requests/new` | 新規申請 | 全員 |
| `/requests` | 申請一覧 | 全員 |
| `/requests/:id` | 申請詳細 / 承認 | 関係者 |
| `/requests/:id/edit` | 再申請（修正） | 申請者(rejected時) |
| `/admin/users` | ユーザー管理 | admin |
| `/admin/approvers` | 承認者設定 | admin |
| `/admin/settings` | システム設定 | admin |
| `/admin/audit-logs` | 監査ログ | admin |

## API エンドポイント

| メソッド | パス | 機能 |
|---|---|---|
| POST | `/api/auth/login` | ログイン |
| GET | `/api/auth/me` | 現在ユーザー取得 |
| POST | `/api/auth/change-password` | パスワード変更 |
| GET | `/api/requests` | 申請一覧 |
| GET | `/api/requests/:id` | 申請詳細 |
| POST | `/api/requests` | 新規申請 |
| POST | `/api/requests/:id/withdraw` | 取下げ |
| POST | `/api/requests/:id/resubmit` | 再申請 |
| POST | `/api/approvals/approve` | 承認 |
| POST | `/api/approvals/reject` | 差戻し |
| POST | `/api/approvals/process` | 処理済み |
| POST | `/api/approvals/reassign` | 承認者振替 |
| GET | `/api/admin/users` | ユーザー一覧 |
| POST | `/api/admin/users/invite` | ユーザー招待 |
| POST | `/api/admin/users/:id/update` | ユーザー更新 |
| POST | `/api/admin/users/:id/delete` | ユーザー削除 |
| POST | `/api/admin/users/:id/reset-password` | パスワードリセット |
| GET | `/api/admin/approvers` | 承認者一覧 |
| POST | `/api/admin/approvers` | 承認者追加 |
| POST | `/api/admin/approvers/:id/update` | 承認者更新 |
| POST | `/api/admin/approvers/:id/delete` | 承認者削除 |
| POST | `/api/admin/approvers/reorder` | 順序一括更新 |
| GET | `/api/admin/settings` | 設定取得 |
| POST | `/api/admin/settings` | 設定更新 |
| GET | `/api/admin/audit-logs` | 監査ログ |
| GET | `/api/admin/export/requests` | CSV エクスポート |
| GET | `/api/dashboard` | ダッシュボード |

## デモアカウント

| 名前 | メール | パスワード | ロール |
|---|---|---|---|
| 岩野 管理者 | admin@example.com | password123 | applicant, approver, admin |
| 鈴木 一郎 | suzuki@example.com | password123 | applicant, approver |
| 高橋 部長 | takahashi@example.com | password123 | applicant, approver |
| 山本 事務 | yamamoto@example.com | password123 | applicant, clerk |
| 佐藤 花子 | sato@example.com | password123 | applicant |
| 田中 一郎 | tanaka@example.com | password123 | applicant |

## データベーステーブル

- **profiles**: ユーザー情報（ID, メール, 表示名, パスワードハッシュ, ロール, 有効フラグ）
- **requests**: 申請データ（採番, 種別, 金額, ステータス, バージョン）
- **approval_steps**: 承認ステップ（承認者, 順序, ステータス, コメント, バージョン）
- **approver_master**: 承認者マスタ（承認順序, ラベル, 有効フラグ）
- **request_files**: 添付ファイル管理
- **notification_logs**: 通知ログ
- **audit_logs**: 監査ログ
- **settings**: システム設定（JSONB）
- **sequences**: 自動採番管理

## ローカル開発

```bash
npm install
npm run build
npm run db:migrate:local
npm run db:seed
npm run dev:sandbox
```

## デプロイステータス

- **プラットフォーム**: Cloudflare Pages
- **状態**: 開発中
- **最終更新**: 2026年3月15日
