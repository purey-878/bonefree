"""Bound reservation bodies and prevent caching/referrer leakage on API resources."""
import logging
from starlette.responses import JSONResponse

logger = logging.getLogger(__name__)


class ReservationPrivacyMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        path = scope.get('path', '')
        if scope['type'] != 'http' or not (path == '/reservations' or path.startswith('/reservations/') or path.startswith('/admin/reservations')):
            return await self.app(scope, receive, send)

        response_started = False

        async def private_send(message):
            nonlocal response_started
            if message['type'] == 'http.response.start':
                response_started = True
                protected = {b'cache-control', b'pragma', b'referrer-policy', b'x-robots-tag', b'x-content-type-options'}
                message['headers'] = [(k, v) for k, v in message.get('headers', []) if k.lower() not in protected] + [
                    (b'cache-control', b'no-store, private, max-age=0'), (b'pragma', b'no-cache'),
                    (b'referrer-policy', b'no-referrer'), (b'x-robots-tag', b'noindex, nofollow'), (b'x-content-type-options', b'nosniff')]
            await send(message)

        async def protected_call(body_receive):
            try:
                await self.app(scope, body_receive, private_send)
            except Exception:
                # Exception/SQL reprs can include personal data and token material.
                # Consume unexpected reservation failures before Uvicorn logs them.
                logger.error('Unexpected reservation request failure; details redacted.')
                if not response_started:
                    await JSONResponse({'error': 'internal_server_error', 'message': 'Internal server error.'}, status_code=500)(scope, body_receive, private_send)
                else:
                    await send({'type': 'http.response.body', 'body': b'', 'more_body': False})

        if scope.get('method') not in {'POST', 'PUT', 'PATCH'}:
            return await protected_call(receive)
        limit = 65536 if path.startswith('/admin/') else 16384
        body = bytearray()
        while True:
            message = await receive()
            if message['type'] == 'http.disconnect':
                return
            body.extend(message.get('body', b''))
            if len(body) > limit:
                return await JSONResponse({'error': 'request_too_large', 'message': 'Reservation request is too large.'}, status_code=413)(scope, receive, private_send)
            if not message.get('more_body', False):
                break
        delivered = False

        async def replay():
            nonlocal delivered
            if not delivered:
                delivered = True
                return {'type': 'http.request', 'body': bytes(body), 'more_body': False}
            return await receive()
        await protected_call(replay)
