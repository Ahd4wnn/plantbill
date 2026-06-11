from enum import Enum
from decimal import Decimal, InvalidOperation
from datetime import datetime
from uuid import UUID
from typing import List, Optional
from pydantic import BaseModel, Field, field_validator, model_validator

def to_decimal(value, default="0.00") -> Decimal:
    if value is None:
        return Decimal(default)
    s = str(value).strip()
    if s == "" or s.lower() in ("none", "null", "nan"):
        return Decimal(default)
    try:
        return Decimal(s)
    except (InvalidOperation, ValueError, ArithmeticError):
        raise ValueError(f"Not a valid number: {value!r}")

def parse_int_safely(v) -> int:
    if v is None or (isinstance(v, str) and v.strip() == ""):
        raise ValueError("Quantity is required and must be a valid integer")
    try:
        dec = to_decimal(v)
        return int(dec)
    except (ValueError, TypeError):
        raise ValueError("Quantity must be a valid integer")


# 1. Enums
class UserRole(str, Enum):
    ADMIN = 'admin'
    CASHIER = 'cashier'

class SessionStatus(str, Enum):
    OPEN = 'open'
    CLOSED = 'closed'

class PaymentMethod(str, Enum):
    CASH = 'cash'
    UPI = 'upi'
    SPLIT = 'split'

# 2. Database Row Models
class Profile(BaseModel):
    id: UUID
    role: UserRole
    full_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class DaySession(BaseModel):
    id: UUID
    opened_by: UUID
    status: SessionStatus
    opening_balance: Decimal = Field(..., ge=0)
    closing_balance: Optional[Decimal] = Field(None, ge=0)
    opened_at: datetime
    closed_at: Optional[datetime] = None
    notes: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class Bill(BaseModel):
    id: UUID
    session_id: UUID
    created_by: UUID
    discount_amount: Decimal = Field(Decimal('0.00'), ge=0, description="Flat discount amount")
    payment_method: PaymentMethod
    cash_amount: Decimal = Field(Decimal('0.00'), ge=0)
    upi_amount: Decimal = Field(Decimal('0.00'), ge=0)
    total: Decimal = Field(..., ge=0)
    bill_number: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True

class BillItem(BaseModel):
    id: UUID
    bill_id: UUID
    plant_name: str
    unit_price: Decimal = Field(..., ge=0)
    quantity: int = Field(..., gt=0)
    total_price: Decimal = Field(..., ge=0)

    class Config:
        from_attributes = True

# 3. Request Shapes
class SessionOpen(BaseModel):
    opening_balance: Decimal = Field(..., ge=0, description="Opening register balance in Rupees")
    notes: Optional[str] = Field(None, description="Optional opening notes")

class SessionClose(BaseModel):
    closing_balance: Decimal = Field(..., ge=0, description="Ending register balance in Rupees")
    notes: Optional[str] = Field(None, description="Optional closing notes")

class BillItemIn(BaseModel):
    plant_name: str = Field(..., min_length=1)
    unit_price: Decimal = Field(..., ge=0)
    quantity: int = Field(..., gt=0)
    total_price: Decimal = Field(..., ge=0)

    @field_validator('unit_price', 'total_price', mode='before')
    @classmethod
    def validate_decimal(cls, v):
        return to_decimal(v)

    @field_validator('quantity', mode='before')
    @classmethod
    def validate_int(cls, v):
        return parse_int_safely(v)

    @model_validator(mode='after')
    def validate_item_total(self) -> 'BillItemIn':
        expected_total = self.unit_price * self.quantity
        if self.total_price != expected_total:
            raise ValueError(f"total_price ({self.total_price}) must equal unit_price * quantity ({expected_total})")
        return self

class BillCreate(BaseModel):
    items: List[BillItemIn] = Field(..., min_length=1, description="List of items in the bill")
    discount_amount: Decimal = Field(Decimal('0.00'), ge=0, description="Flat discount amount in Rupees")
    payment_method: PaymentMethod = Field(..., description="Payment mode")
    cash_amount: Decimal = Field(Decimal('0.00'), ge=0, description="Cash paid")
    upi_amount: Decimal = Field(Decimal('0.00'), ge=0, description="UPI paid")
    customer_name: Optional[str] = Field(None, description="Optional customer name")
    customer_phone: Optional[str] = Field(None, description="Optional customer phone")

    @field_validator('discount_amount', 'cash_amount', 'upi_amount', mode='before')
    @classmethod
    def validate_decimal(cls, v):
        return to_decimal(v)

    @field_validator('customer_name', mode='before')
    @classmethod
    def validate_name(cls, v):
        if v is None:
            return None
        s = str(v).strip()
        return s if s != "" else None

    @field_validator('customer_phone', mode='before')
    @classmethod
    def validate_phone(cls, v):
        if v is None:
            return None
        s = str(v).strip()
        if s == "":
            return None
        import re
        if not re.match(r"^[0-9\s+\-()]+$", s):
            raise ValueError("Phone number contains invalid characters. Only digits, spaces, +, -, and () are allowed.")
        if len(s) > 20:
            raise ValueError("Phone number must not exceed 20 characters.")
        return s

    @model_validator(mode='after')
    def validate_payment_sums(self) -> 'BillCreate':
        items = self.items
        discount = self.discount_amount
        
        # Calculate expected total price
        total_items_price = sum(item.total_price for item in items)
        expected_total = total_items_price - discount
        if expected_total < 0:
            raise ValueError("Discount cannot exceed total items price")
            
        method = self.payment_method
        cash = self.cash_amount
        upi = self.upi_amount
        
        if method == PaymentMethod.CASH:
            if cash != expected_total:
                raise ValueError(f"For CASH payment, cash_amount ({cash}) must equal total price ({expected_total})")
            if upi != 0:
                raise ValueError(f"For CASH payment, upi_amount must be 0, got {upi}")
        elif method == PaymentMethod.UPI:
            if upi != expected_total:
                raise ValueError(f"For UPI payment, upi_amount ({upi}) must equal total price ({expected_total})")
            if cash != 0:
                raise ValueError(f"For UPI payment, cash_amount must be 0, got {cash}")
        elif method == PaymentMethod.SPLIT:
            if cash + upi != expected_total:
                raise ValueError(f"For SPLIT payment, cash_amount + upi_amount ({cash + upi}) must equal total price ({expected_total})")
                
        return self

# 4. Response Shapes
class SessionSummary(BaseModel):
    bill_count: int = 0
    revenue: Decimal = Decimal('0.00')
    cash_total: Decimal = Decimal('0.00')
    upi_total: Decimal = Decimal('0.00')
    expense_total: Decimal = Decimal('0.00')

class SessionDetailResponse(BaseModel):
    id: UUID
    opened_by: UUID
    status: SessionStatus
    opening_balance: Decimal
    closing_balance: Optional[Decimal] = None
    opened_at: datetime
    closed_at: Optional[datetime] = None
    notes: Optional[str] = None
    created_at: datetime
    summary: Optional[SessionSummary] = None
    expense_total: Decimal = Decimal('0.00')

    class Config:
        from_attributes = True

class SessionCloseResponse(BaseModel):
    session: DaySession
    expected_cash: Decimal
    variance: Decimal

class BillItemResponse(BaseModel):
    plant_name: str
    unit_price: Decimal
    quantity: int
    total_price: Decimal

    class Config:
        from_attributes = True

class BillDetailResponse(BaseModel):
    id: UUID
    session_id: UUID
    created_by: UUID
    discount_amount: Decimal
    payment_method: PaymentMethod
    cash_amount: Decimal
    upi_amount: Decimal
    total_price: Decimal
    bill_number: int
    created_at: datetime
    items: List[BillItemResponse]
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None

    class Config:
        from_attributes = True

class BillSummaryResponse(BaseModel):
    id: UUID
    bill_number: int
    total_price: Decimal
    created_at: datetime
    item_count: int
    payment_method: PaymentMethod
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None

    class Config:
        from_attributes = True

class ExpenseCreate(BaseModel):
    amount: Decimal = Field(..., gt=0, description="Amount taken out in Rupees")
    reason: str = Field(..., min_length=1, description="Reason for expense")

    @field_validator('amount', mode='before')
    @classmethod
    def validate_decimal(cls, v):
        return to_decimal(v)

    @field_validator('reason', mode='before')
    @classmethod
    def validate_reason(cls, v):
        if v is None:
            raise ValueError("Reason is required")
        s = str(v).strip()
        if s == "":
            raise ValueError("Reason cannot be empty")
        return s

class ExpenseResponse(BaseModel):
    id: UUID
    amount: Decimal
    reason: str
    created_at: datetime

    class Config:
        from_attributes = True

class ExpenseListResponse(BaseModel):
    expenses: List[ExpenseResponse]
    total_expenses: Decimal
