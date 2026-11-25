import asyncio
import json

from aiohttp.test_utils import TestClient, TestServer

from pocketpad.backends import NullBackend
from pocketpad.relay import make_app as make_relay
from pocketpad.server import make_app
from pocketpad.state import parse_state


def test_parse_state_clamps_and_filters():
    s = parse_state({"b": ["a", "hack", 3, "up"], "lx": 5, "ly": "x", "lt": -2, "rt": 0.5})
    assert s.buttons == frozenset({"a", "up"})
    assert (s.lx, s.ly, s.lt, s.rt) == (1.0, 0.0, 0.0, 0.5)


def test_parse_state_garbage():
    assert parse_state({"b": "a", "lx": float("nan")}).buttons == frozenset()


def test_server_applies_state_and_checks_key():
    async def run():
        backend = NullBackend()
        async with TestClient(TestServer(make_app(backend, "secret"))) as c:
            resp = await c.get("/ws?key=nope")
            assert resp.status == 403
            ws = await c.ws_connect("/ws?key=secret")
            await ws.send_str(json.dumps({"t": "s", "b": ["a"], "lx": 0.5}))
            await ws.send_str(json.dumps({"t": "ping", "ts": 42}))
            reply = await ws.receive_json()
            assert reply == {"t": "pong", "ts": 42}
            assert "a" in backend.last.buttons and backend.last.lx == 0.5
            await ws.close()
            await asyncio.sleep(0.05)
            assert not backend.last.buttons  # neutre apres deconnexion
    asyncio.run(run())


def test_relay_forwards_both_ways():
    async def run():
        async with TestClient(TestServer(make_relay())) as c:
            host = await c.ws_connect("/host/room1?key=k")
            phone = await c.ws_connect("/ws/room1?key=k")
            await phone.send_str('{"t":"s"}')
            assert (await host.receive()).data == '{"t":"s"}'
            await host.send_str('{"t":"rumble"}')
            assert (await phone.receive()).data == '{"t":"rumble"}'
            assert (await c.get("/ws/room1?key=wrong")).status == 403
    asyncio.run(run())
