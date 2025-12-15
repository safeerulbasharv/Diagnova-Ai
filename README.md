# Diagnova AI 🩺🤖

Diagnova AI is an AI-powered medical diagnosis platform combining
machine learning, radiology image analysis, OCR, and doctor chat.

## Features
- Disease prediction (Diabetes, Heart, Kidney)
- Radiology image analysis (MedMNIST)
- OCR medical report extraction
- Doctor chat interface
- FastAPI backend + React frontend

## Tech Stack
- Backend: FastAPI, Python, PyTorch, Scikit-learn
- Frontend: React, Vite
- Database: SQLite
- ML: CNN (ResNet18), ML classifiers

## Run Backend
```bash
cd backend
python -m venv .venv
venv\Scripts\activate
python train_auto.py
python train_medmnist_cpu.py
pip install -r requirements.txt
uvicorn main:app --reload
```

## Run Frontend
```bash
cd frontend
npm install
npm start
```
