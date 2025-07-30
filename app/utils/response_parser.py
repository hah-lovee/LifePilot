# app/utils/response_parser.py
from datetime import datetime

def parse_balance_response(raw_response):
    if raw_response.get("code") != "0":
        return {"error": "Invalid response", "details": raw_response}

    result = []
    balances = raw_response.get("data", [])
    for item in balances:
        details = item.get("details", [])
        for asset in details:
            try:
                eq_usd = float(asset.get("eqUsd", "0"))
                if eq_usd > 1:
                    result.append({
                        "currency": asset.get("ccy"),
                        "balance": asset.get("cashBal"),
                        "available": asset.get("availBal"),
                        "equivalent_usd": asset.get("eqUsd"),
                        "ord_frozen": asset.get("ordFrozen"),
                        "updated_at": datetime.fromtimestamp(int(asset.get("uTime")) / 1000).isoformat()
                    })
            except Exception as e:
                continue  # ignore malformed rows
    return result


# def parse_balance_response(raw):
#     result = []
#     details = raw.get("data", [])[0].get("details", [])
#     for currency in details:
#         try:
#             eq_usd = float(currency.get("eqUsd", "0"))
#         except ValueError:
#             eq_usd = 0

#         if eq_usd > 1:
#             result.append({
#                 "Валюта": currency.get("ccy"),
#                 "ВесьОстаток": currency.get("cashBal"),
#                 "ДоступныйОстаток": currency.get("availBal"),
#                 "ЭквивалентВДолларах": currency.get("eqUsd"),
#                 "ЗамороженоПодОрдера": currency.get("ordFrozen"),
#                 "ВремяОбновления": currency.get("uTime")
#             })
#     return result