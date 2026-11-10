-- Run once in Supabase > SQL Editor. Requires auth users to be created by an admin.
create extension if not exists pgcrypto;

create table if not exists public.warehouse_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','editor','viewer')),
  created_at timestamptz not null default now()
);
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 200),
  code text not null unique check (length(trim(code)) between 1 and 80),
  category text not null check (category in ('spare','raw','finished')),
  unit text not null default 'قطعة',
  quantity bigint not null default 0 check (quantity >= 0),
  price numeric(14,2) not null default 0 check (price >= 0),
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists products_code_casefold on public.products (lower(code));
create table if not exists public.movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id),
  product_name text not null,
  type text not null check (type in ('in','out','opening')),
  quantity bigint not null check (quantity > 0),
  before_quantity bigint not null check (before_quantity >= 0),
  after_quantity bigint not null check (after_quantity >= 0),
  performed_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists movements_created_at_idx on public.movements (created_at desc);

alter table public.warehouse_members enable row level security;
alter table public.products enable row level security;
alter table public.movements enable row level security;

-- Only approved users can view warehouse data; no direct client writes.
revoke all on public.warehouse_members, public.products, public.movements from anon, authenticated;
grant select on public.warehouse_members, public.products, public.movements to authenticated;
drop policy if exists "member reads own role" on public.warehouse_members;
create policy "member reads own role" on public.warehouse_members for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "approved members view products" on public.products;
create policy "approved members view products" on public.products for select to authenticated using (
  exists (select 1 from public.warehouse_members where user_id = (select auth.uid()))
);
drop policy if exists "approved members view movements" on public.movements;
create policy "approved members view movements" on public.movements for select to authenticated using (
  exists (select 1 from public.warehouse_members where user_id = (select auth.uid()))
);

create or replace function public.add_warehouse_product(
  p_name text, p_code text, p_category text, p_unit text, p_quantity bigint, p_price numeric
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_user uuid := auth.uid();
begin
  if v_user is null or not exists (
    select 1 from public.warehouse_members where user_id = v_user and role in ('admin','editor')
  ) then raise exception 'غير مصرح بالإضافة'; end if;
  if p_quantity is null or p_quantity < 0 or p_price is null or p_price < 0 or p_price > 999999999999.99
    or trim(coalesce(p_name,'')) = '' or trim(coalesce(p_code,'')) = ''
    or p_category not in ('spare','raw','finished') or trim(coalesce(p_unit,'')) = '' then
    raise exception 'بيانات المنتج غير صحيحة'; end if;
  insert into public.products(name,code,category,unit,quantity,price)
  values (trim(p_name),trim(p_code),p_category,trim(p_unit),p_quantity,p_price)
  returning id into v_id;
  if p_quantity > 0 then
    insert into public.movements(product_id,product_name,type,quantity,before_quantity,after_quantity,performed_by)
    values (v_id,trim(p_name),'opening',p_quantity,0,p_quantity,v_user);
  end if;
  return v_id;
end $$;

create or replace function public.record_warehouse_movement(p_product_id uuid,p_type text,p_quantity bigint)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_product public.products%rowtype; v_after bigint;
begin
  if v_user is null or not exists (
    select 1 from public.warehouse_members where user_id = v_user and role in ('admin','editor')
  ) then raise exception 'غير مصرح بتعديل المخزون'; end if;
  if p_type not in ('in','out') or p_type is null or p_quantity is null or p_quantity < 1 then
    raise exception 'نوع الحركة أو الكمية غير صحيح'; end if;
  select * into v_product from public.products where id = p_product_id and not archived for update;
  if not found then raise exception 'المنتج غير موجود'; end if;
  if p_type = 'out' and p_quantity > v_product.quantity then raise exception 'الكمية أكبر من الرصيد'; end if;
  v_after := case when p_type='in' then v_product.quantity + p_quantity else v_product.quantity-p_quantity end;
  update public.products set quantity = v_after where id = p_product_id;
  insert into public.movements(product_id,product_name,type,quantity,before_quantity,after_quantity,performed_by)
  values (p_product_id,v_product.name,p_type,p_quantity,v_product.quantity,v_after,v_user);
  return v_after;
end $$;

create or replace function public.archive_warehouse_product(p_product_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.warehouse_members where user_id = auth.uid() and role = 'admin'
  ) then raise exception 'الحذف للأدمن فقط'; end if;
  update public.products set archived=true where id=p_product_id and not archived;
  if not found then raise exception 'المنتج غير موجود'; end if;
end $$;

revoke execute on function public.add_warehouse_product(text,text,text,text,bigint,numeric) from public,anon;
revoke execute on function public.record_warehouse_movement(uuid,text,bigint) from public,anon;
revoke execute on function public.archive_warehouse_product(uuid) from public,anon;
grant execute on function public.add_warehouse_product(text,text,text,text,bigint,numeric) to authenticated;
grant execute on function public.record_warehouse_movement(uuid,text,bigint) to authenticated;
grant execute on function public.archive_warehouse_product(uuid) to authenticated;

-- AFTER creating user in Authentication > Users, approve by email:
-- insert into public.warehouse_members(user_id,role)
-- select id,'admin' from auth.users where email='admin@example.com'
-- on conflict (user_id) do update set role=excluded.role;
