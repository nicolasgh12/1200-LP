create table public.users (
  alias text not null,
  constraint users_pkey primary key (alias),
  constraint users_alias_format check ((alias ~ '^[a-z0-9_]{3,20}$'::text))
) TABLESPACE pg_default;

create table public.wallet (
  user_alias text not null,
  address text not null,
  constraint wallet_pkey primary key (user_alias),
  constraint wallet_address_key unique (address),
  constraint wallet_user_alias_fkey foreign KEY (user_alias) references users (alias) on delete CASCADE,
  constraint wallet_address_not_empty check ((btrim(address) <> ''::text))
) TABLESPACE pg_default;

create table public.transactions (
  id uuid not null default gen_random_uuid (),
  user_alias text not null,
  payment_id text null,
  blockchain_hash text null,
  sender_address text not null,
  recipient_address text not null,
  token_address text not null,
  amount numeric not null,
  fee numeric null,
  direction text not null,
  status text not null default 'pending'::text,
  recorded_at timestamp with time zone not null default now(),
  constraint transactions_pkey primary key (id),
  constraint transactions_payment_id_key unique (payment_id),
  constraint transactions_blockchain_hash_key unique (blockchain_hash),
  constraint transactions_user_alias_fkey foreign KEY (user_alias) references wallet (user_alias) on delete CASCADE,
  constraint transactions_fee_check check (
    (
      (fee is null)
      or (fee >= (0)::numeric)
    )
  ),
  constraint transactions_direction_check check (
    (
      direction = any (array['incoming'::text, 'outgoing'::text])
    )
  ),
  constraint transactions_status_check check (
    (
      status = any (
        array[
          'pending'::text,
          'confirmed'::text,
          'failed'::text
        ]
      )
    )
  ),
  constraint transactions_amount_check check ((amount > (0)::numeric))
) TABLESPACE pg_default;

create index IF not exists transactions_user_history_idx on public.transactions using btree (user_alias, recorded_at desc) TABLESPACE pg_default;