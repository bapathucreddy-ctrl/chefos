from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [("core", "0008_chefwavepolicy_custom_wave_labels")]
    operations = [
        migrations.AddField(model_name="subscription", name="pricing_snapshot",
                            field=models.JSONField(blank=True, default=dict)),
        migrations.CreateModel(name="ChefPricingProfile", fields=[
            ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
            ("subscriber_ratings", models.PositiveIntegerField(default=0)),
            ("tenure_months", models.PositiveIntegerField(default=0)),
            ("meals_served", models.PositiveIntegerField(default=0)),
            ("certified_specialty", models.BooleanField(default=False)),
            ("pilot_rate", models.PositiveIntegerField(blank=True, null=True)),
            ("pilot_started_at", models.DateField(blank=True, null=True)),
            ("updated_at", models.DateTimeField(auto_now=True)),
            ("chef", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE,
                                         related_name="pricing_profile", to="chef.chef")),
        ]),
    ]
