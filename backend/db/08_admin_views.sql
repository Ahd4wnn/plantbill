-- 08_admin_views.sql
-- Aggregates register sessions with corresponding bill totals, cash/UPI totals,
-- discounts, expected cash, and reconciliation variances.

CREATE OR REPLACE VIEW public.daily_summary AS
SELECT
    ds.id AS session_id,
    (ds.opened_at AT TIME ZONE 'UTC')::date AS session_date,
    ds.status::text AS status,
    ds.opening_balance,
    ds.closing_balance,
    COALESCE(b.bill_count, 0) AS bill_count,
    COALESCE(b.revenue, 0.00) AS revenue,
    COALESCE(b.cash_total, 0.00) AS cash_total,
    COALESCE(b.upi_total, 0.00) AS upi_total,
    COALESCE(b.discount_total, 0.00) AS discount_total,
    (ds.opening_balance + COALESCE(b.cash_total, 0.00)) AS expected_cash,
    (ds.closing_balance - (ds.opening_balance + COALESCE(b.cash_total, 0.00))) AS variance,
    ds.opened_at,
    ds.closed_at
FROM public.day_sessions ds
LEFT JOIN (
    SELECT
        session_id,
        COUNT(id) AS bill_count,
        SUM(total) AS revenue,
        SUM(cash_amount) AS cash_total,
        SUM(upi_amount) AS upi_total,
        SUM(discount_amount) AS discount_total
    FROM public.bills
    GROUP BY session_id
) b ON ds.id = b.session_id;
