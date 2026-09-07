from datetime import UTC, datetime, timedelta, timezone
import unittest
from unittest.mock import patch

from utils.datetime_utils import naive_utc_now, to_naive_utc, utc_now


class DatetimeUtilsTests(unittest.TestCase):
    def test_current_time_is_timezone_aware_utc(self):
        before = datetime.now(UTC)
        current = utc_now()
        after = datetime.now(UTC)

        self.assertEqual(current.utcoffset(), timedelta(0))
        self.assertLessEqual(before, current)
        self.assertLessEqual(current, after)

    def test_database_clock_preserves_utc_wall_time_and_precision(self):
        instant = datetime(2026, 9, 7, 0, 0, 1, 123456, tzinfo=UTC)
        with patch("utils.datetime_utils.utc_now", return_value=instant):
            current = naive_utc_now()

        self.assertIsNone(current.tzinfo)
        self.assertEqual(current, datetime(2026, 9, 7, 0, 0, 1, 123456))

    def test_normalization_handles_day_boundaries_and_legacy_values(self):
        legacy = datetime(2026, 9, 7, 12, 30)
        self.assertIsNone(to_naive_utc(None))
        self.assertIs(to_naive_utc(legacy), legacy)
        for value, expected in (
            (
                datetime(2026, 9, 7, 1, 30, tzinfo=timezone(timedelta(hours=5, minutes=30))),
                datetime(2026, 9, 6, 20),
            ),
            (
                datetime(2026, 9, 7, 23, 30, tzinfo=timezone(timedelta(hours=-3))),
                datetime(2026, 9, 8, 2, 30),
            ),
        ):
            with self.subTest(value=value):
                normalized = to_naive_utc(value)
                self.assertIsNone(normalized.tzinfo)
                self.assertEqual(normalized, expected)


if __name__ == "__main__":
    unittest.main()
