"""
Entrypoint to run the ResQ-Mesh FastAPI backend server.
"""
import uvicorn

if __name__ == "__main__":
    uvicorn.run("backend.app.main:app", host="127.0.0.1", port=8000, reload=False)
