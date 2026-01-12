from typing import Optional
from db.connection import get_conn

def create_user(email: str, password_hash: str) -> None:
    conn = get_conn()
    conn.execute(
        """
        INSERT INTO users (email, password_hash)
        VALUES (?, ?)
        """,
        (email, password_hash),
    )

def get_user_by_email(email: str) -> Optional[dict]:
    conn = get_conn()
    row = conn.execute(
        """
        SELECT id, email, password_hash
        FROM users
        WHERE email = ?
        """,
        (email,),
    ).fetchone()

    if not row:
        return None

    return {
        "id": row[0],
        "email": row[1],
        "password_hash": row[2],
    }

def update_user_password(user_id: int, new_password_hash: str) -> None:
    conn = get_conn()
    conn.execute(
        """
        UPDATE users
        SET password_hash = ?
        WHERE id = ?
        """,
        (new_password_hash, user_id),
    )
