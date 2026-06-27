import requests
from fastapi import HTTPException, status

from app.core.config import settings


def _headers() -> dict:
    return {"X-API-Key": settings.investments_api_key}


def _request(method: str, path: str, **kwargs) -> requests.Response:
    try:
        resp = requests.request(method, f"{settings.investments_api_url}{path}", headers=_headers(), **kwargs)
    except requests.exceptions.RequestException as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Сервис инвестиций недоступен — попробуйте позже",
        ) from exc
    return resp


def _raise_for_status(resp: requests.Response) -> None:
    if resp.ok:
        return
    detail = resp.text
    try:
        detail = resp.json().get("detail", detail)
    except ValueError:
        pass
    raise HTTPException(status_code=resp.status_code, detail=detail)


def connect_exchange(user_guid: str, exchange: str, api_key: str, secret_key: str, passphrase: str | None) -> dict:
    resp = _request(
        "post", "/exchanges",
        json={
            "user_guid": user_guid, "exchange": exchange,
            "api_key": api_key, "secret_key": secret_key, "passphrase": passphrase,
        },
        timeout=15,
    )
    _raise_for_status(resp)
    return resp.json()


def update_exchange(user_guid: str, exchange: str, api_key: str, secret_key: str, passphrase: str | None) -> dict:
    resp = _request(
        "put", "/exchanges",
        json={
            "user_guid": user_guid, "exchange": exchange,
            "api_key": api_key, "secret_key": secret_key, "passphrase": passphrase,
        },
        timeout=15,
    )
    _raise_for_status(resp)
    return resp.json()


def delete_exchange(user_guid: str, exchange: str) -> None:
    resp = _request("delete", f"/exchanges/{user_guid}/{exchange}", timeout=15)
    _raise_for_status(resp)


def connect_broker(user_guid: str, broker: str, token: str, account_id: str | None) -> dict:
    resp = _request(
        "post", "/brokers",
        json={"user_guid": user_guid, "broker": broker, "token": token, "account_id": account_id},
        timeout=15,
    )
    _raise_for_status(resp)
    return resp.json()


def update_broker(user_guid: str, broker: str, token: str, account_id: str | None) -> dict:
    resp = _request(
        "put", "/brokers",
        json={"user_guid": user_guid, "broker": broker, "token": token, "account_id": account_id},
        timeout=15,
    )
    _raise_for_status(resp)
    return resp.json()


def delete_broker(user_guid: str, broker: str) -> None:
    resp = _request("delete", f"/brokers/{user_guid}/{broker}", timeout=15)
    _raise_for_status(resp)


def get_balances(user_guid: str) -> dict | None:
    resp = _request("get", f"/balances/{user_guid}", timeout=30)
    if resp.status_code == status.HTTP_404_NOT_FOUND:
        return None
    _raise_for_status(resp)
    return resp.json()


def get_dividends(user_guid: str, lookahead_days: int = 90) -> list[dict]:
    resp = _request("get", f"/dividends/{user_guid}", params={"lookahead_days": lookahead_days}, timeout=30)
    _raise_for_status(resp)
    return resp.json()


def get_rates() -> dict:
    resp = _request("get", "/rates", timeout=15)
    _raise_for_status(resp)
    return resp.json()
