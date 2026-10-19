"""Read-only cutover export. Password hashes, JWTs and live OTPs are excluded."""
import hashlib
import json
from pathlib import Path
from django.apps import apps
from django.core.management.base import BaseCommand, CommandError
from django.core.serializers.json import DjangoJSONEncoder
from django.db import connection, transaction
from django.utils import timezone


class Command(BaseCommand):
    help = "Export Chefos records for Supabase reconciliation without authentication secrets"

    def add_arguments(self, parser):
        parser.add_argument("--output", required=True)

    def handle(self, *args, **options):
        target = Path(options["output"]).resolve()
        if target.exists():
            raise CommandError("Choose a new export path; existing backups are never overwritten")
        models = [
            "users.User", "chef.Chef", "chef.ChefPartnerProfile", "chef.UserChef",
            "menu.UserPreference", "menu.WeeklyMenu", "core.Subscription",
            "core.ChefPricingProfile", "core.ChefAssignment", "core.Feedback",
            "core.ChefWavePolicy", "core.PaymentTransaction", "chef.InstantChefRequest",
            "chef.InstantChefOffer", "chef.ServiceOtpSession", "chef.InstantOrderHistory",
        ]
        excluded = {"password", "signature", "start_otp", "end_otp"}
        records = {}
        with transaction.atomic():
            if connection.vendor == "postgresql":
                with connection.cursor() as cursor:
                    cursor.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
            for label in models:
                model = apps.get_model(label)
                fields = [f.attname for f in model._meta.concrete_fields if f.name not in excluded]
                records[label] = list(model.objects.order_by("pk").values(*fields))
        payload = {"format": "chefos-django-export-v1", "exported_at": timezone.now(), "records": records}
        data = json.dumps(payload, cls=DjangoJSONEncoder, ensure_ascii=False, indent=2).encode("utf-8")
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open("xb") as output:
            output.write(data)
        digest = hashlib.sha256(data).hexdigest()
        self.stdout.write(self.style.SUCCESS(f"Exported {sum(map(len, records.values()))} records; SHA256 {digest}"))
        self.stdout.write("Contains personal data. Keep this file private and outside source control.")
