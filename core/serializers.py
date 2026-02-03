from rest_framework import serializers
from django.contrib.auth.models import User
from .models import Chef, Subscription, Feedback
from .models import ChefAssignment

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
    class Meta:
        model = Subscription
        fields = '__all__'


class FeedbackSerializer(serializers.ModelSerializer):
    class Meta:
        model = Feedback
        fields = '__all__'
