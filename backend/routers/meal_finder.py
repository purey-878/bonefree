from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.orm import Session
from database import get_db
from schemas.errors import ApiErrorResponse
from dependencies import require_role
from services.auth_service import STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE
from core.rate_limit import enforce_rate_limit, get_client_ip, RATE_LIMIT_OPENAPI_RESPONSES
from schemas.meal_finder import Configuration, FinderSettings, RecommendationRequest, RecommendationResult
from services import meal_finder as service


async def public_limit(request: Request, response: Response):
    response.headers['Cache-Control'] = 'no-store'
    await enforce_rate_limit(request, bucket='meal-finder', identity=get_client_ip(request), max_requests=60, window_seconds=60)


router = APIRouter(prefix='/meal-finder', tags=['Meal Finder'], dependencies=[Depends(public_limit)], responses={**RATE_LIMIT_OPENAPI_RESPONSES, 413: {'model': ApiErrorResponse, 'description': 'Request body too large'}})
admin_router = APIRouter(prefix='/admin/meal-finder', tags=['Admin Meal Finder'], responses={413: {'model': ApiErrorResponse, 'description': 'Request body too large'}})


@router.get('/config', response_model=Configuration, operation_id='meal_finder_config')
def public_config(db: Session = Depends(get_db)):
    return service.configuration(db)


@router.post('/recommendations', response_model=RecommendationResult, operation_id='meal_finder_recommendations')
def recommend(data: RecommendationRequest, db: Session = Depends(get_db)):
    return service.recommendations(db, data)


@admin_router.get('/settings', response_model=FinderSettings, operation_id='meal_finder_admin_settings')
def settings(db: Session = Depends(get_db), admin=Depends(require_role(SUPER_ADMIN_ROLE, STAFF_ADMIN_ROLE))):
    return service.settings(db)


@admin_router.put('/settings', response_model=FinderSettings, operation_id='meal_finder_save_settings')
def save_settings(data: FinderSettings, db: Session = Depends(get_db), admin=Depends(require_role(SUPER_ADMIN_ROLE, STAFF_ADMIN_ROLE))):
    return service.save_settings(db, data)
