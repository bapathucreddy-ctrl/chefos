from django.contrib import admin
from .models import Chef, Subscription, ChefAssignment, Feedback

admin.site.register(Chef)
admin.site.register(Subscription)
admin.site.register(ChefAssignment)
admin.site.register(Feedback)
