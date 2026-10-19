-- Operations can populate reviewed profile content. Customers and chefs retain
-- read-only table access, so this does not create a self-verification path.
alter table public.chefos_chefs add column photo_url text not null default '' check (photo_url='' or photo_url like 'https://%');
alter table public.chefos_chefs add column bio text not null default '' check (length(bio)<=2000);
