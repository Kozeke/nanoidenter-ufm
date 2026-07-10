# Helpers for HDF5 segment0/segment1 storage and query filtering.
from typing import Optional, Sequence, Tuple


def normalize_segment_type(segment_type: Optional[str]) -> str:
    """Map UI/API segment aliases to canonical segment0 or segment1."""
    if not segment_type:
        return "segment0"
    normalized = str(segment_type).strip().lower()
    if normalized in {"indent", "approach", "segment0", "0"}:
        return "segment0"
    if normalized in {"retract", "segment1", "1"}:
        return "segment1"
    return normalized


def segment_types_for_filter(segment_type: Optional[str]) -> Tuple[str, ...]:
    """Return DB segment_type values included for the selected UI segment."""
    canonical = normalize_segment_type(segment_type)
    if canonical == "segment1":
        return ("segment1", "retract")
    return ("segment0", "approach")


def segment_types_sql(segment_type: Optional[str]) -> str:
    """Build a SQL predicate restricting rows to one logical segment."""
    types = segment_types_for_filter(segment_type)
    quoted = ", ".join(f"'{value}'" for value in types)
    return f"segment_type IN ({quoted})"
