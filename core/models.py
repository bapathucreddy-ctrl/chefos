from django.db import models
from django.conf import settings


class Chef(models.Model):
    name = models.CharField(max_length=100)
    phone = models.CharField(max_length=15)
    is_active = models.BooleanField(default=True)
    joined_on = models.DateField(auto_now_add=True)
    speciality = models.CharField(max_length=200)

    def __str__(self):
        return self.name


class Subscription(models.Model):
    MEAL_CHOICES = (
        ('breakfast', 'Breakfast'),
        ('lunch', 'Lunch'),
        ('dinner', 'Dinner'),
    )

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="subscriptions"
    )
    chef = models.ForeignKey(
        Chef,
        on_delete=models.CASCADE,
        related_name="subscriptions"
    )
    meal_type = models.JSONField()
    start_date = models.DateField()
    end_date = models.DateField()
    price = models.IntegerField()
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.user.username} - {self.meal_type}"


class ChefAssignment(models.Model):
    chef = models.ForeignKey(Chef, on_delete=models.CASCADE)
    subscription = models.OneToOneField(Subscription, on_delete=models.CASCADE)
    assigned_on = models.DateField(auto_now_add=True)

    def __str__(self):
        return f"{self.chef} → {self.subscription}"


class Feedback(models.Model):
    subscription = models.ForeignKey(Subscription, on_delete=models.CASCADE)
    rating = models.IntegerField()  # 1 to 5
    comment = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.rating}★"
