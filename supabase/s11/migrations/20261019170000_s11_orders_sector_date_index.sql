-- Accélère le chargement par secteur et par période (commandes non supprimées, la plus récente d'abord).
create index if not exists orders_sector_date_idx on plans_prevention.orders (sector_code, order_date desc) where trashed_at is null;
