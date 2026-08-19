"""Product review endpoints."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from auth import get_current_user, get_current_user_optional, require_super_admin
from database import get_db
from models import Admin, Cliente, Encomenda, EncomendaProduto, Produto, ProdutoReview, ReviewReaction, ReviewReply
from schemas.review import (
    ProdutoReviewCreate,
    ProdutoReviewEligibilityItem,
    ProdutoReviewEligibilityResponse,
    ProdutoReviewResponse,
    ProdutoReviewStatsResponse,
    ProdutoReviewUpdate,
    ReviewReactionCreate,
    ReviewReactionResponse,
    ReviewReplyCreate,
    ReviewReplyResponse,
)
from utils.id_format import format_product_id, parse_product_id

router = APIRouter(tags=["Reviews"])


def _review_response(review: ProdutoReview, current_user: Cliente | None = None) -> ProdutoReviewResponse:
    cliente_nome = None
    if review.customer:
        cliente_nome = f"{review.customer.name or ''} {review.customer.last_name or ''}".strip() or review.customer.email

    return ProdutoReviewResponse(
        review_id=review.review_id,
        product_id=review.product_id,
        id_produto_display=format_product_id(review.product_id),
        customer_id=review.customer_id,
        order_product_id=review.order_product_id,
        cliente_nome=cliente_nome,
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


def _get_review_or_404(db: Session, review_id: int) -> ProdutoReview:
    review = db.query(ProdutoReview).filter(ProdutoReview.review_id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="Avaliação não encontrada.")
    return review


def _get_reply_or_404(db: Session, review_id: int, reply_id: int) -> ReviewReply:
    reply = db.query(ReviewReply).filter(
        ReviewReply.review_id == review_id,
        ReviewReply.reply_id == reply_id,
    ).first()
    if not reply:
        raise HTTPException(status_code=404, detail="Resposta da avaliação não encontrada.")
    return reply


def _get_active_product(db: Session, produto_id: int) -> Produto:
    product = db.query(Produto).filter(
        Produto.product_id == produto_id,
        ((Produto.status == 1) | (Produto.status.is_(None))),
        Produto.deleted_at.is_(None),
    ).first()
    if not product:
        raise HTTPException(status_code=404, detail="Produto não encontrado.")
    return product


def _get_review_for_owner(db: Session, review_id: int, current_user: Cliente) -> ProdutoReview:
    review = db.query(ProdutoReview).filter(ProdutoReview.review_id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="Avaliação não encontrada.")
    if review.customer_id != current_user.customer_id:
        raise HTTPException(status_code=403, detail="Só pode alterar as suas próprias avaliações.")
    return review


def _purchased_order_item(db: Session, current_user: Cliente, produto_id: int, order_product_id: int) -> EncomendaProduto:
    item = (
        db.query(EncomendaProduto)
        .options(joinedload(EncomendaProduto.order), joinedload(EncomendaProduto.product))
        .join(Encomenda)
        .filter(
            EncomendaProduto.order_product_id == order_product_id,
            EncomendaProduto.product_id == produto_id,
            Encomenda.customer_id == current_user.customer_id,
            Encomenda.state != "cancelada",
        )
        .first()
    )
    if not item:
        raise HTTPException(status_code=403, detail="So pode avaliar products que comprou.")
    return item


def _existing_product_review(db: Session, current_user: Cliente, produto_id: int) -> ProdutoReview | None:
    return db.query(ProdutoReview).filter(
        ProdutoReview.customer_id == current_user.customer_id,
        ProdutoReview.product_id == produto_id,
    ).first()


@router.get("/products/{produto_id}/reviews", response_model=list[ProdutoReviewResponse])
def list_product_reviews(
    produto_id: str,
    db: Session = Depends(get_db),
    current_user: Cliente | None = Depends(get_current_user_optional),
):
    parsed_produto_id = parse_product_id(produto_id)
    _get_active_product(db, parsed_produto_id)
    reviews = (
        db.query(ProdutoReview)
        .options(joinedload(ProdutoReview.customer))
        .filter(ProdutoReview.product_id == parsed_produto_id, ProdutoReview.status == "aprovado")
        .order_by(ProdutoReview.created_at.desc())
        .all()
    )
    return [_review_response(review, current_user) for review in reviews]


@router.get("/products/{produto_id}/reviews/stats", response_model=ProdutoReviewStatsResponse)
def get_product_review_stats(produto_id: str, db: Session = Depends(get_db)):
    parsed_produto_id = parse_product_id(produto_id)
    _get_active_product(db, parsed_produto_id)
    rating_medio, total_reviews = (
        db.query(func.avg(ProdutoReview.rating), func.count(ProdutoReview.review_id))
        .filter(ProdutoReview.product_id == parsed_produto_id, ProdutoReview.status == "aprovado")
        .one()
    )
    return ProdutoReviewStatsResponse(
        product_id=parsed_produto_id,
        id_produto_display=format_product_id(parsed_produto_id),
        rating_medio=round(float(rating_medio), 2) if rating_medio is not None else None,
        total_reviews=int(total_reviews or 0),
    )


@router.get("/products/{produto_id}/reviews/eligibility", response_model=ProdutoReviewEligibilityResponse)
def get_product_review_eligibility(
    produto_id: str,
    db: Session = Depends(get_db),
    current_user: Cliente | None = Depends(get_current_user_optional),
):
    parsed_produto_id = parse_product_id(produto_id)
    _get_active_product(db, parsed_produto_id)
    if not current_user:
        return ProdutoReviewEligibilityResponse(
            eligible=False,
            authenticated=False,
            message="Log in to review products you have purchased.",
        )

    existing_product_review = _existing_product_review(db, current_user, parsed_produto_id)
    order_items = (
        db.query(EncomendaProduto)
        .options(
            joinedload(EncomendaProduto.order),
            joinedload(EncomendaProduto.product),
            joinedload(EncomendaProduto.review).joinedload(ProdutoReview.customer),
        )
        .join(Encomenda)
        .filter(
            EncomendaProduto.product_id == parsed_produto_id,
            Encomenda.customer_id == current_user.customer_id,
            Encomenda.state != "cancelada",
        )
        .order_by(Encomenda.ordered_at.desc(), EncomendaProduto.order_product_id.desc())
        .all()
    )

    items = [
        ProdutoReviewEligibilityItem(
            order_product_id=item.order_product_id,
            order_id=item.order_id,
            product_id=item.product_id,
            id_produto_display=format_product_id(item.product_id),
            nome_produto=item.product_name_snapshot or (item.product.name if item.product else format_product_id(item.product_id)),
            ordered_at=item.order.ordered_at,
            existing_review=_review_response(existing_product_review or item.review, current_user) if (existing_product_review or item.review) else None,
        )
        for item in order_items
    ]
    eligible = bool(items and existing_product_review is None)
    message = "Escolha um item comprado para avaliar." if eligible else "Já avaliou este product. Edite a sua avaliação existente."
    if not items:
        message = "Compre este product antes de deixar uma avaliação."

    return ProdutoReviewEligibilityResponse(
        eligible=eligible,
        authenticated=True,
        items=items,
        existing_review=_review_response(existing_product_review, current_user) if existing_product_review else None,
        message=message,
    )


@router.post("/products/{produto_id}/reviews", response_model=ProdutoReviewResponse, status_code=status.HTTP_201_CREATED)
def create_product_review(
    produto_id: str,
    body: ProdutoReviewCreate,
    db: Session = Depends(get_db),
    current_user: Cliente = Depends(get_current_user),
):
    parsed_produto_id = parse_product_id(produto_id)
    _get_active_product(db, parsed_produto_id)
    _purchased_order_item(db, current_user, parsed_produto_id, body.order_product_id)

    existing_product_review = _existing_product_review(db, current_user, parsed_produto_id)
    if existing_product_review:
        raise HTTPException(
            status_code=409,
            detail="Já avaliou este product. Edite a sua avaliação existente.",
        )

    existing = db.query(ProdutoReview).filter(
        ProdutoReview.order_product_id == body.order_product_id
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Este item comprado já foi avaliado.")

    review = ProdutoReview(
        product_id=parsed_produto_id,
        customer_id=current_user.customer_id,
        order_product_id=body.order_product_id,
        rating=body.rating,
        title=body.title,
        comment=body.comment,
        status="aprovado",
    )
    db.add(review)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Já avaliou este product. Edite a sua avaliação existente.")

    db.refresh(review)
    return _review_response(review, current_user)


@router.put("/reviews/{review_id}", response_model=ProdutoReviewResponse)
def update_product_review(
    review_id: int,
    body: ProdutoReviewUpdate,
    db: Session = Depends(get_db),
    current_user: Cliente = Depends(get_current_user),
):
    if not body.model_fields_set:
        raise HTTPException(status_code=400, detail="Envie pelo menos um campo da avaliação para atualizar.")

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
    current_user: Cliente = Depends(get_current_user),
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
    current_admin: Admin = Depends(require_super_admin),
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
    current_admin: Admin = Depends(require_super_admin),
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
    current_admin: Admin = Depends(require_super_admin),
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
    current_admin: Admin = Depends(require_super_admin),
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
    current_admin: Admin = Depends(require_super_admin),
):
    reaction = db.query(ReviewReaction).filter(
        ReviewReaction.review_id == review_id,
        ReviewReaction.admin_id == current_admin.admin_id,
    ).first()
    if reaction:
        db.delete(reaction)
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
