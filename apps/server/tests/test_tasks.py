"""13.3: fire-and-forget task phải giữ ref + log exception (spawn_task)."""

import asyncio
import logging

import pytest

from src.main import _background_tasks, spawn_task


@pytest.mark.asyncio
async def test_spawn_task_keeps_ref_until_done():
    done = asyncio.Event()

    async def work():
        done.set()

    t = spawn_task(work(), name="test-keep-ref")
    # đang chạy: ref được giữ trong set (không bị GC giữa chừng)
    assert t in _background_tasks
    await asyncio.wait_for(done.wait(), timeout=2)
    await t
    await asyncio.sleep(0)  # nhả control cho loop để done callback chạy
    # xong: ref được nhả
    assert t not in _background_tasks


@pytest.mark.asyncio
async def test_spawn_task_logs_exception_not_swallowed(caplog):
    async def boom():
        raise ValueError("bg explosion")

    t = spawn_task(boom(), name="test-boom")
    with caplog.at_level(logging.ERROR, logger="lt-server"):
        with pytest.raises(ValueError):
            await t
        # cho done callback chạy
        await asyncio.sleep(0.05)
    assert any("test-boom" in r.message and "bg explosion" in r.message for r in caplog.records)


@pytest.mark.asyncio
async def test_spawn_task_cancelled_does_not_log_error(caplog):
    async def hang():
        await asyncio.sleep(10)

    t = spawn_task(hang(), name="test-cancel")
    t.cancel()
    with caplog.at_level(logging.ERROR, logger="lt-server"):
        with pytest.raises(asyncio.CancelledError):
            await t
        await asyncio.sleep(0.05)
    assert not any("test-cancel" in r.message for r in caplog.records)
    assert t not in _background_tasks


@pytest.mark.asyncio
async def test_spawn_task_success_no_error_log(caplog):
    async def ok():
        return 42

    t = spawn_task(ok(), name="test-ok")
    with caplog.at_level(logging.ERROR, logger="lt-server"):
        assert await t == 42
        await asyncio.sleep(0.05)
    assert not [r for r in caplog.records if r.levelno >= logging.ERROR]
