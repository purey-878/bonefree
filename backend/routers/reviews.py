"""Product review endpoints."""

from datetime import datetime

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from dependencies import get_current_user, get_current_user_optional, require_role
from services.auth_service import SUPER_ADMIN_ROLE
from database import get_db
from enums import EntityStatus, OrderState, ReviewStatus
from models import Admin, Customer, Order, OrderProduct, Product, ProductReview, ReviewReaction, ReviewReply
from schemas.review import (
    ProductReviewCreate,
    ProductReviewEligibilityItem,
    ProductReviewEligibilityResponse,
    ProductReviewResponse,
    ProductReviewStatsResponse,
    ProductReviewUpdate,
    ReviewReactionCreate,
    ReviewReactionResponse,
    ReviewReplyCreate,
    ReviewReplyResponse,
)
from utils.id_format import format_product_id, parse_product_id
from core.errors import AppHTTPException

router = APIRouter(tags=["Reviews"])


def _review_response(review: ProductReview, current_user: Customer | None = None) -> ProductReviewResponse:
    customer_name = None
    if review.customer:
        customer_name = f"{review.customer.name or ''} {review.customer.last_name or ''}".strip() or review.customer.email

    return ProductReviewResponse(
        review_id=review.review_id,
        product_id=review.product_id,
        product_display_id=format_product_id(review.product_id),
        customer_id=review.customer_id,
        order_product_id=review.order_product_id,
        customer_name=customer_name,
        rating=review.rating,
        title=review.title,
        comment=review.comment,
        status=review.status,
        created_at=review.created_at,
        updated_at=review.updated_at,
        is_owner=bool(current_user and review.customer_id == current_user.customer_id),
        reply=review.reply,
        replies=review.replies or [],
        reactions=review.reactions or [],
    )


def _get_review_or_404(db: Session, review_id: int) -> ProductReview:
    review = db.query(ProductReview).filter(ProductReview.review_id == review_id).first()
    if not review:
        raise AppHTTPException(status_code=404, error="review_not_found", message="Review not found.", details={"reason": "request_failed"})
    return review


def _get_reply_or_404(db: Session, review_id: int, reply_id: int) -> ReviewReply:
    reply = db.query(ReviewReply).filter(
        ReviewReply.review_id == review_id,
        ReviewReply.reply_id == reply_id,
    ).first()
    if not reply:
        raise AppHTTPException(status_code=404, error="review_not_found", message="Review not found.", details={"reason": "request_failed"})
    return reply


def _get_active_product(db: Session, product_id: int) -> Product:
    product = db.query(Product).filter(
        Product.product_id == product_id,
        ((Product.status == EntityStatus.ACTIVE) | (Product.status.is_(None))),
        Product.deleted_at.is_(None),
    ).first()
    if not product:
        raise AppHTTPException(status_code=404, error="product_not_found", message="Product not found.", details={"reason": "request_failed"})
    return product


def _get_review_for_owner(db: Session, review_id: int, current_user: Customer) -> ProductReview:
    review = db.query(ProductReview).filter(ProductReview.review_id == review_id).first()
    if not review:
        raise AppHTTPException(status_code=404, error="review_not_found", message="Review not found.", details={"reason": "request_failed"})
    if review.customer_id != current_user.customer_id:
        raise AppHTTPException(status_code=403, error="permission_denied", message="Permission denied.", details={"reason": "request_failed"})
    return review


def _purchased_order_item(db: Session, current_user: Customer, product_id: int, order_product_id: int) -> OrderProduct:
    item = (
        db.query(OrderProduct)
        .options(joinedload(OrderProduct.order), joinedload(OrderProduct.product))
        .join(Order)
        .filter(
            OrderProduct.order_product_id == order_product_id,
            OrderProduct.product_id == product_id,
            Order.customer_id == current_user.customer_id,
            Order.state != OrderState.CANCELLED,
        )
        .first()
    )
    if not item:
        raise AppHTTPException(status_code=403, error="permission_denied", message="Permission denied.", details={"reason": "request_failed"})
    return item


def _existing_product_review(db: Session, current_user: Customer, product_id: int) -> ProductReview | None:
    return db.query(ProductReview).filter(
        ProductReview.customer_id == current_user.customer_id,
        ProductReview.product_id == product_id,
    ).first()


@router.get("/products/{product_id}/reviews", response_model=list[ProductReviewResponse])
def list_product_reviews(
    product_id: str,
    db: Session = Depends(get_db),
    current_user: Customer | None = Depends(get_current_user_optional),
):
    parsed_product_id = parse_product_id(product_id)
    _get_active_product(db, parsed_product_id)
    reviews = (
        db.query(ProductReview)
        .options(joinedload(ProductReview.customer))
        .filter(ProductReview.product_id == parsed_product_id, ProductReview.status == ReviewStatus.APPROVED)
        .order_by(ProductReview.created_at.desc())
        .all()
    )
    return [_review_response(review, current_user) for review in reviews]


@router.get("/products/{product_id}/reviews/stats", response_model=ProductReviewStatsResponse)
def get_product_review_stats(product_id: str, db: Session = Depends(get_db)):
    parsed_product_id = parse_product_id(product_id)
    _get_active_product(db, parsed_product_id)
    average_rating, total_reviews = (
        db.query(func.avg(ProductReview.rating), func.count(ProductReview.review_id))
        .filter(ProductReview.product_id == parsed_product_id, ProductReview.status == ReviewStatus.APPROVED)
        .one()
    )
    return ProductReviewStatsResponse(
        product_id=parsed_product_id,
        product_display_id=format_product_id(parsed_product_id),
        average_rating=round(float(average_rating), 2) if average_rating is not None else None,
        total_reviews=int(total_reviews or 0),
    )


@router.get("/products/{product_id}/reviews/eligibility", response_model=ProductReviewEligibilityResponse)
def get_product_review_eligibility(
    product_id: str,
    db: Session = Depends(get_db),
    current_user: Customer | None = Depends(get_current_user_optional),
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
    order_items = (
        db.query(OrderProduct)
        .options(
            joinedload(OrderProduct.order),
            joinedload(OrderProduct.product),
            joinedload(OrderProduct.review).joinedload(ProductReview.customer),
        )
        .join(Order)
        .filter(
            OrderProduct.product_id == parsed_product_id,
            Order.customer_id == current_user.customer_id,
            Order.state != OrderState.CANCELLED,
        )
        .order_by(Order.ordered_at.desc(), OrderProduct.order_product_id.desc())
        .all()
    )

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
    message = "Escolha um item comprado para avaliar." if eligible else "Já avaliou este product. Edite a sua avaliação existente."
    if not items:
        message = "Compre este product antes de deixar uma avaliação."

    return ProductReviewEligibilityResponse(
        eligible=eligible,
        authenticated=True,
        items=items,
        existing_review=_review_response(existing_product_review, current_user) if existing_product_review else None,
        message=message,
    )


@router.post("/products/{product_id}/reviews", response_model=ProductReviewResponse, status_code=status.HTTP_201_CREATED)
def create_product_review(
    product_id: str,
    body: ProductReviewCreate,
    db: Session = Depends(get_db),
    current_user: Customer = Depends(get_current_user),
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

    existing = db.query(ProductReview).filter(
        ProductReview.order_product_id == body.order_product_id
    ).first()
    if existing:
        raise AppHTTPException(
            status_code=status.HTTP_409_CONFLICT,
            error="order_item_already_reviewed",
            message="This order item has already been reviewed.",
            details={"order_product_id": body.order_product_id, "review_id": existing.review_id},
        )

    review = ProductReview(
        product_id=parsed_product_id,
        customer_id=current_user.customer_id,
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


@router.put("/reviews/{review_id}", response_model=ProductReviewResponse)
def update_product_review(
    review_id: int,
    body: ProductReviewUpdate,
    db: Session = Depends(get_db),
    current_user: Customer = Depends(get_current_user),
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


@router.delete("/reviews/{review_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product_review(
    review_id: int,
    db: Session = Depends(get_db),
    current_user: Customer = Depends(get_current_user),
):
    review = _get_review_for_owner(db, review_id, current_user)
    db.delete(review)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/admin/reviews/{review_id}/reply", response_model=ReviewReplyResponse, status_code=status.HTTP_201_CREATED)
def create_review_reply(
    review_id: int,
    body: ReviewReplyCreate,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(require_role(SUPER_ADMIN_ROLE)),
):
    _get_review_or_404(db, review_id)
    reply = ReviewReply(review_id=review_id, admin_id=current_admin.admin_id, text=body.text.strip())
    db.add(reply)
    db.commit()
    db.refresh(reply)
    return reply


@router.put("/admin/reviews/{review_id}/reply/{reply_id}", response_model=ReviewReplyResponse)
def update_review_reply(
    review_id: int,
    reply_id: int,
    body: ReviewReplyCreate,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(require_role(SUPER_ADMIN_ROLE)),
):
    reply = _get_reply_or_404(db, review_id, reply_id)
    reply.text = body.text.strip()
    reply.admin_id = current_admin.admin_id
    reply.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(reply)
    return reply


@router.delete("/admin/reviews/{review_id}/reply/{reply_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_review_reply(
    review_id: int,
    reply_id: int,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(require_role(SUPER_ADMIN_ROLE)),
):
    _ = current_admin
    reply = _get_reply_or_404(db, review_id, reply_id)
    db.delete(reply)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/admin/reviews/{review_id}/reaction", response_model=ReviewReactionResponse)
def upsert_review_reaction(
    review_id: int,
    body: ReviewReactionCreate,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(require_role(SUPER_ADMIN_ROLE)),
):
    _get_review_or_404(db, review_id)
    reaction = db.query(ReviewReaction).filter(
        ReviewReaction.review_id == review_id,
        ReviewReaction.admin_id == current_admin.admin_id,
    ).first()
    if reaction:
        reaction.type = body.type
    else:
        reaction = ReviewReaction(review_id=review_id, admin_id=current_admin.admin_id, type=body.type)
        db.add(reaction)
    db.commit()
    db.refresh(reaction)
    return reaction


@router.delete("/admin/reviews/{review_id}/reaction", status_code=status.HTTP_204_NO_CONTENT)
def delete_review_reaction(
    review_id: int,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(require_role(SUPER_ADMIN_ROLE)),
):
    reaction = db.query(ReviewReaction).filter(
        ReviewReaction.review_id == review_id,
        ReviewReaction.admin_id == current_admin.admin_id,
    ).first()
    if reaction:
        db.delete(reaction)
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
