# -*- coding: utf-8 -*-
from django.contrib import admin
from django.urls import path

from catalog import views

urlpatterns = [
    path('', views.home, name='home'),
    path('a/<str:code>/', views.hub, name='hub'),
    path('a/<str:code>/recipes/', views.recipes, name='recipes'),
    path('a/<str:code>/skus/', views.skus, name='skus'),
    path('a/<str:code>/price/', views.price, name='price'),
    path('a/<str:code>/price.xlsx', views.price_xlsx, name='price_xlsx'),
    path('recipe/<uuid:pk>/', views.recipe_detail, name='recipe_detail'),
    path('admin/', admin.site.urls),
]
