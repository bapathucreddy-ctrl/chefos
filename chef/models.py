from django.db import models

class Chef(models.Model):
    name = models.CharField(max_length=100)
    rating = models.FloatField(default=4.5)
    is_available = models.BooleanField(default=True)
    speciality = models.CharField(max_length=200)

    def __str__(self):
        return self.name
