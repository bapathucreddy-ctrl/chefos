"""Pricing arithmetic from the repository's canonical Chefos JSON definition.

All money is calculated with Decimal and ROUND_HALF_UP. Formula strings support
only arithmetic, named inputs, round/round5/min/max; they are never eval'd.
"""
import ast
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from functools import lru_cache
import json
import os
from pathlib import Path


class PricingError(ValueError):
    pass


@lru_cache(maxsize=4)
def _read_config(path, modified):
    with open(path, encoding="utf-8-sig") as source:
        return json.load(source, parse_float=Decimal)


def get_pricing_config():
    path = Path(os.environ.get(
        "CHEFOS_PRICING_CONFIG_PATH",
        Path(__file__).resolve().parents[2] / "chefos_pricing_config.json",
    ))
    return _read_config(str(path), path.stat().st_mtime_ns)


def round_money(value, step=1):
    step = Decimal(str(step))
    return int((Decimal(str(value)) / step).quantize(Decimal("1"), rounding=ROUND_HALF_UP) * step)


def formula(expression, **inputs):
    def visit(node):
        if isinstance(node, ast.Constant) and type(node.value) in (int, float):
            return Decimal(str(node.value))
        if isinstance(node, ast.Name) and node.id in inputs:
            return Decimal(str(inputs[node.id]))
        if isinstance(node, ast.BinOp):
            left, right = visit(node.left), visit(node.right)
            if isinstance(node.op, ast.Add): return left + right
            if isinstance(node.op, ast.Sub): return left - right
            if isinstance(node.op, ast.Mult): return left * right
            if isinstance(node.op, ast.Div): return left / right
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and not node.keywords:
            values = [visit(arg) for arg in node.args]
            if node.func.id in ("round", "round5") and len(values) == 1:
                return Decimal(round_money(values[0], 5 if node.func.id == "round5" else 1))
            if node.func.id in ("min", "max") and values:
                return (min if node.func.id == "min" else max)(values)
        raise PricingError("Unsupported pricing formula")
    return visit(ast.parse(expression, mode="eval").body)


def normalize_cycle(value=None):
    cycle = str(value or "monthly").strip().lower()
    plans = get_pricing_config()["plans"]
    if cycle not in plans or not isinstance(plans[cycle], dict) or "days" not in plans[cycle]:
        raise PricingError("Choose a weekly, monthly or quarterly plan")
    return cycle


def household_band(people_count, config=None):
    config = config or get_pricing_config()
    try:
        if isinstance(people_count, bool) or Decimal(str(people_count)) != int(people_count):
            raise ValueError
        people = int(people_count)
    except (ValueError, TypeError, ArithmeticError):
        raise PricingError("people_count must be a positive whole number")
    if people < 1:
        raise PricingError("people_count must be a positive whole number")
    for band in config["household_size"]["bands"]:
        if band["min"] <= people <= band["max"]:
            return band
    raise PricingError("Households of 9 or more require a custom quote")


def chef_payout(*, rating=0, subscriber_ratings=0, tenure_months=0,
                meals_served=0, certified_specialty=False, config=None):
    config = config or get_pricing_config()
    card = config["chef_rate_card"]
    metrics = {"min_subscriber_ratings": subscriber_ratings,
               "min_tenure_months": tenure_months, "min_meals_served": meals_served}
    rating_bonus = max((tier["bonus"] for tier in card["rating_bonus"]
                        if Decimal(str(rating)) >= Decimal(str(tier["min_rating"]))
                        and all(metrics.get(key, 0) >= value
                                for key, value in tier.get("requires", {}).items())), default=0)
    tenure_bonus = max((tier["bonus"] for tier in card["tenure_bonus"]
                        if tenure_months >= tier["min_months"]), default=0)
    meals_bonus = max((tier["bonus"] for tier in card["meals_served_bonus"]
                       if meals_served >= tier["min_meals"]), default=0)
    specialty = card["specialty_bonus"]["certified_cuisine_specialty"] if certified_specialty else 0
    return min(card["payout_cap_per_meal"], card["base_payout_per_meal"]
               + rating_bonus + tenure_bonus + meals_bonus + specialty)


def _scaled(value, band, config):
    if band["id"] == config["household_size"]["base_band"]:
        return round_money(value)
    return round_money(Decimal(str(value)) * Decimal(str(band["multiplier"])), 5)


def _floor(payout, config):
    return int(formula(config["guards"]["price_floor"]["per_meal"], chef_payout_for_band=payout))


def quote_subscription(*, people_count=3, meals_per_day=1, cycle="monthly",
                       payout=None, coupon_code="", new_customer=False,
                       pilot_rate=None, config=None):
    config = config or get_pricing_config()
    if cycle not in ("weekly", "monthly", "quarterly"):
        raise PricingError("Choose a weekly, monthly or quarterly plan")
    if type(meals_per_day) is not int or meals_per_day not in (1, 2, 3):
        raise PricingError("Select between one and three meals per day")
    band = household_band(people_count, config)
    code = str(coupon_code or "").strip().upper()
    if "," in code or " " in code:
        raise PricingError("Only one coupon may be used per order")
    card_payout = config["chef_rate_card"]["base_payout_per_meal"] if payout is None else payout
    if pilot_rate is not None:
        if Decimal(str(pilot_rate)) <= 0:
            raise PricingError("Pilot cook rate must be positive")
        if code:
            raise PricingError("Coupons are not available on pilot cook rates")
        card_payout = Decimal(str(pilot_rate))
        base_price = round_money(card_payout * (1 + config["pilot_cook_offer"]["customer_markup_on_payout"][cycle]))
    else:
        monthly = formula(config["plans"]["monthly"]["per_meal_formula"], chef_payout=card_payout)
        base_price = monthly if cycle == "monthly" else formula(
            config["plans"][cycle]["per_meal_formula"], monthly_per_meal=monthly)
    band_payout = _scaled(card_payout, band, config)
    floor = _floor(band_payout, config)
    price = max(floor, _scaled(base_price, band, config))
    applied = ""
    # An explicit promotion replaces the automatic meal coupon; never stack.
    bundle_code = f"MEAL{meals_per_day}"
    if pilot_rate is None and (code in config["meal_bundles"] or
            (not code and meals_per_day > 1 and config["meal_bundles"]["auto_apply_at_checkout"])):
        applied = code or bundle_code
        bundle = config["meal_bundles"][applied]
        if bundle["meals_per_day"] != meals_per_day:
            raise PricingError(f"{applied} requires {bundle['meals_per_day']} meals per day")
        discount = round_money(Decimal(str(bundle["per_meal_discount_inr_at_base_band"][cycle]))
                               * Decimal(str(band["multiplier"])))
        price = max(floor, price - discount)
    days = config["plans"][cycle]["days"]
    total_meals = days * meals_per_day
    total = price * total_meals
    promotion_discount = 0
    if code and not applied:
        promotion = next((c for c in config["coupons"] if c["code"] == code), None)
        if not promotion or cycle not in promotion["applies_to"]:
            raise PricingError("Coupon is not valid for this plan")
        if promotion["type"] != "flat_off_first_plan":
            raise PricingError("This coupon requires a verified earned credit")
        if not new_customer:
            raise PricingError("Welcome coupons are available to new customers only")
        expires = promotion.get("expires_at")
        if config["coupon_rules"]["expiry_required"] and not expires:
            raise PricingError("This promotion is not active: an expiry must be configured")
        if expires and date.fromisoformat(expires[:10]) < date.today():
            raise PricingError("Coupon has expired")
        promotion_discount = promotion["amount"]
        if total - promotion_discount < floor * total_meals:
            raise PricingError("Coupon would put this plan below its minimum price")
        total -= promotion_discount
        applied = code
    return {
        "pricing_version": config["meta"]["version"], "currency": config["meta"]["currency"],
        "plan_cycle": cycle, "days": days, "people_count": int(people_count),
        "people_tier": band["id"], "meal_count": meals_per_day, "total_meals": total_meals,
        "per_meal_inr": price, "price_inr": total, "amount_paise": total * 100,
        "coupon_code": applied, "discount_inr": promotion_discount, "before_gst": True,
        "chef_payout_per_meal": band_payout, "price_floor_per_meal": floor,
        "pilot_cook_rate": pilot_rate is not None,
    }


def quote_instant(*, people_count=3, meals=1, payout=None, config=None):
    config = config or get_pricing_config()
    if type(meals) is not int or not 1 <= meals <= config["instant"]["max_meals"]:
        raise PricingError("Instant bookings support one or two meals only")
    band = household_band(people_count, config)
    payout = config["chef_rate_card"]["base_payout_per_meal"] if payout is None else payout
    monthly = formula(config["plans"]["monthly"]["per_meal_formula"], chef_payout=payout)
    options = config["instant"]["options"]
    single = formula(options["1_meal"]["customer_price_formula"], monthly_per_meal=monthly)
    if meals == 1:
        customer = single
        earnings = formula(options["1_meal"]["chef_earns_formula"], chef_payout=payout)
    else:
        customer = formula(options["2_meals"]["customer_price_formula"], instant_1_meal_customer_price=single)
        earnings = formula(options["2_meals"]["chef_earns_formula"], customer_price=customer)
    price, earnings = _scaled(customer, band, config), _scaled(earnings, band, config)
    minimum = _floor(_scaled(payout, band, config), config) * meals
    price = max(price, minimum)
    return {"pricing_version": config["meta"]["version"], "currency": config["meta"]["currency"],
            "plan_cycle": "instant", "people_count": int(people_count), "people_tier": band["id"],
            "meal_count": meals, "price_inr": price, "amount_paise": price * 100,
            "chef_payout_total": earnings, "before_gst": True}


def customer_quote(quote):
    """Never expose payout, fee, tiering internals, or margin inputs to customers."""
    return {key: value for key, value in quote.items()
            if key not in {"chef_payout_per_meal", "chef_payout_total", "price_floor_per_meal"}}


def customer_catalog():
    config = get_pricing_config()
    return {"currency": config["meta"]["currency"], "pricing_version": config["meta"]["version"],
            "before_gst": True, "custom_quote_from_people": 9,
            "households": [{"id": band["id"], "label": band["label"],
                            "plans": {cycle: {str(meals): customer_quote(quote_subscription(
                                people_count=band["min"], cycle=cycle, meals_per_day=meals, config=config))
                                for meals in (1, 2, 3)} for cycle in ("weekly", "monthly", "quarterly")},
                            "instant": {str(meals): customer_quote(quote_instant(
                                people_count=band["min"], meals=meals, config=config)) for meals in (1, 2)}}
                           for band in config["household_size"]["bands"]]}
