FROM python:3.10-slim

# Set working directory to /app
WORKDIR /app

# Install system dependencies
# ffmpeg is needed by librosa and fastai audio extensions
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libsm6 \
    libxext6 \
    git \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements file first to cache the pip install step
COPY requirements.txt .

# Install Python packages
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the backend files inside the container
COPY backend/ .

# Ensure the uploads directory exists
RUN mkdir -p /app/uploads

# Expose the default port for Hugging Face Spaces
EXPOSE 7860

# Command to run the FastAPI application
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
