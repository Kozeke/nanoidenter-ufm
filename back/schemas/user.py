# back/schemas/user.py
from pydantic import BaseModel
from typing import Optional

class UpdateProfile(BaseModel):
    email: Optional[str] = None
    full_name: Optional[str] = None
    affiliation: Optional[str] = None
    instrument_serial_number: Optional[str] = None
    bio: Optional[str] = None
    phone_number: Optional[str] = None
