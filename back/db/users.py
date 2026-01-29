from typing import Optional
from db.connection import get_conn
from schemas.user import UpdateProfile

USER_FIELDS = [
    "id",
    "email",
    "password_hash",
    "full_name",
    "affiliation",
    "instrument_serial_number",
    "bio",
    "phone_number",
    "profile_completed"
]

REQUIRED_PROFILE_FIELDS = [
    "full_name",
    "affiliation",
    "instrument_serial_number",
]


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

    fields_sql = ", ".join(USER_FIELDS)

    row = conn.execute(
        f"""
        SELECT {fields_sql}
        FROM users
        WHERE email = ?
        """,
        (email,),
    ).fetchone()

    if row is None:
        return None

    # zip() guarantees correct mapping even if order changes
    return dict(zip(USER_FIELDS, row))


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


def update_user_profile(user_id: int, data: UpdateProfile) -> dict:
    conn = get_conn()

    update_data = data.model_dump(exclude_unset=True)

    if update_data:
        set_clause = ", ".join([f"{k} = ?" for k in update_data.keys()])
        values = list(update_data.values()) + [user_id]

        conn.execute(
            f"""
            UPDATE users
            SET {set_clause}
            WHERE id = ?
            """,
            values,
        )

    # Re-check profile completeness
    row = conn.execute(
        """
        SELECT
            id,
            email,
            full_name,
            affiliation,
            instrument_serial_number,
            bio,
            phone_number,
            (
              full_name IS NOT NULL AND
              affiliation IS NOT NULL AND
              instrument_serial_number IS NOT NULL
            ) AS profile_completed
        FROM users
        WHERE id = ?
        """,
        (user_id,),
    ).fetchone()

    if row is None:
        raise ValueError("User not found")

    (
        id_,
        email,
        full_name,
        affiliation,
        instrument_serial_number,
        bio,
        phone_number,
        profile_completed,
    ) = row

    # Persist profile_completed
    conn.execute(
        """
        UPDATE users
        SET profile_completed = ?
        WHERE id = ?
        """,
        (profile_completed, user_id),
    )

    return {
        "id": id_,
        "email": email,
        "profile_completed": bool(profile_completed),
        "full_name": full_name,
        "affiliation": affiliation,
        "instrument_serial_number": instrument_serial_number,
        "bio": bio,
        "phone_number": phone_number,
    }
