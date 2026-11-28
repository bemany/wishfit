"""Result store on top of db.py: Postgres when DATABASE_URL is set, otherwise in memory."""

import db


def save(result_id: str, response: dict, trace: dict, user_id: str | None = None) -> None:
    db.save_result(result_id, response, trace, user_id)


def get(result_id: str) -> tuple[dict, dict] | None:
    return db.get_result(result_id)
