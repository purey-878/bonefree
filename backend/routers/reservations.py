from datetime import date, timedelta
from typing import Annotated
from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session
from database import get_db
from dependencies import require_role
from services.auth_service import STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE
from core.rate_limit import enforce_rate_limit, get_client_ip, RATE_LIMIT_OPENAPI_RESPONSES
from reservation_models import Reservation, ReservationException, ReservationPromotion
from schemas.reservations import (AdminBooking, Availability, BookingCreated, BookingInput, BookingPage, BookingSettings, DateException, DeleteResult, Locale, PassResponse, PrivateAccess, PromotionAdmin, PromotionInput, PublicSettings, SettingsResult, StatusUpdate)
from services import reservations as service
from services.reservation_pdf import render_reservation_pdf
from schemas.pagination import total_pages


async def public_limit(request: Request):
    path = request.url.path.rstrip('/')
    bucket = 'reservation-public'
    if request.method == 'POST':
        if path == '/reservations':
            bucket = 'reservation-create'
        elif path == '/reservations/confirmation/cancel':
            bucket = 'reservation-cancel'
    write = bucket != 'reservation-public'
    await enforce_rate_limit(request, bucket=bucket, identity=get_client_ip(request), max_requests=10 if write else 90, window_seconds=300 if write else 60)

router = APIRouter(prefix='/reservations', tags=['Reservations'], dependencies=[Depends(public_limit)], responses=RATE_LIMIT_OPENAPI_RESPONSES)
admin_router = APIRouter(prefix='/admin/reservations', tags=['Admin Reservations'])


@router.get('/settings', response_model=PublicSettings, operation_id='reservations_public_settings')
def public_settings(db: Session = Depends(get_db)):
    _, config = service.configuration(db)
    today = service.now_local().date()
    return PublicSettings(enabled=config.enabled, today=today, last_date=today + timedelta(days=config.horizon_days), min_guests=config.min_guests, max_guests=config.max_guests)


@router.get('/availability', response_model=Availability, operation_id='reservations_availability')
def available_slots(day: date, guests: int = Query(ge=1, le=100), locale: Locale = 'pt-PT', db: Session = Depends(get_db)):
    return service.availability(db, day, guests, locale)


@router.get('/dates', response_model=list[date], operation_id='reservations_available_dates')
def available_dates(start: date, guests: int = Query(ge=1, le=100), days: int = Query(default=31, ge=1, le=31), db: Session = Depends(get_db)):
    return service.available_dates(db, start, days, guests)


@router.post('', response_model=BookingCreated, status_code=201, operation_id='reservations_create')
def create(data: BookingInput, locale: Locale = 'pt-PT', db: Session = Depends(get_db)):
    try:
        row, token = service.create_booking(db, data)
        result = {**service.pass_data(row, locale), 'confirmation_token': token}
        db.commit()
        return result
    except Exception:
        db.rollback()
        raise


@router.post('/confirmation', response_model=PassResponse, operation_id='reservations_confirmation')
def confirmation(data: PrivateAccess, db: Session = Depends(get_db)):
    return service.pass_data(service.find_private(db, data.token), data.locale)


@router.post('/confirmation/cancel', response_model=PassResponse, operation_id='reservations_cancel')
def cancel(data: PrivateAccess, db: Session = Depends(get_db)):
    try:
        row = service.cancel_booking(db, data.token)
        result = service.pass_data(row, data.locale)
        db.commit()
        return result
    except Exception:
        db.rollback()
        raise


@router.post('/confirmation/pdf', response_class=Response, response_model=None, operation_id='reservations_confirmation_pdf', responses={200: {'description': 'Private reservation pass PDF', 'content': {'application/pdf': {'schema': {'type': 'string', 'format': 'binary'}}}}})
def pdf(data: PrivateAccess, db: Session = Depends(get_db)):
    row = service.find_private(db, data.token)
    return Response(render_reservation_pdf(service.pass_data(row, data.locale), data.locale), media_type='application/pdf', headers={'Content-Disposition': f'attachment; filename="bonefree-{row.reference}.pdf"'})


@admin_router.get('/settings', response_model=SettingsResult, operation_id='reservations_admin_settings')
def admin_settings(db: Session = Depends(get_db), admin=Depends(require_role(STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE))):
    _, config = service.configuration(db)
    return SettingsResult(settings=config, conflicting_bookings=service.config_conflicts(db, config))


@admin_router.put('/settings', response_model=SettingsResult, operation_id='reservations_update_settings')
def update_settings(data: BookingSettings, db: Session = Depends(get_db), admin=Depends(require_role(SUPER_ADMIN_ROLE))):
    row, _ = service.configuration(db, lock=True)
    row.config = data.model_dump(mode='json')
    result = SettingsResult(settings=data, conflicting_bookings=service.config_conflicts(db, data))
    db.commit()
    return result


@admin_router.get('/exceptions', response_model=list[DateException], operation_id='reservations_list_exceptions')
def exceptions(db: Session = Depends(get_db), admin=Depends(require_role(STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE))):
    return [DateException(day=row.day, closed=row.closed, windows=row.windows) for row in db.scalars(select(ReservationException).order_by(ReservationException.day)).all()]


@admin_router.put('/exceptions', response_model=SettingsResult, operation_id='reservations_save_exception')
def save_exception(data: DateException, db: Session = Depends(get_db), admin=Depends(require_role(SUPER_ADMIN_ROLE))):
    _, config = service.configuration(db, lock=True)
    row = db.scalar(select(ReservationException).where(ReservationException.day == data.day))
    if row is None:
        row = ReservationException(day=data.day)
        db.add(row)
    row.closed, row.windows = data.closed, [w.model_dump() for w in data.windows]
    db.flush()
    result = SettingsResult(settings=config, conflicting_bookings=service.config_conflicts(db, config))
    db.commit()
    return result


@admin_router.delete('/exceptions/{day}', response_model=SettingsResult, operation_id='reservations_delete_exception')
def delete_exception(day: date, db: Session = Depends(get_db), admin=Depends(require_role(SUPER_ADMIN_ROLE))):
    _, config = service.configuration(db, lock=True)
    db.execute(delete(ReservationException).where(ReservationException.day == day))
    result = SettingsResult(settings=config, conflicting_bookings=service.config_conflicts(db, config))
    db.commit()
    return result


@admin_router.get('/promotions', response_model=list[PromotionAdmin], operation_id='reservations_list_promotions')
def promotions(db: Session = Depends(get_db), admin=Depends(require_role(STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE))):
    return [service.promotion_data(row) for row in db.scalars(select(ReservationPromotion).order_by(ReservationPromotion.id.desc())).all()]


def write_promotion(db, data, row):
    row.enabled, row.automatic = data.enabled, data.automatic
    row.start_date, row.end_date, row.percentage = data.start_date, data.end_date, data.percentage
    row.content = data.model_dump(mode='json', exclude={'enabled', 'automatic', 'start_date', 'end_date', 'percentage'})
    db.add(row)
    db.flush()
    result = service.promotion_data(row)
    db.commit()
    return result


@admin_router.post('/promotions', response_model=PromotionAdmin, status_code=201, operation_id='reservations_create_promotion')
def create_promotion(data: PromotionInput, db: Session = Depends(get_db), admin=Depends(require_role(SUPER_ADMIN_ROLE))):
    service.configuration(db, lock=True)
    return write_promotion(db, data, ReservationPromotion())


@admin_router.put('/promotions/{promotion_id}', response_model=PromotionAdmin, operation_id='reservations_update_promotion')
def update_promotion(promotion_id: int, data: PromotionInput, db: Session = Depends(get_db), admin=Depends(require_role(SUPER_ADMIN_ROLE))):
    service.configuration(db, lock=True)
    row = db.scalar(select(ReservationPromotion).where(ReservationPromotion.id == promotion_id))
    if row is None:
        service.fail('reservation_promotion_not_found', 404)
    return write_promotion(db, data, row)


@admin_router.delete('/retention', response_model=DeleteResult, operation_id='reservations_purge_expired')
def purge(db: Session = Depends(get_db), admin=Depends(require_role(SUPER_ADMIN_ROLE))):
    _, config = service.configuration(db, lock=True)
    result = db.execute(delete(Reservation).where(Reservation.day < service.now_local().date() - timedelta(days=config.retention_days)))
    db.commit()
    return DeleteResult(deleted=result.rowcount)


@admin_router.get('', response_model=BookingPage, operation_id='reservations_admin_list')
def list_bookings(page: int = Query(default=1, ge=1), per_page: int = Query(default=20, ge=1, le=100), search: str = Query(default='', max_length=120), day: date | None = None, status: Annotated[str | None, Query(pattern='^(confirmed|cancelled|completed|no_show)$')] = None, upcoming: bool = False, promotion_id: int | None = None, db: Session = Depends(get_db), admin=Depends(require_role(STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE))):
    conditions = []
    if search.strip():
        pattern = '%' + search.strip().replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_') + '%'
        conditions.append(or_(Reservation.name.ilike(pattern, escape='\\'), Reservation.reference.ilike(pattern, escape='\\')))
    if day:
        conditions.append(Reservation.day == day)
    if status:
        conditions.append(Reservation.status == status)
    if upcoming:
        conditions.append(Reservation.day >= service.now_local().date())
    if promotion_id:
        conditions.append(Reservation.promotion_id == promotion_id)
    total = db.scalar(select(func.count(Reservation.id)).where(*conditions)) or 0
    items = db.scalars(select(Reservation).where(*conditions).order_by(Reservation.day, Reservation.slot, Reservation.id).offset((page - 1) * per_page).limit(per_page)).all()
    return BookingPage(items=[service.admin_data(row) for row in items], total=total, total_pages=total_pages(total, per_page), page=page, per_page=per_page)


@admin_router.get('/{reservation_id}', response_model=AdminBooking, operation_id='reservations_admin_detail')
def booking_detail(reservation_id: int, db: Session = Depends(get_db), admin=Depends(require_role(STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE))):
    row = db.scalar(select(Reservation).where(Reservation.id == reservation_id))
    if not row:
        service.fail('reservation_not_found', 404)
    return service.admin_data(row)


@admin_router.patch('/{reservation_id}', response_model=AdminBooking, operation_id='reservations_update_status')
def update_status(reservation_id: int, data: StatusUpdate, db: Session = Depends(get_db), admin=Depends(require_role(STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE))):
    _, config = service.configuration(db, lock=True)
    row = db.scalar(select(Reservation).where(Reservation.id == reservation_id))
    if not row:
        service.fail('reservation_not_found', 404)
    if data.status == 'confirmed' and row.status != 'confirmed':
        service.validate_allocation(db, config, row.day, row.slot, row.guests, exclude_id=row.id)
    row.status = data.status
    result = service.admin_data(row)
    db.commit()
    return result
