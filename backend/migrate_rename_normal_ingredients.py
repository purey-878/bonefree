import sqlite3
from pathlib import Path


DB_PATH = Path(__file__).with_name("prey_rest_2.db")
OLD_TYPE = "INGREDIENTE"
NEW_TYPE = "INGREDIENTES_NORMAIS"


def main() -> None:
    with sqlite3.connect(DB_PATH) as connection:
        cursor = connection.cursor()
        before = cursor.execute(
            "select count(*) from ingrediente where tipo = ?",
            (OLD_TYPE,),
        ).fetchone()[0]
        cursor.execute(
            "update ingrediente set tipo = ? where tipo = ?",
            (NEW_TYPE, OLD_TYPE),
        )
        connection.commit()
        remaining_old = cursor.execute(
            "select count(*) from ingrediente where tipo = ?",
            (OLD_TYPE,),
        ).fetchone()[0]
        new_total = cursor.execute(
            "select count(*) from ingrediente where tipo = ?",
            (NEW_TYPE,),
        ).fetchone()[0]
    print(f"updated={before} remaining_old={remaining_old} new_total={new_total}")


if __name__ == "__main__":
    main()
