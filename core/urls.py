from django.urls import path
from .views import (
    create_user,
    list_chefs,
    create_subscription,
    submit_feedback
)

from .views import assign_chef

urlpatterns = [
    path('users/create/', create_user),
    path('chefs/', list_chefs),
    path('subscriptions/create/', create_subscription),
    path('feedback/', submit_feedback),
    path('assign-chef/', assign_chef),
]

