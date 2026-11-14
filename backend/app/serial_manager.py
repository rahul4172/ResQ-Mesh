"""
Serial connection manager for ResQ-Mesh RX ESP32.
Handles port detection, safe background reading, raw byte logging,
reconnection, and event pipeline integration.
"""
import threading
import time
import os
import logging
from typing import List, Optional, Callable
import serial
import serial.tools.list_ports
from .schemas import ConnectionState, SerialPortInfo
from .parser import RxSerialParser
from .storage import StorageManager

logger = logging.getLogger("resq_mesh.serial")


class SerialManager:
    def __init__(self, parser: RxSerialParser, storage: StorageManager, on_event_callback: Callable):
        self.parser = parser
        self.storage = storage
        self.on_event_callback = on_event_callback

        self.state = ConnectionState()
        self._serial: Optional[serial.Serial] = None
        self._reader_thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._lock = threading.Lock()

        # Raw log file
        self.raw_log_path = "backend/logs/serial_raw.log"
        os.makedirs(os.path.dirname(self.raw_log_path), exist_ok=True)

    def list_ports(self) -> List[SerialPortInfo]:
        """Scans and returns all available system COM / Serial ports."""
        ports = serial.tools.list_ports.comports()
        port_list = []
        for p in ports:
            port_list.append(SerialPortInfo(
                port=p.device,
                description=p.description or "Unknown Serial Device",
                hwid=p.hwid or ""
            ))
        return port_list

    def connect(self, port: str, baud_rate: int = 115200) -> bool:
        """Connects to a physical Serial port in a separate reading thread."""
        with self._lock:
            if self.state.is_connected and self._serial and self._serial.is_open:
                if self.state.port == port:
                    return True
                self.disconnect()

            try:
                logger.info(f"Connecting to {port} at {baud_rate} baud...")
                self._serial = serial.Serial(
                    port=port,
                    baudrate=baud_rate,
                    timeout=1.0,
                    bytesize=serial.EIGHTBITS,
                    parity=serial.PARITY_NONE,
                    stopbits=serial.STOPBITS_ONE,
                )
                self._stop_event.clear()
                self._reader_thread = threading.Thread(target=self._read_loop, daemon=True, name="SerialReader")
                self._reader_thread.start()

                self.state.is_connected = True
                self.state.is_simulated = False
                self.state.port = port
                self.state.baud_rate = baud_rate
                self.state.error = None
                self.state.last_activity = time.time()
                logger.info(f"Successfully connected to {port}")
                return True
            except Exception as e:
                err_msg = f"Failed to open port {port}: {str(e)}"
                logger.error(err_msg)
                self.state.is_connected = False
                self.state.error = err_msg
                return False

    def disconnect(self):
        """Disconnects and terminates the background reading thread."""
        with self._lock:
            self._stop_event.set()
            if self._serial:
                try:
                    self._serial.close()
                except Exception as e:
                    logger.warning(f"Error closing serial port: {e}")
                self._serial = None

            if self._reader_thread and self._reader_thread.is_alive():
                self._reader_thread.join(timeout=2.0)
            self._reader_thread = None

            self.state.is_connected = False
            self.state.port = None
            logger.info("Serial port disconnected.")

    def _read_loop(self):
        """Continuous background loop safely reading and parsing Serial lines."""
        buffer = bytearray()
        
        while not self._stop_event.is_set():
            if not self._serial or not self._serial.is_open:
                break

            try:
                raw_bytes = self._serial.read(self._serial.in_waiting or 1)
                if not raw_bytes:
                    continue

                self.state.bytes_read += len(raw_bytes)
                self.state.last_activity = time.time()

                # Append raw to disk log
                try:
                    with open(self.raw_log_path, "ab") as f:
                        f.write(raw_bytes)
                except Exception as log_err:
                    logger.debug(f"Raw logging error: {log_err}")

                buffer.extend(raw_bytes)

                # Process complete lines
                while b"\n" in buffer:
                    line_end_idx = buffer.index(b"\n")
                    line_bytes = buffer[:line_end_idx + 1]
                    del buffer[:line_end_idx + 1]

                    # Safe decode
                    line_str = line_bytes.decode("utf-8", errors="replace").strip("\r\n")
                    if not line_str:
                        continue

                    self.state.lines_read += 1
                    self._process_line(line_str, is_simulated=False)

            except serial.SerialException as se:
                logger.error(f"Serial hardware disconnect/error: {se}")
                self.state.error = f"Hardware read error: {se}"
                self.state.is_connected = False
                break
            except Exception as e:
                logger.error(f"Unexpected error in serial read loop: {e}")
                time.sleep(0.1)

        self.state.is_connected = False

    def _process_line(self, line: str, is_simulated: bool):
        """Feeds line to parser, saves to storage, and dispatches events."""
        events = self.parser.parse_line(line, is_simulated=is_simulated)
        for event_type, model in events:
            # Save recognized events to DB
            if event_type.value == "gps":
                self.storage.save_gps(model)
            elif event_type.value == "status_report":
                self.storage.save_packet_stats(model)
            elif event_type.value == "raw_log":
                self.storage.save_raw_log(model)
            elif event_type.value == "warning":
                self.storage.save_warning(model)

            # Callback into websocket / app notification
            self.on_event_callback(event_type.value, model)
