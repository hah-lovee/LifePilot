from okx_service import get_account_balance

def test_get_account_balance():
    result = get_account_balance()
    print(result)  # Выведет результат в консоль

if __name__ == "__main__":
    test_get_account_balance()