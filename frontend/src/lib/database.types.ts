// TypeScript Definitions matching Supabase Schema in 02_schema.sql

export type UserRole = 'admin' | 'cashier';
export type SessionStatus = 'open' | 'closed';
export type PaymentMethod = 'cash' | 'upi' | 'split';

export interface Profile {
  id: string;
  role: UserRole;
  full_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface DaySession {
  id: string;
  opened_by: string;
  status: SessionStatus;
  opening_balance: number;
  closing_balance: number | null;
  opened_at: string;
  closed_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface Bill {
  id: string;
  session_id: string;
  created_by: string;
  discount_amount: number;
  payment_method: PaymentMethod;
  cash_amount: number;
  upi_amount: number;
  total_price: number;
  bill_number: number;
  created_at: string;
}

export interface BillItem {
  id: string;
  bill_id: string;
  plant_name: string;
  unit_price: number;
  quantity: number;
  total_price: number;
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, 'created_at' | 'updated_at'> & Partial<Pick<Profile, 'role' | 'created_at' | 'updated_at'>>;
        Update: Partial<Profile>;
      };
      day_sessions: {
        Row: DaySession;
        Insert: Omit<DaySession, 'id' | 'opened_at' | 'closed_at' | 'created_at'> & Partial<Pick<DaySession, 'id' | 'status' | 'closing_balance' | 'notes' | 'opened_at' | 'closed_at' | 'created_at'>>;
        Update: Partial<DaySession>;
      };
      bills: {
        Row: Bill;
        Insert: Omit<Bill, 'id' | 'created_at'> & Partial<Pick<Bill, 'id' | 'discount_amount' | 'cash_amount' | 'upi_amount' | 'created_at'>>;
        Update: Partial<Bill>;
      };
      bill_items: {
        Row: BillItem;
        Insert: Omit<BillItem, 'id'> & Partial<Pick<BillItem, 'id'>>;
        Update: Partial<BillItem>;
      };
    };
    Enums: {
      user_role: UserRole;
      session_status: SessionStatus;
      payment_method_type: PaymentMethod;
    };
  };
}
