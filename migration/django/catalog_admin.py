# -*- coding: utf-8 -*-
# Read-only admin: витрина над синхронизируемой базой.
# Ничего не создаём/не меняем/не удаляем — только просмотр и поиск.
from django.contrib import admin
from . import models


class ReadOnlyAdmin(admin.ModelAdmin):
    """Базовый класс: только просмотр (add/change/delete запрещены)."""

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def has_view_permission(self, request, obj=None):
        return True


@admin.register(models.RawMaterial)
class RawMaterialAdmin(ReadOnlyAdmin):
    list_display = ('article', 'name', 'category', 'unit', 'is_active')
    list_filter = ('is_active', 'category')
    search_fields = ('article', 'name', 'supplier')


@admin.register(models.MaterialPrice)
class MaterialPriceAdmin(ReadOnlyAdmin):
    list_display = ('material', 'price_per_unit', 'valid_from', 'valid_to', 'supplier')
    search_fields = ('material__article', 'material__name')


@admin.register(models.Recipe)
class RecipeAdmin(ReadOnlyAdmin):
    list_display = ('article', 'name', 'output_quantity', 'output_unit', 'is_active')
    list_filter = ('is_active',)
    search_fields = ('article', 'name')


@admin.register(models.RecipeIngredient)
class RecipeIngredientAdmin(ReadOnlyAdmin):
    list_display = ('recipe', 'material', 'sub_recipe', 'quantity', 'unit')
    search_fields = ('recipe__article', 'recipe__name', 'material__article', 'material__name')


@admin.register(models.Product)
class ProductAdmin(ReadOnlyAdmin):
    list_display = ('article', 'name', 'type', 'package_size', 'package_unit', 'is_active')
    list_filter = ('is_active', 'type')
    search_fields = ('article', 'name')


@admin.register(models.SkuRecipeComponent)
class SkuRecipeComponentAdmin(ReadOnlyAdmin):
    list_display = ('product', 'recipe', 'material', 'quantity', 'unit')
    search_fields = ('product__article', 'product__name')


@admin.register(models.ProductDescription)
class ProductDescriptionAdmin(ReadOnlyAdmin):
    list_display = ('product', 'generated_at', 'updated_at')
    search_fields = ('product__article', 'product__name', 'description')


@admin.register(models.PriceList)
class PriceListAdmin(ReadOnlyAdmin):
    list_display = ('name', 'markup_percent', 'is_active')


@admin.register(models.PriceListItem)
class PriceListItemAdmin(ReadOnlyAdmin):
    list_display = ('price_list', 'product', 'price', 'override_markup_percent')
    search_fields = ('product__article', 'product__name')


@admin.register(models.Assortment)
class AssortmentAdmin(ReadOnlyAdmin):
    list_display = ('code', 'name', 'created_at')
    search_fields = ('code', 'name')


@admin.register(models.AssortmentProduct)
class AssortmentProductAdmin(ReadOnlyAdmin):
    list_display = ('assortment', 'product', 'client', 'added_at')
    list_filter = ('assortment', 'client')
    search_fields = ('product__article', 'product__name')


@admin.register(models.Client)
class ClientAdmin(ReadOnlyAdmin):
    list_display = ('name', 'created_at')
    search_fields = ('name',)


@admin.register(models.Manager)
class ManagerAdmin(ReadOnlyAdmin):
    list_display = ('full_name', 'role', 'is_active', 'phone', 'created_at')
    list_filter = ('role', 'is_active')
    search_fields = ('full_name', 'phone')


@admin.register(models.PricelistDownload)
class PricelistDownloadAdmin(ReadOnlyAdmin):
    list_display = ('downloaded_at', 'user_id', 'tier', 'client_name', 'sku_count')
    list_filter = ('tier',)


# --- Себестоимость и цены (view) ---

@admin.register(models.SkuCost)
class SkuCostAdmin(ReadOnlyAdmin):
    list_display = ('sku_article', 'product_name', 'blend_cost', 'packaging_cost', 'total_sku_cost')
    search_fields = ('sku_article', 'product_name')


@admin.register(models.RecipeCost)
class RecipeCostAdmin(ReadOnlyAdmin):
    list_display = ('recipe_article', 'recipe_name', 'total_cost', 'cost_per_kg')
    search_fields = ('recipe_article', 'recipe_name')


@admin.register(models.ManagerPricelist)
class ManagerPricelistAdmin(ReadOnlyAdmin):
    list_display = ('sku_article', 'sku_name', 'category_name',
                    'price_base', 'price_opt', 'price_opt_plus',
                    'price_partner', 'price_key_partner')
    list_filter = ('category_name',)
    search_fields = ('sku_article', 'sku_name')


@admin.register(models.RawMaterialWithPrice)
class RawMaterialWithPriceAdmin(ReadOnlyAdmin):
    list_display = ('article', 'name', 'unit', 'current_price', 'price_date')
    search_fields = ('article', 'name')


# Прочие справочники/связи — простая регистрация
for _model in (models.MaterialCategory, models.ProductType,
               models.AssortmentRecipe, models.AssortmentPriceList,
               models.AssortmentMaterial, models.Project, models.ProjectItem):
    @admin.register(_model)
    class _Admin(ReadOnlyAdmin):
        pass

admin.site.site_header = 'Tea Production — витрина (только чтение)'
admin.site.site_title = 'Tea Production'
admin.site.index_title = 'Данные из Supabase (синхронизируемая копия)'
