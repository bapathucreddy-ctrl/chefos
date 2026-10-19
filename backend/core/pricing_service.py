from datetime import date

from rest_framework.exceptions import ValidationError
from chef.models import Chef, UserChef
from .models import PaymentTransaction, Subscription
from .pricing import PricingError, chef_payout, get_pricing_config, quote_subscription


def resolve_chef(user, chef_id=None):
    if chef_id not in (None, ""):
        try:
            return Chef.objects.get(pk=chef_id)
        except (Chef.DoesNotExist, ValueError, TypeError):
            raise ValidationError({"detail": "Chef not found"})
    assignment = UserChef.objects.filter(user=user).select_related("chef").first()
    return assignment.chef if assignment else None


def chef_pricing_inputs(chef):
    profile = getattr(chef, "pricing_profile", None) if chef else None
    if profile is None:
        return {"payout": chef_payout()}
    inputs = {"payout": chef_payout(
        rating=chef.rating, subscriber_ratings=profile.subscriber_ratings,
        tenure_months=profile.tenure_months, meals_served=profile.meals_served,
        certified_specialty=profile.certified_specialty,
    )}
    if profile.pilot_rate is not None and profile.pilot_started_at:
        today = date.today()
        start = profile.pilot_started_at
        months = (today.year - start.year) * 12 + today.month - start.month - (today.day < start.day)
        if start <= today and months < get_pricing_config()["pilot_cook_offer"]["duration_months"]:
            inputs["pilot_rate"] = profile.pilot_rate
    return inputs


def subscription_quote(user, meals, cycle, people, chef=None, coupon_code=""):
    try:
        quote = quote_subscription(
            people_count=people, meals_per_day=len(meals), cycle=cycle,
            coupon_code=coupon_code,
            new_customer=not (Subscription.objects.filter(user=user).exists()
                or PaymentTransaction.objects.filter(user=user, status=PaymentTransaction.STATUS_PAID).exists())
                if coupon_code else False,
            **chef_pricing_inputs(chef),
        )
        quote["chef_id"] = chef.pk if chef else None
        return quote
    except PricingError as exc:
        raise ValidationError({"detail": str(exc)})


def locked_quote(subscription, people):
    if subscription.pricing_snapshot:
        return subscription.pricing_snapshot
    # Existing plans can predate this definition. Keep their paid total, without
    # inventing a chef payout or repricing their remaining meals.
    from decimal import Decimal, ROUND_HALF_UP
    from .pricing import household_band
    days = max(1, (subscription.end_date - subscription.start_date).days + 1)
    meals = len(subscription.meal_type)
    total_meals = max(1, days * meals)
    return {"pricing_version": "legacy", "currency": get_pricing_config()["meta"]["currency"],
            "plan_cycle": "weekly" if days <= 8 else "quarterly" if days >= 80 else "monthly",
            "days": days, "people_count": people, "people_tier": household_band(people)["id"],
            "meal_count": meals, "total_meals": total_meals, "price_inr": subscription.price,
            "amount_paise": subscription.price * 100,
            "per_meal_inr": float((Decimal(subscription.price) / total_meals).quantize(Decimal(".01"), rounding=ROUND_HALF_UP)),
            "before_gst": True, "legacy_price_locked": True}
