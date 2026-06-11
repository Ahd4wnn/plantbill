from fastapi import APIRouter, Depends, HTTPException, Query, status
from typing import List, Optional
from decimal import Decimal
from uuid import UUID
from datetime import datetime

from models.schemas import (
    ExpenseCreate,
    ExpenseResponse,
    ExpenseListResponse,
    to_decimal
)
from auth.dependencies import get_current_user
from db.client import get_supabase

router = APIRouter(
    prefix="/api/expenses",
    tags=["expenses"]
)

@router.post("/", response_model=ExpenseResponse)
async def create_expense(
    payload: ExpenseCreate,
    current_user: dict = Depends(get_current_user)
):
    """
    Records a petty cash expense against the current open session.
    """
    supabase = get_supabase()
    
    # 1. Fetch current open session
    session_res = supabase.table("day_sessions").select("id").eq("status", "open").execute()
    if not session_res.data:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Start the day before adding an expense. Please open a register session first."
        )
    open_session = session_res.data[0]
    
    try:
        insert_data = {
            "session_id": open_session["id"],
            "amount": float(payload.amount),
            "reason": payload.reason,
            "created_by": current_user["id"]
        }
        
        res = supabase.table("expenses").insert(insert_data).execute()
        if not res.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Database failed to record expense."
            )
            
        exp_data = res.data[0]
        return ExpenseResponse(
            id=UUID(exp_data["id"]),
            amount=Decimal(str(exp_data["amount"])),
            reason=exp_data["reason"],
            created_at=datetime.fromisoformat(exp_data["created_at"].replace("Z", "+00:00"))
        )
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create expense: {str(e)}"
        )

@router.get("/", response_model=ExpenseListResponse)
async def list_expenses(
    scope: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user)
):
    """
    Lists petty cash expenses.
    If scope="current" (default/recommended for cashiers), lists expenses for the current open session.
    """
    supabase = get_supabase()
    
    try:
        if scope == "current":
            # Fetch current open session
            session_res = supabase.table("day_sessions").select("id").eq("status", "open").execute()
            if not session_res.data:
                return ExpenseListResponse(expenses=[], total_expenses=Decimal("0.00"))
            
            open_session_id = session_res.data[0]["id"]
            res = supabase.table("expenses").select("*").eq("session_id", open_session_id).order("created_at", desc=True).execute()
        else:
            # List all expenses
            res = supabase.table("expenses").select("*").order("created_at", desc=True).execute()
            
        if not res.data:
            return ExpenseListResponse(expenses=[], total_expenses=Decimal("0.00"))
            
        expenses = []
        total_expenses = Decimal("0.00")
        
        for exp in res.data:
            amount = Decimal(str(exp["amount"]))
            expenses.append(
                ExpenseResponse(
                    id=UUID(exp["id"]),
                    amount=amount,
                    reason=exp["reason"],
                    created_at=datetime.fromisoformat(exp["created_at"].replace("Z", "+00:00"))
                )
            )
            total_expenses += amount
            
        return ExpenseListResponse(
            expenses=expenses,
            total_expenses=total_expenses
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list expenses: {str(e)}"
        )

@router.delete("/{expense_id}", response_model=dict)
async def delete_expense(
    expense_id: UUID,
    current_user: dict = Depends(get_current_user)
):
    """
    Deletes an expense if the associated session is still open.
    """
    supabase = get_supabase()
    
    try:
        # 1. Fetch the expense
        exp_res = supabase.table("expenses").select("session_id").eq("id", str(expense_id)).execute()
        if not exp_res.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Expense not found."
            )
        session_id = exp_res.data[0]["session_id"]
        
        # 2. Check if the session is still open
        session_res = supabase.table("day_sessions").select("status").eq("id", session_id).execute()
        if not session_res.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Associated session not found."
            )
            
        if session_res.data[0]["status"] != "open":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Cannot delete expense from a closed register session."
            )
            
        # 3. Delete the expense
        delete_res = supabase.table("expenses").delete().eq("id", str(expense_id)).execute()
        if not delete_res.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Database failed to delete expense."
            )
            
        return {"success": True}
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete expense: {str(e)}"
        )
