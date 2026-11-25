"""Backends : transforment un PadState en manette virtuelle sur le PC."""
from __future__ import annotations

import logging
import sys
from typing import Callable, Optional

from .state import NEUTRAL, PadState

log = logging.getLogger("pocketpad.backend")
RumbleCallback = Callable[[float, float], None]


class Backend:
    name = "base"

    def __init__(self) -> None:
        self.on_rumble: Optional[RumbleCallback] = None

    def apply(self, state: PadState) -> None:  # pragma: no cover
        raise NotImplementedError

    def close(self) -> None:
        try:
            self.apply(NEUTRAL)
        except Exception:  # noqa: BLE001
            pass


class NullBackend(Backend):
    """Ne fait rien (tests / diagnostic)."""
    name = "null"

    def __init__(self) -> None:
        super().__init__()
        self.last: PadState = NEUTRAL

    def apply(self, state: PadState) -> None:
        self.last = state
        log.debug("state=%s", state)


class VigemBackend(Backend):
    """Manette Xbox 360 virtuelle (Windows, driver ViGEmBus + paquet vgamepad)."""
    name = "vigem"

    def __init__(self) -> None:
        super().__init__()
        import vgamepad as vg  # type: ignore

        B = vg.XUSB_BUTTON
        self.pad = vg.VX360Gamepad()
        self.map = {
            "a": B.XUSB_GAMEPAD_A, "b": B.XUSB_GAMEPAD_B,
            "x": B.XUSB_GAMEPAD_X, "y": B.XUSB_GAMEPAD_Y,
            "lb": B.XUSB_GAMEPAD_LEFT_SHOULDER, "rb": B.XUSB_GAMEPAD_RIGHT_SHOULDER,
            "back": B.XUSB_GAMEPAD_BACK, "start": B.XUSB_GAMEPAD_START,
            "guide": B.XUSB_GAMEPAD_GUIDE,
            "ls": B.XUSB_GAMEPAD_LEFT_THUMB, "rs": B.XUSB_GAMEPAD_RIGHT_THUMB,
            "up": B.XUSB_GAMEPAD_DPAD_UP, "down": B.XUSB_GAMEPAD_DPAD_DOWN,
            "left": B.XUSB_GAMEPAD_DPAD_LEFT, "right": B.XUSB_GAMEPAD_DPAD_RIGHT,
        }
        self.pressed: set = set()
        try:
            self.pad.register_notification(callback_function=self._rumble)
        except Exception as exc:  # noqa: BLE001
            log.warning("Vibrations indisponibles: %s", exc)

    def _rumble(self, client, target, large_motor, small_motor, led_number, user_data):
        if self.on_rumble:
            self.on_rumble(large_motor / 255.0, small_motor / 255.0)

    def apply(self, s: PadState) -> None:
        for name, btn in self.map.items():
            on = name in s.buttons
            if on and name not in self.pressed:
                self.pad.press_button(button=btn)
            elif not on and name in self.pressed:
                self.pad.release_button(button=btn)
        self.pressed = set(s.buttons) & set(self.map)
        self.pad.left_joystick_float(x_value_float=s.lx, y_value_float=s.ly)
        self.pad.right_joystick_float(x_value_float=s.rx, y_value_float=s.ry)
        self.pad.left_trigger_float(value_float=s.lt)
        self.pad.right_trigger_float(value_float=s.rt)
        self.pad.update()


class EvdevBackend(Backend):
    """Manette virtuelle via uinput (Linux, paquet evdev, acces a /dev/uinput)."""
    name = "evdev"

    def __init__(self) -> None:
        super().__init__()
        from evdev import AbsInfo, UInput, ecodes as e  # type: ignore

        self.e = e
        self.keys = {
            "a": e.BTN_SOUTH, "b": e.BTN_EAST, "x": e.BTN_WEST, "y": e.BTN_NORTH,
            "lb": e.BTN_TL, "rb": e.BTN_TR, "back": e.BTN_SELECT, "start": e.BTN_START,
            "guide": e.BTN_MODE, "ls": e.BTN_THUMBL, "rs": e.BTN_THUMBR,
        }
        stick = AbsInfo(0, -32767, 32767, 16, 128, 0)
        trig = AbsInfo(0, 0, 255, 0, 0, 0)
        hat = AbsInfo(0, -1, 1, 0, 0, 0)
        caps = {
            e.EV_KEY: list(self.keys.values()),
            e.EV_ABS: [(e.ABS_X, stick), (e.ABS_Y, stick), (e.ABS_RX, stick),
                       (e.ABS_RY, stick), (e.ABS_Z, trig), (e.ABS_RZ, trig),
                       (e.ABS_HAT0X, hat), (e.ABS_HAT0Y, hat)],
        }
        self.ui = UInput(caps, name="PocketPad Virtual Gamepad", vendor=0x045E, product=0x028E)

    def apply(self, s: PadState) -> None:
        e, ui = self.e, self.ui
        for name, code in self.keys.items():
            ui.write(e.EV_KEY, code, 1 if name in s.buttons else 0)
        ax = lambda v: int(v * 32767)  # noqa: E731
        ui.write(e.EV_ABS, e.ABS_X, ax(s.lx))
        ui.write(e.EV_ABS, e.ABS_Y, ax(-s.ly))  # evdev: bas = positif
        ui.write(e.EV_ABS, e.ABS_RX, ax(s.rx))
        ui.write(e.EV_ABS, e.ABS_RY, ax(-s.ry))
        ui.write(e.EV_ABS, e.ABS_Z, int(s.lt * 255))
        ui.write(e.EV_ABS, e.ABS_RZ, int(s.rt * 255))
        ui.write(e.EV_ABS, e.ABS_HAT0X, ("right" in s.buttons) - ("left" in s.buttons))
        ui.write(e.EV_ABS, e.ABS_HAT0Y, ("down" in s.buttons) - ("up" in s.buttons))
        ui.syn()

    def close(self) -> None:
        super().close()
        self.ui.close()


class KeyboardBackend(Backend):
    """Repli : emule le clavier (ZQSD/WASD, fleches, etc.) pour les jeux sans support manette."""
    name = "keyboard"
    DEAD = 0.35

    def __init__(self) -> None:
        super().__init__()
        from pynput.keyboard import Controller, Key  # type: ignore

        self.kb = Controller()
        self.Key = Key
        self.down: set = set()
        self.button_keys = {
            "a": Key.space, "b": "e", "x": "r", "y": "f",
            "lb": "q", "rb": "c", "back": Key.tab, "start": Key.esc,
            "ls": Key.shift, "rs": "v",
            "up": Key.up, "down": Key.down, "left": Key.left, "right": Key.right,
        }

    def apply(self, s: PadState) -> None:
        want = {self.button_keys[b] for b in s.buttons if b in self.button_keys}
        d = self.DEAD
        if s.ly > d: want.add("w")
        if s.ly < -d: want.add("s")
        if s.lx < -d: want.add("a")
        if s.lx > d: want.add("d")
        if s.rt > 0.5: want.add(self.Key.ctrl)
        for k in want - self.down:
            self.kb.press(k)
        for k in self.down - want:
            self.kb.release(k)
        self.down = want


def create_backend(name: str = "auto") -> Backend:
    order = {
        "auto": ["vigem", "evdev", "keyboard", "null"] if sys.platform != "linux"
        else ["evdev", "keyboard", "null"],
        "vigem": ["vigem"], "evdev": ["evdev"], "keyboard": ["keyboard"], "null": ["null"],
    }[name]
    classes = {"vigem": VigemBackend, "evdev": EvdevBackend,
               "keyboard": KeyboardBackend, "null": NullBackend}
    last_exc: Optional[Exception] = None
    for n in order:
        try:
            backend = classes[n]()
            log.info("Backend actif : %s", backend.name)
            return backend
        except Exception as exc:  # noqa: BLE001
            last_exc = exc
            log.warning("Backend %s indisponible : %s", n, exc)
    raise RuntimeError(f"Aucun backend utilisable ({last_exc})")
