-- PDFファイルデータ保存用テーブル
-- request_filesのfile_pathカラムをfile_data(BLOB)に変更し、実データをDB内に保存

-- 既存のrequest_filesテーブルにfile_dataカラムを追加
ALTER TABLE request_files ADD COLUMN file_data BLOB;

-- request_filesのインデックス
CREATE INDEX IF NOT EXISTS idx_request_files_request ON request_files(request_id);
