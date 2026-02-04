from django.contrib import admin
from .models import  Subscription, ChefAssignment, Feedback
from chef.models import Chef
from django.contrib.auth import get_user_model
from menu.models import UserPreference,WeeklyMenu

User = get_user_model()

admin.site.register(Chef)
admin.site.register(Subscription)
admin.site.register(ChefAssignment)
admin.site.register(User)
admin.site.register(Feedback)
admin.site.register(UserPreference)
admin.site.register(WeeklyMenu)
