from rest_framework import serializers
# from django.conf import settings

from .models import  Subscription, Feedback
from .models import ChefAssignment
from django.contrib.auth import get_user_model
from chef.models import Chef
from menu.models import UserPreference,WeeklyMenu
from .pricing import customer_quote
User = get_user_model()

class ChefAssignmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChefAssignment
        fields = '__all__'

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email']


class ChefSerializer(serializers.ModelSerializer):
    class Meta:
        model = Chef
        fields = '__all__'


class SubscriptionSerializer(serializers.ModelSerializer):
    pricing = serializers.SerializerMethodField()

    def get_pricing(self, obj):
        return customer_quote(obj.pricing_snapshot) if obj.pricing_snapshot else None

    class Meta:
        model = Subscription
        exclude = ['pricing_snapshot']

        # def validate_meal_type(self, value):
        #     allowed = {'breakfast', 'lunch', 'dinner'}
        #     if not isinstance(value, list):
        #         raise serializers.ValidationError("meal_type must be a list")
        #     if not all(item in allowed for item in value):
        #         raise serializers.ValidationError(f"Invalid meal_type. Allowed: {allowed}")
        #     return value


class FeedbackSerializer(serializers.ModelSerializer):
    class Meta:
        model = Feedback
        fields = '__all__'

class UserPreferenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserPreference
        fields = '__all__'        


class WeeklyMenuSerializer(serializers.ModelSerializer):
    class Meta:
        model = WeeklyMenu
        fields = '__all__'
