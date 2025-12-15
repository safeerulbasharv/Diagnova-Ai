import os
from datetime import datetime
import numpy as np
import pandas as pd
import joblib

from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import RandomForestClassifier
from sklearn.multiclass import OneVsRestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import roc_auc_score

BASE = os.path.dirname(__file__)
DATA_DIR = os.path.join(BASE, "data")
MODELS_DIR = os.path.join(BASE, "models")
os.makedirs(MODELS_DIR, exist_ok=True)

FEATURES = [
    "age", "gender", "glucose", "bmi",
    "systolic_bp", "diastolic_bp", "cholesterol", "creatinine"
]

def norm(df):
    df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]
    return df

def pick(df, names):
    df = norm(df)
    for n in names:
        if n.lower() in df.columns:
            return df[n.lower()]
    return np.nan

def load_dataset(filename, label, mapping):
    path = os.path.join(DATA_DIR, filename)
    if not os.path.exists(path):
        print(f"Skipping missing dataset: {filename}")
        return pd.DataFrame()
    df = norm(pd.read_csv(path))
    out = {}
    for feat, aliases in mapping.items():
        out[feat] = pick(df, aliases)
    out = pd.DataFrame(out)
    out["label"] = label
    return out

def build_all():
    diabetes = load_dataset(
        "diabetes_cleaned.csv", "Diabetes",
        {
            "age": ["age"],
            "gender": ["gender", "sex"],
            "glucose": ["glucose", "fbs", "glucose_mgdl"],
            "bmi": ["bmi"],
            "systolic_bp": ["systolic_bp", "bp", "trestbps"],
            "diastolic_bp": ["diastolic_bp", "diastolic", "bp"],  # ✅ Fixed mapping
            "cholesterol": ["chol", "cholesterol"],
            "creatinine": ["creatinine", "serum_creatinine", "sc"]
        }
    )

    heart = load_dataset(
        "heart_cleaned.csv", "Heartdisease",
        {
            "age": ["age"],
            "gender": ["sex", "gender"],
            "glucose": ["glucose", "fbs"],
            "bmi": ["bmi"],
            "systolic_bp": ["trestbps", "systolic_bp", "bp"],
            "diastolic_bp": ["diastolic_bp", "diastolic", "bp"],  # ✅ Fixed mapping
            "cholesterol": ["chol", "cholesterol"],
            "creatinine": ["creatinine", "sc", "serum_creatinine"]
        }
    )

    kidney = load_dataset(
        "kidney_cleaned.csv", "Kidney",
        {
            "age": ["age"],
            "gender": ["gender", "sex"],
            "glucose": ["glucose", "bgr", "glucose_mgdl"],
            "bmi": ["bmi"],
            "systolic_bp": ["bp", "systolic_bp", "trestbps"],
            "diastolic_bp": ["diastolic_bp", "diastolic", "bp"],  # ✅ Fixed mapping
            "cholesterol": ["chol", "cholesterol"],
            "creatinine": ["sc", "serum_creatinine", "creatinine"]
        }
    )

    df = pd.concat([Diabetes, Heart, Kidney], ignore_index=True)

    # Convert to numeric safely
    df[FEATURES] = df[FEATURES].apply(pd.to_numeric, errors="coerce")

    # ✅ NEW IMPORTANT FIX for accuracy:
    # If diastolic_bp is missing, estimate it as systolic_bp * 0.66 (clinical ratio)
    df["diastolic_bp"] = df["diastolic_bp"].fillna(df["systolic_bp"] * 0.66)

    return df[FEATURES], df["label"]

def train_model():
    X, y = build_all()

    Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

    pipe = Pipeline([
        ("impute", SimpleImputer(strategy="median")),
        ("scale", StandardScaler()),
        ("clf", OneVsRestClassifier(RandomForestClassifier(
            n_estimators=500,
            max_depth=None,
            class_weight="balanced",
            random_state=42
        )))
    ])

    pipe.fit(Xtr, ytr)

    try:
        proba = pipe.predict_proba(Xte)
        auc = roc_auc_score(pd.get_dummies(yte), proba, multi_class="ovr")
    except:
        auc = None

    joblib.dump({
        "pipeline": pipe,
        "features": FEATURES,
        "labels": sorted(y.unique().tolist()),
        "trained_at": datetime.now().isoformat(),
        "auc_macro": auc
    }, os.path.join(MODELS_DIR, "disease_classifier.joblib"))

    print("\n✅ Model saved to models/disease_classifier.joblib")
    if auc:
        print(f"Model Used for Training : Random Forest Classifier")
        print(f"🎯 Validation AUC (macro): {auc:.4f}")

if __name__ == "__main__":
    train_model()

