from django.urls import path
from .views import (
    create_user,
    list_chefs,
    create_subscription,
    submit_feedback,
    create_chef,
    menu_preference,
    weekly_menu
)

from .views import assign_chef

urlpatterns = [
    path('register/', create_user,name='register'),
    path('chefs/', list_chefs),
    path('subscriptions/create/', create_subscription),
    path('feedback/', submit_feedback),
    path('assign-chef/', assign_chef),
    path('chefs/create/', create_chef),
    path('menu/weekly/', weekly_menu),
    path('menu/preference/', menu_preference),

]

