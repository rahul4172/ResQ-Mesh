"""
FastAPI application backend for ResQ-Mesh Live Rescue Monitoring.
Provides WebSocket event streaming, PySerial hardware bridging,
and local SQLite persistence.
"""
import asyncio
import os
import logging
from typing import Optional, List
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from .schemas import (
    GpsEvent,
    AudioLifecycleEvent,
    PacketStatsEvent,
    WarningEvent,
    RawLogEvent,
    ConnectionState,
    SerialPortInfo,
    ConnectRequest,
    ConnectResponse,
    SimulationToggleRequest,
    SystemStatusResponse,
)
from .parser import RxSerialParser
from .storage import StorageManager
from .websocket_manager import WebSocketManager
from .serial_manager import SerialManager
from .simulator import RxHardwareSimulator

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("resq_mesh.main")

# Instantiate singletons
parser = RxSerialParser()
storage = StorageManager()
ws_manager = WebSocketManager()

# Global state tracking
latest_gps: Optional[GpsEvent] = None
latest_audio: Optional[AudioLifecycleEvent] = None
latest_stats: Optional[PacketStatsEvent] = None
active_warnings: List[WarningEvent] = []
loop_ref: Optional[asyncio.AbstractEventLoop] = None


def dispatch_event(event_type: str, model_data: any):
    """
    Called by SerialManager or Simulator when a new verified event is produced.
    Updates in-memory latest records and dispatches to WebSockets safely across threads.
    """
    global latest_gps, latest_audio, latest_stats, active_warnings

    if event_type == "gps":
        latest_gps = model_data
    elif event_type == "audio_lifecycle":
        latest_audio = model_data
    elif event_type == "status_report":
        latest_stats = model_data
        # Update audio peak from status report if available
        if latest_audio and hasattr(model_data, "decoded_peak_level"):
            latest_audio.peak_level = model_data.decoded_peak_level
    elif event_type == "warning":
        active_warnings.insert(0, model_data)
        if len(active_warnings) > 10:
            active_warnings.pop()

    # Schedule thread-safe broadcast in the main asyncio loop
    if loop_ref and loop_ref.is_running():
        asyncio.run_coroutine_threadsafe(
            ws_manager.broadcast(event_type, model_data),
            loop_ref
        )


serial_manager = SerialManager(parser=parser, storage=storage, on_event_callback=dispatch_event)
simulator = RxHardwareSimulator(line_processor=serial_manager._process_line)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global loop_ref
    loop_ref = asyncio.get_running_loop()
    logger.info("ResQ-Mesh backend startup complete.")
    yield
    # Shutdown logic
    logger.info("Shutting down ResQ-Mesh backend...")
    simulator.stop()
    serial_manager.disconnect()


app = FastAPI(
    title="ResQ-Mesh Live Rescue Monitoring Backend",
    version="1.0.0",
    lifespan=lifespan
)

# CORS configuration for Vite local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/ports", response_model=List[SerialPortInfo])
def get_available_ports():
    """Lists all detected hardware USB/Serial COM ports on the host system."""
    return serial_manager.list_ports()


@app.get("/api/status", response_model=SystemStatusResponse)
def get_system_status():
    """Returns the consolidated live state of the receiver bridge."""
    conn_state = serial_manager.state
    if simulator.is_running:
        conn_state = ConnectionState(
            is_connected=True,
            is_simulated=True,
            port="VIRTUAL_SIM_COM",
            baud_rate=115200,
            bytes_read=serial_manager.state.bytes_read,
            lines_read=serial_manager.state.lines_read,
            last_activity=serial_manager.state.last_activity,
        )

    return SystemStatusResponse(
        connection=conn_state,
        latest_gps=latest_gps,
        latest_audio=latest_audio,
        latest_stats=latest_stats,
        active_warnings=active_warnings,
        database_records_count=storage.get_total_records_count()
    )


@app.post("/api/connect", response_model=ConnectResponse)
def connect_serial_port(req: ConnectRequest):
    """Connects to a real hardware COM port."""
    if simulator.is_running:
        simulator.stop()

    success = serial_manager.connect(req.port, req.baud_rate)
    if success:
        return ConnectResponse(
            success=True,
            message=f"Connected to {req.port} at {req.baud_rate} baud",
            state=serial_manager.state
        )
    raise HTTPException(status_code=400, detail=serial_manager.state.error or "Connection failed")


@app.post("/api/disconnect", response_model=ConnectResponse)
def disconnect_serial_port():
    """Disconnects from the active serial port."""
    if simulator.is_running:
        simulator.stop()
    serial_manager.disconnect()
    return ConnectResponse(
        success=True,
        message="Disconnected successfully",
        state=serial_manager.state
    )


@app.post("/api/simulation/start")
def start_simulation():
    """Starts the offline mock hardware telemetry simulation."""
    if serial_manager.state.is_connected:
        serial_manager.disconnect()

    simulator.start()
    return {"success": True, "message": "Simulation started", "is_simulated": True}


@app.post("/api/simulation/stop")
def stop_simulation():
    """Stops the offline mock simulation."""
    simulator.stop()
    return {"success": True, "message": "Simulation stopped", "is_simulated": False}


@app.get("/api/gps/history")
def get_gps_history(limit: int = 500):
    """Retrieves chronological GPS fixes for map path rendering."""
    return storage.get_gps_history(limit=limit)


@app.get("/api/packets/history")
def get_packet_stats_history(limit: int = 100):
    """Retrieves historical packet loss and signal metrics."""
    return storage.get_packet_stats_history(limit=limit)


@app.get("/api/logs/raw")
def get_raw_logs(limit: int = 200, only_unknown: bool = False):
    """Retrieves recent raw serial lines received from the ESP32."""
    return storage.get_raw_logs(limit=limit, only_unknown=only_unknown)


@app.delete("/api/storage/clear")
def clear_storage():
    """Clears local SQLite telemetry and path history."""
    storage.clear_database()
    return {"success": True, "message": "Database cleared"}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """Real-time event stream WebSocket endpoint."""
    await ws_manager.connect(websocket)
    try:
        # Send initial status snapshot upon connection
        status_data = get_system_status()
        await websocket.send_json({"type": "init", "payload": status_data.model_dump()})
        
        while True:
            # Keep connection alive; process client messages if any
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        await ws_manager.disconnect(websocket)
    except Exception as e:
        logger.warning(f"WebSocket client loop error: {e}")
        await ws_manager.disconnect(websocket)


# Mount frontend static distribution if built
frontend_dist = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "frontend", "dist")
if os.path.exists(frontend_dist):
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_dist, "assets")), name="assets")

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        file_path = os.path.join(frontend_dist, full_path)
        if os.path.exists(file_path) and os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(frontend_dist, "index.html"))
