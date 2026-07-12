-- Track how many delivery attempts a webhook took (retry with backoff).
alter table public.webhook_deliveries
  add column attempts integer not null default 1;
