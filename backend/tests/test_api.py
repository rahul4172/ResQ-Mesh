import pytest
from fastapi.testclient import TestClient
from backend.app.main import app


def test_api_status_endpoint():
    with TestClient(app) as client:
        response = client.get("/api/status")
        assert response.status_code == 200
        data = response.json()
        assert "connection" in data
        assert "is_connected" in data["connection"]
        assert "database_records_count" in data


def test_api_ports_endpoint():
    with TestClient(app) as client:
        response = client.get("/api/ports")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)


def test_api_simulation_lifecycle():
    with TestClient(app) as client:
        # Start simulation
        start_res = client.post("/api/simulation/start")
        assert start_res.status_code == 200
        assert start_res.json()["success"] is True

        # Check status shows connected & simulated
        status_res = client.get("/api/status")
        assert status_res.status_code == 200
        status_data = status_res.json()
        assert status_data["connection"]["is_simulated"] is True
        assert status_data["connection"]["is_connected"] is True

        # Stop simulation
        stop_res = client.post("/api/simulation/stop")
        assert stop_res.status_code == 200
        assert stop_res.json()["success"] is True


def test_api_history_endpoints():
    with TestClient(app) as client:
        gps_res = client.get("/api/gps/history")
        assert gps_res.status_code == 200
        assert isinstance(gps_res.json(), list)

        packets_res = client.get("/api/packets/history")
        assert packets_res.status_code == 200
        assert isinstance(packets_res.json(), list)

        logs_res = client.get("/api/logs/raw")
        assert logs_res.status_code == 200
        assert isinstance(logs_res.json(), list)
