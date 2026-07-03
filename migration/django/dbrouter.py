# -*- coding: utf-8 -*-
# Роутер баз: бизнес-модели (app 'catalog') читаются из базы 'tea'
# (tea_production, read-only). Всё служебное Django — в 'default' (teahub).

class DBRouter:
    business_app = 'catalog'

    def db_for_read(self, model, **hints):
        if model._meta.app_label == self.business_app:
            return 'tea'
        return 'default'

    def db_for_write(self, model, **hints):
        # На этом этапе запись в бизнес-базу не предусмотрена (read-only).
        if model._meta.app_label == self.business_app:
            return 'tea'
        return 'default'

    def allow_relation(self, obj1, obj2, **hints):
        return True

    def allow_migrate(self, db, app_label, model_name=None, **hints):
        # Бизнес-модели не мигрируем (managed=False). Служебное — только в default.
        if app_label == self.business_app:
            return False
        return db == 'default'
