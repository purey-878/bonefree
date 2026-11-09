from datetime import date, datetime, time, timedelta
import secrets
import unittest
from unittest.mock import patch
from sqlalchemy import delete, func, select
from tests import test_endpoint_smoke as smoke
from core.config import settings
from core.redis import InMemoryRedis
from reservation_models import Reservation, ReservationException, ReservationPromotion, ReservationSettings
from schemas.reservations import BookingSettings
from services.reservations import now_local, wall_datetime


class ReservationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixture = smoke.EndpointSmokeTests
        cls.fixture.setUpClass()
        cls.client = cls.fixture.client
        cls.owner = {'Authorization': 'Bearer admin-smoke-token'}
        cls.manager = {'Authorization': 'Bearer manager-smoke-token'}

    @classmethod
    def tearDownClass(cls):
        cls.fixture.tearDownClass()

    def setUp(self):
        self.day = (now_local().date() + timedelta(days=2)).isoformat()
        self.config = BookingSettings(enabled=True, weekly={day: [{'start':'18:00','end':'20:00'}] for day in range(7)}, minimum_notice_minutes=0, max_reservations_per_slot=2, max_guests_per_slot=8)
        self.rate = patch.object(settings, 'rate_limit_enabled', False)
        self.rate.start()
        with self.fixture.Session() as db:
            for model in [Reservation, ReservationPromotion, ReservationException, ReservationSettings]:
                db.execute(delete(model))
            db.add(ReservationSettings(id=1, config=self.config.model_dump(mode='json')))
            db.commit()

    def tearDown(self):
        self.rate.stop()

    def book(self, **changes):
        return self.client.post('/reservations', json={'name':'João Müller','day':self.day,'time':'18:00','guests':2,'idempotency_key':secrets.token_hex(32),**changes})

    def promo(self, **changes):
        r = self.client.post('/admin/reservations/promotions', headers=self.owner, json={'title':'Oferta à carta','scope':'Menu à la carte','conditions':'Apenas na data da reserva','percentage':'30.00','enabled':True,'automatic':True,'start_date':self.day,'end_date':self.day,'translations':{'de-DE':{'title':'Menüangebot','scope':'À-la-carte-Menü','conditions':'Nur am Reservierungstag'}},**changes})
        self.assertEqual(r.status_code, 201, r.text)
        return r.json()

    def lookup(self, token, locale='pt-PT'):
        return self.client.post('/reservations/confirmation', json={'token':token,'locale':locale})

    def test_optional_contacts_secure_pass_pdf_and_idempotency(self):
        key = secrets.token_hex(32)
        first = self.book(idempotency_key=key,email='',phone='')
        self.assertEqual(first.status_code,201,first.text)
        data=first.json()
        self.assertFalse(data['contact_provided'])
        self.assertEqual(self.book(idempotency_key=key,email='',phone='').json(),data)
        with self.fixture.Session() as db:
            self.assertEqual(db.scalar(select(func.count(Reservation.id))),1)
            row=db.scalar(select(Reservation))
            self.assertNotEqual(row.token_hash,data['confirmation_token'])
            self.assertNotEqual(row.idempotency_hash,key)
            self.assertIsNone(row.email);self.assertIsNone(row.phone)
        found=self.lookup(data['confirmation_token'])
        self.assertEqual(found.json()['reference'],data['reference'])
        self.assertNotIn('email',found.json())
        self.assertIn('no-store',found.headers['Cache-Control'])
        self.assertEqual(found.headers['Referrer-Policy'],'no-referrer')
        self.assertIn('noindex',found.headers['X-Robots-Tag'])
        for locale in ['pt-PT','en-GB','de-DE']:
            pdf=self.client.post('/reservations/confirmation/pdf',json={'token':data['confirmation_token'],'locale':locale})
            self.assertEqual(pdf.status_code,200)
            self.assertTrue(pdf.content.startswith(b'%PDF'),pdf.text[:100])
            self.assertIn(data['reference'],pdf.headers['Content-Disposition'])
        self.assertEqual(self.book(idempotency_key=key,guests=3).status_code,409)
        self.assertEqual(self.lookup('0'*64).status_code,404)
        self.assertEqual(self.client.get('/reservations/'+data['reference']).status_code,404)

    def cancel(self, token, **changes):
        return self.client.post('/reservations/confirmation/cancel', json={'token': token, 'locale': 'en-GB', **changes})

    def test_customer_cancellation_is_private_persistent_idempotent_and_releases_capacity(self):
        self.promo()
        first = self.book(guests=4).json()
        second = self.book(guests=4).json()
        token = first['confirmation_token']
        self.assertTrue(first['can_cancel'])
        def slot_available():
            slots = self.client.get('/reservations/availability', params={'day': self.day, 'guests': 2}).json()['slots']
            return next(slot['available'] for slot in slots if slot['time'] == '18:00')
        self.assertFalse(slot_available())
        self.assertEqual(self.lookup(token).json()['status'], 'confirmed')
        self.assertFalse(slot_available())
        result = self.cancel(token)
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(result.json()['status'], 'cancelled')
        self.assertFalse(result.json()['can_cancel'])
        self.assertEqual(result.json()['promotion']['percentage'], '30.00')
        self.assertNotIn('email', result.json())
        self.assertNotIn('confirmation_token', result.json())
        self.assertTrue(slot_available())
        self.assertEqual(self.lookup(token).json()['status'], 'cancelled')
        self.assertEqual(self.lookup(second['confirmation_token']).json()['status'], 'confirmed')
        self.assertEqual(self.cancel(token).json(), result.json())
        self.assertEqual(self.book().status_code, 201)
        for header, value in [('Cache-Control', 'no-store'), ('Referrer-Policy', 'no-referrer'), ('X-Robots-Tag', 'noindex')]:
            self.assertIn(value, result.headers[header])
        self.assertEqual(self.cancel(token).status_code, 200)
        self.assertEqual(self.client.get('/admin/reservations', headers=self.owner, params={'status': 'confirmed'}).json()['total'], 2)

    def test_customer_cancellation_requires_the_private_token_and_checks_booking_state(self):
        saved = self.book().json()
        token = saved['confirmation_token']
        self.assertEqual(self.cancel('0' * 64).status_code, 404)
        self.assertEqual(self.cancel(saved['reference']).status_code, 422)
        self.assertEqual(self.cancel(token, status='confirmed').status_code, 422)
        self.assertEqual(self.client.get('/reservations/confirmation/cancel').status_code, 405)
        with self.fixture.Session() as db:
            row = db.scalar(select(Reservation))
            for status in ['completed', 'no_show']:
                row.status = status
                db.commit()
                response = self.cancel(token)
                self.assertEqual(response.status_code, 409)
                self.assertEqual(response.json()['error'], 'reservation_cancellation_unavailable')
                self.assertFalse(self.lookup(token).json()['can_cancel'])
                self.assertEqual(self.lookup(token).json()['status'], status)
            row.status = 'confirmed'
            db.commit()
        start = wall_datetime(date.fromisoformat(self.day), time(18))
        for now, allowed in [(start - timedelta(seconds=1), True), (start, False), (start + timedelta(days=1), False)]:
            with patch('services.reservations.now_local', return_value=now):
                self.assertEqual(self.lookup(token).json()['can_cancel'], allowed)
                if not allowed:
                    self.assertEqual(self.cancel(token).status_code, 409)
                    self.assertEqual(self.lookup(token).json()['status'], 'confirmed')
        self.client.put('/admin/reservations/settings', headers=self.owner, json={})
        self.assertEqual(self.cancel(token).status_code, 200)
        with patch('services.reservations.now_local', return_value=start + timedelta(days=1)):
            self.assertEqual(self.cancel(token).status_code, 200)

    def test_customer_cancellation_rate_limit_and_rollback(self):
        saved = self.book().json()
        token = saved['confirmation_token']
        self.fixture.app.state.redis = InMemoryRedis()
        with patch.object(settings, 'rate_limit_enabled', True):
            responses = [self.cancel('0' * 64) for _ in range(11)]
            self.assertEqual(responses[-1].status_code, 429)
            self.assertEqual(self.lookup(token).status_code, 200)
        with patch('routers.reservations.service.pass_data', side_effect=RuntimeError('redacted')):
            self.assertEqual(self.cancel(token).status_code, 500)
        self.assertEqual(self.lookup(token).json()['status'], 'confirmed')

    def test_validation_closed_past_notice_and_horizon(self):
        for changes in [{'name':''},{'guests':0},{'guests':101},{'time':'28:00'},{'email':'bad'},{'phone':'bad'},{'idempotency_key':'short'}]:
            self.assertEqual(self.book(**changes).status_code,422,changes)
        for changes in [{'day':'2000-01-01'},{'day':(now_local().date()+timedelta(days=400)).isoformat()},{'time':'20:00'},{'time':'18:15'}]:
            self.assertEqual(self.book(**changes).status_code,409,changes)
        self.assertEqual(self.book(guests=9).status_code,422)
        self.assertEqual(self.client.put('/admin/reservations/exceptions',headers=self.owner,json={'day':self.day,'closed':True}).status_code,200)
        self.assertEqual(self.book().status_code,409)
        self.assertEqual(self.client.get('/reservations/availability',params={'day':self.day,'guests':2}).json()['slots'],[])
        self.client.delete('/admin/reservations/exceptions/'+self.day,headers=self.owner)
        with patch('services.reservations.now_local',return_value=datetime.combine(date.fromisoformat(self.day),time(18,45),tzinfo=now_local().tzinfo)):
            self.assertEqual(self.book().status_code,409)

    def test_disabled_and_permissions(self):
        self.client.put('/admin/reservations/settings',headers=self.owner,json={})
        self.assertFalse(self.client.get('/reservations/settings').json()['enabled'])
        self.assertEqual(self.book().status_code,409)
        for path in ['/admin/reservations','/admin/reservations/settings','/admin/reservations/promotions','/admin/reservations/exceptions']:
            self.assertEqual(self.client.get(path).status_code,401)
            self.assertEqual(self.client.get(path,headers={'Authorization':'Bearer chef-smoke-token'}).status_code,403)
            self.assertEqual(self.client.get(path,headers=self.manager).status_code,200)
        self.assertEqual(self.client.put('/admin/reservations/settings',headers=self.manager,json={}).status_code,403)
        self.assertEqual(self.client.post('/admin/reservations/promotions',headers=self.manager,json={}).status_code,403)

    def test_capacity_release_filters_and_promotion_snapshot(self):
        promo=self.promo()
        self.promo(percentage=20,title='Lower')
        first=self.book(guests=4).json()
        self.assertEqual(first['promotion']['percentage'],'30.00')
        self.assertEqual(self.book(guests=4).status_code,201)
        self.assertFalse(self.client.get('/reservations/availability',params={'day':self.day,'guests':2}).json()['slots'][0]['available'])
        self.assertEqual(self.book().status_code,409)
        rows=self.client.get('/admin/reservations',headers=self.owner,params={'status':'confirmed','day':self.day,'per_page':1}).json()
        self.assertEqual(rows['total_pages'],2)
        row=rows['items'][0]
        result=self.client.put('/admin/reservations/promotions/'+str(promo['id']),headers=self.owner,json={**{k:v for k,v in promo.items() if k!='id'},'enabled':False,'percentage':'10','title':'Edited'})
        self.assertEqual(result.status_code,200,result.text)
        snapshot=self.lookup(first['confirmation_token'],'de-DE').json()['promotion']
        self.assertEqual(snapshot['title'],'Menüangebot');self.assertEqual(snapshot['percentage'],'30.00')
        self.assertEqual(self.client.patch('/admin/reservations/'+str(row['id']),headers=self.manager,json={'status':'cancelled'}).status_code,200)
        self.assertEqual(self.lookup(first['confirmation_token']).json()['status'],'cancelled')
        self.assertEqual(self.book().status_code,201)
        self.assertEqual(self.client.get('/admin/reservations',headers=self.owner,params={'promotion_id':promo['id']}).json()['total'],2)

    def test_exceptions_conflicts_retention_and_settings_bounds(self):
        self.book()
        r=self.client.put('/admin/reservations/exceptions',headers=self.owner,json={'day':self.day,'closed':True})
        self.assertEqual(r.json()['conflicting_bookings'],1)
        self.assertEqual(self.client.get('/admin/reservations',headers=self.owner).json()['total'],1)
        self.client.put('/admin/reservations/exceptions',headers=self.owner,json={'day':self.day,'closed':False,'windows':[{'start':'12:00','end':'13:00'}]})
        self.assertEqual(self.book(time='12:00').status_code,201)
        self.client.delete('/admin/reservations/exceptions/'+self.day,headers=self.owner)
        self.assertEqual(self.book(time='12:00').status_code,409)
        for config in [{'weekly':{'7':[]}},{'min_guests':9,'max_guests':2},{'interval_minutes':10},{'weekly':{'1':[{'start':'18:00','end':'20:00'},{'start':'19:00','end':'21:00'}]}}]:
            self.assertEqual(self.client.put('/admin/reservations/settings',headers=self.owner,json=config).status_code,422)
        with self.fixture.Session() as db:
            db.scalar(select(Reservation)).day=date(2020,1,1);db.commit()
        self.assertEqual(self.client.delete('/admin/reservations/retention',headers=self.owner).json()['deleted'],1)

    def test_promotion_rules_and_validation(self):
        self.promo(title='First');self.promo(title='Second')
        self.assertEqual(self.book().json()['promotion']['title'],'First')
        with self.fixture.Session() as db:
            db.execute(delete(Reservation));db.execute(delete(ReservationPromotion));db.commit()
        self.promo(weekdays=[(date.fromisoformat(self.day).weekday()+1)%7])
        self.assertIsNone(self.book().json()['promotion'])
        self.promo(windows=[{'start':'19:00','end':'20:00'}])
        self.assertIsNone(self.book().json()['promotion'])
        for bad in [0,-1,101,'NaN','20.555']:
            self.assertEqual(self.client.post('/admin/reservations/promotions',headers=self.owner,json={'title':'Bad','scope':'Menu','percentage':bad,'start_date':self.day,'end_date':self.day}).status_code,422)

    def test_body_limits_rate_limit_available_dates_and_dst(self):
        self.assertEqual(self.client.post('/reservations',content=b'x'*17000,headers={'Content-Type':'application/json'}).status_code,413)
        self.fixture.app.state.redis=InMemoryRedis()
        with patch.object(settings,'rate_limit_enabled',True):
            self.assertEqual([self.lookup('0'*64) for _ in range(91)][-1].status_code,429)
        self.assertEqual(len(self.client.get('/reservations/dates',params={'start':self.day,'guests':2}).json()),31)
        self.assertIsNone(wall_datetime(date(2027,3,28),time(1,30)))
        self.assertIsNone(wall_datetime(date(2027,10,31),time(1,30)))

    def test_unexpected_failures_do_not_expose_or_log_private_data(self):
        secret = 'private-customer-and-token-material'
        with patch('routers.reservations.service.create_booking', side_effect=RuntimeError(secret)), patch.object(settings, 'debug', True), self.assertLogs('core.reservation_privacy', level='ERROR') as logs:
            result = self.book()
        self.assertEqual(result.status_code, 500)
        self.assertNotIn(secret, result.text)
        self.assertNotIn(secret, ''.join(logs.output))
        self.assertIn('no-store', result.headers['Cache-Control'])
        self.assertEqual(result.headers['Referrer-Policy'], 'no-referrer')
