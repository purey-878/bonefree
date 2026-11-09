"""All mutations serialize on the migration-created settings row until commit.

This deliberately coarse PostgreSQL row lock protects capacity, idempotency,
status changes and configuration consistently, without table allocation or workers.
"""
from datetime import date, datetime, time, timedelta, timezone
import hashlib
import hmac
import json
import secrets
from zoneinfo import ZoneInfo
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from reservation_models import Reservation, ReservationException, ReservationPromotion, ReservationSettings
from schemas.reservations import Award, BookingInput, BookingSettings, PassResponse, PromotionInput
from core.errors import AppHTTPException
from services.site_settings import get_company_details_settings

LISBON = ZoneInfo('Europe/Lisbon')


def now_local():
    return datetime.now(timezone.utc).astimezone(LISBON)


def fail(code, status=409):
    raise AppHTTPException(status_code=status, error=code, message={
        'reservations_paused': 'Reservations are currently paused.',
        'reservation_unavailable': 'This time is no longer available. Please choose another time.',
        'reservation_guests': 'Guest count is outside the configured limits.',
        'reservation_not_found': 'Confirmation not found. Please use your saved private link.',
        'reservation_cancellation_unavailable': 'This reservation can no longer be cancelled online. Please contact the restaurant.',
        'reservation_retry_conflict': 'This retry key belongs to a different booking. Start a new booking.',
    }.get(code, 'Reservation request could not be completed.'))


def configuration(db: Session, lock=False):
    statement = select(ReservationSettings).where(ReservationSettings.id == 1)
    row = db.scalar(statement.with_for_update() if lock else statement)
    if row is None:
        if lock:
            fail('reservations_paused', 503)
        return None, BookingSettings()
    return row, BookingSettings.model_validate(row.config)


def opening_windows(db, config, day):
    exception = db.scalar(select(ReservationException).where(ReservationException.day == day))
    if exception:
        return [] if exception.closed else exception.windows
    return [w.model_dump() for w in config.weekly.get(day.weekday(), [])]


def wall_datetime(day, slot):
    naive = datetime.combine(day, slot)
    aware = naive.replace(tzinfo=LISBON)
    # Do not sell nonexistent or ambiguous wall-clock times at DST transitions.
    if aware.astimezone(timezone.utc).astimezone(LISBON).replace(tzinfo=None) != naive:
        return None
    if aware.utcoffset() != naive.replace(tzinfo=LISBON, fold=1).utcoffset():
        return None
    return aware


def candidate_slots(db, config, day, now=None, windows=None):
    now = now or now_local()
    if not config.enabled or day < now.date() or day > now.date() + timedelta(days=config.horizon_days):
        return []
    slots = []
    for window in (opening_windows(db, config, day) if windows is None else windows):
        current = datetime.combine(day, time.fromisoformat(window['start']))
        end = datetime.combine(day, time.fromisoformat(window['end']))
        while current < end:
            aware = wall_datetime(day, current.time())
            if aware and aware.astimezone(timezone.utc) >= now.astimezone(timezone.utc) + timedelta(minutes=config.minimum_notice_minutes):
                slots.append(current.strftime('%H:%M'))
            current += timedelta(minutes=config.interval_minutes)
    return slots


def promotion_rows(db, day):
    return db.scalars(select(ReservationPromotion).where(ReservationPromotion.enabled.is_(True), ReservationPromotion.automatic.is_(True), ReservationPromotion.start_date <= day, ReservationPromotion.end_date >= day).order_by(ReservationPromotion.percentage.desc(), ReservationPromotion.id)).all()


def promotion_snapshot(promotions, day, slot):
    for row in promotions:
        content = row.content
        if day.weekday() not in content['weekdays']:
            continue
        windows = content['windows']
        if windows and not any(w['start'] <= slot < w['end'] for w in windows):
            continue
        return {**content, 'id': row.id, 'percentage': str(row.percentage)}
    return None


def localized_award(snapshot, locale):
    if not snapshot:
        return None
    text = snapshot.get('translations', {}).get(locale, snapshot)
    return Award(id=snapshot['id'], percentage=snapshot['percentage'], **{key: text[key] for key in ['title', 'description', 'scope', 'conditions']})


def availability(db, day, guests, locale='pt-PT'):
    _, config = configuration(db)
    if not config.min_guests <= guests <= config.max_guests:
        fail('reservation_guests', 422)
    times = candidate_slots(db, config, day)
    if not times:
        return {'day': day, 'slots': []}
    counts = {slot.strftime('%H:%M'): (count, total) for slot, count, total in db.execute(select(Reservation.slot, func.count(Reservation.id), func.sum(Reservation.guests)).where(Reservation.day == day, Reservation.status == 'confirmed').group_by(Reservation.slot)).all()}
    promos = promotion_rows(db, day)
    return {'day': day, 'slots': [{'time': slot, 'available': counts.get(slot, (0, 0))[0] < config.max_reservations_per_slot and counts.get(slot, (0, 0))[1] + guests <= config.max_guests_per_slot, 'promotion': localized_award(promotion_snapshot(promos, day, slot), locale)} for slot in times]}


def validate_allocation(db, config, day, slot, guests, exclude_id=None):
    if not config.enabled:
        fail('reservations_paused')
    if not config.min_guests <= guests <= config.max_guests:
        fail('reservation_guests', 422)
    if slot.strftime('%H:%M') not in candidate_slots(db, config, day):
        fail('reservation_unavailable')
    statement = select(func.count(Reservation.id), func.coalesce(func.sum(Reservation.guests), 0)).where(Reservation.day == day, Reservation.slot == slot, Reservation.status == 'confirmed')
    if exclude_id:
        statement = statement.where(Reservation.id != exclude_id)
    count, total = db.execute(statement).one()
    if count >= config.max_reservations_per_slot or total + guests > config.max_guests_per_slot:
        fail('reservation_unavailable')


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def private_token(row, key):
    # Per-record random salt is secret material. Reconstructing a retry requires
    # the original 256-bit client key, which is itself stored only as a hash.
    return hmac.new(bytes.fromhex(row.token_salt), key.encode(), hashlib.sha256).hexdigest()


def create_booking(db, data: BookingInput):
    _, config = configuration(db, lock=True)
    key_hash = digest(data.idempotency_key)
    payload_hash = digest(json.dumps(data.model_dump(mode='json', exclude={'idempotency_key'}), sort_keys=True))
    existing = db.scalar(select(Reservation).where(Reservation.idempotency_hash == key_hash))
    if existing:
        if not hmac.compare_digest(existing.payload_hash, payload_hash):
            fail('reservation_retry_conflict')
        return existing, private_token(existing, data.idempotency_key)
    slot = time.fromisoformat(data.time)
    validate_allocation(db, config, data.day, slot, data.guests)
    snapshot = promotion_snapshot(promotion_rows(db, data.day), data.day, data.time)
    venue = get_company_details_settings(db)
    row = Reservation(reference=f'BF-{secrets.token_hex(6).upper()}', name=data.name, day=data.day, slot=slot, guests=data.guests,
        email=str(data.email) if data.email else None, phone=data.phone, special_requests=data.special_requests,
        status='confirmed', idempotency_hash=key_hash, payload_hash=payload_hash, token_salt=secrets.token_hex(32), token_hash='',
        promotion_id=snapshot['id'] if snapshot else None, promotion_snapshot=snapshot, venue={'name': venue.brand_name, 'address': venue.address})
    token = private_token(row, data.idempotency_key)
    row.token_hash = digest(token)
    db.add(row)
    db.flush()
    return row, token


def find_private(db, token):
    row = db.scalar(select(Reservation).where(Reservation.token_hash == digest(token)))
    if not row:
        fail('reservation_not_found', 404)
    return row


def can_cancel(row, now=None):
    if row.status != 'confirmed':
        return False
    start = wall_datetime(row.day, row.slot)
    return start is not None and start.astimezone(timezone.utc) > (now or now_local()).astimezone(timezone.utc)


def cancel_booking(db, token):
    # Share the allocation lock with creation and administrator status changes.
    # Pausing new reservations must not prevent cancelling an existing one.
    configuration(db, lock=True)
    row = find_private(db, token)
    if row.status == 'cancelled':
        return row
    if not can_cancel(row):
        fail('reservation_cancellation_unavailable')
    row.status = 'cancelled'
    db.flush()
    return row


def pass_data(row, locale='pt-PT'):
    return PassResponse(reference=row.reference, name=row.name, day=row.day, time=row.slot.strftime('%H:%M'), guests=row.guests, status=row.status,
        restaurant_name=row.venue['name'], restaurant_address=row.venue['address'], promotion=localized_award(row.promotion_snapshot, locale), contact_provided=bool(row.email or row.phone), can_cancel=can_cancel(row)).model_dump()


def admin_data(row):
    return {**pass_data(row), 'id': row.id, 'email': row.email, 'phone': row.phone, 'special_requests': row.special_requests, 'created_at': row.created_at}


def promotion_data(row):
    return PromotionInput.model_validate({**row.content, 'enabled': row.enabled, 'automatic': row.automatic, 'percentage': row.percentage, 'start_date': row.start_date, 'end_date': row.end_date}).model_dump() | {'id': row.id}


def config_conflicts(db, config):
    # Batch aggregates, rather than one query per booking, also cover capacity reductions.
    rows = db.execute(select(Reservation.day, Reservation.slot, func.count(Reservation.id), func.sum(Reservation.guests), func.min(Reservation.guests), func.max(Reservation.guests)).where(Reservation.day >= now_local().date(), Reservation.status == 'confirmed').group_by(Reservation.day, Reservation.slot)).all()
    exceptions = {row.day: row for row in db.scalars(select(ReservationException).where(ReservationException.day >= now_local().date())).all()}
    conflicts = 0
    for day, slot, count, total, smallest, largest in rows:
        exception = exceptions.get(day)
        windows = ([] if exception.closed else exception.windows) if exception else [w.model_dump() for w in config.weekly.get(day.weekday(), [])]
        allowed = any(time.fromisoformat(w['start']) <= slot < time.fromisoformat(w['end']) and (datetime.combine(day, slot) - datetime.combine(day, time.fromisoformat(w['start']))).seconds % (config.interval_minutes * 60) == 0 for w in windows)
        if not config.enabled or not allowed or count > config.max_reservations_per_slot or total > config.max_guests_per_slot or smallest < config.min_guests or largest > config.max_guests:
            conflicts += count
    return conflicts


def available_dates(db, start, days, guests):
    _, config = configuration(db)
    if not config.min_guests <= guests <= config.max_guests:
        fail('reservation_guests', 422)
    end = start + timedelta(days=days - 1)
    exceptions = {r.day: r for r in db.scalars(select(ReservationException).where(ReservationException.day.between(start, end))).all()}
    counts = {(day, slot.strftime('%H:%M')): (count, total) for day, slot, count, total in db.execute(select(Reservation.day, Reservation.slot, func.count(Reservation.id), func.sum(Reservation.guests)).where(Reservation.day.between(start, end), Reservation.status == 'confirmed').group_by(Reservation.day, Reservation.slot)).all()}
    result = []
    now = now_local()
    for index in range(days):
        day = start + timedelta(days=index)
        exception = exceptions.get(day)
        windows = ([] if exception.closed else exception.windows) if exception else [w.model_dump() for w in config.weekly.get(day.weekday(), [])]
        slots = candidate_slots(db, config, day, now=now, windows=windows)
        if any(counts.get((day, slot), (0, 0))[0] < config.max_reservations_per_slot and counts.get((day, slot), (0, 0))[1] + guests <= config.max_guests_per_slot for slot in slots):
            result.append(day)
    return result
