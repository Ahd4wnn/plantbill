-- 09_customers_expenses.sql
-- 1. Alter bills table to add optional customer details
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS customer_phone TEXT;

-- Lets the admin look up a customer's purchase history by phone.
CREATE INDEX IF NOT EXISTS idx_bills_customer_phone
    ON public.bills (customer_phone)
    WHERE customer_phone IS NOT NULL;

-- 2. Create expenses table
CREATE TABLE IF NOT EXISTS public.expenses (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id  UUID REFERENCES public.day_sessions(id) ON DELETE CASCADE NOT NULL,
    amount      NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    reason      TEXT NOT NULL,
    created_by  UUID REFERENCES public.profiles(id) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expenses_session ON public.expenses (session_id);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS expenses_rw ON public.expenses;
CREATE POLICY expenses_rw ON public.expenses
    FOR ALL USING (auth.uid() is not null)
    WITH CHECK (auth.uid() is not null);

-- 3. Recreate create_bill function to accept optional customer details
-- Drops the old version and recreates it with new customer parameters.
DROP FUNCTION IF EXISTS public.create_bill(
    uuid, numeric, numeric, numeric, text, numeric, numeric, uuid, jsonb
);

CREATE OR REPLACE FUNCTION public.create_bill(
    p_session_id      uuid,
    p_subtotal        numeric,
    p_discount_amount numeric,
    p_total           numeric,
    p_payment_method  text,
    p_cash_amount     numeric,
    p_upi_amount      numeric,
    p_created_by      uuid,
    p_items           jsonb,
    p_customer_name   text default null,
    p_customer_phone  text default null
)
RETURNS TABLE (
    id          uuid,
    bill_number integer,
    created_at  timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session_status text;
    v_next_number    integer;
    v_bill_id        uuid;
    v_created_at     timestamptz;
BEGIN
    SELECT status INTO v_session_status
    FROM public.day_sessions
    WHERE day_sessions.id = p_session_id
    FOR UPDATE;

    IF v_session_status IS NULL THEN
        RAISE EXCEPTION 'Session % not found', p_session_id;
    END IF;

    IF v_session_status <> 'open' THEN
        RAISE EXCEPTION 'Cannot add a bill: the day is already closed';
    END IF;

    SELECT COALESCE(MAX(bills.bill_number), 0) + 1
    INTO v_next_number
    FROM public.bills
    WHERE bills.session_id = p_session_id;

    INSERT INTO public.bills (
        session_id, bill_number, subtotal, discount_amount, total,
        payment_method, cash_amount, upi_amount, created_by,
        customer_name, customer_phone
    )
    VALUES (
        p_session_id, v_next_number, p_subtotal, p_discount_amount, p_total,
        p_payment_method, p_cash_amount, p_upi_amount, p_created_by,
        nullif(trim(coalesce(p_customer_name, '')), ''),
        nullif(trim(coalesce(p_customer_phone, '')), '')
    )
    RETURNING bills.id, bills.created_at
    INTO v_bill_id, v_created_at;

    INSERT INTO public.bill_items (bill_id, plant_name, unit_price, quantity, total_price)
    SELECT
        v_bill_id,
        coalesce(item ->> 'plant_name', ''),
        (item ->> 'unit_price')::numeric,
        (item ->> 'quantity')::integer,
        (item ->> 'total_price')::numeric
    FROM jsonb_array_elements(p_items) as item;

    RETURN QUERY SELECT v_bill_id, v_next_number, v_created_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_bill(
    uuid, numeric, numeric, numeric, text, numeric, numeric, uuid, jsonb, text, text
) TO service_role, authenticated;

-- 4. Recreate daily_summary view to include expenses aggregation
DROP VIEW IF EXISTS public.daily_summary CASCADE;

CREATE VIEW public.daily_summary AS
WITH bill_agg AS (
    SELECT
        session_id,
        COUNT(*)                  AS bill_count,
        COALESCE(SUM(total), 0)   AS revenue,
        COALESCE(SUM(cash_amount), 0)     AS cash_total,
        COALESCE(SUM(upi_amount), 0)      AS upi_total,
        COALESCE(SUM(discount_amount), 0) AS discount_total
    FROM public.bills
    GROUP BY session_id
),
expense_agg AS (
    SELECT session_id, COALESCE(SUM(amount), 0) AS expense_total
    from public.expenses
    GROUP BY session_id
)
SELECT
    s.id                                      AS session_id,
    s.session_date,
    s.status,
    s.opening_balance,
    s.closing_balance,
    s.opened_at,
    s.closed_at,

    COALESCE(ba.bill_count, 0)                AS bill_count,
    COALESCE(ba.revenue, 0)                   AS revenue,
    COALESCE(ba.cash_total, 0)                AS cash_total,
    COALESCE(ba.upi_total, 0)                 AS upi_total,
    COALESCE(ba.discount_total, 0)            AS discount_total,
    COALESCE(ea.expense_total, 0)             AS expense_total,

    -- Expected drawer cash = opening + cash sales - cash expenses.
    s.opening_balance
        + COALESCE(ba.cash_total, 0)
        - COALESCE(ea.expense_total, 0)       AS expected_cash,

    CASE
        WHEN s.closing_balance IS NULL THEN NULL
        ELSE s.closing_balance
             - (s.opening_balance
                + COALESCE(ba.cash_total, 0)
                - COALESCE(ea.expense_total, 0))
    END                                       AS variance

FROM public.day_sessions s
LEFT JOIN bill_agg    ba ON ba.session_id = s.id
LEFT JOIN expense_agg ea ON ea.session_id = s.id
ORDER BY s.session_date desc, s.opened_at desc;

GRANT SELECT ON public.daily_summary TO service_role, authenticated;
GRANT ALL ON public.expenses TO service_role, authenticated;
