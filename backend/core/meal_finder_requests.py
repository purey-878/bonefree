"""Bound anonymous quiz/configuration bodies and keep live responses uncached."""
from starlette.responses import JSONResponse


class MealFinderRequestMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        path = scope.get('path', '')
        if scope['type'] != 'http' or not (path.startswith('/meal-finder/') or path.startswith('/admin/meal-finder/')):
            return await self.app(scope, receive, send)

        async def uncached(message):
            if message['type'] == 'http.response.start':
                message['headers'] = [(k,v) for k,v in message.get('headers',[]) if k.lower() != b'cache-control'] + [(b'cache-control',b'no-store, private, max-age=0')]
            await send(message)

        if scope.get('method') not in {'POST','PUT','PATCH'}:
            return await self.app(scope, receive, uncached)
        limit = 65536 if path.startswith('/admin/') else 8192
        body = bytearray()
        while True:
            message = await receive()
            if message['type'] == 'http.disconnect':
                return
            body.extend(message.get('body',b''))
            if len(body) > limit:
                return await JSONResponse({'error':'request_too_large','message':'Meal Finder request is too large.'},status_code=413)(scope, receive, uncached)
            if not message.get('more_body',False):
                break
        delivered = False
        async def bounded_receive():
            nonlocal delivered
            if not delivered:
                delivered = True
                return {'type':'http.request','body':bytes(body),'more_body':False}
            return await receive()
        await self.app(scope, bounded_receive, uncached)
