"""Product review endpoints."""

from datetime import datetime

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload, selectinload

from modules.auth.dependencies import get_current_user, get_current_user_optional, require_organization_role
from modules.auth.models import User, UserRole
from database import get_db
from modules.restaurant.models import EntityStatus, OrderState, ReviewStatus
from modules.restaurant.models import Order, OrderProduct, Product, ProductReview, ReviewReaction, ReviewReply
from modules.restaurant.schemas.review import (
    FeaturedProductReviewResponse,
    ProductReviewCreate,
    AdminReviewPageResponse,
    AdminReviewSummary,
    ProductReviewEligibilityItem,
    ProductReviewEligibilityResponse,
    ProductReviewResponse,
    ProductReviewPageResponse,
    ProductReviewStatsResponse,
    ProductReviewUpdate,
    ReviewReactionCreate,
    ReviewReactionResponse,
    ReviewReplyCreate,
    ReviewReplyResponse,
)
from modules.restaurant.schemas.pagination import total_pages
from utils.id_format import format_product_id, parse_product_id
from core.errors import AppHTTPException
from core.rate_limit import RATE_LIMIT_OPENAPI_RESPONSES

router = APIRouter(tags=["Reviews"])


def _review_response(review: ProductReview, current_user: User | None = None) -> ProductReviewResponse:
    customer_name = None
    if review.customer:
        customer_name = f"{review.customer.name or ''} {review.customer.last_name or ''}".strip() or review.customer.email

    return ProductReviewResponse(
        review_id=review.review_id,
        product_id=review.product_id,
        product_display_id=format_product_id(review.product_id),
        product_name=review.product.name if review.product else None,
        customer_id=review.customer_id,
        order_product_id=review.order_product_id,
        customer_name=customer_name,
        rating=review.rating,
        title=review.title,
        comment=review.comment,
        status=review.status,
        created_at=review.created_at,
        updated_at=review.updated_at,
        is_owner=bool(current_user and review.customer_id == current_user.id),
        reply=review.reply,
        replies=review.replies or [],
        reactions=review.reactions or [],
    )


def _get_review_or_404(db: Session, review_id: int) -> ProductReview:
    review = db.scalar(select(ProductReview).where(ProductReview.review_id == review_id))
    if not review:
        raise AppHTTPException(status_code=404, error="review_not_found", message="Review not found.", details={"reason": "request_failed"})
    return review


def _get_reply_or_404(db: Session, review_id: int, reply_id: int) -> ReviewReply:
    reply = db.scalar(
        select(ReviewReply).where(
            ReviewReply.review_id == review_id,
            ReviewReply.reply_id == reply_id,
        )
    )
    if not reply:
        raise AppHTTPException(status_code=404, error="review_not_found", message="Review not found.", details={"reason": "request_failed"})
    return reply


def _get_active_product(db: Session, product_id: int) -> Product:
    product = db.scalar(
        select(Product).where(
            Product.product_id == product_id,
            ((Product.status == EntityStatus.ACTIVE) | (Product.status.is_(None))),
            Product.deleted_at.is_(None),
        ).limit(1)
    )
    if not product:
        raise AppHTTPException(status_code=404, error="product_not_found", message="Product not found.", details={"reason": "request_failed"})
    return product


def _get_review_for_owner(db: Session, review_id: int, current_user: User) -> ProductReview:
    review = db.scalar(select(ProductReview).where(ProductReview.review_id == review_id))
    if not review:
        raise AppHTTPException(status_code=404, error="review_not_found", message="Review not found.", details={"reason": "request_failed"})
    if review.customer_id != current_user.id:
        raise AppHTTPException(status_code=403, error="permission_denied", message="Permission denied.", details={"reason": "request_failed"})
    return review


def _purchased_order_item(db: Session, current_user: User, product_id: int, order_product_id: int) -> OrderProduct:
    item = db.scalar(
        select(OrderProduct)
        .options(joinedload(OrderProduct.order), joinedload(OrderProduct.product))
        .join(Order)
        .where(
            OrderProduct.order_product_id == order_product_id,
            OrderProduct.product_id == product_id,
            Order.customer_id == current_user.id,
            Order.state != OrderState.CANCELLED,
        )
        .limit(1)
    )
    if not item:
        raise AppHTTPException(status_code=403, error="permission_denied", message="Permission denied.", details={"reason": "request_failed"})
    return item


def _existing_product_review(db: Session, current_user: User, product_id: int) -> ProductReview | None:
    return db.scalar(
        select(ProductReview).where(
            ProductReview.customer_id == current_user.id,
            ProductReview.product_id == product_id,
        )
    )


@router.get(
    "/reviews/featured",
    response_model=list[FeaturedProductReviewResponse],
    operation_id="reviews_list_featured_product_reviews",
)
def list_featured_product_reviews(
    limit: int = Query(default=3, ge=1, le=20),
    db: Session = Depends(get_db),
):
    review_copy = case(
        (
            func.length(func.trim(func.coalesce(ProductReview.comment, ""))) > 0,
            func.trim(ProductReview.comment),
        ),
        else_=func.trim(func.coalesce(ProductReview.title, "")),
    )
    rows = db.execute(
        select(
            ProductReview.review_id,
            ProductReview.product_id,
            Product.name.label("product_name"),
            User.name.label("customer_first_name"),
            User.last_name.label("customer_last_name"),
            User.email.label("customer_email"),
            ProductReview.rating,
            ProductReview.title,
            ProductReview.comment,
            ProductReview.created_at,
        )
        .join(Product, Product.id == ProductReview.product_id)
        .join(User, User.id == ProductReview.customer_id)
        .where(
            ProductReview.status == ReviewStatus.APPROVED,
            Product.deleted_at.is_(None),
            (Product.status == EntityStatus.ACTIVE) | (Product.status.is_(None)),
            func.length(review_copy) >= 24,
        )
        .order_by(ProductReview.created_at.desc(), ProductReview.rating.desc())
        .limit(limit)
    ).all()

    return [
        FeaturedProductReviewResponse(
            review_id=row.review_id,
            product_id=row.product_id,
            product_display_id=format_product_id(row.product_id),
            product_name=row.product_name,
            customer_name=(
                f"{row.customer_first_name or ''} {row.customer_last_name or ''}".strip()
                or row.customer_email
            ),
            rating=row.rating,
            title=row.title,
            comment=row.comment,
            created_at=row.created_at,
        )
        for row in rows
    ]


@router.get(
    "/products/{product_id}/reviews",
    response_model=ProductReviewPageResponse,
    operation_id="reviews_list_product_reviews",
)
def list_product_reviews(
    product_id: str,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    rating: int | None = Query(None, ge=1, le=5),
    min_rating: int | None = Query(None, ge=1, le=5),
    has_text: bool | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    parsed_product_id = parse_product_id(product_id)
    _get_active_product(db, parsed_product_id)
    filters = [
        ProductReview.product_id == parsed_product_id,
        ProductReview.status == ReviewStatus.APPROVED,
    ]
    if rating is not None:
        filters.append(ProductReview.rating == rating)
    if min_rating is not None:
        filters.append(ProductReview.rating >= min_rating)
    text_filter = or_(
        func.length(func.trim(func.coalesce(ProductReview.title, ""))) > 0,
        func.length(func.trim(func.coalesce(ProductReview.comment, ""))) > 0,
    )
    if has_text is True:
        filters.append(text_filter)
    elif has_text is False:
        filters.append(~text_filter)

    total = db.scalar(select(func.count(ProductReview.review_id)).where(*filters)) or 0
    reviews = db.scalars(
        select(ProductReview)
        .options(
            joinedload(ProductReview.product),
            joinedload(ProductReview.customer),
            selectinload(ProductReview.replies),
            selectinload(ProductReview.reactions),
        )
        .where(*filters)
        .order_by(ProductReview.created_at.desc(), ProductReview.review_id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    ).all()
    return ProductReviewPageResponse(
        items=[_review_response(review, current_user) for review in reviews],
        page=page,
        per_page=per_page,
        total=int(total),
        total_pages=total_pages(int(total), per_page),
    )


@router.get(
    "/admin/reviews",
    response_model=AdminReviewPageResponse,
    operation_id="reviews_list_admin_reviews",
)
def list_admin_reviews(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    search: str | None = Query(None, max_length=160),
    rating: int | None = Query(None, ge=1, le=5),
    has_text: bool | None = Query(None),
    status_filter: ReviewStatus | None = Query(ReviewStatus.APPROVED, alias="status"),
    db: Session = Depends(get_db),
    current_owner: User = Depends(require_organization_role(UserRole.OWNER)),
):
    del current_owner
    filters = []
    if status_filter is not None:
        filters.append(ProductReview.status == status_filter)
    if rating is not None:
        filters.append(ProductReview.rating == rating)
    if has_text is True:
        filters.append(or_(
            func.length(func.trim(func.coalesce(ProductReview.title, ""))) > 0,
            func.length(func.trim(func.coalesce(ProductReview.comment, ""))) > 0,
        ))
    elif has_text is False:
        filters.append(and_(
            func.length(func.trim(func.coalesce(ProductReview.title, ""))) == 0,
            func.length(func.trim(func.coalesce(ProductReview.comment, ""))) == 0,
        ))
    if search and search.strip():
        pattern = f"%{search.strip()}%"
        filters.append(or_(
            Product.name.ilike(pattern),
            User.name.ilike(pattern),
            User.last_name.ilike(pattern),
            User.email.ilike(pattern),
            ProductReview.title.ilike(pattern),
            ProductReview.comment.ilike(pattern),
        ))

    filtered_ids = (
        select(ProductReview.review_id)
        .join(ProductReview.product)
        .join(ProductReview.customer)
        .where(*filters)
    )
    total = db.scalar(select(func.count()).select_from(filtered_ids.subquery())) or 0
    review_ids = db.scalars(
        filtered_ids
        .order_by(ProductReview.created_at.desc(), ProductReview.review_id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    ).all()
    reviews = []
    if review_ids:
        loaded = db.scalars(
            select(ProductReview)
            .options(
                joinedload(ProductReview.product),
                joinedload(ProductReview.customer),
                selectinload(ProductReview.replies),
                selectinload(ProductReview.reactions),
            )
            .where(ProductReview.review_id.in_(review_ids))
        ).all()
        lookup = {review.review_id: review for review in loaded}
        reviews = [lookup[review_id] for review_id in review_ids if review_id in lookup]

    average_rating = db.scalar(
        select(func.avg(ProductReview.rating))
        .select_from(ProductReview)
        .join(ProductReview.product)
        .join(ProductReview.customer)
        .where(*filters)
    )
    with_reply_count = int(db.scalar(
        select(func.count(func.distinct(ProductReview.review_id)))
        .select_from(ProductReview)
        .join(ProductReview.product)
        .join(ProductReview.customer)
        .join(ReviewReply, ReviewReply.review_id == ProductReview.review_id)
        .where(*filters)
    ) or 0)
    return AdminReviewPageResponse(
        items=[_review_response(review) for review in reviews],
        page=page,
        per_page=per_page,
        total=int(total),
        total_pages=total_pages(int(total), per_page),
        summary=AdminReviewSummary(
            average_rating=round(float(average_rating), 2) if average_rating is not None else None,
            with_reply=with_reply_count,
            awaiting_reply=max(int(total) - with_reply_count, 0),
        ),
    )


@router.get(
    "/products/{product_id}/reviews/stats",
    response_model=ProductReviewStatsResponse,
    operation_id="reviews_get_product_review_stats",
)
def get_product_review_stats(product_id: str, db: Session = Depends(get_db)):
    parsed_product_id = parse_product_id(product_id)
    _get_active_product(db, parsed_product_id)
    average_rating, total_reviews = db.execute(
        select(func.avg(ProductReview.rating), func.count(ProductReview.review_id)).where(
            ProductReview.product_id == parsed_product_id,
            ProductReview.status == ReviewStatus.APPROVED,
        )
    ).one()
    return ProductReviewStatsResponse(
        product_id=parsed_product_id,
        product_display_id=format_product_id(parsed_product_id),
        average_rating=round(float(average_rating), 2) if average_rating is not None else None,
        total_reviews=int(total_reviews or 0),
    )


@router.get(
    "/products/{product_id}/reviews/eligibility",
    response_model=ProductReviewEligibilityResponse,
    operation_id="reviews_get_product_review_eligibility",
)
def get_product_review_eligibility(
    product_id: str,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    parsed_product_id = parse_product_id(product_id)
    _get_active_product(db, parsed_product_id)
    if not current_user:
        return ProductReviewEligibilityResponse(
            eligible=False,
            authenticated=False,
            message="Log in to review products you have purchased.",
        )

    existing_product_review = _existing_product_review(db, current_user, parsed_product_id)
    order_items = db.scalars(
        select(OrderProduct)
        .options(
            joinedload(OrderProduct.order),
            joinedload(OrderProduct.product),
            joinedload(OrderProduct.review).joinedload(ProductReview.customer),
            joinedload(OrderProduct.review).selectinload(ProductReview.replies),
            joinedload(OrderProduct.review).selectinload(ProductReview.reactions),
        )
        .join(Order)
        .where(
            OrderProduct.product_id == parsed_product_id,
            Order.customer_id == current_user.id,
            Order.state != OrderState.CANCELLED,
        )
        .order_by(Order.ordered_at.desc(), OrderProduct.order_product_id.desc())
    ).unique().all()

    items = [
        ProductReviewEligibilityItem(
            order_product_id=item.order_product_id,
            order_id=item.order_id,
            product_id=item.product_id,
            product_display_id=format_product_id(item.product_id),
            product_name=item.product_name_snapshot or (item.product.name if item.product else format_product_id(item.product_id)),
            ordered_at=item.order.ordered_at,
            existing_review=_review_response(existing_product_review or item.review, current_user) if (existing_product_review or item.review) else None,
        )
        for item in order_items
    ]
    eligible = bool(items and existing_product_review is None)
    message = "Choose a purchased item to review." if eligible else "You have already reviewed this product. Edit your existing review."
    if not items:
        message = "Purchase this product before leaving a review."

    return ProductReviewEligibilityResponse(
        eligible=eligible,
        authenticated=True,
        items=items,
        existing_review=_review_response(existing_product_review, current_user) if existing_product_review else None,
        message=message,
    )


@router.post(
    "/products/{product_id}/reviews",
    response_model=ProductReviewResponse,
    status_code=status.HTTP_201_CREATED,
    operation_id="reviews_create_product_review",
)
def create_product_review(
    product_id: str,
    body: ProductReviewCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    parsed_product_id = parse_product_id(product_id)
    _get_active_product(db, parsed_product_id)
    _purchased_order_item(db, current_user, parsed_product_id, body.order_product_id)

    existing_product_review = _existing_product_review(db, current_user, parsed_product_id)
    if existing_product_review:
        raise AppHTTPException(
            status_code=status.HTTP_409_CONFLICT,
            error="product_already_reviewed",
            message="You have already reviewed this product.",
            details={"product_id": parsed_product_id, "review_id": existing_product_review.review_id},
        )

    existing = db.scalar(
        select(ProductReview).where(ProductReview.order_product_id == body.order_product_id)
    )
    if existing:
        raise AppHTTPException(
            status_code=status.HTTP_409_CONFLICT,
            error="order_item_already_reviewed",
            message="This order item has already been reviewed.",
            details={"order_product_id": body.order_product_id, "review_id": existing.review_id},
        )

    review = ProductReview(
        product_id=parsed_product_id,
        customer_id=current_user.id,
        order_product_id=body.order_product_id,
        rating=body.rating,
        title=body.title,
        comment=body.comment,
        status=ReviewStatus.APPROVED,
    )
    db.add(review)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise AppHTTPException(
            status_code=status.HTTP_409_CONFLICT,
            error="review_conflict",
            message="Review could not be created because it conflicts with an existing review.",
            details={"product_id": parsed_product_id, "order_product_id": body.order_product_id, "exception": str(exc)},
        )

    db.refresh(review)
    return _review_response(review, current_user)


@router.put(
    "/reviews/{review_id}",
    response_model=ProductReviewResponse,
    operation_id="reviews_update_product_review",
)
def update_product_review(
    review_id: int,
    body: ProductReviewUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not body.model_fields_set:
        raise AppHTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error="empty_review_update",
            message="At least one field must be provided to update the review.",
            details={"review_id": review_id},
        )

    review = _get_review_for_owner(db, review_id, current_user)
    if body.rating is not None:
        review.rating = body.rating
    if "title" in body.model_fields_set:
        review.title = body.title
    if "comment" in body.model_fields_set:
        review.comment = body.comment
    review.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(review)
    return _review_response(review, current_user)


@router.delete(
    "/reviews/{review_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    operation_id="reviews_delete_product_review",
)
def delete_product_review(
    review_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    review = _get_review_for_owner(db, review_id, current_user)
    db.delete(review)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/admin/reviews/{review_id}/reply",
    response_model=ReviewReplyResponse,
    status_code=status.HTTP_201_CREATED,
    responses=RATE_LIMIT_OPENAPI_RESPONSES,
    operation_id="reviews_create_review_reply",
)
def create_review_reply(
    review_id: int,
    body: ReviewReplyCreate,
    db: Session = Depends(get_db),
    current_owner: User = Depends(require_organization_role(UserRole.OWNER)),
):
    _get_review_or_404(db, review_id)
    reply = ReviewReply(review_id=review_id, author_user_id=current_owner.id, text=body.text.strip())
    db.add(reply)
    db.commit()
    db.refresh(reply)
    return reply


@router.put(
    "/admin/reviews/{review_id}/reply/{reply_id}",
    response_model=ReviewReplyResponse,
    responses=RATE_LIMIT_OPENAPI_RESPONSES,
    operation_id="reviews_update_review_reply",
)
def update_review_reply(
    review_id: int,
    reply_id: int,
    body: ReviewReplyCreate,
    db: Session = Depends(get_db),
    current_owner: User = Depends(require_organization_role(UserRole.OWNER)),
):
    reply = _get_reply_or_404(db, review_id, reply_id)
    reply.text = body.text.strip()
    reply.author_user_id = current_owner.id
    reply.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(reply)
    return reply


@router.delete(
    "/admin/reviews/{review_id}/reply/{reply_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=RATE_LIMIT_OPENAPI_RESPONSES,
    operation_id="reviews_delete_review_reply",
)
def delete_review_reply(
    review_id: int,
    reply_id: int,
    db: Session = Depends(get_db),
    current_owner: User = Depends(require_organization_role(UserRole.OWNER)),
):
    _ = current_owner
    reply = _get_reply_or_404(db, review_id, reply_id)
    db.delete(reply)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/admin/reviews/{review_id}/reaction",
    response_model=ReviewReactionResponse,
    responses=RATE_LIMIT_OPENAPI_RESPONSES,
    operation_id="reviews_upsert_review_reaction",
)
def upsert_review_reaction(
    review_id: int,
    body: ReviewReactionCreate,
    db: Session = Depends(get_db),
    current_owner: User = Depends(require_organization_role(UserRole.OWNER)),
):
    _get_review_or_404(db, review_id)
    reaction = db.scalar(
        select(ReviewReaction).where(
            ReviewReaction.review_id == review_id,
            ReviewReaction.reacted_by_user_id == current_owner.id,
        )
    )
    if reaction:
        reaction.type = body.type
    else:
        reaction = ReviewReaction(review_id=review_id, reacted_by_user_id=current_owner.id, type=body.type)
        db.add(reaction)
    db.commit()
    db.refresh(reaction)
    return reaction


@router.delete(
    "/admin/reviews/{review_id}/reaction",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=RATE_LIMIT_OPENAPI_RESPONSES,
    operation_id="reviews_delete_review_reaction",
)
def delete_review_reaction(
    review_id: int,
    db: Session = Depends(get_db),
    current_owner: User = Depends(require_organization_role(UserRole.OWNER)),
):
    reaction = db.scalar(
        select(ReviewReaction).where(
            ReviewReaction.review_id == review_id,
            ReviewReaction.reacted_by_user_id == current_owner.id,
        )
    )
    if reaction:
        db.delete(reaction)
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
