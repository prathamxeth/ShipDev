"""
Regression test suite for demo calculator application.
"""

import pytest
from buggy_app.calculator import add, divide, calculate_discount


def test_add():
    assert add(10, 5) == 15


def test_divide():
    assert divide(20, 4) == 5.0
    with pytest.raises(ValueError):
        divide(10, 0)


def test_calculate_discount_applies_correct_reduction():
    """Regression test: 20% discount on $100 must evaluate to $80.0."""
    initial_price = 100.0
    discount_rate = 20.0
    expected_discounted_price = 80.0

    actual_price = calculate_discount(initial_price, discount_rate)
    assert actual_price == expected_discounted_price, (
        f"Defect reproduced: expected ${expected_discounted_price}, but received ${actual_price}"
    )

