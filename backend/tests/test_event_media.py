from io import BytesIO
import unittest
from unittest.mock import patch
from PIL import Image
from tests import test_endpoint_smoke as smoke
from core.config import settings
from schemas.site_settings import EventItemSettings


class EventMediaTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixture = smoke.EndpointSmokeTests
        cls.fixture.setUpClass()
        cls.client = cls.fixture.client
        cls.owner = {'Authorization': 'Bearer admin-smoke-token'}

    @classmethod
    def tearDownClass(cls):
        cls.fixture.tearDownClass()

    def setUp(self):
        self.rate = patch.object(settings, 'rate_limit_enabled', False)
        self.rate.start()
        self.addCleanup(self.rate.stop)
        photo = BytesIO()
        Image.new('RGBA', (80, 120), (20, 100, 80, 180)).save(photo, format='PNG')
        self.photo = photo.getvalue()

    def upload(self, content=None, mime='image/png', headers=None):
        return self.client.post('/admin/site-settings/events/image', headers=self.owner if headers is None else headers,
                                files={'file': ('../../poster.png', self.photo if content is None else content, mime)})

    def test_photo_upload_is_owner_only_and_publicly_served(self):
        self.assertIn(self.upload(headers={}).status_code, [401, 403])
        self.assertEqual(self.upload(headers={'Authorization': 'Bearer manager-smoke-token'}).status_code, 403)
        response = self.upload()
        self.assertEqual(response.status_code, 200, response.text)
        result = response.json()
        self.assertTrue(result['image_url'].startswith('/uploads/events/'))
        self.assertEqual((result['width'], result['height']), (80, 120))
        served = self.client.get(result['image_url'])
        self.assertEqual(served.status_code, 200)
        with Image.open(BytesIO(served.content)) as image:
            self.assertEqual(image.format, 'WEBP')
            self.assertIn('A', image.getbands())
        self.assertNotEqual(self.upload().json()['image_url'], result['image_url'])

    def test_invalid_oversized_and_bomb_images_are_rejected(self):
        self.assertEqual(self.upload(b'<svg></svg>', 'image/svg+xml').status_code, 400)
        self.assertEqual(self.upload(b'not an image').status_code, 400)
        with patch('services.event_images.MAX_IMAGE_BYTES', 16):
            self.assertEqual(self.upload(b'a' * 17).status_code, 413)
        with patch.object(Image, 'MAX_IMAGE_PIXELS', 100):
            self.assertEqual(self.upload().status_code, 400)

    def event(self, **changes):
        return {'id': 'media-test', 'title': 'Coastal night', 'description': '', 'date': '2030-06-20',
                'start_time': '18:00', 'end_time': '23:00', 'image_url': '/assets/images/about-us-3.jpg', **changes}

    def test_uploaded_photo_and_optional_links_round_trip_and_can_be_cleared(self):
        image_url = self.upload().json()['image_url']
        data = self.event(image_url=image_url, instagram_url=' https://www.instagram.com/b0nefree/ ', website_url='https://example.com/event?ticket=1')
        saved = self.client.put('/admin/site-settings/events', headers=self.owner, json={'events': [data]})
        self.assertEqual(saved.status_code, 200, saved.text)
        public = self.client.get('/site-settings/events').json()['events'][0]
        self.assertEqual(public['image_url'], image_url)
        self.assertEqual(public['instagram_url'], data['instagram_url'].strip())
        self.assertEqual(public['website_url'], data['website_url'])
        cleared = self.client.put('/admin/site-settings/events', headers=self.owner, json={'events': [self.event()]})
        self.assertEqual(cleared.status_code, 200)
        self.assertEqual(cleared.json()['events'][0]['website_url'], '')
        self.assertEqual(EventItemSettings(**self.event()).instagram_url, '')

    def test_event_links_only_accept_valid_web_urls(self):
        for link in ['javascript:alert(1)', '//example.com', 'https://user:password@example.com', 'https://example.com:bad', 'https://example.com/a b', 'https://']:
            with self.subTest(link=link):
                response = self.client.put('/admin/site-settings/events', headers=self.owner, json={'events': [self.event(website_url=link)]})
                self.assertEqual(response.status_code, 422, response.text)
