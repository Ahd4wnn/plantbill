from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Optional
from decimal import Decimal
from datetime import datetime
from uuid import UUID

from models.schemas import (
    SessionOpen,
    SessionClose,
    SessionDetailResponse,
    SessionCloseResponse,
    SessionSummary,
    DaySession
)
from auth.dependencies import get_current_user, require_admin
from db.client import get_supabase

router = APIRouter(
    prefix="/api/sessions",
    tags=["sessions"]
)

@router.get("/current", response_model=Optional[SessionDetailResponse])
async def get_current_session(current_user: dict = Depends(get_current_user)):
    """
    Returns the currently active open day session.
    If no session is open, returns None.
    """
    supabase = get_supabase()
    
    try:
        # Fetch current open session
        res = supabase.table("day_sessions").select("*").eq("status", "open").execute()
        if not res.data:
            return None
        
        session_data = res.data[0]
        session_id = session_data["id"]
        
        # Calculate summary metrics for the open session
        bills_res = supabase.table("bills").select("cash_amount, upi_amount, total").eq("session_id", session_id).execute()
        
        bill_count = len(bills_res.data)
        revenue = Decimal("0.00")
        cash_total = Decimal("0.00")
        upi_total = Decimal("0.00")
        
        for bill in bills_res.data:
            revenue += Decimal(str(bill["total"]))
            cash_total += Decimal(str(bill["cash_amount"]))
            upi_total += Decimal(str(bill["upi_amount"]))
            
        # Calculate expenses for the open session
        expenses_res = supabase.table("expenses").select("amount").eq("session_id", session_id).execute()
        expense_total = Decimal("0.00")
        for exp in expenses_res.data:
            expense_total += Decimal(str(exp["amount"]))
            
        summary = SessionSummary(
            bill_count=bill_count,
            revenue=revenue,
            cash_total=cash_total,
            upi_total=upi_total,
            expense_total=expense_total
        )
        
        # Construct response
        return SessionDetailResponse(
            id=UUID(session_data["id"]),
            opened_by=UUID(session_data["opened_by"]),
            status=session_data["status"],
            opening_balance=Decimal(str(session_data["opening_balance"])),
            closing_balance=Decimal(str(session_data["closing_balance"])) if session_data["closing_balance"] is not None else None,
            opened_at=datetime.fromisoformat(session_data["opened_at"].replace("Z", "+00:00")),
            closed_at=datetime.fromisoformat(session_data["closed_at"].replace("Z", "+00:00")) if session_data["closed_at"] is not None else None,
            notes=session_data["notes"],
            created_at=datetime.fromisoformat(session_data["created_at"].replace("Z", "+00:00")),
            summary=summary,
            expense_total=expense_total
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve current session: {str(e)}"
        )

@router.post("/open", response_model=SessionDetailResponse)
async def open_session(
    payload: SessionOpen,
    current_user: dict = Depends(get_current_user)
):
    """
    Opens a new day session register.
    If a session is already open, returns a 409 Conflict.
    """
    supabase = get_supabase()
    
    # Check if a session is already open
    check_res = supabase.table("day_sessions").select("id").eq("status", "open").execute()
    if check_res.data:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A register session is already open. Close it before opening a new one."
        )
        
    try:
        insert_data = {
            "opened_by": current_user["id"],
            "status": "open",
            "opening_balance": float(payload.opening_balance),
            "notes": payload.notes
        }
        
        res = supabase.table("day_sessions").insert(insert_data).execute()
        if not res.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Database failed to open session."
            )
            
        session_data = res.data[0]
        return SessionDetailResponse(
            id=UUID(session_data["id"]),
            opened_by=UUID(session_data["opened_by"]),
            status=session_data["status"],
            opening_balance=Decimal(str(session_data["opening_balance"])),
            closing_balance=None,
            opened_at=datetime.fromisoformat(session_data["opened_at"].replace("Z", "+00:00")),
            closed_at=None,
            notes=session_data["notes"],
            created_at=datetime.fromisoformat(session_data["created_at"].replace("Z", "+00:00")),
            summary=SessionSummary()
        )
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to open session: {str(e)}"
        )

@router.post("/close", response_model=SessionCloseResponse)
async def close_session(
    payload: SessionClose,
    current_user: dict = Depends(get_current_user)
):
    """
    Closes the current active session, computing expected cash and variance.
    If no session is open, returns a 409 Conflict.
    """
    supabase = get_supabase()
    
    # Fetch the open session
    session_res = supabase.table("day_sessions").select("*").eq("status", "open").execute()
    if not session_res.data:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No session is currently open."
        )
        
    open_session = session_res.data[0]
    session_id = open_session["id"]
    opening_balance = Decimal(str(open_session["opening_balance"]))
    
    try:
        # Sum cash transactions from bills inside this session
        bills_res = supabase.table("bills").select("cash_amount").eq("session_id", session_id).execute()
        
        total_cash_sales = Decimal("0.00")
        for bill in bills_res.data:
            total_cash_sales += Decimal(str(bill["cash_amount"]))
            
        # Sum expenses for this session
        expenses_res = supabase.table("expenses").select("amount").eq("session_id", session_id).execute()
        expense_total = Decimal("0.00")
        for exp in expenses_res.data:
            expense_total += Decimal(str(exp["amount"]))
            
        expected_cash = opening_balance + total_cash_sales - expense_total
        variance = payload.closing_balance - expected_cash
        
        update_data = {
            "status": "closed",
            "closing_balance": float(payload.closing_balance),
            "closed_at": datetime.utcnow().isoformat(),
            "notes": payload.notes if payload.notes else open_session.get("notes")
        }
        
        update_res = supabase.table("day_sessions").update(update_data).eq("id", session_id).execute()
        if not update_res.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Database failed to close session."
            )
            
        closed_session = update_res.data[0]
        
        session_row = DaySession(
            id=UUID(closed_session["id"]),
            opened_by=UUID(closed_session["opened_by"]),
            status=closed_session["status"],
            opening_balance=Decimal(str(closed_session["opening_balance"])),
            closing_balance=Decimal(str(closed_session["closing_balance"])),
            opened_at=datetime.fromisoformat(closed_session["opened_at"].replace("Z", "+00:00")),
            closed_at=datetime.fromisoformat(closed_session["closed_at"].replace("Z", "+00:00")),
            notes=closed_session["notes"],
            created_at=datetime.fromisoformat(closed_session["created_at"].replace("Z", "+00:00"))
        )
        
        return SessionCloseResponse(
            session=session_row,
            expected_cash=expected_cash,
            variance=variance
        )
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to close session: {str(e)}"
        )

@router.get("/", response_model=List[SessionDetailResponse])
async def list_sessions(admin_user: dict = Depends(require_admin)):
    """
    Lists historical sessions, newest first, with summary details.
    Admin only.
    """
    supabase = get_supabase()
    
    try:
        # Fetch sessions ordered by opened_at descending
        sessions_res = supabase.table("day_sessions").select("*").order("opened_at", desc=True).execute()
        if not sessions_res.data:
            return []
            
        # Fetch all bills to map in-memory and avoid N+1 queries
        bills_res = supabase.table("bills").select("session_id, cash_amount, upi_amount, total").execute()
        
        # Build mapping of session_id -> list of bills
        bills_by_session = {}
        for bill in bills_res.data:
            s_id = bill["session_id"]
            if s_id not in bills_by_session:
                bills_by_session[s_id] = []
            bills_by_session[s_id].append(bill)
            
        # Fetch all expenses to map in-memory and avoid N+1 queries
        expenses_res = supabase.table("expenses").select("session_id, amount").execute()
        
        # Build mapping of session_id -> list of expenses
        expenses_by_session = {}
        for exp in expenses_res.data:
            s_id = exp["session_id"]
            if s_id not in expenses_by_session:
                expenses_by_session[s_id] = []
            expenses_by_session[s_id].append(exp)
            
        responses = []
        for session_data in sessions_res.data:
            s_id = session_data["id"]
            session_bills = bills_by_session.get(s_id, [])
            session_expenses = expenses_by_session.get(s_id, [])
            
            bill_count = len(session_bills)
            revenue = Decimal("0.00")
            cash_total = Decimal("0.00")
            upi_total = Decimal("0.00")
            
            for bill in session_bills:
                revenue += Decimal(str(bill["total"]))
                cash_total += Decimal(str(bill["cash_amount"]))
                upi_total += Decimal(str(bill["upi_amount"]))
                
            expense_total = Decimal("0.00")
            for exp in session_expenses:
                expense_total += Decimal(str(exp["amount"]))
                
            summary = SessionSummary(
                bill_count=bill_count,
                revenue=revenue,
                cash_total=cash_total,
                upi_total=upi_total,
                expense_total=expense_total
            )
            
            responses.append(
                SessionDetailResponse(
                    id=UUID(session_data["id"]),
                    opened_by=UUID(session_data["opened_by"]),
                    status=session_data["status"],
                    opening_balance=Decimal(str(session_data["opening_balance"])),
                    closing_balance=Decimal(str(session_data["closing_balance"])) if session_data["closing_balance"] is not None else None,
                    opened_at=datetime.fromisoformat(session_data["opened_at"].replace("Z", "+00:00")),
                    closed_at=datetime.fromisoformat(session_data["closed_at"].replace("Z", "+00:00")) if session_data["closed_at"] is not None else None,
                    notes=session_data["notes"],
                    created_at=datetime.fromisoformat(session_data["created_at"].replace("Z", "+00:00")),
                    summary=summary,
                    expense_total=expense_total
                )
            )
            
        return responses
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list sessions: {str(e)}"
        )
