"""Disposable SQLite HTTP fixture for browser QA. Never accesses production data."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tests.test_meal_finder import MealFinderTests
from core.redis import InMemoryRedis
import uvicorn

if __name__ == '__main__':
    MealFinderTests.setUpClass()
    fixture = MealFinderTests()
    fixture.setUp()
    app = MealFinderTests.fixture.app
    app.state.redis = InMemoryRedis()
    try:
        uvicorn.run(app, host='127.0.0.1', port=19112, access_log=False)
    finally:
        fixture.tearDown()
        MealFinderTests.tearDownClass()
