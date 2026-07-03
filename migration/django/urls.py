# -*- coding: utf-8 -*-
from django.contrib import admin
from django.urls import path
from django.shortcuts import redirect

urlpatterns = [
    path('', lambda r: redirect('admin:index')),
    path('admin/', admin.site.urls),
]
