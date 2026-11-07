"""
ShipDev Isolated Demo Application: Financial and arithmetic utility functions.
"""

def add(a: float, b: float) -> float:
    return a + b

def divide(a: float, b: float) -> float:
    if b == 0:
        raise ValueError("Cannot divide by zero")
    return a / b

def calculate_discount(price: float, discount_percent: float) -> float:
    """
    Calculate final price after applying a percentage discount.
    
    DEFECT: Adds the discount surcharge instead of deducting it!
    """
    if discount_percent < 0 or discount_percent > 100:
        raise ValueError("Discount percent must be between 0 and 100")
    # BUG: should be price - (price * (discount_percent / 100.0))
    return price + (price * (discount_percent / 100.0))

