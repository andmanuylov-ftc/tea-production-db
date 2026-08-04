# -*- coding: utf-8 -*-
# Модели Tea Production — отражение существующей схемы public.
# managed = False: Django НЕ управляет этими таблицами (схема приходит из
# Supabase через синхронизацию, база на сервере — только для чтения).
from django.db import models


class MaterialCategory(models.Model):
    id = models.UUIDField(primary_key=True)
    name = models.TextField()
    description = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'material_categories'
        verbose_name = 'Категория сырья'
        verbose_name_plural = 'Категории сырья'

    def __str__(self):
        return self.name


class ProductType(models.Model):
    id = models.IntegerField(primary_key=True)
    name = models.TextField()
    sort_order = models.IntegerField()
    code = models.TextField(blank=True, null=True)
    parent = models.ForeignKey('self', on_delete=models.DO_NOTHING,
                               db_column='parent_id', blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'product_types'
        verbose_name = 'Тип SKU'
        verbose_name_plural = 'Типы SKU'

    def __str__(self):
        return self.name


class Client(models.Model):
    id = models.UUIDField(primary_key=True)
    name = models.TextField()
    notes = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField()

    class Meta:
        managed = False
        db_table = 'clients'
        verbose_name = 'Клиент'
        verbose_name_plural = 'Клиенты'

    def __str__(self):
        return self.name


class Assortment(models.Model):
    id = models.UUIDField(primary_key=True)
    code = models.TextField(unique=True)
    name = models.TextField()
    description = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField()

    class Meta:
        managed = False
        db_table = 'assortments'
        verbose_name = 'Ассортимент'
        verbose_name_plural = 'Ассортименты'

    def __str__(self):
        return self.name


class RawMaterial(models.Model):
    id = models.UUIDField(primary_key=True)
    name = models.TextField()
    category = models.ForeignKey(MaterialCategory, on_delete=models.DO_NOTHING,
                                 db_column='category_id', blank=True, null=True)
    unit = models.TextField()
    description = models.TextField(blank=True, null=True)
    supplier = models.TextField(blank=True, null=True)
    is_active = models.BooleanField(blank=True, null=True)
    created_at = models.DateTimeField(blank=True, null=True)
    updated_at = models.DateTimeField(blank=True, null=True)
    article = models.TextField(unique=True, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'raw_materials'
        verbose_name = 'Сырьё'
        verbose_name_plural = 'Сырьё'

    def __str__(self):
        return f'{self.article} · {self.name}' if self.article else self.name


class MaterialPrice(models.Model):
    id = models.UUIDField(primary_key=True)
    material = models.ForeignKey(RawMaterial, on_delete=models.DO_NOTHING,
                                 db_column='material_id')
    price_per_unit = models.DecimalField(max_digits=20, decimal_places=4)
    valid_from = models.DateField()
    valid_to = models.DateField(blank=True, null=True)
    supplier = models.TextField(blank=True, null=True)
    notes = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'material_prices'
        verbose_name = 'Цена сырья'
        verbose_name_plural = 'Цены сырья'


class Recipe(models.Model):
    id = models.UUIDField(primary_key=True)
    name = models.TextField()
    description = models.TextField(blank=True, null=True)
    output_quantity = models.DecimalField(max_digits=20, decimal_places=4)
    output_unit = models.TextField()
    notes = models.TextField(blank=True, null=True)
    is_active = models.BooleanField(blank=True, null=True)
    created_at = models.DateTimeField(blank=True, null=True)
    updated_at = models.DateTimeField(blank=True, null=True)
    article = models.TextField(unique=True, blank=True, null=True)
    photo_url = models.TextField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'recipes'
        verbose_name = 'Рецепт (купаж)'
        verbose_name_plural = 'Рецепты (купажи)'

    def __str__(self):
        return f'{self.article} · {self.name}' if self.article else self.name


class RecipeIngredient(models.Model):
    id = models.UUIDField(primary_key=True)
    recipe = models.ForeignKey(Recipe, on_delete=models.DO_NOTHING,
                               db_column='recipe_id', related_name='ingredients')
    material = models.ForeignKey(RawMaterial, on_delete=models.DO_NOTHING,
                                 db_column='material_id', blank=True, null=True)
    quantity = models.DecimalField(max_digits=20, decimal_places=4)
    unit = models.TextField()
    notes = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(blank=True, null=True)
    sub_recipe = models.ForeignKey(Recipe, on_delete=models.DO_NOTHING,
                                   db_column='sub_recipe_id', blank=True, null=True,
                                   related_name='used_in')

    class Meta:
        managed = False
        db_table = 'recipe_ingredients'
        verbose_name = 'Ингредиент рецепта'
        verbose_name_plural = 'Состав рецептов'


class Product(models.Model):
    id = models.UUIDField(primary_key=True)
    name = models.TextField()
    recipe = models.ForeignKey(Recipe, on_delete=models.DO_NOTHING,
                               db_column='recipe_id', blank=True, null=True)
    package_size = models.DecimalField(max_digits=20, decimal_places=4, blank=True, null=True)
    package_unit = models.TextField(blank=True, null=True)
    description = models.TextField(blank=True, null=True)
    is_active = models.BooleanField(blank=True, null=True)
    created_at = models.DateTimeField(blank=True, null=True)
    updated_at = models.DateTimeField(blank=True, null=True)
    article = models.TextField(unique=True, blank=True, null=True)
    type = models.ForeignKey(ProductType, on_delete=models.DO_NOTHING,
                             db_column='type_id', blank=True, null=True)
    photo_url = models.TextField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'products'
        verbose_name = 'SKU (товар)'
        verbose_name_plural = 'SKU (товары)'

    def __str__(self):
        return f'{self.article} · {self.name}' if self.article else self.name


class SkuRecipeComponent(models.Model):
    id = models.UUIDField(primary_key=True)
    product = models.ForeignKey(Product, on_delete=models.DO_NOTHING,
                                db_column='product_id', related_name='components')
    recipe = models.ForeignKey(Recipe, on_delete=models.DO_NOTHING,
                               db_column='recipe_id', blank=True, null=True)
    material = models.ForeignKey(RawMaterial, on_delete=models.DO_NOTHING,
                                 db_column='material_id', blank=True, null=True)
    quantity = models.DecimalField(max_digits=20, decimal_places=4)
    unit = models.TextField()
    notes = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'sku_recipe_components'
        verbose_name = 'Компонент SKU'
        verbose_name_plural = 'Состав SKU'


class ProductDescription(models.Model):
    id = models.UUIDField(primary_key=True)
    product = models.OneToOneField(Product, on_delete=models.DO_NOTHING,
                                   db_column='product_id')
    description = models.TextField(blank=True, null=True)
    generated_at = models.DateTimeField(blank=True, null=True)
    updated_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'product_descriptions'
        verbose_name = 'Описание SKU'
        verbose_name_plural = 'Описания SKU'


class PriceList(models.Model):
    id = models.UUIDField(primary_key=True)
    name = models.TextField()
    description = models.TextField(blank=True, null=True)
    markup_percent = models.DecimalField(max_digits=20, decimal_places=4, blank=True, null=True)
    is_active = models.BooleanField(blank=True, null=True)
    created_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'price_lists'
        verbose_name = 'Прайслист'
        verbose_name_plural = 'Прайслисты'

    def __str__(self):
        return self.name


class PriceListItem(models.Model):
    id = models.UUIDField(primary_key=True)
    price_list = models.ForeignKey(PriceList, on_delete=models.DO_NOTHING,
                                   db_column='price_list_id')
    product = models.ForeignKey(Product, on_delete=models.DO_NOTHING,
                                db_column='product_id')
    price = models.DecimalField(max_digits=20, decimal_places=4, blank=True, null=True)
    override_markup_percent = models.DecimalField(max_digits=20, decimal_places=4, blank=True, null=True)
    created_at = models.DateTimeField(blank=True, null=True)
    updated_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'price_list_items'
        verbose_name = 'Позиция прайслиста'
        verbose_name_plural = 'Позиции прайслистов'


class AssortmentProduct(models.Model):
    id = models.UUIDField(primary_key=True)
    assortment = models.ForeignKey(Assortment, on_delete=models.DO_NOTHING,
                                   db_column='assortment_id')
    product = models.ForeignKey(Product, on_delete=models.DO_NOTHING,
                                db_column='product_id')
    added_at = models.DateTimeField()
    notes = models.TextField(blank=True, null=True)
    client = models.ForeignKey(Client, on_delete=models.DO_NOTHING,
                               db_column='client_id', blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'assortment_products'
        verbose_name = 'SKU в ассортименте'
        verbose_name_plural = 'SKU в ассортиментах'


class AssortmentRecipe(models.Model):
    id = models.UUIDField(primary_key=True)
    assortment = models.ForeignKey(Assortment, on_delete=models.DO_NOTHING,
                                   db_column='assortment_id')
    recipe = models.ForeignKey(Recipe, on_delete=models.DO_NOTHING,
                               db_column='recipe_id')
    added_at = models.DateTimeField()
    notes = models.TextField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'assortment_recipes'
        verbose_name = 'Рецепт в ассортименте'
        verbose_name_plural = 'Рецепты в ассортиментах'


class AssortmentPriceList(models.Model):
    id = models.UUIDField(primary_key=True)
    assortment = models.ForeignKey(Assortment, on_delete=models.DO_NOTHING,
                                   db_column='assortment_id')
    price_list = models.ForeignKey(PriceList, on_delete=models.DO_NOTHING,
                                   db_column='price_list_id')
    added_at = models.DateTimeField()

    class Meta:
        managed = False
        db_table = 'assortment_price_lists'
        verbose_name = 'Прайслист в ассортименте'
        verbose_name_plural = 'Прайслисты в ассортиментах'


class AssortmentMaterial(models.Model):
    id = models.UUIDField(primary_key=True)
    assortment = models.ForeignKey(Assortment, on_delete=models.DO_NOTHING,
                                   db_column='assortment_id')
    material = models.ForeignKey(RawMaterial, on_delete=models.DO_NOTHING,
                                 db_column='material_id')
    added_at = models.DateTimeField()
    notes = models.TextField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'assortment_materials'
        verbose_name = 'Сырьё в ассортименте'
        verbose_name_plural = 'Сырьё в ассортиментах'


class Project(models.Model):
    id = models.UUIDField(primary_key=True)
    type = models.TextField()
    name = models.TextField()
    notes = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField()
    linked_id = models.UUIDField(blank=True, null=True)
    linked_article = models.TextField(blank=True, null=True)
    linked_name = models.TextField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'projects'
        verbose_name = 'Проект (конструктор)'
        verbose_name_plural = 'Проекты (конструктор)'

    def __str__(self):
        return self.name


class ProjectItem(models.Model):
    id = models.UUIDField(primary_key=True)
    project = models.ForeignKey(Project, on_delete=models.DO_NOTHING,
                                db_column='project_id', related_name='items')
    material = models.ForeignKey(RawMaterial, on_delete=models.DO_NOTHING,
                                 db_column='material_id', blank=True, null=True)
    quantity = models.DecimalField(max_digits=20, decimal_places=4)
    unit = models.TextField()
    created_at = models.DateTimeField()
    recipe = models.ForeignKey(Recipe, on_delete=models.DO_NOTHING,
                               db_column='recipe_id', blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'project_items'
        verbose_name = 'Позиция проекта'
        verbose_name_plural = 'Позиции проектов'


class Manager(models.Model):
    user_id = models.UUIDField(primary_key=True)
    full_name = models.TextField()
    phone = models.TextField(blank=True, null=True)
    role = models.TextField()
    is_active = models.BooleanField()
    created_at = models.DateTimeField()
    created_by = models.UUIDField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'managers'
        verbose_name = 'Пользователь (профиль)'
        verbose_name_plural = 'Пользователи (профили)'

    def __str__(self):
        return f'{self.full_name} ({self.role})'


class PricelistDownload(models.Model):
    id = models.BigIntegerField(primary_key=True)
    user_id = models.UUIDField()
    downloaded_at = models.DateTimeField()
    tier = models.TextField()
    client_name = models.TextField(blank=True, null=True)
    sku_count = models.IntegerField(blank=True, null=True)
    notes = models.TextField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'pricelist_downloads'
        verbose_name = 'Скачивание прайса'
        verbose_name_plural = 'Аудит скачиваний прайсов'


# ---------------------------------------------------------------------
# VIEW (только чтение). primary_key указан на уникальном поле view.
# ---------------------------------------------------------------------

class RecipeCost(models.Model):
    recipe_id = models.UUIDField(primary_key=True)
    recipe_article = models.TextField(blank=True, null=True)
    recipe_name = models.TextField(blank=True, null=True)
    output_quantity = models.DecimalField(max_digits=20, decimal_places=4, blank=True, null=True)
    output_unit = models.TextField(blank=True, null=True)
    total_cost = models.DecimalField(max_digits=20, decimal_places=4, blank=True, null=True)
    cost_per_kg = models.DecimalField(max_digits=20, decimal_places=4, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'recipe_cost'
        verbose_name = 'Себестоимость рецепта'
        verbose_name_plural = 'Себестоимость рецептов'


class SkuCost(models.Model):
    product_id = models.UUIDField(primary_key=True)
    sku_article = models.TextField(blank=True, null=True)
    product_name = models.TextField(blank=True, null=True)
    package_size = models.DecimalField(max_digits=20, decimal_places=4, blank=True, null=True)
    package_unit = models.TextField(blank=True, null=True)
    blend_cost = models.DecimalField(max_digits=20, decimal_places=4, blank=True, null=True)
    packaging_cost = models.DecimalField(max_digits=20, decimal_places=4, blank=True, null=True)
    total_sku_cost = models.DecimalField(max_digits=20, decimal_places=4, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'sku_cost'
        verbose_name = 'Себестоимость SKU'
        verbose_name_plural = 'Себестоимость SKU'


class ManagerPricelist(models.Model):
    product_id = models.UUIDField(primary_key=True)
    sku_article = models.TextField(blank=True, null=True)
    sku_name = models.TextField(blank=True, null=True)
    photo_url = models.TextField(blank=True, null=True)
    package_size = models.DecimalField(max_digits=20, decimal_places=4, blank=True, null=True)
    package_unit = models.TextField(blank=True, null=True)
    category_name = models.TextField(blank=True, null=True)
    price_base = models.IntegerField(blank=True, null=True)
    price_opt = models.IntegerField(blank=True, null=True)
    price_opt_plus = models.IntegerField(blank=True, null=True)
    price_partner = models.IntegerField(blank=True, null=True)
    price_key_partner = models.IntegerField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'manager_pricelist_v1'
        verbose_name = 'Прайс менеджера'
        verbose_name_plural = 'Прайс менеджера (5 уровней)'


class RawMaterialWithPrice(models.Model):
    id = models.UUIDField(primary_key=True)
    article = models.TextField(blank=True, null=True)
    name = models.TextField(blank=True, null=True)
    unit = models.TextField(blank=True, null=True)
    category_id = models.UUIDField(blank=True, null=True)
    current_price = models.DecimalField(max_digits=20, decimal_places=4, blank=True, null=True)
    price_date = models.DateField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'raw_materials_with_price'
        verbose_name = 'Сырьё с ценой'
        verbose_name_plural = 'Сырьё с актуальной ценой'


class RecipeClient(models.Model):
    id = models.UUIDField(primary_key=True)
    recipe = models.ForeignKey(Recipe, on_delete=models.DO_NOTHING, db_column='recipe_id')
    client = models.ForeignKey(Client, on_delete=models.DO_NOTHING, db_column='client_id')
    created_at = models.DateTimeField()

    class Meta:
        managed = False
        db_table = 'recipe_clients'
        verbose_name = 'Рецепт клиента (СТМ)'
        verbose_name_plural = 'Рецепты клиентов (СТМ)'
