FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080

WORKDIR /app

# Install dependencies first for better layer caching
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

# Copy app source
COPY backend /app/backend
COPY frontend /app/frontend

EXPOSE 8080

# Start the FastAPI app
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080", "--app-dir", "backend"]
