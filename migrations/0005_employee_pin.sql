-- 従業員テーブルに暗証番号カラムを追加
-- 初期値は '0000' で、各従業員が任意で変更可能
ALTER TABLE employees ADD COLUMN pin TEXT DEFAULT '0000';
