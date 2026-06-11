-- Database Schema for Plant Shop Billing App (PlantBill)

-- 1. Create Custom Enums
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE public.user_role AS ENUM ('admin', 'cashier');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'session_status') THEN
        CREATE TYPE public.session_status AS ENUM ('open', 'closed');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_method_type') THEN
        CREATE TYPE public.payment_method_type AS ENUM ('cash', 'upi', 'split');
    END IF;
END $$;

-- 2. Create profiles table (integrates with auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    role public.user_role DEFAULT 'cashier'::public.user_role NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Trigger function to automatically create a profile on auth signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, role)
    VALUES (new.id, 'cashier'::public.user_role);
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Create day_sessions table
CREATE TABLE IF NOT EXISTS public.day_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT NOT NULL,
    status public.session_status DEFAULT 'open'::public.session_status NOT NULL,
    opening_balance NUMERIC(12, 2) NOT NULL CONSTRAINT check_opening_balance CHECK (opening_balance >= 0),
    closing_balance NUMERIC(12, 2) CONSTRAINT check_closing_balance CHECK (closing_balance >= 0),
    opened_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    closed_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Unique index to enforce that only one session can be open at a time
CREATE UNIQUE INDEX IF NOT EXISTS one_open_session_idx 
    ON public.day_sessions (status) 
    WHERE (status = 'open');

-- 4. Create bills table
CREATE TABLE IF NOT EXISTS public.bills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES public.day_sessions(id) ON DELETE RESTRICT NOT NULL,
    created_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT NOT NULL,
    discount_amount NUMERIC(12, 2) DEFAULT 0.00 NOT NULL CONSTRAINT check_discount_amount CHECK (discount_amount >= 0),
    payment_method public.payment_method_type NOT NULL,
    cash_amount NUMERIC(12, 2) DEFAULT 0.00 NOT NULL CONSTRAINT check_cash_amount CHECK (cash_amount >= 0),
    upi_amount NUMERIC(12, 2) DEFAULT 0.00 NOT NULL CONSTRAINT check_upi_amount CHECK (upi_amount >= 0),
    total_price NUMERIC(12, 2) NOT NULL CONSTRAINT check_total_price CHECK (total_price >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    
    -- Constraint: Split payments or single payment sums must match total price
    CONSTRAINT check_payment_sums CHECK (
        (payment_method = 'cash'::public.payment_method_type AND cash_amount = total_price AND upi_amount = 0) OR
        (payment_method = 'upi'::public.payment_method_type AND upi_amount = total_price AND cash_amount = 0) OR
        (payment_method = 'split'::public.payment_method_type AND (cash_amount + upi_amount) = total_price)
    )
);

-- 5. Create bill_items table
CREATE TABLE IF NOT EXISTS public.bill_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_id UUID REFERENCES public.bills(id) ON DELETE CASCADE NOT NULL,
    plant_name TEXT NOT NULL,
    unit_price NUMERIC(12, 2) NOT NULL CONSTRAINT check_unit_price CHECK (unit_price >= 0),
    quantity INTEGER NOT NULL CONSTRAINT check_quantity CHECK (quantity > 0),
    total_price NUMERIC(12, 2) NOT NULL CONSTRAINT check_item_total CHECK (total_price >= 0),
    
    -- Constraint: Total price must match quantity * unit price
    CONSTRAINT check_item_total_match CHECK (total_price = unit_price * quantity)
);

-- 6. Enable Row Level Security (RLS) on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.day_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_items ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies
-- Profiles Policies
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.profiles;
CREATE POLICY "Enable read access for authenticated users"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Enable update for users own profile" ON public.profiles;
CREATE POLICY "Enable update for users own profile"
    ON public.profiles FOR UPDATE
    TO authenticated
    USING (auth.uid() = id);

-- Day Sessions Policies
DROP POLICY IF EXISTS "Enable read for authenticated users on sessions" ON public.day_sessions;
CREATE POLICY "Enable read for authenticated users on sessions"
    ON public.day_sessions FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Enable insert for cashiers and admins on sessions" ON public.day_sessions;
CREATE POLICY "Enable insert for cashiers and admins on sessions"
    ON public.day_sessions FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() 
              AND profiles.role IN ('admin'::public.user_role, 'cashier'::public.user_role)
        )
    );

DROP POLICY IF EXISTS "Enable update for cashiers and admins on sessions" ON public.day_sessions;
CREATE POLICY "Enable update for cashiers and admins on sessions"
    ON public.day_sessions FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() 
              AND profiles.role IN ('admin'::public.user_role, 'cashier'::public.user_role)
        )
    );

-- Bills Policies
DROP POLICY IF EXISTS "Enable read for authenticated users on bills" ON public.bills;
CREATE POLICY "Enable read for authenticated users on bills"
    ON public.bills FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Enable insert for cashiers and admins on bills" ON public.bills;
CREATE POLICY "Enable insert for cashiers and admins on bills"
    ON public.bills FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() 
              AND profiles.role IN ('admin'::public.user_role, 'cashier'::public.user_role)
        )
    );

-- Bill Items Policies
DROP POLICY IF EXISTS "Enable read for authenticated users on bill items" ON public.bill_items;
CREATE POLICY "Enable read for authenticated users on bill items"
    ON public.bill_items FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Enable insert for cashiers and admins on bill items" ON public.bill_items;
CREATE POLICY "Enable insert for cashiers and admins on bill items"
    ON public.bill_items FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() 
              AND profiles.role IN ('admin'::public.user_role, 'cashier'::public.user_role)
        )
    );
