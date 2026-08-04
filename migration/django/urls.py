# -*- coding: utf-8 -*-
from django.contrib import admin
from django.urls import path

from catalog import views

urlpatterns = [
    path('dj/', views.home, name='home'),
    path('dj/a/<str:code>/', views.hub, name='hub'),
    path('dj/a/<str:code>/recipes/', views.recipes, name='recipes'),
    path('dj/a/<str:code>/skus/', views.skus, name='skus'),
    path('dj/a/<str:code>/price/', views.price, name='price'),
    path('dj/a/<str:code>/price.xlsx', views.price_xlsx, name='price_xlsx'),
    path('dj/recipe/<uuid:pk>/', views.recipe_detail, name='recipe_detail'),
    path('dj/admin/', admin.site.urls),
]
