from fastapi import APIRouter, Depends, HTTPException, Query, status, Response
from typing import List, Optional
from decimal import Decimal
from uuid import UUID
from datetime import datetime, date, timedelta
import io
import csv

from models.schemas import PaymentMethod
from auth.dependencies import require_admin
from db.client import get_supabase
from pydantic import BaseModel

router = APIRouter(
    prefix="/api/admin",
    tags=["admin"]
)

# 1. Pydantic Models for Admin Router
class AdminSummaryResponse(BaseModel):
    session_date: date
    status: str
    opening_balance: Decimal
    closing_balance: Optional[Decimal] = None
    bill_count: int
    revenue: Decimal
    cash_total: Decimal
    upi_total: Decimal
    discount_total: Decimal
    expense_total: Decimal
    expected_cash: Decimal
    variance: Optional[Decimal] = None

class AdminDaySummary(BaseModel):
    session_date: date
    status: str
    bill_count: int
    revenue: Decimal
    cash_total: Decimal
    upi_total: Decimal
    expense_total: Decimal
    variance: Optional[Decimal] = None

class AdminDaysResponse(BaseModel):
    days: List[AdminDaySummary]
    total_revenue: Decimal
    total_bills: int
    total_cash: Decimal
    total_upi: Decimal

class AdminBillResponse(BaseModel):
    id: UUID
    bill_number: int
    session_date: date
    total: Decimal
    payment_method: PaymentMethod
    cash_amount: Decimal
    upi_amount: Decimal
    item_count: int
    created_at: datetime
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None

class CustomerBillHistory(BaseModel):
    id: UUID
    bill_number: int
    total: Decimal
    created_at: datetime
    payment_method: PaymentMethod

class CustomerHistoryResponse(BaseModel):
    customer_name: Optional[str] = None
    customer_phone: str
    bills: List[CustomerBillHistory]
    total_spent: Decimal
    bill_count: int

class AdminExpenseResponse(BaseModel):
    id: UUID
    session_id: UUID
    amount: Decimal
    reason: str
    created_by: UUID
    created_at: datetime
    created_by_name: Optional[str] = None

# 2. Router Endpoint Handlers
@router.get("/summary", response_model=Optional[AdminSummaryResponse])
async def get_admin_summary(
    date: Optional[str] = None,
    current_user: dict = Depends(require_admin)
):
    """
    Returns the aggregated register daily summary for a specific date (YYYY-MM-DD).
    Defaults to UTC today if no date is specified.
    Returns None if no session was active on that date.
    """
    supabase = get_supabase()
    date_str = date or datetime.utcnow().date().isoformat()
    
    try:
        res = supabase.table("daily_summary").select("*").eq("session_date", date_str).execute()
        if not res.data:
            return None
            
        row = res.data[0]
        return AdminSummaryResponse(
            session_date=datetime.strptime(row["session_date"], "%Y-%m-%d").date(),
            status=row["status"],
            opening_balance=Decimal(str(row["opening_balance"])),
            closing_balance=Decimal(str(row["closing_balance"])) if row["closing_balance"] is not None else None,
            bill_count=int(row["bill_count"]),
            revenue=Decimal(str(row["revenue"])),
            cash_total=Decimal(str(row["cash_total"])),
            upi_total=Decimal(str(row["upi_total"])),
            discount_total=Decimal(str(row["discount_total"])),
            expense_total=Decimal(str(row["expense_total"])),
            expected_cash=Decimal(str(row["expected_cash"])),
            variance=Decimal(str(row["variance"])) if row["variance"] is not None else None
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to query daily summary: {str(e)}"
        )

@router.get("/days", response_model=AdminDaysResponse)
async def get_admin_days(
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    current_user: dict = Depends(require_admin)
):
    """
    Returns daily aggregations from daily_summary across a date range.
    Defaults to the last 30 days.
    """
    supabase = get_supabase()
    
    # Calculate default range
    end_str = to_date or datetime.utcnow().date().isoformat()
    start_str = from_date or (datetime.utcnow() - timedelta(days=30)).date().isoformat()
    
    try:
        res = supabase.table("daily_summary").select("*") \
            .gte("session_date", start_str) \
            .lte("session_date", end_str) \
            .order("session_date", desc=True) \
            .execute()
            
        days = []
        total_revenue = Decimal("0.00")
        total_bills = 0
        total_cash = Decimal("0.00")
        total_upi = Decimal("0.00")
        
        for row in res.data:
            r = Decimal(str(row["revenue"]))
            b = int(row["bill_count"])
            c = Decimal(str(row["cash_total"]))
            u = Decimal(str(row["upi_total"]))
            v = Decimal(str(row["variance"])) if row["variance"] is not None else None
            e = Decimal(str(row["expense_total"]))
            
            total_revenue += r
            total_bills += b
            total_cash += c
            total_upi += u
            
            days.append(AdminDaySummary(
                session_date=datetime.strptime(row["session_date"], "%Y-%m-%d").date(),
                status=row["status"],
                bill_count=b,
                revenue=r,
                cash_total=c,
                upi_total=u,
                expense_total=e,
                variance=v
            ))
            
        return AdminDaysResponse(
            days=days,
            total_revenue=total_revenue,
            total_bills=total_bills,
            total_cash=total_cash,
            total_upi=total_upi
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to query historical day range: {str(e)}"
        )

@router.get("/bills", response_model=List[AdminBillResponse])
async def get_admin_bills(
    date: Optional[str] = None,
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    current_user: dict = Depends(require_admin)
):
    """
    Returns all bills for the range, newest first.
    Defaults to today if no parameter is provided.
    """
    supabase = get_supabase()
    
    query = supabase.table("bills").select("*, day_sessions(opened_at), bill_items(id)")
    
    if date:
        # Filter for bills created on that specific day
        start_time = f"{date}T00:00:00+00:00"
        end_time = f"{date}T23:59:59.999999+00:00"
        query = query.gte("created_at", start_time).lte("created_at", end_time)
    elif from_date or to_date:
        if from_date:
            query = query.gte("created_at", f"{from_date}T00:00:00+00:00")
        if to_date:
            query = query.lte("created_at", f"{to_date}T23:59:59.999999+00:00")
    else:
        # Default to today
        today = datetime.utcnow().date().isoformat()
        start_time = f"{today}T00:00:00+00:00"
        end_time = f"{today}T23:59:59.999999+00:00"
        query = query.gte("created_at", start_time).lte("created_at", end_time)
        
    try:
        res = query.order("created_at", desc=True).execute()
        
        response_bills = []
        for bill in res.data:
            session_opened = bill["day_sessions"]["opened_at"] if bill.get("day_sessions") else bill["created_at"]
            # Convert timestamp to date
            s_date = datetime.fromisoformat(session_opened.replace("Z", "+00:00")).date()
            
            response_bills.append(AdminBillResponse(
                id=UUID(bill["id"]),
                bill_number=int(bill["bill_number"]),
                session_date=s_date,
                total=Decimal(str(bill["total"])),
                payment_method=bill["payment_method"],
                cash_amount=Decimal(str(bill["cash_amount"])),
                upi_amount=Decimal(str(bill["upi_amount"])),
                item_count=len(bill["bill_items"]) if "bill_items" in bill else 0,
                created_at=datetime.fromisoformat(bill["created_at"].replace("Z", "+00:00")),
                customer_name=bill.get("customer_name"),
                customer_phone=bill.get("customer_phone")
            ))
            
        return response_bills
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to query range bills: {str(e)}"
        )

@router.get("/export/daily")
async def export_daily_summary(
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    current_user: dict = Depends(require_admin)
):
    """
    Exports daily summaries from daily_summary view as a CSV file.
    """
    supabase = get_supabase()
    
    end_str = to_date or datetime.utcnow().date().isoformat()
    start_str = from_date or (datetime.utcnow() - timedelta(days=30)).date().isoformat()
    
    try:
        res = supabase.table("daily_summary").select("*") \
            .gte("session_date", start_str) \
            .lte("session_date", end_str) \
            .order("session_date", desc=True) \
            .execute()
            
        output = io.StringIO()
        writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL)
        
        # Header Row
        writer.writerow([
            "Date", "Status", "Opening Balance", "Closing Balance", 
            "Bills", "Revenue", "Cash", "UPI", "Discount", "Expenses", "Expected Cash", "Variance"
        ])
        
        for row in res.data:
            opening = f"{float(row['opening_balance']):.2f}"
            closing = f"{float(row['closing_balance']):.2f}" if row['closing_balance'] is not None else ""
            revenue = f"{float(row['revenue']):.2f}"
            cash = f"{float(row['cash_total']):.2f}"
            upi = f"{float(row['upi_total']):.2f}"
            discount = f"{float(row['discount_total']):.2f}"
            expenses = f"{float(row['expense_total']):.2f}"
            expected = f"{float(row['expected_cash']):.2f}"
            
            variance = ""
            if row['variance'] is not None and row['status'] == 'closed':
                variance = f"{float(row['variance']):.2f}"
                
            writer.writerow([
                row["session_date"],
                row["status"].capitalize(),
                opening,
                closing,
                int(row["bill_count"]),
                revenue,
                cash,
                upi,
                discount,
                expenses,
                expected,
                variance
            ])
            
        filename = f"plantbill_daily_{start_str}_to_{end_str}.csv"
        
        return Response(
            content=output.getvalue(),
            media_type="text/csv",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Access-Control-Expose-Headers": "Content-Disposition"
            }
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to export daily summaries: {str(e)}"
        )

@router.get("/export/bills")
async def export_bills(
    date: Optional[str] = None,
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    current_user: dict = Depends(require_admin)
):
    """
    Exports detailed bills as a CSV file.
    """
    supabase = get_supabase()
    
    query = supabase.table("bills").select("*, day_sessions(opened_at), bill_items(plant_name, quantity)")
    
    if date:
        start_time = f"{date}T00:00:00+00:00"
        end_time = f"{date}T23:59:59.999999+00:00"
        query = query.gte("created_at", start_time).lte("created_at", end_time)
        filename = f"plantbill_bills_{date}.csv"
    elif from_date or to_date:
        start_str = from_date or datetime.utcnow().date().isoformat()
        end_str = to_date or datetime.utcnow().date().isoformat()
        query = query.gte("created_at", f"{start_str}T00:00:00+00:00").lte("created_at", f"{end_str}T23:59:59.999999+00:00")
        filename = f"plantbill_bills_{start_str}_to_{end_str}.csv"
    else:
        today = datetime.utcnow().date().isoformat()
        start_time = f"{today}T00:00:00+00:00"
        end_time = f"{today}T23:59:59.999999+00:00"
        query = query.gte("created_at", start_time).lte("created_at", end_time)
        filename = f"plantbill_bills_{today}.csv"
        
    try:
        res = query.order("created_at", desc=True).execute()
        
        output = io.StringIO()
        writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL)
        
        # Header Row
        writer.writerow([
            "Date", "Time", "Bill No", "Items", "Subtotal", "Discount", "Total", "Payment Method", "Cash", "UPI"
        ])
        
        for bill in res.data:
            created_dt = datetime.fromisoformat(bill["created_at"].replace("Z", "+00:00"))
            formatted_date = created_dt.date().isoformat()
            formatted_time = created_dt.time().strftime("%H:%M")
            
            items_list = []
            if "bill_items" in bill:
                for item in bill["bill_items"]:
                    items_list.append(f"{item['plant_name']} x{item['quantity']}")
            items_str = "; ".join(items_list)
            
            discount = f"{float(bill['discount_amount']):.2f}"
            total = f"{float(bill['total']):.2f}"
            cash = f"{float(bill['cash_amount']):.2f}"
            upi = f"{float(bill['upi_amount']):.2f}"
            subtotal = f"{(float(bill['total']) + float(bill['discount_amount'])):.2f}"
            
            payment_method_label = bill["payment_method"].capitalize()
            if bill["payment_method"] == "split":
                payment_method_label = "Both"
                
            writer.writerow([
                formatted_date,
                formatted_time,
                bill["bill_number"],
                items_str,
                subtotal,
                discount,
                total,
                payment_method_label,
                cash,
                upi
            ])
            
        return Response(
            content=output.getvalue(),
            media_type="text/csv",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Access-Control-Expose-Headers": "Content-Disposition"
            }
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to export bills list: {str(e)}"
        )

@router.get("/customers/{phone}", response_model=CustomerHistoryResponse)
async def get_customer_history(
    phone: str,
    current_user: dict = Depends(require_admin)
):
    """
    Returns the purchase history of a customer by phone number.
    Only accessible by admins.
    """
    supabase = get_supabase()
    try:
        # Query bills with the matching customer_phone
        res = supabase.table("bills").select("id, bill_number, total, payment_method, customer_name, created_at") \
            .eq("customer_phone", phone) \
            .order("created_at", desc=True) \
            .execute()
            
        bills_data = res.data or []
        
        # Most recent name is the customer_name from the newest bill (since we sorted desc)
        most_recent_name = None
        for b in bills_data:
            if b.get("customer_name"):
                most_recent_name = b["customer_name"]
                break
                
        bills_history = []
        total_spent = Decimal("0.00")
        
        for b in bills_data:
            total_spent += Decimal(str(b["total"]))
            bills_history.append(
                CustomerBillHistory(
                    id=UUID(b["id"]),
                    bill_number=int(b["bill_number"]),
                    total=Decimal(str(b["total"])),
                    created_at=datetime.fromisoformat(b["created_at"].replace("Z", "+00:00")),
                    payment_method=b["payment_method"]
                )
            )
            
        return CustomerHistoryResponse(
            customer_name=most_recent_name,
            customer_phone=phone,
            bills=bills_history,
            total_spent=total_spent,
            bill_count=len(bills_history)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to query customer history: {str(e)}"
        )

@router.get("/expenses", response_model=List[AdminExpenseResponse])
async def get_admin_expenses(
    date: str = Query(..., description="Date to retrieve expenses for (YYYY-MM-DD)"),
    current_user: dict = Depends(require_admin)
):
    """
    Lists all petty cash expenses recorded on a given date (YYYY-MM-DD).
    Only accessible by admins.
    """
    supabase = get_supabase()
    try:
        # Check expenses on that day. Note that expenses have a created_at timestamp.
        # We need to filter between dateT00:00:00+00:00 and dateT23:59:59.999999+00:00
        start_time = f"{date}T00:00:00+00:00"
        end_time = f"{date}T23:59:59.999999+00:00"
        
        # Select expenses join profile to show who recorded it
        res = supabase.table("expenses").select("*, profiles(full_name)") \
            .gte("created_at", start_time) \
            .lte("created_at", end_time) \
            .order("created_at", desc=True) \
            .execute()
            
        expenses = []
        for exp in res.data:
            profiles = exp.get("profiles") or {}
            created_by_name = profiles.get("full_name")
            expenses.append(
                AdminExpenseResponse(
                    id=UUID(exp["id"]),
                    session_id=UUID(exp["session_id"]),
                    amount=Decimal(str(exp["amount"])),
                    reason=exp["reason"],
                    created_by=UUID(exp["created_by"]),
                    created_at=datetime.fromisoformat(exp["created_at"].replace("Z", "+00:00")),
                    created_by_name=created_by_name
                )
            )
        return expenses
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to query daily expenses: {str(e)}"
        )
