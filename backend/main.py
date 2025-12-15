# main.py — Backend (FastAPI) — Optimized with LLM Stability Fixes (FULL VERSION)

# =========================
# Standard Library
# =========================
import os
import io
import json
import subprocess
import re
import time
import threading
import logging
import random
import concurrent.futures
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List
from collections import defaultdict, deque
from concurrent.futures import ThreadPoolExecutor, as_completed

# =========================
# Third-Party Utilities
# =========================
import pandas as pd
import joblib
import pytesseract
from pytesseract import Output

# =========================
# Environment Variables
# =========================
from dotenv import load_dotenv
load_dotenv()

# =========================
# FastAPI
# =========================
from fastapi import (
    FastAPI,
    HTTPException,
    UploadFile,
    File,
    Form,
    Header,
    Depends
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

# =========================
# Pydantic
# =========================
from pydantic import BaseModel

# =========================
# Image Processing
# =========================
from PIL import Image

# =========================
# PDF → Image (Optional)
# =========================
try:
    from pdf2image import convert_from_bytes
    PDF2IMAGE_AVAILABLE = True
except Exception:
    PDF2IMAGE_AVAILABLE = False

# =========================
# Machine Learning (PyTorch)
# =========================
import torch
import torch.nn.functional as F
from torch import nn
from torchvision import transforms, models

# =========================
# Database (SQLAlchemy 2.x)
# =========================
from sqlalchemy import (
    create_engine,
    Integer,
    String,
    Float,
    DateTime,
    Text,
    select
)
from sqlalchemy.orm import (
    sessionmaker,
    DeclarativeBase,
    mapped_column,
    Mapped
)

# =========================
# PDF EXPORT (ReportLab)
# =========================
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    Image as RLImage,
    HRFlowable
)
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_RIGHT, TA_LEFT
from reportlab.lib import colors
from reportlab.graphics.shapes import Drawing, Rect, Line

# =========================
# Authentication & Security
# =========================
from passlib.context import CryptContext
from jose import jwt, JWTError


# Timezone (IST) helper
import pytz
IST = pytz.timezone("Asia/Kolkata")


def now_ist() -> datetime:
    """Return timezone-aware current time in IST."""
    return datetime.now(IST)


# ---------------- CONFIG ----------------
DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./app.db")
# Keep last 6 turns (user+assistant = 12 lines)
DOCTOR_CHAT_MEMORY = defaultdict(lambda: deque(maxlen=12))
MODEL_PATH = os.environ.get("MODEL_PATH", "./models/disease_classifier.joblib")
MODELS_DIR = os.environ.get("MODELS_DIR", "./models")
SECRET_KEY = os.getenv("SECRET_KEY") or "fallback-insecure-key"
# set a strong value in prod
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES", 60 * 24 * 7))  # default 7 days

# ---------------- LLM CONFIG (Option B Recommended) ----------------
LLM_MODEL = "llama3.2:1b"   # Faster & stable
LLM_TIMEOUT = 40            # Increased from 30 → prevent timeouts for slower responses
LLM_MAX_RETRIES = 1         # Reduced retries to prevent cascading timeouts
LLM_RETRY_DELAY = 2
MAX_WORKERS = 2

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ============================================================
#                       DATABASE MODELS
# ============================================================
class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_ist)


class PredictionLog(Base):
    __tablename__ = "prediction_logs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    disease_type: Mapped[str] = mapped_column(String(50))
    input_values: Mapped[str] = mapped_column(Text)
    risk_label: Mapped[str] = mapped_column(String(50))
    risk_score: Mapped[float] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_ist)


engine = create_engine(DATABASE_URL, echo=False, future=True)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False, future=True)
Base.metadata.create_all(bind=engine)

# ============================================================
#                       AUTH HELPERS
# ============================================================
def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    return pwd_context.verify(password, hashed)


def create_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create JWT token with IST-aware expiry."""
    to_encode = data.copy()
    expire = now_ist() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None


def label_from_score(score: float) -> str:
    return "High" if score >= 0.66 else "Medium" if score >= 0.33 else "Low"
# ============================================================
#               LLM ENGINE — RETRY, TIMEOUT, FALLBACK
# ============================================================
def llm_with_retry(prompt: str, timeout: int = LLM_TIMEOUT) -> str:
    """Run LLM with retry, timeout, and failure protection."""
    for attempt in range(LLM_MAX_RETRIES):
        try:
            # For Windows, we need to handle encoding properly
            env = os.environ.copy()
            env['PYTHONIOENCODING'] = 'utf-8'
            
            # Use a simpler, faster prompt for the model
            r = subprocess.run(
                ["ollama", "run", LLM_MODEL, prompt],
                capture_output=True,
                text=True,
                encoding='utf-8',
                errors='replace',  # Replace undecodable characters
                timeout=timeout,
                env=env
            )

            if r.returncode == 0 and r.stdout.strip():
                # Clean up any problematic characters
                output = r.stdout.strip()
                # Remove any non-printable or problematic characters
                output = re.sub(r'[^\x20-\x7E\u00A0-\u024F\u0400-\u04FF]+', ' ', output)  # Keep common Unicode ranges
                output = re.sub(r'\s+', ' ', output).strip()  # Normalize whitespace
                return output

            print(f"⚠️ LLM attempt {attempt+1} failed, rc={r.returncode}")

        except subprocess.TimeoutExpired:
            print(f"⏳ LLM timeout (attempt {attempt+1}): {prompt[:50]}...")
            return ""  # Return empty string for timeout
        except UnicodeDecodeError as e:
            print(f"💥 Unicode error (attempt {attempt+1}): {e}")
            if attempt < LLM_MAX_RETRIES - 1:
                time.sleep(LLM_RETRY_DELAY)
            else:
                return ""
        except Exception as e:
            print(f"💥 LLM error (attempt {attempt+1}): {type(e).__name__}: {e}")
            if attempt < LLM_MAX_RETRIES - 1:
                time.sleep(LLM_RETRY_DELAY)
            else:
                return ""

    return ""


def safe_llm_list(prompt: str, n: int = 5) -> List[str]:
    """Return parsed LLM output list or empty list."""
    txt = llm_with_retry(prompt, timeout=LLM_TIMEOUT)
    if not txt:
        return []

    items = []
    for line in txt.splitlines():
        line = line.strip()
        if not line:
            continue

        # Remove bullets, numbers, formatting
        line = re.sub(r"^[0-9\)\.\-\*\•\]]+\s*", "", line).strip()

        if len(line) > 2:
            # Clean the line
            line = re.sub(r'[^\x20-\x7E\u00A0-\u024F\u0400-\u04FF]+', ' ', line)
            line = re.sub(r'\s+', ' ', line).strip()
            items.append(line)

    return items[:n]


# ============================================================
#                   FALLBACK CONTENT (UNCHANGED)
# ============================================================
def get_fallback_content(key: str, disease: str, risk: str) -> List[str]:
    disease_lower = disease.lower()

    generic = {
        "symptoms": [
            "Increased thirst",
            "Frequent urination",
            "Fatigue",
            "Blurred vision",
            "Slow healing"
        ],
        "recommendations": [
            "Monitor regularly",
            "Maintain healthy diet",
            "Exercise regularly",
            "Consult doctor",
            "Stay hydrated"
        ],
        "diet_plan": [
            "Eat more vegetables",
            "Reduce sugar intake",
            "Choose whole grains",
            "Limit processed foods",
            "Stay hydrated"
        ],
        "exercise_plan": [
            "30 min daily walking",
            "Strength training twice/week",
            "Yoga for flexibility",
            "Breathing exercises",
            "Light cardio"
        ]
    }

    disease_specific = {
        "diabetes": {
            "symptoms": [
                "Excessive thirst",
                "Frequent urination",
                "Increased hunger",
                "Fatigue",
                "Unexplained weight loss"
            ],
            "recommendations": [
                "Monitor blood sugar daily",
                "Follow diabetic meal plan",
                "Regular foot checkups",
                "Take prescribed medication",
                "Annual eye examination"
            ],
            "diet_plan": [
                "Low glycemic index foods",
                "Reduce high-carb intake",
                "Increase fiber",
                "Avoid sugary drinks",
                "Prefer whole grains"
            ],
            "exercise_plan": [
                "Brisk walking 30 minutes",
                "Cycling",
                "Swimming",
                "Strength training",
                "Yoga for stress"
            ]
        },

        "heartdisease": {
            "symptoms": [
                "Chest pain",
                "Shortness of breath",
                "Neck or jaw pain",
                "Fatigue",
                "Nausea"
            ],
            "recommendations": [
                "Reduce sodium intake",
                "Monitor BP regularly",
                "Avoid saturated fats",
                "Manage stress",
                "Take medications on schedule"
            ],
            "diet_plan": [
                "Increase fruits & vegetables",
                "Consume omega-3 foods",
                "Avoid fried foods",
                "Limit red meat",
                "Choose lean proteins"
            ],
            "exercise_plan": [
                "Light aerobic exercises",
                "Daily walking",
                "Stretching",
                "Breathing exercises",
                "Meditation"
            ]
        },

        "kidney": {
            "symptoms": [
                "Swelling in legs",
                "Weakness",
                "Shortness of breath",
                "Itching",
                "Changes in urination"
            ],
            "recommendations": [
                "Limit sodium",
                "Control fluid intake",
                "Follow renal diet",
                "Monitor kidney tests",
                "Take meds regularly"
            ],
            "diet_plan": [
                "Limit phosphorus-rich foods",
                "Reduce potassium intake",
                "Moderate protein consumption",
                "Avoid salty snacks",
                "Stay hydrated cautiously"
            ],
            "exercise_plan": [
                "Gentle walking",
                "Stretching",
                "Tai chi",
                "Low-impact aerobics",
                "Breathing exercises"
            ]
        }
    }

    if disease_lower in disease_specific:
        return disease_specific[disease_lower].get(key, generic.get(key, []))

    return generic.get(key, ["Information not available"])


# ============================================================
#         PARALLEL LLM CONTENT GENERATION (FAST & SAFE)
# ============================================================
def generate_all_content_parallel(disease: str, risk: str) -> Dict[str, List[str]]:
    results = {
        "symptoms": [],
        "recommendations": [],
        "diet_plan": [],
        "exercise_plan": []
    }

    tasks = [
                ("symptoms", f"List 3 symptoms of {disease}.Each symptom must be one short sentence (max 12 words).\nNo explanations.", 3),
        ("recommendations", f"Give 2 health tips for {disease} (risk: {risk}).Each health tips must be one short sentence (max 12 words).\nNo explanations.", 2),
        ("diet_plan", f"List 3 diet recommendations for {disease}.Each diet recommendations must be one short sentence (max 12 words).\nNo explanations.", 3),
        ("exercise_plan", f"List 3 exercises for {disease}.Each exercises must be one short sentence (max 12 words).\nNo explanations.", 3)
    ]

    success = 0
    fail = 0

    # Use shorter individual timeouts for better control
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        future_map = {}
        for key, prompt, n in tasks:
            future = ex.submit(safe_llm_list, prompt, n)
            future_map[future] = key

        # Process results as they complete, with individual timeout
        for future in list(future_map.keys()):
            key = future_map[future]
            try:
                result = future.result(timeout=25)  # Individual timeout per task
                if result:
                    results[key] = result
                    success += 1
                    print(f"✓ LLM generated {key}")
                else:
                    results[key] = get_fallback_content(key, disease, risk)
                    fail += 1
                    print(f"⚠ fallback used for {key}")
            except concurrent.futures.TimeoutError:
                results[key] = get_fallback_content(key, disease, risk)
                fail += 1
                print(f"⏳ timeout for {key}")
            except Exception as e:
                results[key] = get_fallback_content(key, disease, risk)
                fail += 1
                print(f"⚠ error generating {key}: {type(e).__name__}: {e}")

    print(f"📊 LLM Summary: Success={success}/4, Fallbacks={fail}/4")
    if fail == 4:
        print("🚨 All LLM calls failed!")

    return results


# ============================================================
#                   OLLAMA HEALTH CHECKER
# ============================================================
def check_ollama_health() -> bool:
    """Returns True only if Ollama is running and model exists."""
    try:
        env = os.environ.copy()
        env['PYTHONIOENCODING'] = 'utf-8'
        
        r = subprocess.run(
            ["ollama", "list"],
            capture_output=True,
            text=True,
            encoding='utf-8',
            errors='replace',
            timeout=5,
            env=env
        )
        if r.returncode != 0:
            print("⚠ Ollama list returned error")
            return False

        if LLM_MODEL in r.stdout:
            print(f"✓ Ollama OK — model {LLM_MODEL} found")
            return True

        print(f"⚠ Model {LLM_MODEL} not found in ollama list")
        return False

    except subprocess.TimeoutExpired:
        print("⚠ Ollama health check timeout")
        return False
    except FileNotFoundError:
        print("❌ Ollama binary not found")
        return False
    except Exception as e:
        print(f"❌ Ollama health check failed: {type(e).__name__}: {e}")
        return False


# ============================================================
#                   MODEL PRELOADING
# ============================================================
def preload_model():
    print("\n============================================================")
    print(f"🔥 Preloading LLM model: {LLM_MODEL}")
    print("============================================================")

    if not check_ollama_health():
        print("⚠ Skipping warm-up (Ollama unhealthy)")
        return

    try:
        env = os.environ.copy()
        env['PYTHONIOENCODING'] = 'utf-8'
        
        warm = subprocess.run(
            ["ollama", "run", LLM_MODEL, "Say OK"],
            capture_output=True,
            text=True,
            encoding='utf-8',
            errors='replace',
            timeout=10,
            env=env
        )
        if warm.returncode == 0:
            print("✓ Model warmed:", warm.stdout.strip()[:50])
        else:
            print("⚠ Warm-up returned error")
    except Exception as e:
        print(f"⚠ Warm-up exception: {type(e).__name__}: {e}")

    print("============================================================\n")


preload_model()


# ============================================================
#          BACKGROUND OLLAMA MONITOR — NON-BLOCKING
# ============================================================
def monitor_ollama_health():
    """Runs forever — keeps pinging model every 2 minutes."""
    time.sleep(30)
    n = 0
    while True:
        try:
            if n % 12 == 0:  # roughly every 24 minutes
                print(f"🔍 Periodic Ollama health check #{n//12+1}")
                check_ollama_health()

            env = os.environ.copy()
            env['PYTHONIOENCODING'] = 'utf-8'
            
            subprocess.run(
                ["ollama", "run", LLM_MODEL, "ping"],
                capture_output=True,
                text=True,
                encoding='utf-8',
                errors='replace',
                timeout=5,
                env=env
            )
        except Exception as e:
            pass
        n += 1
        time.sleep(120)


threading.Thread(target=monitor_ollama_health, daemon=True).start()

# ============================================================
#                       FASTAPI APP + CORS
# ============================================================
app = FastAPI(title="AI Health Backend (Full Version w/ Llama3.2:1b)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # adjust in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def home():
    return {
        "message": "✅ API running — FULL BUILD (Llama3.2:1b, Timeouts Optimized)",
        "llm_model": LLM_MODEL,
        "llm_timeout": LLM_TIMEOUT,
        "status": "ready"
    }


# ============================================================
#                       HEALTH ENDPOINTS
# ============================================================
@app.get("/health/llm")
def llm_health():
    """Check if LLM engine is healthy."""
    ok = check_ollama_health()

    return {
        "status": "healthy" if ok else "unhealthy",
        "model": LLM_MODEL,
        "timestamp": now_ist().isoformat()
    }


@app.get("/health/full")
def full_health():
    """Check DB + ML model + LLM."""
    llm_ok = check_ollama_health()
    db_ok = False
    model_ok = False

    # Database health
    try:
        with SessionLocal() as db:
            db.execute(select(1))
            db_ok = True
    except Exception:
        db_ok = False

    # ML model
    try:
        if os.path.exists(MODEL_PATH):
            joblib.load(MODEL_PATH)
            model_ok = True
    except Exception:
        model_ok = False

    overall = llm_ok and db_ok and model_ok

    return {
        "status": "healthy" if overall else "degraded",
        "components": {
            "llm": "healthy" if llm_ok else "unhealthy",
            "database": "healthy" if db_ok else "unhealthy",
            "ml_model": "healthy" if model_ok else "unhealthy",
        },
        "timestamp": now_ist().isoformat()
    }


# ============================================================
#               REQUEST BODY MODELS
# ============================================================
class PredictRequest(BaseModel):
    age: float
    gender: int
    glucose: float
    bmi: float
    systolic_bp: float
    diastolic_bp: float
    cholesterol: float
    creatinine: float


class ChatRequest(BaseModel):
    message: str


class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


# ============================================================
#                        AUTH ROUTES
# ============================================================
@app.post("/register")
def register(req: RegisterRequest):
    with SessionLocal() as db:
        exists = db.query(User).filter(User.email == req.email).first()
        if exists:
            raise HTTPException(status_code=400, detail="Email already registered")

        user = User(
            name=req.name,
            email=req.email,
            password_hash=hash_password(req.password)
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        return {"message": "User registered", "user": {"id": user.id, "email": user.email}}


@app.post("/login")
def login(req: LoginRequest):
    with SessionLocal() as db:
        user = db.query(User).filter(User.email == req.email).first()

        if not user or not verify_password(req.password, user.password_hash):
            raise HTTPException(status_code=401, detail="Invalid email or password")

        token = create_token({"id": user.id, "email": user.email})

        return {
            "access_token": token,
            "token_type": "bearer",
            "user": {"id": user.id, "name": user.name, "email": user.email}
        }


# Dependency: extract the user from authorization header
def get_current_user(authorization: Optional[str] = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")

    if not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Invalid token format")

    token = authorization.split(" ", 1)[1].strip()
    decoded = decode_token(token)

    if not decoded:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user_id = decoded.get("id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    with SessionLocal() as db:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user


def get_doctor_suggestions(disease: str) -> List[str]:
    doctors = {
        "kidney": ["Dr. Vivek Nair — Nephrologist", "Dr. Aarthi Menon — Renal Specialist"],
        "heartdisease": ["Dr. Rajesh Kumar — Cardiologist", "Dr. Sneha Thomas — Heart Specialist"],
        "diabetes": ["Dr. Anjali Verma — Endocrinologist", "Dr. Rohit Kapoor — Diabetologist"],
    }
    return doctors.get(disease.lower(), [])


# ============================================================
#                 PREDICT AUTO (MAIN ML → LLM PIPELINE)
# ============================================================
@app.post("/predict_auto")
def predict_auto(
    data: PredictRequest,
    current: User = Depends(get_current_user)
):
    print(f"\n🔍 Starting prediction for {current.email}")
    start_time = time.time()

    if not os.path.exists(MODEL_PATH):
        raise HTTPException(status_code=500, detail="ML Model not trained. Run train_auto.py")

    try:
        bundle = joblib.load(MODEL_PATH)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed loading model: {e}")

    pipe = bundle.get("pipeline")
    feats = bundle.get("features")
    labels = bundle.get("labels")

    if not pipe or not feats or labels is None:
        raise HTTPException(status_code=500, detail="Model bundle missing required keys")

    row = pd.DataFrame([data.dict()], columns=feats).fillna(0)

    try:
        probs = pipe.predict_proba(row)[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {e}")

    best_idx = int(probs.argmax())
    disease = labels[best_idx]
    risk_score = float(probs[best_idx])
    risk_label = label_from_score(risk_score)

    ml_time = time.time() - start_time
    print(f"✓ ML Prediction: {disease} ({risk_label}) in {ml_time:.1f}s")

    print("🤖 Checking LLM health...")
    if not check_ollama_health():
        print("⚠ LLM unhealthy — using fallback only")
        llm_content = {
            "symptoms": get_fallback_content("symptoms", disease, risk_label),
            "recommendations": get_fallback_content("recommendations", disease, risk_label),
            "diet_plan": get_fallback_content("diet_plan", disease, risk_label),
            "exercise_plan": get_fallback_content("exercise_plan", disease, risk_label),
        }
        llm_time = 0
    else:
        print("🤖 LLM generating content...")
        llm_start = time.time()
        try:
            llm_content = generate_all_content_parallel(disease, risk_label)
        except Exception as e:
            print(f"💥 LLM generation failed: {e}")
            # Use fallback content if LLM generation completely fails
            llm_content = {
                "symptoms": get_fallback_content("symptoms", disease, risk_label),
                "recommendations": get_fallback_content("recommendations", disease, risk_label),
                "diet_plan": get_fallback_content("diet_plan", disease, risk_label),
                "exercise_plan": get_fallback_content("exercise_plan", disease, risk_label),
            }
        llm_time = time.time() - llm_start
        print(f"✓ LLM generation finished in {llm_time:.1f}s")

    # Save prediction — best effort
    try:
        with SessionLocal() as db:
            log = PredictionLog(
                disease_type=disease,
                input_values=json.dumps(data.dict()),
                risk_label=risk_label,
                risk_score=risk_score,
            )
            db.add(log)
            db.commit()
    except Exception as e:
        print("⚠ DB logging failed:", e)

    total_time = time.time() - start_time
    print(f"✅ Total time: {total_time:.1f}s")

    return {
        "disease_type": disease,
        "risk_label": risk_label,
        "risk_score": round(risk_score, 4),
        "symptoms": llm_content["symptoms"],
        "recommendations": llm_content["recommendations"],
        "diet_plan": llm_content["diet_plan"],
        "exercise_plan": llm_content["exercise_plan"],
        "sleep_tips": [
            "Maintain a consistent sleep schedule.",
            "Avoid screens 1 hour before bed.",
            "Ensure bedroom is dark and cool.",
            "Avoid heavy meals before bed.",
        ],
        "reminders": [
            "Drink water regularly",
            "Take medicines on time",
            "Monitor BP",
            "Track symptoms",
            "Monthly check-up recommended",
        ],
        "doctor_suggestions": get_doctor_suggestions(disease),
        "performance_metrics": {
            "ml_prediction_time": round(ml_time, 2),
            "llm_generation_time": round(llm_time, 2),
            "total_time": round(total_time, 2),
            "llm_model": LLM_MODEL,
            "llm_timeout_used": LLM_TIMEOUT,
        },
    }


# ============================================================
#                   DOCTOR CHAT (Protected)
# ============================================================
@app.post("/doctor_chat")
def doctor_chat(body: ChatRequest, current: User = Depends(get_current_user)):
    print(f"💬 Doctor chat request: {body.message[:40]}...")

    if not check_ollama_health():
        return {
            "reply": "The AI medical assistant is currently unavailable. Please try again later or consult your doctor."
        }

    prompt = body.message.strip()
    user_id = current.id

    history = DOCTOR_CHAT_MEMORY[user_id]
    history_text = "\n".join(history)

    medical_prompt = f"""You are a medical information assistant.

Rules:
- Provide GENERAL medical information only
- You may explain common over-the-counter medicines at a high level
- Do NOT give dosage, prescriptions, or personalized treatment
- Do NOT diagnose conditions
- Always recommend consulting a doctor for persistent or severe symptoms

Conversation so far:
{history_text}

Patient question:
{prompt}

Answer briefly, clearly, and safely.
"""

    try:
        reply = llm_with_retry(medical_prompt, timeout=45)

        if not reply or reply.strip() == "":
            reply = (
                "I understand your concern. "
                "For accurate medical advice, please consult a healthcare professional."
            )

        reply = reply.strip()

        history.append(f"Patient: {prompt}")
        history.append(f"Assistant: {reply}")

    except Exception as e:
        print(f"💥 Doctor chat exception: {type(e).__name__}: {e}")
        reply = (
            "I’m having trouble responding right now. "
            "Please try again or consult a healthcare professional."
        )

    return {"reply": reply}


# ============================================================
#              CLEAR DOCTOR CHAT (Protected)
# ============================================================
@app.post("/doctor_chat/clear")
def clear_doctor_chat(current: User = Depends(get_current_user)):
    DOCTOR_CHAT_MEMORY.pop(current.id, None)
    return {"message": "Doctor chat history cleared"}

# ============================================================
#        DOCTOR INTERPRETATION (STATELESS — RADIology)
# ============================================================
@app.post("/doctor_interpretation")
def doctor_interpretation(body: ChatRequest, current: User = Depends(get_current_user)):
    print(f"🩺 Doctor interpretation request")

    if not check_ollama_health():
        return {
            "reply": "The AI assistant is currently unavailable. Please consult a clinician."
        }

    # HARD system guardrail — prevents history & dataset mixing
    system_prompt = (
        "SYSTEM: You are a medical assistant providing a NON-DIAGNOSTIC interpretation "
        "for a SINGLE medical image. "
        "Do NOT reference any previous conversations, datasets, images, or cases. "
        "Only discuss the dataset explicitly provided below."
    )

    final_prompt = f"{system_prompt}\n\n{body.message.strip()}"

    reply = llm_with_retry(final_prompt, timeout=45)

    if not reply or not reply.strip():
        reply = (
            "No interpretation could be generated. "
            "Please consult a qualified healthcare professional."
        )

    return {"reply": reply.strip()}


# ============================================================
#                RADIOLOGY PREDICT (Protected)
# ============================================================
def load_radiology_meta(dataset: str):
    path = os.path.join(MODELS_DIR, f"radiology_meta_{dataset}.joblib")
    if not os.path.exists(path):
        raise HTTPException(status_code=400, detail=f"Missing meta file: {path}")
    return joblib.load(path)


def load_radiology_model(dataset: str, num_classes: int):
    path = os.path.join(MODELS_DIR, f"radiology_resnet18_{dataset}_cpu.pth")
    if not os.path.exists(path):
        raise HTTPException(status_code=400, detail=f"Missing model file: {path}")

    model = models.resnet18(weights=None)
    model.fc = nn.Linear(model.fc.in_features, num_classes)

    state = torch.load(path, map_location="cpu", weights_only=False)
    model.load_state_dict(state)
    model.eval()

    return model


radiology_tf = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.Grayscale(num_output_channels=3),
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406],
                         [0.229, 0.224, 0.225])
])


@app.post("/radiology_predict")
async def radiology_predict(
    file: UploadFile = File(...),
    dataset: str = Form(...),
    current: User = Depends(get_current_user)
):
    allowed = {"pneumoniamnist", "bloodmnist", "retinamnist", "dermamnist"}
    if dataset not in allowed:
        raise HTTPException(status_code=400, detail=f"Dataset must be one of: {allowed}")

    meta = load_radiology_meta(dataset)
    classes = meta.get("classes", [])
    if not classes:
        raise HTTPException(status_code=500, detail="No classes found in meta")

    model = load_radiology_model(dataset, len(classes))

    content = await file.read()

    try:
        img = Image.open(io.BytesIO(content)).convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image: {e}")

    tensor = radiology_tf(img).unsqueeze(0)
    with torch.no_grad():
        logits = model(tensor)
        probs = F.softmax(logits, dim=1)[0].tolist()

    best = int(torch.argmax(logits))
    result = {
        "dataset": dataset,
        "predicted_label": classes[best],
        "probabilities": {classes[i]: round(float(probs[i]), 4) for i in range(len(classes))},
        "val_accuracy": meta.get("val_acc"),
        "trained_at": meta.get("trained_at")
    }

    return result


# ============================================================
#                        OCR EXTRACTION
# ============================================================
def extract_text(image: Image.Image) -> str:
    try:
        return pytesseract.image_to_string(image)
    except Exception as e:
        print("OCR text extraction failed:", e)
        return ""


def extract_text_with_data(image: Image.Image) -> Dict[str, Any]:
    try:
        return pytesseract.image_to_data(image, output_type=Output.DICT)
    except Exception as e:
        print("OCR (data) extraction failed:", e)
        return {"text": [], "conf": []}


def avg_confidence_for_token(data_dict: Dict[str, Any], token: str) -> Optional[float]:
    if not data_dict:
        return None

    confs = []
    for t, c in zip(data_dict.get("text", []), data_dict.get("conf", [])):
        if not t:
            continue

        cleaned = re.sub(r"[^\d\.]", "", t)
        if cleaned == token:
            try:
                val = float(c)
                if val >= 0:
                    confs.append(val)
            except:
                pass

    if not confs:
        return None

    return sum(confs) / len(confs) / 100.0  # convert to 0–1


def parse_values_with_confidence_from_text(text: str, data_dict: Dict[str, Any]):
    raw = (text or "").lower()

    patterns = {
        "glucose": r"glucose[^0-9\-\.]*?(\d+\.?\d*)",
        "cholesterol": r"cholesterol[^0-9\-\.]*?(\d+\.?\d*)",
        "creatinine": r"creatinine[^0-9\-\.]*?(\d+\.?\d*)",
        "bmi": r"\bbmi[^0-9\-\.]*?(\d+\.?\d*)",
        "systolic_bp": r"(systolic|sbp)[^\d]*?(\d{2,3})",
        "diastolic_bp": r"(diastolic|dbp)[^\d]*?(\d{2,3})",
        "bp_pair": r"(\d{2,3})\s*/\s*(\d{2,3})",
        "age": r"(?:age|aged)[^\d]{0,5}(\d{1,3})|\b(\d{1,3})\s*(?:years?|yrs?|yr|y)\b"
    }

    result = {}
    simple = {}

    # BP pair
    m = re.search(patterns["bp_pair"], raw)
    if m:
        s, d = m.group(1), m.group(2)
        sc = avg_confidence_for_token(data_dict, s)
        dc = avg_confidence_for_token(data_dict, d)
        result["systolic_bp"] = {"value": s, "confidence": sc}
        result["diastolic_bp"] = {"value": d, "confidence": dc}
        simple["systolic_bp"] = s
        simple["diastolic_bp"] = d

    # Other patterns
    for key, pattern in patterns.items():
        if key == "bp_pair":
            continue

        m = re.search(pattern, raw)
        if m:
            groups = [g for g in m.groups() if g]
            num = None
            for g in reversed(groups):
                if re.search(r"\d", g):
                    num = re.sub(r"[^\d\.]", "", g)
                    break
            if num:
                conf = avg_confidence_for_token(data_dict, num)
                result[key] = {"value": num, "confidence": conf}
                simple[key] = num

    return {"extracted_values": result, "simple": simple}


@app.post("/ocr_extract")
async def ocr_extract(
    file: UploadFile = File(...),
    current: User = Depends(get_current_user)
):
    content = await file.read()

    # If PDF → convert first page
    if file.filename.lower().endswith(".pdf"):
        if not PDF2IMAGE_AVAILABLE:
            raise HTTPException(status_code=500, detail="pdf2image not installed")
        try:
            page = convert_from_bytes(content, 200)[0]
            image = page
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"PDF conversion failed: {e}")
    else:
        try:
            image = Image.open(io.BytesIO(content)).convert("RGB")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid image: {e}")

    raw_text = extract_text(image)
    data = extract_text_with_data(image)
    parsed = parse_values_with_confidence_from_text(raw_text, data)

    return {
        "raw_text": raw_text,
        "extracted_values": parsed["extracted_values"],
        "extracted_values_simple": parsed["simple"]
    }

# ============================================================
#               ENHANCED PROFESSIONAL PDF REPORT
# ============================================================
def _safe_get(d: dict, k: str, default="N/A"):
    """Helper to safely extract dict values."""
    if not isinstance(d, dict):
        return default
    v = d.get(k)
    return default if v is None else v


def clean_llm_items(items):
    """Clean LLM output items"""
    clean = []
    for x in items or []:
        if not isinstance(x, str):
            continue
        x = x.strip()
        x = re.sub(r"^here are .*?:", "", x, flags=re.I)
        x = re.sub(r"\b\d+\.\s*", "", x)
        x = re.sub(r"^[\-\*\d\.\)\s]+", "", x)
        x = re.sub(r"\s+", " ", x).strip()
        if x:
            clean.append(x)
    return clean


def create_professional_styles():
    """Create enhanced professional styles for the PDF"""
    styles = getSampleStyleSheet()
    
    # Custom Colors
    PRIMARY_COLOR = colors.HexColor("#1a237e")  # Deep blue
    SECONDARY_COLOR = colors.HexColor("#283593")
    ACCENT_COLOR = colors.HexColor("#1565c0")
    SUCCESS_COLOR = colors.HexColor("#2e7d32")
    WARNING_COLOR = colors.HexColor("#f57c00")
    DANGER_COLOR = colors.HexColor("#c62828")
    LIGHT_GRAY = colors.HexColor("#f5f5f5")
    MEDIUM_GRAY = colors.HexColor("#e0e0e0")
    
    # Title Style - use unique name
    styles.add(ParagraphStyle(
        name="ProTitle",
        parent=styles["Title"],
        fontSize=24,
        textColor=PRIMARY_COLOR,
        alignment=TA_CENTER,
        spaceAfter=20,
        fontName="Helvetica-Bold"
    ))
    
    # Header Style - use unique name
    styles.add(ParagraphStyle(
        name="ProSectionHeader",
        parent=styles["Heading2"],
        fontSize=14,
        textColor=SECONDARY_COLOR,
        spaceAfter=8,
        spaceBefore=12,
        fontName="Helvetica-Bold",
        underlineWidth=1,
        underlineColor=ACCENT_COLOR,
        underlineOffset=-2
    ))
    
    # Subheader Style - use unique name
    styles.add(ParagraphStyle(
        name="ProSubHeader",
        parent=styles["Heading3"],
        fontSize=12,
        textColor=ACCENT_COLOR,
        spaceAfter=6,
        fontName="Helvetica-Bold"
    ))
    
    # Normal Text with better spacing - use unique name
    styles.add(ParagraphStyle(
        name="ProBodyText",
        parent=styles["Normal"],
        fontSize=10,
        leading=14,
        spaceAfter=6
    ))
    
    # Small text for disclaimers - use unique name
    styles.add(ParagraphStyle(
        name="ProDisclaimer",
        parent=styles["Normal"],
        fontSize=8,
        textColor=colors.grey,
        leading=10,
        alignment=TA_JUSTIFY
    ))
    
    # Value Style for important numbers - use unique name
    styles.add(ParagraphStyle(
        name="ProValueText",
        parent=styles["Normal"],
        fontSize=11,
        textColor=PRIMARY_COLOR,
        fontName="Helvetica-Bold",
        leading=13
    ))
    
    # Risk Label Styles - use unique names
    styles.add(ParagraphStyle(
        name="ProRiskLow",
        parent=styles["Normal"],
        fontSize=10,
        textColor=SUCCESS_COLOR,
        fontName="Helvetica-Bold",
        backColor=colors.HexColor("#e8f5e9"),
        alignment=TA_CENTER
    ))
    
    styles.add(ParagraphStyle(
        name="ProRiskMedium",
        parent=styles["Normal"],
        fontSize=10,
        textColor=WARNING_COLOR,
        fontName="Helvetica-Bold",
        backColor=colors.HexColor("#fff3e0"),
        alignment=TA_CENTER
    ))
    
    styles.add(ParagraphStyle(
        name="ProRiskHigh",
        parent=styles["Normal"],
        fontSize=10,
        textColor=DANGER_COLOR,
        fontName="Helvetica-Bold",
        backColor=colors.HexColor("#ffebee"),
        alignment=TA_CENTER
    ))
    
    # Add more custom styles with unique names
    styles.add(ParagraphStyle(
        name="HeaderTitle",
        fontSize=16,
        textColor=colors.HexColor("#1a237e"),
        fontName="Helvetica-Bold"
    ))
    
    styles.add(ParagraphStyle(
        name="HeaderSub",
        fontSize=10,
        textColor=colors.grey,
        alignment=TA_RIGHT
    ))
    
    styles.add(ParagraphStyle(
        name="DiagnosisText",
        fontSize=12,
        textColor=PRIMARY_COLOR,
        fontName="Helvetica-Bold"
    ))
    
    styles.add(ParagraphStyle(
        name="RadPred",
        fontSize=10
    ))
    
    styles.add(ParagraphStyle(
        name="Interpretation",
        fontSize=10,
        leading=14,
        alignment=TA_JUSTIFY,
        backColor=colors.HexColor("#f8f9fa"),
        borderPadding=10,
        leftIndent=0,     # 🔥 FIX
        rightIndent=0,    # 🔥 FIX
        spaceBefore=6,
        spaceAfter=8
    ))

    
    styles.add(ParagraphStyle(
        name="ImageCaption",
        fontSize=8,
        textColor=colors.grey
    ))
    
    styles.add(ParagraphStyle(
        name="ImageError",
        fontSize=9,
        textColor=colors.red
    ))
    
    styles.add(ParagraphStyle(
        name="EmptyText",
        fontSize=9,
        textColor=colors.grey,
        fontStyle="italic"
    ))
    
    styles.add(ParagraphStyle(
        name="CardItem",
        fontSize=9,
        leading=12,
        leftIndent=10,
        spaceAfter=4
    ))
    
    styles.add(ParagraphStyle(
        name="NoRadText",
        fontSize=9,
        textColor=colors.grey,
        fontStyle="italic"
    ))
    
    styles.add(ParagraphStyle(
        name="FooterDisclaimer",
        fontSize=7,
        textColor=colors.grey,
        alignment=TA_JUSTIFY,
        leading=9,
        borderPadding=5,
        backColor=colors.HexColor("#fafafa")
    ))
    
    
    return styles, {
        "primary": PRIMARY_COLOR,
        "secondary": SECONDARY_COLOR,
        "accent": ACCENT_COLOR,
        "success": SUCCESS_COLOR,
        "warning": WARNING_COLOR,
        "danger": DANGER_COLOR,
        "light_gray": LIGHT_GRAY,
        "medium_gray": MEDIUM_GRAY
    }

# ============================================================
#              PDF HELPER FUNCTIONS (SAFE STUBS)
# ============================================================

def create_header_with_logo():
    styles = getSampleStyleSheet()
    return Paragraph("Diagnova AI", styles["Title"])


def create_summary_card(report_data, colors_dict, styles):
    diagnosis = report_data.get("disease_type", "N/A")
    risk = report_data.get("risk_label", "N/A")
    return Paragraph(
        f"<b>Disease Detected :</b> {diagnosis}<br/><b>Risk Level : </b> {risk}",
        styles["ProBodyText"]
    )


def create_visual_risk_indicator(score):
    styles = getSampleStyleSheet()
    return Paragraph(f"Risk Score: {score}", styles["Normal"])


def create_recommendation_card(items, title, styles):
    text = "<br/>".join(f"• {i}" for i in items)
    return Paragraph(text, styles["ProBodyText"])


def create_ocr_table(data: dict, styles):
    if not data:
        return Paragraph("No biometric data available.", styles["EmptyText"])

    rows = [["Metric", "Value"]]
    for k, v in data.items():
        rows.append([
            k.replace("_", " ").title(),
            v.get("value", "N/A")
        ])

    table = Table(rows, colWidths=[150, 120, 120])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("FONT", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("ALIGN", (1, 1), (-1, -1), "CENTER"),
    ]))
    return table


def create_radiology_section(rad: dict, colors_dict, styles):
    if not rad:
        return Paragraph("No radiology results available.", styles["NoRadText"])

    label = rad.get("predicted_label", "N/A")
    return Paragraph(
        f"<b>Radiology Prediction:</b> {label}",
        styles["ProBodyText"]
    )

def create_radiology_image_block(
    file: UploadFile,
    styles,
    max_width=400,
    max_height=300
):
    """Safely convert uploaded radiology image into PDF block"""
    if not file:
        return Paragraph("No radiology image provided.", styles["NoRadText"])

    try:
        content = file.file.read()
        img = Image.open(io.BytesIO(content)).convert("RGB")

        # Save to buffer for ReportLab
        img_buffer = io.BytesIO()
        img.save(img_buffer, format="PNG")
        img_buffer.seek(0)

        rl_img = RLImage(img_buffer)

        # Resize while maintaining aspect ratio
        iw, ih = rl_img.drawWidth, rl_img.drawHeight
        scale = min(max_width / iw, max_height / ih, 1)
        rl_img.drawWidth = iw * scale
        rl_img.drawHeight = ih * scale

        return rl_img

    except Exception as e:
        return Paragraph(
            f"Failed to load radiology image.",
            styles["ImageError"]
        )



@app.post("/export_pdf")
async def export_pdf_professional(
    current: User = Depends(get_current_user),
    report: Optional[str] = Form(None),
    radiology_result: Optional[str] = Form(None),
    radiology_image: Optional[UploadFile] = File(None),
    chat_messages: Optional[str] = Form(None),
    ocr_values: Optional[str] = Form(None),
):
    """Enhanced professional PDF generation endpoint"""

    # ---------------- Parse report ----------------
    report_data = {}
    if report:
        try:
            report_data = json.loads(report)
        except Exception:
            try:
                report_data = json.loads(report.replace("'", '"'))
            except Exception:
                report_data = {}

    # ---------------- Detect report type ----------------
    is_radiology_only = bool(radiology_result and not report_data)

    # ---------------- Parse OCR ----------------
    edited_ocr = None
    if ocr_values:
        try:
            edited_ocr = json.loads(ocr_values)
        except Exception:
            edited_ocr = None

    # ---------------- Build PDF ----------------
    buffer = io.BytesIO()
    styles, colors_dict = create_professional_styles()

    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=30,
        leftMargin=30,
        topMargin=40,
        bottomMargin=40,
        title="Diagnova AI",
        author="Health AI System",
        subject="Medical Diagnostic Report",
    )

    story = []

    # ================= HEADER =================
    story.append(create_header_with_logo())
    story.append(Spacer(1, 10))
    story.append(Spacer(1, 15))

    # ================= RADIOLOGY ONLY =================
    if is_radiology_only:
        story.append(Paragraph("RADIOLOGY REPORT", styles["ProTitle"]))
        story.append(Spacer(1, 10))

        rad = {}
        try:
            rad = json.loads(radiology_result)
        except Exception:
            pass

        story.append(create_radiology_section(rad, colors_dict, styles))
        story.append(Spacer(1, 10))

        # 🔹 ADD IMAGE
        story.append(Paragraph("RADIOLOGY IMAGE", styles["ProSubHeader"]))
        story.append(Spacer(1, 6))
        story.append(create_radiology_image_block(radiology_image, styles))
        story.append(Spacer(1, 12))


        interp = rad.get("interpretation", "No interpretation provided.")
        story.append(Paragraph("CLINICAL INTERPRETATION", styles["ProSectionHeader"]))
        story.append(
            Table(
                [[Paragraph(interp, styles["Interpretation"])]],
                colWidths=[doc.width],
                style=[
                    ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8f9fa")),
                    ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#dcdcdc")),
                    ("LEFTPADDING", (0, 0), (-1, -1), 14),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 14),
                    ("TOPPADDING", (0, 0), (-1, -1), 12),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
                ]
            )
        )


    # ================= COMPREHENSIVE =================
    else:
        story.append(Paragraph("COMPREHENSIVE HEALTH REPORT", styles["ProTitle"]))
        story.append(Spacer(1, 15))

        story.append(create_summary_card(report_data, colors_dict, styles))
        story.append(Spacer(1, 10))

        risk_score = report_data.get("risk_score", "0.5")
        story.append(Paragraph("RISK ASSESSMENT", styles["ProSubHeader"]))
        story.append(create_visual_risk_indicator(risk_score))
        story.append(Spacer(1, 15))

        sections = [
            ("Possible Symptoms", report_data.get("symptoms")),
            ("Treatment Recommendations", report_data.get("recommendations")),
            ("Dietary Guidelines", report_data.get("diet_plan")),
            ("Exercise Protocol", report_data.get("exercise_plan")),
            ("Sleep Management", report_data.get("sleep_tips")),
            ("Important Reminders", report_data.get("reminders")),
        ]

        for title, items in sections:
            cleaned = clean_llm_items(items)
            if cleaned:
                story.append(Paragraph(title, styles["ProSubHeader"]))
                story.append(create_recommendation_card(cleaned[:6], title, styles))
                story.append(Spacer(1, 8))

        # OCR Section
        story.append(Paragraph("BIOMETRIC MEASUREMENTS", styles["ProSectionHeader"]))
        story.append(Spacer(1, 8))

        normalized = {}
        if edited_ocr:
            for k, v in edited_ocr.items():
                normalized[k] = {"value": v}
        else:
            for k, v in (report_data.get("extracted_values") or {}).items():
                normalized[k] = {
                    "value": v.get("value", "N/A"),
                }

        story.append(create_ocr_table(normalized, styles))

    # ================= FOOTER =================
    story.append(Spacer(1, 20))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.grey))
    story.append(
        Paragraph(
            "<b>IMPORTANT DISCLAIMER:</b> This AI-generated report is for informational "
            "purposes only and is not a substitute for professional medical advice.",
            styles["FooterDisclaimer"],
        )
    )

    def footer(canvas, doc):
        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(colors.grey)
        canvas.drawString(30, 20, f"Generated: {now_ist().strftime('%Y-%m-%d %H:%M')}")
        canvas.drawRightString(570, 20, f"Page {canvas.getPageNumber()}")

    # ✅ BUILD PDF ONCE
    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    buffer.seek(0)

    filename = "radiology_report.pdf" if is_radiology_only else "health_report.pdf"

    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "X-Report-Type": "radiology-only" if is_radiology_only else "comprehensive",
        },
    )



# ============================================================
#                    FINAL API UTILITIES & ENDPOINTS
# ============================================================

@app.get("/profile")
def profile(current: User = Depends(get_current_user)):
    return {
        "id": current.id,
        "name": current.name,
        "email": current.email,
        "created_at": current.created_at.isoformat()
    }


# ============================================================
#                     FINAL SANITY PRINT
# ============================================================

print("\n=======================================================")
print("  🚀 AI Health Backend (Llama3.2:1b) Loaded Successfully")
print("=======================================================\n")

# ============================================================
#                      SERVER READY MESSAGE
# ============================================================

if __name__ == "__main__":
    print("\n=======================================================")
    print("  🚀 Starting AI Health Backend (FULL BUILD VERSION)")
    print(f"  🧠 LLM Model Loaded: {LLM_MODEL}")
    print(f"  ⏱  Default LLM Timeout: {LLM_TIMEOUT}s")
    print("=======================================================\n")

    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=False
    )


# ============================================================
#                     END OF FILE — main.py
# ============================================================