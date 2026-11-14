"""
WebSocket Manager for broadcasting real-time normalized ResQ-Mesh events to frontend clients.
"""
import asyncio
import json
import logging
from typing import Set, Dict, Any
from fastapi import WebSocket

logger = logging.getLogger("resq_mesh.ws")


class WebSocketManager:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        async with self._lock:
            self.active_connections.add(websocket)
        logger.info(f"WebSocket client connected. Total clients: {len(self.active_connections)}")

    async def disconnect(self, websocket: WebSocket):
        async with self._lock:
            self.active_connections.discard(websocket)
        logger.info(f"WebSocket client disconnected. Total clients: {len(self.active_connections)}")

    async def broadcast(self, event_type: str, payload: Any):
        """
        Broadcasts an event envelope to all connected WebSocket clients.
        Payload can be a Pydantic model or dict.
        """
        if not self.active_connections:
            return

        # Prepare message
        if hasattr(payload, "model_dump"):
            data = payload.model_dump()
        elif isinstance(payload, dict):
            data = payload
        else:
            data = {"data": str(payload)}

        message = json.dumps({"type": event_type, "payload": data})

        disconnected: Set[WebSocket] = set()
        async with self._lock:
            for connection in list(self.active_connections):
                try:
                    await connection.send_text(message)
                except Exception as e:
                    logger.warning(f"Failed to send to client: {e}")
                    disconnected.add(connection)

            for dead in disconnected:
                self.active_connections.discard(dead)
