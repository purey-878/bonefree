from ._shared import *  # noqa: F403 - shared router namespace

@router.get(
    "/analytics/dashboard",
    response_model=DashboardAnalytics,
    operation_id="admin_management_get_dashboard_analytics",
    dependencies=ANALYTICS_FEATURE_DEPENDENCIES,
)
def get_dashboard_analytics(
    current_owner: User = Depends(require_organization_role(UserRole.OWNER)),
    db: Session = Depends(get_db)
):
    total_products, total_categories, total_customers, total_carts = db.execute(
        select(
            select(func.count(Product.product_id))
            .where(Product.status == EntityStatus.ACTIVE)
            .scalar_subquery(),
            select(func.count(Category.category_id))
            .where(Category.status == EntityStatus.ACTIVE)
            .scalar_subquery(),
            select(func.count(User.id))
            .where(User.status == UserStatus.ACTIVE, User.role == UserRole.CLIENT)
            .scalar_subquery(),
            select(func.count(Cart.cart_id)).scalar_subquery(),
        )
    ).one()

    return DashboardAnalytics(
        total_products=total_products,
        total_categories=total_categories,
        total_customers=total_customers,
        total_carts=total_carts,
        unavailable_products=_unavailable_product_rows(db, 5),
        popular_products=_popular_product_rows(db, 5),
        sales_charts=_build_dashboard_sales_graphs(db),
    )

@router.get(
    "/analytics/popular-products",
    response_model=List[PopularProduct],
    operation_id="admin_management_get_popular_products",
    dependencies=ANALYTICS_FEATURE_DEPENDENCIES,
)
def get_popular_products(
    limit: int = Query(5, ge=1, le=20),
    current_owner: User = Depends(require_organization_role(UserRole.OWNER)),
    db: Session = Depends(get_db)
):
    return _popular_product_rows(db, limit)


@router.get(
    "/analytics/series",
    response_model=AnalyticsSeriesResponse,
    operation_id="admin_management_get_analytics_series",
    dependencies=ANALYTICS_FEATURE_DEPENDENCIES,
)
def get_analytics_series(
    metric: str = Query(..., pattern="^(sales|orders|clients|products)$"),
    range: str = Query("month", pattern="^(day|month|year|custom)$"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    current_owner: User = Depends(require_organization_role(UserRole.OWNER)),
    db: Session = Depends(get_db)
):
    start, end, granularity = _analytics_window(range, start_date, end_date)
    keys = _analytics_keys(start, end, granularity)
    buckets = {
        key: {
            "value": 0.0,
            "quantity_sold": 0,
            "order_count": 0,
        }
        for key in keys
    }

    if metric in {"sales", "orders"}:
        for key, total_sales, quantity_sold, order_count in _sales_aggregate_rows(
            db, start, end, granularity
        ):
            if key not in buckets:
                continue
            buckets[key]["value"] = total_sales if metric == "sales" else order_count
            buckets[key]["order_count"] = order_count
            buckets[key]["quantity_sold"] = quantity_sold

    elif metric == "products":
        for key, _total_sales, quantity_sold, line_count, _distinct_order_count in _product_sales_aggregate_rows(
            db, start, end, granularity
        ):
            if key not in buckets:
                continue
            buckets[key]["value"] = quantity_sold
            buckets[key]["quantity_sold"] = quantity_sold
            buckets[key]["order_count"] = line_count

    else:
        customer_dates = db.scalars(select(User.created_at).where(User.role == UserRole.CLIENT)).all()
        for customer_date in customer_dates:
            created_at = _parse_customer_created_at(customer_date)
            if not created_at or created_at < start or created_at > end:
                continue
            key = _analytics_key(created_at, granularity)
            if key not in buckets:
                continue
            buckets[key]["value"] += 1

    points = [
        AnalyticsSeriesPoint(
            period=key,
            label=_analytics_label(key, granularity),
            value=float(buckets[key]["value"]),
            quantity_sold=int(buckets[key]["quantity_sold"]),
            order_count=int(buckets[key]["order_count"]),
        )
        for key in keys
    ]

    return AnalyticsSeriesResponse(
        metric=metric,
        range=range,
        start_date=start.strftime("%Y-%m-%d"),
        end_date=end.strftime("%Y-%m-%d"),
        total=sum(point.value for point in points),
        points=points,
    )


@router.get(
    "/analytics/sales-performance",
    response_model=SalesPerformanceResponse,
    operation_id="admin_management_get_sales_performance",
    dependencies=ANALYTICS_FEATURE_DEPENDENCIES,
)
def get_sales_performance(
    days: int = Query(7, ge=1, le=90),
    current_owner: User = Depends(require_organization_role(UserRole.OWNER)),
    db: Session = Depends(get_db)
):
    """Get sales performance over specified number of days."""
    end_date = datetime.utcnow().date()
    start_date = end_date - timedelta(days=days)

    total_sales = 0.0
    quantity_sold = 0
    order_count = 0
    sales_by_day_by_date = {}

    for date_key, daily_sales, daily_quantity, daily_order_count in _sales_aggregate_rows(
        db,
        datetime.combine(start_date, datetime.min.time()),
        datetime.combine(end_date, datetime.max.time()),
        "day",
    ):
        total_sales += daily_sales
        quantity_sold += daily_quantity
        order_count += daily_order_count
        sales_by_day_by_date[date_key] = {
            "total_sales": daily_sales,
            "quantity_sold": daily_quantity,
            "order_count": daily_order_count,
        }

    # Build sorted list of daily sales
    sales_by_day = [
        PeriodicSalesResponse(
            period=date_str,
            total_sales=stats["total_sales"],
            quantity_sold=stats["quantity_sold"],
            order_count=stats["order_count"]
        )
        for date_str, stats in sorted(sales_by_day_by_date.items())
    ]

    period = f"{start_date} a {end_date}"

    return SalesPerformanceResponse(
        total_sales=total_sales,
        quantity_sold=quantity_sold,
        order_count=order_count,
        period=period,
        sales_by_day=sales_by_day
    )
