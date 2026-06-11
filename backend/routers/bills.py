from fastapi import APIRouter, Depends, HTTPException, Query, status, Request
from typing import List, Optional
from decimal import Decimal
from uuid import UUID
from datetime import datetime
import logging

from models.schemas import (
    BillCreate,
    BillSummaryResponse,
    BillDetailResponse,
    BillItemResponse,
    to_decimal
)
from auth.dependencies import get_current_user
from db.client import get_supabase

router = APIRouter(
    prefix="/api/bills",
    tags=["bills"]
)

@router.post("/", response_model=dict)
async def create_bill(
    request: Request,
    current_user: dict = Depends(get_current_user)
):
    """
    Creates a new bill.
    Performs validation on open session, item totals, and payment sums,
    then executes transaction in database using RPC create_bill.
    """
    body = await request.json()
    logging.info("RAW BILL PAYLOAD: %s", body)
    
    try:
        payload = BillCreate(**body)
    except Exception as e:
        logging.exception("BILL MODEL PARSING FAILED")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Validation failed: {str(e)}"
        )

    supabase = get_supabase()
    
    try:
        # 1. Fetch current open session
        session_res = supabase.table("day_sessions").select("id").eq("status", "open").execute()
        if not session_res.data:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Start the day before billing. Please open a register session first."
            )
        open_session = session_res.data[0]
        
        # 2. Subtotal and total calculation using to_decimal
        subtotal = sum(to_decimal(item.unit_price) * to_decimal(item.quantity) for item in payload.items)
        total = subtotal - to_decimal(payload.discount_amount)
        
        if total < 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Discount amount cannot exceed items subtotal."
            )

        # 3. Server-side verification of payment splits using to_decimal
        discount_amount_dec = to_decimal(payload.discount_amount)
        cash_amount_dec = to_decimal(payload.cash_amount)
        upi_amount_dec = to_decimal(payload.upi_amount)

        if payload.payment_method.value == "cash":
            if cash_amount_dec != total or upi_amount_dec != 0:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"For CASH payment, cash_amount ({cash_amount_dec}) must equal total price ({total}) and upi_amount must be 0."
                )
        elif payload.payment_method.value == "upi":
            if upi_amount_dec != total or cash_amount_dec != 0:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"For UPI payment, upi_amount ({upi_amount_dec}) must equal total price ({total}) and cash_amount must be 0."
                )
        elif payload.payment_method.value == "split":
            if cash_amount_dec + upi_amount_dec != total:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"For SPLIT payment, cash_amount + upi_amount ({cash_amount_dec + upi_amount_dec}) must equal total price ({total})."
                )
            
        # Serialize items converting Decimal objects to floats for JSON payload
        serialized_items = []
        for item in payload.items:
            serialized_items.append({
                "plant_name": item.plant_name,
                "unit_price": float(to_decimal(item.unit_price)),
                "quantity": int(to_decimal(item.quantity)),
                "total_price": float(to_decimal(item.total_price))
            })
            
        rpc_params = {
            "p_session_id": open_session["id"],
            "p_created_by": current_user["id"],
            "p_discount_amount": float(discount_amount_dec),
            "p_payment_method": payload.payment_method.value,
            "p_cash_amount": float(cash_amount_dec),
            "p_upi_amount": float(upi_amount_dec),
            "p_subtotal": float(subtotal),
            "p_total": float(total),
            "p_items": serialized_items,
            "p_customer_name": payload.customer_name,
            "p_customer_phone": payload.customer_phone
        }
        
        res = supabase.rpc("create_bill", rpc_params).execute()
        if not res.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Database transaction failed to create bill."
            )
            
        bill_data = res.data[0]
        logging.info("BILL DATA FROM RPC: %s", bill_data)
        total_val = bill_data.get("total") if "total" in bill_data else bill_data.get("total_price")
        if total_val is None:
            total_val = total
        return {
            "id": bill_data["id"],
            "bill_number": bill_data["bill_number"],
            "total": float(to_decimal(total_val)),
            "created_at": bill_data["created_at"],
            "customer_name": payload.customer_name,
            "customer_phone": payload.customer_phone
        }
    except HTTPException as he:
        logging.exception("BILL SAVE FAILED (HTTPException)")
        raise he
    except ValueError as ve:
        logging.exception("BILL SAVE FAILED (ValueError)")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Validation failed: {str(ve)}"
        )
    except Exception as e:
        logging.exception("BILL SAVE FAILED (Exception)")
        err_msg = str(e)
        if "Active session not found" in err_msg:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Register session is closed. Please open a session before billing."
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process transaction: {err_msg}"
        )

@router.get("/", response_model=List[BillSummaryResponse])
async def list_bills(
    scope: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user)
):
    """
    Lists bills.
    Query parameter scope="current" limits the list to the current active session.
    """
    supabase = get_supabase()
    
    try:
        query = supabase.table("bills").select("*, bill_items(id)")
        
        if scope == "current":
            # Find current open session
            session_res = supabase.table("day_sessions").select("id").eq("status", "open").execute()
            if not session_res.data:
                return [] # No current open session means no current bills
            open_session_id = session_res.data[0]["id"]
            query = query.eq("session_id", open_session_id)
            
        res = query.order("created_at", desc=True).execute()
        if not res.data:
            return []
            
        summaries = []
        for bill in res.data:
            summaries.append(
                BillSummaryResponse(
                    id=UUID(bill["id"]),
                    bill_number=int(bill["bill_number"]),
                    total_price=Decimal(str(bill["total"])),
                    created_at=datetime.fromisoformat(bill["created_at"].replace("Z", "+00:00")),
                    item_count=len(bill["bill_items"]),
                    payment_method=bill["payment_method"],
                    customer_name=bill.get("customer_name"),
                    customer_phone=bill.get("customer_phone")
                )
            )
        return summaries
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list transactions: {str(e)}"
        )

@router.get("/{bill_id}", response_model=BillDetailResponse)
async def get_bill_detail(
    bill_id: UUID,
    current_user: dict = Depends(get_current_user)
):
    """
    Retrieves full bill details including all line items.
    """
    supabase = get_supabase()
    
    try:
        # Fetch bill row
        bill_res = supabase.table("bills").select("*").eq("id", str(bill_id)).execute()
        if not bill_res.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Transaction receipt not found."
            )
        bill = bill_res.data[0]
        
        # Fetch associated line items
        items_res = supabase.table("bill_items").select("*").eq("bill_id", str(bill_id)).execute()
        
        items_response = []
        for item in items_res.data:
            items_response.append(
                BillItemResponse(
                    plant_name=item["plant_name"],
                    unit_price=Decimal(str(item["unit_price"])),
                    quantity=int(item["quantity"]),
                    total_price=Decimal(str(item["total_price"]))
                )
            )
            
        return BillDetailResponse(
            id=UUID(bill["id"]),
            session_id=UUID(bill["session_id"]),
            created_by=UUID(bill["created_by"]),
            discount_amount=Decimal(str(bill["discount_amount"])),
            payment_method=bill["payment_method"],
            cash_amount=Decimal(str(bill["cash_amount"])),
            upi_amount=Decimal(str(bill["upi_amount"])),
            total_price=Decimal(str(bill["total"])),
            bill_number=int(bill["bill_number"]),
            created_at=datetime.fromisoformat(bill["created_at"].replace("Z", "+00:00")),
            items=items_response,
            customer_name=bill.get("customer_name"),
            customer_phone=bill.get("customer_phone")
        )
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to resolve bill transaction: {str(e)}"
        )
