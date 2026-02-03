from rest_framework.decorators import api_view
from rest_framework.response import Response
from django.contrib.auth.models import User
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from .models import Chef, Subscription, Feedback
from .serializers import (
    UserSerializer,
    ChefSerializer,
    SubscriptionSerializer,
    FeedbackSerializer
)
from .models import ChefAssignment
from .serializers import ChefAssignmentSerializer

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def assign_chef(request):
    serializer = ChefAssignmentSerializer(data=request.data)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data)
    return Response(serializer.errors, status=400)


@api_view(['POST'])
def create_user(request):
    data = request.data
    user = User.objects.create_user(
        username=data['username'],
        email=data.get('email', ''),
        password=data['password']
    )
    return Response(UserSerializer(user).data)


@api_view(['GET'])
def list_chefs(request):
    chefs = Chef.objects.filter(is_active=True)
    return Response(ChefSerializer(chefs, many=True).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_subscription(request):
    serializer = SubscriptionSerializer(data=request.data)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data)
    return Response(serializer.errors, status=400)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def submit_feedback(request):
    serializer = FeedbackSerializer(data=request.data)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data)
    return Response(serializer.errors, status=400)
