from django.db import models
from django.conf import settings
from chef.models import Chef


# -------------------------
# USER FOOD PREFERENCES
# -------------------------

class UserPreference(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="food_preferences"
    )
    food_type = models.CharField(max_length=50)
    goal = models.CharField(max_length=50)
    allergies = models.TextField(blank=True)

    def __str__(self):
        return f"{self.user} preferences"


# -------------------------
# WEEKLY MENU
# -------------------------

class WeeklyMenu(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="weekly_menus"
    )
    breakfast = models.JSONField()
    lunch = models.JSONField()
    dinner = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Weekly menu for {self.user}"


# # -------------------------
# # SUBSCRIPTION
# # -------------------------

# class Subscription(models.Model):
#     user = models.ForeignKey(
#         settings.AUTH_USER_MODEL,
#         on_delete=models.CASCADE,
#         related_name="subscriptions"
#     )
#     chef = models.ForeignKey(
#         Chef,
#         on_delete=models.CASCADE,
#         related_name="subscriptions"
#     )
#     price = models.IntegerField()
#     status = models.CharField(max_length=20, default="active")
#     start_date = models.DateField(auto_now_add=True)

#     def __str__(self):
#         return f"{self.user} → {self.chef}"
