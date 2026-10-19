from copy import deepcopy
from datetime import date, timedelta
import json
from unittest.mock import patch, MagicMock

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import SimpleTestCase, TestCase
from rest_framework.test import APIClient

from chef.models import Chef, UserChef
from .models import ChefPricingProfile, PaymentTransaction, Subscription
from .pricing import (PricingError, chef_payout, customer_catalog, customer_quote,
                      formula, get_pricing_config, quote_instant, quote_subscription, round_money)


class PricingDefinitionTests(SimpleTestCase):
    def test_every_subscription_reference_price_and_floor(self):
        config = get_pricing_config()
        for band in config["household_size"]["bands"]:
            reference = config["reference_tables_base_chef"]["by_household_band"][band["id"]]
            for cycle, expected in reference["plans"].items():
                for meals, key in ((1, "1_meal_per_day"), (2, "MEAL2_per_meal"), (3, "MEAL3_per_meal")):
                    with self.subTest(band=band["id"], cycle=cycle, meals=meals):
                        quote = quote_subscription(people_count=band["min"], cycle=cycle, meals_per_day=meals)
                        self.assertEqual(quote["per_meal_inr"], expected[key])
                        self.assertEqual(quote["chef_payout_per_meal"], reference["chef_payout_per_meal"])
                        self.assertEqual(quote["price_floor_per_meal"], reference["price_floor_per_meal"])
                        self.assertEqual(quote["price_inr"], expected[key] * meals * config["plans"][cycle]["days"])
                        self.assertGreaterEqual(quote["per_meal_inr"], quote["price_floor_per_meal"])

    def test_every_instant_reference(self):
        config = get_pricing_config()
        for band in config["household_size"]["bands"]:
            for meals in (1, 2):
                with self.subTest(band=band["id"], meals=meals):
                    expected = config["reference_tables_base_chef"]["by_household_band"][band["id"]]["instant"][f"{meals}_meal{'s' if meals == 2 else ''}"]
                    quote = quote_instant(people_count=band["min"], meals=meals)
                    self.assertEqual(quote["price_inr"], expected["customer_price"])
                    self.assertEqual(quote["chef_payout_total"], expected["chef_earns"])

    def test_named_total_vectors(self):
        expected = {("monthly", 1): 4290, ("monthly", 2): 8400, ("monthly", 3): 12150,
                    ("quarterly", 1): 12330, ("weekly", 1): 1155}
        for (cycle, meals), amount in expected.items():
            self.assertEqual(quote_subscription(cycle=cycle, meals_per_day=meals)["price_inr"], amount)
        self.assertEqual(quote_subscription(payout=160)["per_meal_inr"], 208)
        self.assertEqual(quote_subscription(people_count=5)["per_meal_inr"], 180)

    def test_formulas_are_definition_driven_not_table_lookups(self):
        config = deepcopy(get_pricing_config())
        config["plans"]["monthly"]["per_meal_formula"] = "round(chef_payout * 1.40)"
        self.assertEqual(quote_subscription(config=config)["per_meal_inr"], 154)
        self.assertEqual(quote_subscription(config=config, cycle="weekly")["per_meal_inr"], 175)
        with self.assertRaises(PricingError):
            formula("__import__('os').system('anything')")

    def test_half_up_rounding_and_base_band_not_rerounded(self):
        self.assertEqual(round_money("2.5"), 3)
        self.assertEqual(round_money("247.5", 5), 250)
        self.assertEqual(quote_subscription()["per_meal_inr"], 143)

    def test_bonuses_require_all_conditions_and_do_not_stack_within_category(self):
        self.assertEqual(chef_payout(rating=5), 110)
        self.assertEqual(chef_payout(rating=4.7, subscriber_ratings=20), 120)
        self.assertEqual(chef_payout(rating=4.7, subscriber_ratings=20, tenure_months=12, meals_served=300), 165)
        self.assertEqual(chef_payout(rating=5, subscriber_ratings=100, tenure_months=24, meals_served=5000, certified_specialty=True), 235)

    def test_coupon_never_reduces_payout_or_breaches_floor(self):
        single = quote_subscription(people_count=1)
        bundle = quote_subscription(people_count=1, meals_per_day=3)
        self.assertEqual(single["chef_payout_per_meal"], bundle["chef_payout_per_meal"])
        self.assertEqual(bundle["per_meal_inr"], bundle["price_floor_per_meal"])
        with self.assertRaises(PricingError):
            quote_subscription(coupon_code="MEAL3", meals_per_day=2)
        with self.assertRaises(PricingError):
            quote_subscription(coupon_code="MONTH150", new_customer=True)  # Config requires an expiry.
        config = deepcopy(get_pricing_config())
        coupon = next(c for c in config["coupons"] if c["code"] == "MONTH150")
        coupon["expires_at"] = (date.today() + timedelta(days=1)).isoformat()
        quote = quote_subscription(config=config, coupon_code="MONTH150", new_customer=True, meals_per_day=2)
        self.assertEqual(quote["coupon_code"], "MONTH150")
        self.assertEqual(quote["price_inr"], 143 * 60 - 150)  # No MEAL2 stacking.
        coupon["amount"] = 100000
        with self.assertRaises(PricingError):
            quote_subscription(config=config, coupon_code="MONTH150", new_customer=True)

    def test_invalid_household_cycle_and_meal_counts_are_rejected(self):
        for people in (0, -1, 9, 100, 1.5, "invalid"):
            with self.subTest(people=people), self.assertRaises(PricingError):
                quote_subscription(people_count=people)
        for count in (0, 4, 1.5):
            with self.assertRaises(PricingError): quote_subscription(meals_per_day=count)
        with self.assertRaises(PricingError): quote_subscription(cycle="annual")
        with self.assertRaises(PricingError): quote_instant(meals=3)

    def test_pilot_cook_rate_has_no_bundle_or_promotions(self):
        quote = quote_subscription(pilot_rate=200, meals_per_day=3)
        self.assertEqual(quote["per_meal_inr"], 230)
        self.assertEqual(quote["chef_payout_per_meal"], 200)
        self.assertEqual(quote["coupon_code"], "")
        with self.assertRaises(PricingError): quote_subscription(pilot_rate=200, coupon_code="MEAL2", meals_per_day=2)

    def test_customer_responses_exclude_private_rate_inputs(self):
        response = json.dumps(customer_catalog())
        for hidden in ("chef_payout", "platform_fee", "price_floor", "rating_bonus"):
            self.assertNotIn(hidden, response)
        self.assertNotIn("chef_payout_per_meal", customer_quote(quote_subscription()))


class PricingApiTests(TestCase):
    def setUp(self):
        cache.clear()
        self.user = get_user_model().objects.create_user(username="pricing-customer", password="pass12345")
        self.chef = Chef.objects.create(name="Test chef", speciality="Indian")
        UserChef.objects.create(user=self.user, chef=self.chef)
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_public_catalog_and_authenticated_preview(self):
        self.assertEqual(APIClient().get("/api/pricing/").status_code, 200)
        response = self.client.get("/api/subscriptions/price-preview/", {"meal_type": "lunch,dinner", "people_count": 3, "plan_cycle": "monthly"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["price_inr"], 8400)
        self.assertEqual(response.data["coupon_code"], "MEAL2")
        self.assertNotIn("chef_payout_per_meal", response.data)

    def test_preview_handles_custom_quotes_and_invalid_inputs(self):
        for params in ({"people_count":9}, {"people_count":1.5}, {"plan_cycle":"annual"}):
            response = self.client.get("/api/subscriptions/price-preview/", {"meal_type":"lunch", **params})
            self.assertEqual(response.status_code, 400)

    def test_instant_quote_respects_limits_and_payout_privacy(self):
        response = self.client.get("/api/pricing/instant-preview/", {"people_count":3, "meal_count":2})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["price_inr"], 450)
        self.assertTrue(response.data["two_slot_confirmation_required"])
        self.assertNotIn("chef_payout_total", response.data)
        self.assertEqual(self.client.get("/api/pricing/instant-preview/", {"meal_count":3}).status_code, 400)

    def test_verified_chef_metrics_change_quote(self):
        ChefPricingProfile.objects.create(chef=self.chef, tenure_months=24, meals_served=5000, certified_specialty=True)
        response = self.client.get("/api/subscriptions/price-preview/", {"meal_type":"lunch", "people_count":3})
        # 110 + 30 + 35 + 25, no subscriber-rating bonus without eligible ratings.
        self.assertEqual(response.data["per_meal_inr"], 260)

    @patch("core.views._razorpay_keys", return_value=("test_key", "test_secret"))
    @patch("core.views.request_module.urlopen")
    def test_payment_order_uses_same_quote_and_keeps_private_snapshot(self, urlopen, keys):
        gateway = MagicMock()
        gateway.__enter__.return_value.read.return_value = b'{"id":"order_test", "currency":"INR"}'
        urlopen.return_value = gateway
        response = self.client.post("/api/payments/create-order/", {"subscription_payload": {"chef":self.chef.pk,"meal_type":["lunch"],"people_count":3,"plan_cycle":"quarterly","price":2}}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["price_inr"], 12330)
        self.assertEqual(response.data["amount"], 1233000)
        self.assertEqual(json.loads(urlopen.call_args.args[0].data)["amount"], 1233000)
        self.assertNotIn("chef_payout_per_meal", response.data["pricing"])
        self.assertEqual(PaymentTransaction.objects.get().subscription_payload["pricing_snapshot"]["chef_payout_per_meal"], 110)

    @patch("core.views._create_ai_menu_for_user")
    def test_paid_snapshot_survives_rate_change_and_plan_is_locked(self, menu):
        quote = quote_subscription(people_count=3)
        quote["chef_id"] = self.chef.pk
        payment = PaymentTransaction.objects.create(user=self.user, order_id="paid_quote", amount=429000,
            status=PaymentTransaction.STATUS_PAID,
            subscription_payload={"meal_type":["lunch"],"pricing_snapshot":quote})
        ChefPricingProfile.objects.create(chef=self.chef, tenure_months=24)
        payload = {"chef":self.chef.pk,"meal_type":["lunch"],"people_count":3,"plan_cycle":"monthly","payment_order_id":payment.order_id}
        response = self.client.post("/api/subscriptions/create/", payload, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        sub = Subscription.objects.get()
        self.assertEqual(sub.price, 4290)
        self.assertEqual((sub.end_date-sub.start_date).days+1, 30)
        self.assertEqual(sub.pricing_snapshot["chef_payout_per_meal"], 110)
        self.assertNotIn("pricing_snapshot", response.data)
        locked = self.client.get("/api/subscriptions/price-preview/", {"meal_type":"lunch","people_count":3})
        self.assertEqual(locked.data["price_inr"], 4290)
        self.assertTrue(locked.data["price_locked"])
        resize = self.client.post("/api/subscriptions/create/", {**payload,"people_count":5}, format="json")
        self.assertEqual(resize.status_code, 409)
        sub.is_active = False
        sub.save()
        reused = self.client.post("/api/subscriptions/create/", payload, format="json")
        self.assertEqual(reused.status_code, 409)

    def test_subscription_rejects_unpaid_activation(self):
        response = self.client.post("/api/subscriptions/create/", {"chef":self.chef.pk,"meal_type":["lunch"],"people_count":3}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_legacy_active_price_is_not_silently_replaced(self):
        Subscription.objects.create(user=self.user, chef=self.chef, meal_type=["lunch"],
            start_date=date.today(), end_date=date.today()+timedelta(days=29), price=2)
        response = self.client.get("/api/subscriptions/price-preview/", {"meal_type":"lunch", "people_count":3})
        self.assertEqual(response.data["price_inr"], 2)
        self.assertTrue(response.data["legacy_price_locked"])
        self.assertNotIn("chef_payout_per_meal", response.data)
