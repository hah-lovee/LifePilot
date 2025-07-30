# app/services/okx_client.py
import os
from dotenv import load_dotenv
from okx import OkxRestClient

load_dotenv()

OKX_API_KEY = os.getenv("OKX_API_KEY")
OKX_SECRET_KEY = os.getenv("OKX_SECRET_KEY")
OKX_PASSPHRASE = os.getenv("OKX_PASSPHRASE")

client = OkxRestClient(OKX_API_KEY, OKX_SECRET_KEY, OKX_PASSPHRASE)

def get_account_balance():
    try:
        return client.account.get_account_balance()
    except Exception as e:
        print(f"Error fetching account balance: {e}")
        return None
