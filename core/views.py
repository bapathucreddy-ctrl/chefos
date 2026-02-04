from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.contrib.auth import get_user_model
from chef.models import Chef
from menu.models import UserPreference,WeeklyMenu
from .models import (

    Subscription,
    Feedback,
    ChefAssignment
)

from .serializers import (
    UserSerializer,
    ChefSerializer,
    SubscriptionSerializer,
    FeedbackSerializer,
    ChefAssignmentSerializer,
    WeeklyMenuSerializer,
    UserPreferenceSerializer

)

User = get_user_model()


# -------------------------
# USER
# -------------------------

@api_view(['POST'])
def create_user(request):
    data = request.data

    user = User.objects.create_user(
        username=data['username'],
        email=data.get('email', ''),
        password=data['password']
    )

    return Response(UserSerializer(user).data)


# -------------------------
# CHEF
# -------------------------

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def list_chefs(request):
    chefs = Chef.objects.filter(is_available=True)
    print(chefs)
    return Response(ChefSerializer(chefs, many=True).data)

@api_view(['POST'])
def create_chef(request):
    data = request.data

    chef = Chef.objects.create(
        name=data['name'],
        speciality=data['speciality'],
        rating=data['rating']
    )

    return Response(ChefSerializer(chef).data)



@api_view(['POST'])
@permission_classes([IsAuthenticated])
def assign_chef(request):
    serializer = ChefAssignmentSerializer(data=request.data)
    if serializer.is_valid():
        serializer.save(user=request.user)
        return Response(serializer.data)
    return Response(serializer.errors, status=400)


# -------------------------
# SUBSCRIPTION
# -------------------------

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_subscription(request):
    serializer = SubscriptionSerializer(data=request.data)
    if serializer.is_valid():
        serializer.save(user=request.user)
        return Response(serializer.data)
    return Response(serializer.errors, status=400)


# -------------------------
# FEEDBACK
# -------------------------

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def submit_feedback(request):
    serializer = FeedbackSerializer(data=request.data)
    if serializer.is_valid():
        serializer.save(user=request.user)
        return Response(serializer.data)
    return Response(serializer.errors, status=400)


# -------------------------
# MENU
# -------------------------

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def menu_preference(request):
    data = request.data

    userPreference = UserPreference.objects.create(
        user_id = data['user_id'],
        food_type=data['food_type'],
        goal=data['goal'],
        allergies=data['allergies']
    )

    return Response(UserPreferenceSerializer(userPreference).data)



@api_view(['POST'])
@permission_classes([IsAuthenticated])
def weekly_menu(request):
    data = request.data

    weeklyMenu = WeeklyMenu.objects.create(
        user_id = data['user_id'],
        breakfast=data['breakfast'],
        lunch=data['lunch'],
        dinner=data['dinner']
    )

    return Response(WeeklyMenuSerializer(weeklyMenu).data)
