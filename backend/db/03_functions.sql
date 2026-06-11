-- Database Functions & Alterations

-- 1. Alter profiles table to add full_name if not exists
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name TEXT;

-- 2. Alter bills table to add sequential bill_number if not exists
-- If the column is added, it will automatically auto-increment using a sequence.
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS bill_number SERIAL;

-- 3. Update the handle_new_user trigger function to capture full_name from auth metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, role, full_name)
    VALUES (
        new.id,
        'cashier'::public.user_role,
        coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
    );
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Create transactional create_bill RPC function
CREATE OR REPLACE FUNCTION public.create_bill(
    p_session_id UUID,
    p_created_by UUID,
    p_discount_amount NUMERIC(12, 2),
    p_payment_method public.payment_method_type,
    p_cash_amount NUMERIC(12, 2),
    p_upi_amount NUMERIC(12, 2),
    p_total_price NUMERIC(12, 2),
    p_items JSONB
)
RETURNS TABLE (
    id UUID,
    bill_number INT,
    total_price NUMERIC(12, 2),
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
DECLARE
    v_bill_id UUID;
    v_bill_number INT;
    v_created_at TIMESTAMP WITH TIME ZONE;
    v_item RECORD;
BEGIN
    -- Double check that the day session is indeed open
    IF NOT EXISTS (
        SELECT 1 FROM public.day_sessions 
        WHERE day_sessions.id = p_session_id AND day_sessions.status = 'open'::public.session_status
    ) THEN
        RAISE EXCEPTION 'Active session not found or session is closed' USING ERRCODE = 'P0001';
    END IF;

    -- Insert parent bill record
    INSERT INTO public.bills (
        session_id,
        created_by,
        discount_amount,
        payment_method,
        cash_amount,
        upi_amount,
        total_price
    ) VALUES (
        p_session_id,
        p_created_by,
        p_discount_amount,
        p_payment_method,
        p_cash_amount,
        p_upi_amount,
        p_total_price
    ) RETURNING bills.id, bills.bill_number, bills.created_at INTO v_bill_id, v_bill_number, v_created_at;

    -- Insert all bill items from the JSONB array
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        plant_name TEXT,
        unit_price NUMERIC(12, 2),
        quantity INT,
        total_price NUMERIC(12, 2)
    ) LOOP
        INSERT INTO public.bill_items (
            bill_id,
            plant_name,
            unit_price,
            quantity,
            total_price
        ) VALUES (
            v_bill_id,
            v_item.plant_name,
            v_item.unit_price,
            v_item.quantity,
            v_item.total_price
        );
    END LOOP;

    -- Return the inserted bill attributes
    RETURN QUERY SELECT v_bill_id, v_bill_number, p_total_price, v_created_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
