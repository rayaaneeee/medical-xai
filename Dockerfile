FROM python:3.11-slim

WORKDIR /app

# System deps for OpenCV + Pillow
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 libgl1-mesa-glx libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Install PyTorch CPU-only first (much smaller, no CUDA needed on HF free tier)
RUN pip install --no-cache-dir \
    torch==2.2.0+cpu torchvision==0.17.0+cpu \
    --index-url https://download.pytorch.org/whl/cpu

# Install remaining dependencies
COPY requirements_deploy.txt .
RUN pip install --no-cache-dir -r requirements_deploy.txt

# Copy application
COPY src/        src/
COPY web/        web/
COPY checkpoints/ checkpoints/
COPY server.py   .

# HuggingFace Spaces expects port 7860
ENV PORT=7860
EXPOSE 7860

CMD ["python", "-m", "uvicorn", "server:app", "--host", "0.0.0.0", "--port", "7860"]
