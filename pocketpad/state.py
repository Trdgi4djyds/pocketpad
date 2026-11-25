"""Etat de la manette et validation du protocole.

Convention : pour les sticks, +x = droite, +y = haut, valeurs dans [-1, 1].
Les gachettes (lt, rt) sont dans [0, 1].
"""
from __future__ import annotations

from dataclasses import dataclass, field

BUTTONS = frozenset(
    {"a", "b", "x", "y", "lb", "rb", "back", "start", "guide", "ls", "rs",
     "up", "down", "left", "right"}
)


def _clamp(value, lo, hi) -> float:
    try:
        v = float(value)
    except (TypeError, ValueError):
        return 0.0
    if v != v:  # NaN
        return 0.0
    return max(lo, min(hi, v))


@dataclass
class PadState:
    buttons: frozenset = field(default_factory=frozenset)
    lx: float = 0.0
    ly: float = 0.0
    rx: float = 0.0
    ry: float = 0.0
    lt: float = 0.0
    rt: float = 0.0


NEUTRAL = PadState()


def parse_state(msg: dict) -> PadState:
    """Construit un PadState a partir d'un message client (donnees non fiables)."""
    raw = msg.get("b", [])
    buttons = frozenset(b for b in raw if isinstance(b, str) and b in BUTTONS) if isinstance(raw, list) else frozenset()
    return PadState(
        buttons=buttons,
        lx=_clamp(msg.get("lx"), -1, 1),
        ly=_clamp(msg.get("ly"), -1, 1),
        rx=_clamp(msg.get("rx"), -1, 1),
        ry=_clamp(msg.get("ry"), -1, 1),
        lt=_clamp(msg.get("lt"), 0, 1),
        rt=_clamp(msg.get("rt"), 0, 1),
    )
