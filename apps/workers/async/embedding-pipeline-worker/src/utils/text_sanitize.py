"""
author: Yagnik Poshiya
github: https://github.com/yagnikposhiya/Neurons
"""

from __future__ import annotations


def sanitize_text_for_db(text: str) -> str:
    """
    Make text safe for PostgreSQL text columns.

    - Removes NULL bytes (\x00), which PostgreSQL rejects in text.
    - Removes most control characters, while preserving common whitespace:
      newline, carriage return, and tab.
    """
    if not text:
        return ""

    # PostgreSQL text cannot contain NULL bytes.
    s = text.replace("\x00", "")

    # Strip non-printable control chars except \n, \r, \t.
    cleaned_chars: list[str] = []
    for ch in s:
        code = ord(ch)
        if code < 32 and ch not in ("\n", "\r", "\t"):
            continue
        cleaned_chars.append(ch)
    return "".join(cleaned_chars)

