from ._shared import *  # noqa: F403 - shared router namespace

@router.get(
    "/categories",
    response_model=List[CategoryResponse],
    operation_id="admin_management_list_categories",
    dependencies=CATALOG_FEATURE_DEPENDENCIES,
)
def list_categories(
    include_inactive: bool = Query(False),
    current_staff: User = Depends(require_organization_role(UserRole.MANAGER, UserRole.OWNER)),
    db: Session = Depends(get_db)
):
    stmt = select(Category)
    if not include_inactive:
        stmt = stmt.where(Category.status == EntityStatus.ACTIVE)
    return db.scalars(stmt.order_by(Category.category_name.asc())).all()


@router.post(
    "/categories",
    response_model=CategoryResponse,
    status_code=status.HTTP_201_CREATED,
    operation_id="admin_management_create_category",
    dependencies=CATALOG_FEATURE_DEPENDENCIES,
)
def create_category(
    category: CategoryCreate,
    current_staff: User = Depends(require_organization_role(UserRole.MANAGER, UserRole.OWNER)),
    db: Session = Depends(get_db)
):
    new_category = Category(
        category_name=category.category_name,
        category_description=category.category_description,
        created_by_user_id=current_staff.id,
        status=EntityStatus.ACTIVE,
    )
    db.add(new_category)
    db.commit()
    db.refresh(new_category)
    return new_category


@router.put(
    "/categories/{category_id}",
    response_model=CategoryResponse,
    operation_id="admin_management_update_category",
    dependencies=CATALOG_FEATURE_DEPENDENCIES,
)
def update_category(
    category_id: str,
    category_update: CategoryUpdate,
    current_staff: User = Depends(require_organization_role(UserRole.MANAGER, UserRole.OWNER)),
    db: Session = Depends(get_db)
):
    parsed_category_id = parse_category_id(category_id)
    category = db.scalar(select(Category).where(Category.category_id == parsed_category_id))
    if not category:
        raise AppHTTPException(status_code=404, error="category_not_found", message="Category not found.", details={"reason": "request_failed"})

    if category_update.category_name is not None:
        category.category_name = category_update.category_name
    if category_update.category_description is not None:
        category.category_description = category_update.category_description
    if category_update.status is not None:
        category.status = category_update.status

    db.commit()
    db.refresh(category)
    return category


@router.delete(
    "/categories/{category_id}",
    response_model=CategoryResponse,
    operation_id="admin_management_delete_category",
    dependencies=CATALOG_FEATURE_DEPENDENCIES,
)
def delete_category(
    category_id: str,
    current_staff: User = Depends(require_organization_role(UserRole.MANAGER, UserRole.OWNER)),
    db: Session = Depends(get_db)
):
    parsed_category_id = parse_category_id(category_id)
    category = db.scalar(select(Category).where(Category.category_id == parsed_category_id))
    if not category:
        raise AppHTTPException(status_code=404, error="category_not_found", message="Category not found.", details={"reason": "request_failed"})

    active_products = db.scalar(
        select(func.count(Product.product_id)).where(
            Product.category_id == parsed_category_id,
            active_product_filter(),
            Product.deleted_at.is_(None),
        )
    ) or 0
    if active_products > 0:
        raise AppHTTPException(status_code=status.HTTP_409_CONFLICT, error="category_has_active_products", message="Category cannot be archived while it has active products.", details={"category_id": category.category_id, "active_products": active_products})

    category.status = EntityStatus.INACTIVE
    db.commit()
    db.refresh(category)
    return category


# ─────────────────────────────────────────────────────────────
# PRODUCTS
# ─────────────────────────────────────────────────────────────

# INGREDIENTS

@router.get(
    "/ingredients",
    response_model=List[IngredientResponse],
    operation_id="admin_management_list_ingredients",
    dependencies=CATALOG_FEATURE_DEPENDENCIES,
)
def list_ingredients(
    include_inactive: bool = Query(False),
    customization_only: bool = Query(False),
    current_staff: User = Depends(require_organization_role(UserRole.MANAGER, UserRole.OWNER)),
    db: Session = Depends(get_db),
):
    stmt = select(Ingredient)
    if not include_inactive:
        stmt = stmt.where(Ingredient.status == EntityStatus.ACTIVE)
    if customization_only:
        drink_category_ids = select(Category.category_id).where(
            Category.category_name.ilike("%bebida%")
        )
        non_drink_ingredient_ids = (
            select(ProductIngredient.ingredient_id)
            .join(Product, Product.product_id == ProductIngredient.product_id)
            .where(~Product.category_id.in_(drink_category_ids))
        )
        linked_ingredient_ids = select(ProductIngredient.ingredient_id)
        stmt = stmt.where(
            Ingredient.type != IngredientType.DRINK,
            or_(
                Ingredient.ingredient_id.in_(non_drink_ingredient_ids),
                ~Ingredient.ingredient_id.in_(linked_ingredient_ids),
            ),
        )
    return db.scalars(stmt.order_by(Ingredient.type.asc(), Ingredient.name.asc())).all()


@router.post(
    "/ingredients",
    response_model=IngredientResponse,
    status_code=status.HTTP_201_CREATED,
    operation_id="admin_management_create_ingredient",
    dependencies=CATALOG_FEATURE_DEPENDENCIES,
)
def create_ingredient(
    ingredient: IngredientCreate,
    current_staff: User = Depends(require_organization_role(UserRole.MANAGER, UserRole.OWNER)),
    db: Session = Depends(get_db),
):
    name = ingredient.name.strip()
    existing = db.scalar(select(Ingredient).where(func.lower(Ingredient.name) == name.lower()))
    if existing:
        if existing.status == EntityStatus.INACTIVE:
            existing.status = EntityStatus.ACTIVE
            existing.type = ingredient.type
            existing.available = ingredient.available
            if "calories_per_gram" in getattr(ingredient, "model_fields_set", set()):
                existing.calories_per_gram = ingredient.calories_per_gram
            db.commit()
            db.refresh(existing)
            return existing
        raise AppHTTPException(status_code=status.HTTP_409_CONFLICT, error="duplicate_ingredient_name", message="An ingredient with this name already exists.", details={"name": name})

    new_ingredient = Ingredient(
        name=name,
        type=ingredient.type,
        status=ingredient.status,
        available=ingredient.available,
        calories_per_gram=ingredient.calories_per_gram,
    )
    db.add(new_ingredient)
    db.commit()
    db.refresh(new_ingredient)
    return new_ingredient


@router.put(
    "/ingredients/{ingredient_id}",
    response_model=IngredientResponse,
    operation_id="admin_management_update_ingredient",
    dependencies=CATALOG_FEATURE_DEPENDENCIES,
)
def update_ingredient(
    ingredient_id: int,
    ingredient_update: IngredientUpdate,
    current_staff: User = Depends(require_organization_role(UserRole.MANAGER, UserRole.OWNER)),
    db: Session = Depends(get_db),
):
    ingredient = db.scalar(select(Ingredient).where(Ingredient.ingredient_id == ingredient_id))
    if not ingredient:
        raise AppHTTPException(status_code=404, error="ingredient_not_found", message="Ingredient not found.", details={"reason": "request_failed"})

    if ingredient_update.name is not None:
        name = ingredient_update.name.strip()
        existing = (
            db.scalar(
                select(Ingredient).where(
                    func.lower(Ingredient.name) == name.lower(),
                    Ingredient.ingredient_id != ingredient_id,
                ).limit(1)
            )
        )
        if existing:
            raise AppHTTPException(status_code=status.HTTP_409_CONFLICT, error="duplicate_ingredient_name", message="An ingredient with this name already exists.", details={"name": name})
        ingredient.name = name
    if ingredient_update.type is not None:
        ingredient.type = ingredient_update.type
    if ingredient_update.status is not None:
        ingredient.status = ingredient_update.status
    if ingredient_update.available is not None:
        ingredient.available = ingredient_update.available
    if "calories_per_gram" in getattr(ingredient_update, "model_fields_set", set()):
        ingredient.calories_per_gram = ingredient_update.calories_per_gram

    db.commit()
    db.refresh(ingredient)
    return ingredient


@router.put(
    "/ingredients/{ingredient_id}/availability",
    response_model=IngredientResponse,
    operation_id="admin_management_set_ingredient_availability",
    dependencies=CATALOG_FEATURE_DEPENDENCIES,
)
def set_ingredient_availability(
    ingredient_id: int,
    availability: AvailabilityUpdate,
    current_staff: User = Depends(require_organization_role(UserRole.MANAGER, UserRole.OWNER)),
    db: Session = Depends(get_db),
):
    ingredient = db.scalar(select(Ingredient).where(Ingredient.ingredient_id == ingredient_id))
    if not ingredient:
        raise AppHTTPException(status_code=404, error="ingredient_not_found", message="Ingredient not found.", details={"reason": "request_failed"})

    ingredient.available = availability.available
    db.commit()
    db.refresh(ingredient)
    return ingredient


@router.delete(
    "/ingredients/{ingredient_id}",
    response_model=IngredientResponse,
    operation_id="admin_management_delete_ingredient",
    dependencies=CATALOG_FEATURE_DEPENDENCIES,
)
def delete_ingredient(
    ingredient_id: int,
    current_staff: User = Depends(require_organization_role(UserRole.MANAGER, UserRole.OWNER)),
    db: Session = Depends(get_db),
):
    ingredient = db.scalar(select(Ingredient).where(Ingredient.ingredient_id == ingredient_id))
    if not ingredient:
        raise AppHTTPException(status_code=404, error="ingredient_not_found", message="Ingredient not found.", details={"reason": "request_failed"})

    ingredient.status = EntityStatus.INACTIVE
    db.commit()
    db.refresh(ingredient)
    return ingredient


@router.post(
    "/products",
    response_model=ProductAdminResponse,
    status_code=status.HTTP_201_CREATED,
    operation_id="admin_management_create_product",
    dependencies=CATALOG_FEATURE_DEPENDENCIES,
)
def create_product(
    product: ProductCreate,
    current_staff: User = Depends(require_organization_role(UserRole.MANAGER, UserRole.OWNER)),
    db: Session = Depends(get_db)
):
    category = db.scalar(
        select(Category).where(
            Category.category_id == product.category_id,
            Category.status == EntityStatus.ACTIVE,
        )
    )
    if not category:
        raise AppHTTPException(status_code=404, error="category_not_found", message="Category not found.", details={"reason": "request_failed"})

    new_product = Product(
        name=product.name,
        product_description=product.product_description,
        price=product.price,
        available=product.available,
        category_id=product.category_id,
        created_by_user_id=current_staff.id,
        sold=0,
        status=EntityStatus.ACTIVE,
        customizable=1 if product.customizable else 0,
        menu_tags=product.menu_tags,
        featured=1 if product.featured else 0,
        discount_percentage=product.discount_percentage,
        gluten_free=1 if product.gluten_free else 0,
        contains_alcohol=1 if product.contains_alcohol else 0,
        total_calories=product.total_calories,
    )
    db.add(new_product)
    db.flush()
    _sync_product_ingredients(db, new_product.product_id, product.ingredients)
    db.commit()
    db.refresh(new_product)

    saved_product = db.scalar(
        select(Product).options(
            selectinload(Product.media_items)
            .selectinload(ProductMedia.media)
            .selectinload(Media.variants)
        ).where(
            Product.product_id == new_product.product_id
        ).limit(1)
    )
    return _product_staff_response(db, saved_product)


@router.get(
    "/products",
    response_model=List[ProductAdminResponse],
    operation_id="admin_management_list_products",
    dependencies=CATALOG_FEATURE_DEPENDENCIES,
)
def list_products(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    name: str = Query(None),
    category: str = Query(None),
    min_price: float = Query(None),
    max_price: float = Query(None),
    featured: bool = Query(None),
    gluten_free: bool = Query(None),
    contains_alcohol: bool = Query(None),
    include_deleted: bool = Query(False),
    current_staff: User = Depends(require_organization_role(UserRole.MANAGER, UserRole.OWNER)),
    db: Session = Depends(get_db)
):
    stmt = select(Product).options(
        selectinload(Product.media_items)
        .selectinload(ProductMedia.media)
        .selectinload(Media.variants)
    )

    if not include_deleted:
        stmt = stmt.where(active_product_filter(), Product.deleted_at.is_(None))

    if name:
        stmt = stmt.where(Product.name.ilike(f"%{name}%"))

    if category:
        stmt = stmt.where(Product.category_id == parse_category_id(category))

    if min_price is not None:
        stmt = stmt.where(Product.price >= min_price)

    if max_price is not None:
        stmt = stmt.where(Product.price <= max_price)

    if featured is not None:
        stmt = stmt.where(Product.featured == (1 if featured else 0))

    if gluten_free is not None:
        stmt = stmt.where(Product.gluten_free == (1 if gluten_free else 0))

    if contains_alcohol is not None:
        stmt = stmt.where(Product.contains_alcohol == (1 if contains_alcohol else 0))

    products = db.scalars(stmt.offset(skip).limit(limit)).unique().all()
    product_ids = [product.product_id for product in products]
    ingredient_lookup = _product_ingredient_lookup(db, product_ids)
    unavailable_base_lookup = unavailable_base_ingredients(db, product_ids)
    return [
        _product_staff_response(db, product, ingredient_lookup, unavailable_base_lookup)
        for product in products
    ]


@router.get(
    "/products/{product_id}",
    response_model=ProductAdminResponse,
    operation_id="admin_management_get_product",
    dependencies=CATALOG_FEATURE_DEPENDENCIES,
)
def get_product(
    product_id: str,
    current_staff: User = Depends(require_organization_role(UserRole.MANAGER, UserRole.OWNER)),
    db: Session = Depends(get_db)
):
    parsed_product_id = parse_product_id(product_id)
    product = db.scalar(
        select(Product).options(
            selectinload(Product.media_items)
            .selectinload(ProductMedia.media)
            .selectinload(Media.variants)
        ).where(
            Product.product_id == parsed_product_id,
            Product.status == EntityStatus.ACTIVE,
        ).limit(1)
    )

    if not product:
        raise AppHTTPException(status_code=404, error="product_not_found", message="Product not found.", details={"reason": "request_failed"})

    return _product_staff_response(db, product)


@router.get(
    "/products/{product_id}/analytics",
    response_model=ProductAnalyticsResponse,
    operation_id="admin_management_get_product_analytics",
    dependencies=ANALYTICS_FEATURE_DEPENDENCIES,
)
def get_product_analytics(
    product_id: str,
    days: int = Query(30, ge=1, le=365),
    current_staff: User = Depends(require_organization_role(UserRole.MANAGER, UserRole.OWNER)),
    db: Session = Depends(get_db)
):
    parsed_product_id = parse_product_id(product_id)
    product = db.scalar(select(Product).where(Product.product_id == parsed_product_id))
    if not product:
        raise AppHTTPException(status_code=404, error="product_not_found", message="Product not found.", details={"reason": "request_failed"})

    end_date = datetime.utcnow().date()
    start_date = end_date - timedelta(days=days - 1)
    daily_keys = [(start_date + timedelta(days=index)).strftime("%Y-%m-%d") for index in range(days)]
    daily_buckets = {key: _empty_sales_stats() for key in daily_keys}

    total_sales = 0.0
    quantity_sold = 0
    order_count = 0
    for date_key, daily_sales, daily_quantity, line_count, distinct_order_count in _product_sales_aggregate_rows(
        db,
        datetime.combine(start_date, datetime.min.time()),
        datetime.combine(end_date, datetime.max.time()),
        "day",
        parsed_product_id,
    ):
        total_sales += daily_sales
        quantity_sold += daily_quantity
        order_count += distinct_order_count
        if date_key in daily_buckets:
            daily_buckets[date_key] = {
                "total_sales": daily_sales,
                "quantity_sold": daily_quantity,
                "order_count": line_count,
            }

    average_rating = db.scalar(
        select(func.avg(ProductReview.rating)).where(
            ProductReview.product_id == parsed_product_id,
            ProductReview.status == ReviewStatus.APPROVED,
        )
    )
    total_reviews = db.scalar(
        select(func.count(ProductReview.review_id)).where(ProductReview.product_id == parsed_product_id)
    ) or 0

    return ProductAnalyticsResponse(
        product_id=parsed_product_id,
        product_display_id=format_product_id(parsed_product_id),
        total_sales=total_sales,
        quantity_sold=quantity_sold,
        order_count=order_count,
        current_price=float(product.price),
        effective_available=effective_product_available(
            product,
            unavailable_base_product_ids(db, [parsed_product_id]),
        ),
        average_rating=float(average_rating) if average_rating is not None else None,
        total_reviews=total_reviews,
        sales_by_day=[_sales_point(key, daily_buckets[key]) for key in daily_keys],
    )


@router.put(
    "/products/{product_id}",
    response_model=ProductAdminResponse,
    operation_id="admin_management_update_product",
    dependencies=CATALOG_FEATURE_DEPENDENCIES,
)
def update_product(
    product_id: str,
    product_update: ProductUpdate,
    current_staff: User = Depends(require_organization_role(UserRole.MANAGER, UserRole.OWNER)),
    db: Session = Depends(get_db)
):
    parsed_product_id = parse_product_id(product_id)
    product = db.scalar(
        select(Product).where(
            Product.product_id == parsed_product_id,
            Product.status == EntityStatus.ACTIVE,
        ).limit(1)
    )

    if not product:
        raise AppHTTPException(status_code=404, error="product_not_found", message="Product not found.", details={"reason": "request_failed"})

    if product_update.name is not None:
        product.name = product_update.name
    if product_update.product_description is not None:
        product.product_description = product_update.product_description
    if product_update.price is not None:
        product.price = product_update.price
    if product_update.available is not None:
        product.available = product_update.available
    if product_update.category_id is not None:
        category = db.scalar(
            select(Category).where(
                Category.category_id == product_update.category_id,
                Category.status == EntityStatus.ACTIVE,
            )
        )
        if not category:
            raise AppHTTPException(status_code=404, error="category_not_found", message="Category not found.", details={"reason": "request_failed"})
        product.category_id = product_update.category_id
    if product_update.status is not None:
        product.status = product_update.status
    if product_update.customizable is not None:
        product.customizable = 1 if product_update.customizable else 0
    if "menu_tags" in getattr(product_update, "model_fields_set", set()):
        product.menu_tags = product_update.menu_tags
    if product_update.featured is not None:
        product.featured = 1 if product_update.featured else 0
    if product_update.discount_percentage is not None:
        product.discount_percentage = product_update.discount_percentage
    if product_update.gluten_free is not None:
        product.gluten_free = 1 if product_update.gluten_free else 0
    if product_update.contains_alcohol is not None:
        product.contains_alcohol = 1 if product_update.contains_alcohol else 0
    if "total_calories" in getattr(product_update, "model_fields_set", set()):
        product.total_calories = product_update.total_calories
    if product_update.ingredients is not None:
        _sync_product_ingredients(db, parsed_product_id, product_update.ingredients)

    db.commit()
    db.refresh(product)
    return _product_staff_response(db, product)


@router.put(
    "/products/{product_id}/availability",
    response_model=ProductAdminResponse,
    operation_id="admin_management_set_product_availability",
    dependencies=CATALOG_FEATURE_DEPENDENCIES,
)
def set_product_availability(
    product_id: str,
    availability: AvailabilityUpdate,
    current_staff: User = Depends(require_organization_role(UserRole.MANAGER, UserRole.OWNER)),
    db: Session = Depends(get_db),
):
    parsed_product_id = parse_product_id(product_id)
    product = db.scalar(select(Product).where(Product.product_id == parsed_product_id))
    if not product:
        raise AppHTTPException(status_code=404, error="product_not_found", message="Product not found.", details={"reason": "request_failed"})

    product.available = availability.available
    db.commit()
    db.refresh(product)
    return _product_staff_response(db, product)


@router.post(
    "/products/{product_id}/toggle-status",
    response_model=ProductAdminResponse,
    operation_id="admin_management_toggle_product_status",
    dependencies=CATALOG_FEATURE_DEPENDENCIES,
)
def toggle_product_status(
    product_id: str,
    current_staff: User = Depends(require_organization_role(UserRole.MANAGER, UserRole.OWNER)),
    db: Session = Depends(get_db)
):
    parsed_product_id = parse_product_id(product_id)
    product = db.scalar(
        select(Product).where(Product.product_id == parsed_product_id).limit(1)
    )

    if not product:
        raise AppHTTPException(status_code=404, error="product_not_found", message="Product not found.", details={"reason": "request_failed"})

    if product.deleted_at is not None:
        product.status = EntityStatus.ACTIVE
        product.deleted_at = None
    else:
        product.status = EntityStatus.INACTIVE if product.status == EntityStatus.ACTIVE else EntityStatus.ACTIVE
    db.commit()
    db.refresh(product)

    return _product_staff_response(db, product)


@router.delete(
    "/products/{product_id}",
    response_model=ProductAdminResponse,
    operation_id="admin_management_delete_product",
    dependencies=CATALOG_FEATURE_DEPENDENCIES,
)
def delete_product(
    product_id: str,
    current_staff: User = Depends(require_organization_role(UserRole.MANAGER, UserRole.OWNER)),
    db: Session = Depends(get_db)
):
    parsed_product_id = parse_product_id(product_id)
    product = db.scalar(
        select(Product).where(Product.product_id == parsed_product_id).limit(1)
    )
    if not product:
        raise AppHTTPException(status_code=404, error="product_not_found", message="Product not found.", details={"reason": "request_failed"})

    product.status = EntityStatus.INACTIVE
    product.deleted_at = datetime.utcnow()
    db.commit()
    db.refresh(product)
    return _product_staff_response(db, product)


@router.post(
    "/products/{product_id}/media",
    response_model=ProductMediaUploadResponse,
    operation_id="admin_management_upload_product_media",
    dependencies=CATALOG_FEATURE_DEPENDENCIES,
)
def upload_product_media(
    product_id: str,
    file: UploadFile = File(...),
    replace_existing: bool = Query(True),
    current_staff: User = Depends(require_organization_role(UserRole.MANAGER, UserRole.OWNER)),
    db: Session = Depends(get_db),
):
    parsed_product_id = parse_product_id(product_id)
    product = db.scalar(
        select(Product).where(Product.product_id == parsed_product_id).limit(1)
    )
    if not product:
        raise AppHTTPException(status_code=404, error="product_not_found", message="Product not found.", details={"reason": "request_failed"})
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise AppHTTPException(status_code=status.HTTP_400_BAD_REQUEST, error="invalid_image_type", message="Image type is not supported.", details={"content_type": file.content_type, "allowed_types": sorted(ALLOWED_IMAGE_TYPES)})

    stored_image = None
    try:
        stored_image = store_product_media_upload(parsed_product_id, file)
        old_storage_keys: list[str] = []
        old_media_links = db.scalars(
            select(ProductMedia)
            .options(selectinload(ProductMedia.media).selectinload(Media.variants))
            .where(ProductMedia.product_id == parsed_product_id)
            .order_by(ProductMedia.sort_order, ProductMedia.id)
        ).all()

        if replace_existing:
            for old_link in old_media_links:
                old_storage_keys.extend(variant.storage_key for variant in old_link.media.variants)
                old_storage_keys.append(old_link.media.storage_key)
                db.delete(old_link.media)
            db.flush()
            sort_order = 0
            is_primary = True
        else:
            sort_order = max((old_link.sort_order for old_link in old_media_links), default=-1) + 1
            is_primary = not old_media_links

        media = Media(
            owner_type=MediaOwnerType.PRODUCT,
            original_filename=stored_image.original_filename,
            content_type=stored_image.content_type,
            storage_key=stored_image.storage_key,
            public_url=stored_image.public_url,
            width=stored_image.width,
            height=stored_image.height,
            size_bytes=stored_image.size_bytes,
            variants=[
                MediaVariant(
                    kind=variant.kind,
                    storage_key=variant.storage_key,
                    public_url=variant.public_url,
                    content_type=variant.content_type,
                    width=variant.width,
                    height=variant.height,
                    size_bytes=variant.size_bytes,
                )
                for variant in stored_image.variants
            ],
        )
        link = ProductMedia(
            product_id=parsed_product_id,
            media=media,
            sort_order=sort_order,
            alt_text=product.name,
            is_primary=is_primary,
        )
        db.add(link)
        db.commit()

        for storage_key in old_storage_keys:
            try:
                delete_storage_key(storage_key)
            except OSError:
                logger.exception("Failed to remove replaced media file %s", storage_key)

        saved_link = db.scalar(
            select(ProductMedia)
            .options(selectinload(ProductMedia.media).selectinload(Media.variants))
            .where(ProductMedia.id == link.id)
        )
        return ProductMediaUploadResponse(
            message="Media uploaded successfully.",
            media=product_media_response(saved_link),
        )
    except ValueError as exc:
        db.rollback()
        if str(exc) == "unsupported_image_type":
            raise AppHTTPException(status_code=status.HTTP_400_BAD_REQUEST, error="invalid_image_type", message="Image type is not supported.", details={"content_type": file.content_type, "allowed_types": sorted(ALLOWED_IMAGE_TYPES)})
        raise AppHTTPException(status_code=status.HTTP_400_BAD_REQUEST, error="invalid_image_file", message="Uploaded file is not a valid image.", details={"reason": "request_failed"})
    except Exception:
        db.rollback()
        if stored_image is not None:
            for storage_key in [
                stored_image.storage_key,
                *(variant.storage_key for variant in stored_image.variants),
            ]:
                try:
                    delete_storage_key(storage_key)
                except OSError:
                    logger.exception("Failed to clean up uncommitted media file %s", storage_key)
        logger.exception("Failed to upload product media for product %s", parsed_product_id)
        raise AppHTTPException(status_code=500, error="internal_server_error", message="Internal server error.", details={"reason": "request_failed"})


@router.delete(
    "/products/{product_id}/media/{media_id}",
    response_model=MessageResponse,
    operation_id="admin_management_delete_product_media",
    dependencies=CATALOG_FEATURE_DEPENDENCIES,
)
def delete_product_media(
    product_id: str,
    media_id: int,
    current_staff: User = Depends(require_organization_role(UserRole.MANAGER, UserRole.OWNER)),
    db: Session = Depends(get_db),
):
    parsed_product_id = parse_product_id(product_id)
    link = db.scalar(
        select(ProductMedia)
        .options(selectinload(ProductMedia.media).selectinload(Media.variants))
        .where(
            ProductMedia.product_id == parsed_product_id,
            ProductMedia.media_id == media_id,
        )
        .limit(1)
    )
    if not link:
        raise AppHTTPException(status_code=404, error="media_not_found", message="Media not found.", details={"reason": "request_failed"})

    media = link.media
    storage_keys = [media.storage_key, *(variant.storage_key for variant in media.variants)]
    was_primary = link.is_primary
    has_other_owner = bool(db.scalar(select(exists().where(
        ProductMedia.media_id == media_id,
        ProductMedia.id != link.id,
    ))))
    db.delete(link)
    db.flush()

    remaining_links = db.scalars(
        select(ProductMedia)
        .where(ProductMedia.product_id == parsed_product_id)
        .order_by(ProductMedia.sort_order, ProductMedia.id)
    ).all()
    for temporary_order, remaining_link in enumerate(remaining_links, start=1):
        remaining_link.sort_order = -temporary_order
    db.flush()
    for sort_order, remaining_link in enumerate(remaining_links):
        remaining_link.sort_order = sort_order
    if was_primary and remaining_links:
        remaining_links[0].is_primary = True
    if not has_other_owner:
        db.delete(media)
    db.commit()

    if not has_other_owner:
        for storage_key in storage_keys:
            try:
                delete_storage_key(storage_key)
            except OSError:
                logger.exception("Failed to remove media file %s", storage_key)
    return {"message": "Media removed successfully."}


# ─────────────────────────────────────────────────────────────
# ORDERS
# ─────────────────────────────────────────────────────────────

