# app/api/balance.py
from fastapi import APIRouter
from app.services.okx_client import get_account_balance
from app.utils.response_parser import parse_balance_response

router = APIRouter()

@router.get("/get-balance")
def get_balance():
    raw_balance = get_account_balance()
    if raw_balance:
        parsed = parse_balance_response(raw_balance)
        return parsed
    return {"error": "Failed to fetch balance"}