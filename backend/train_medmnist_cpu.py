# train_medmnist_cpu.py
import os
from datetime import datetime
import torch
from torch import nn, optim
from torch.utils.data import DataLoader
from torchvision import models, transforms
import medmnist
from medmnist import INFO
import joblib
from tqdm import tqdm  # 👈 Progress bar

# ---------------- CONFIG ----------------
DATASETS = [
    "pneumoniamnist",
    "bloodmnist",
    "retinamnist",
    "dermamnist"
]

MODELS_DIR = "./models"
os.makedirs(MODELS_DIR, exist_ok=True)

BATCH_SIZE = 32
NUM_EPOCHS = 3
LR = 1e-3
DEVICE = torch.device("cpu")

# ---------------- TRANSFORM ----------------
transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.Grayscale(num_output_channels=3),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406],
                         std=[0.229, 0.224, 0.225])
])

# ---------------- TRAIN FUNCTION ----------------
def train_one_dataset(name):
    print("\n" + "=" * 80)
    print(f"🧠 Training {name.upper()} model")
    print("=" * 80)

    if name not in INFO:
        print(f"❌ Unknown dataset name: {name}")
        return

    info = INFO[name]
    DataClass = getattr(medmnist, info["python_class"])

    train_dataset = DataClass(split="train", transform=transform, download=True)
    val_dataset = DataClass(split="val", transform=transform, download=True)
    train_loader = DataLoader(train_dataset, batch_size=BATCH_SIZE, shuffle=True)
    val_loader = DataLoader(val_dataset, batch_size=BATCH_SIZE, shuffle=False)

    num_classes = len(info["label"])
    print(f"✅ Loaded {name} with {num_classes} classes and {len(train_dataset)} training samples.")

    # Model setup
    model = models.resnet18(weights=None)
    model.fc = nn.Linear(model.fc.in_features, num_classes)
    model = model.to(DEVICE)

    criterion = nn.CrossEntropyLoss()
    optimizer = optim.Adam(model.parameters(), lr=LR)

    # ---------------- TRAIN ----------------
    print(f"🚀 Training {name} on CPU...\n")
    for epoch in range(1, NUM_EPOCHS + 1):
        model.train()
        total_loss, correct, total = 0, 0, 0

        progress_bar = tqdm(train_loader, desc=f"Epoch {epoch}/{NUM_EPOCHS}", leave=False)
        for imgs, labels in progress_bar:
            imgs, labels = imgs.to(DEVICE), labels.squeeze().long().to(DEVICE)
            optimizer.zero_grad()
            outputs = model(imgs)
            loss = criterion(outputs, labels)
            loss.backward()
            optimizer.step()

            total_loss += loss.item() * imgs.size(0)
            preds = outputs.argmax(dim=1)
            correct += (preds == labels).sum().item()
            total += labels.size(0)

            # Update progress bar with running metrics
            progress_bar.set_postfix({
                "Loss": f"{total_loss/total:.4f}",
                "Acc": f"{100*correct/total:.2f}%"
            })

        # Epoch summary
        epoch_loss = total_loss / total
        epoch_acc = correct / total
        print(f"📘 Epoch {epoch}: Loss={epoch_loss:.4f}, Accuracy={epoch_acc:.3f}")

    # ---------------- VALIDATION ----------------
    model.eval()
    correct, total = 0, 0
    with torch.no_grad():
        for imgs, labels in val_loader:
            imgs, labels = imgs.to(DEVICE), labels.squeeze().long().to(DEVICE)
            preds = model(imgs).argmax(dim=1)
            correct += (preds == labels).sum().item()
            total += labels.size(0)

    val_acc = correct / total
    print(f"✅ Validation Accuracy ({name}): {val_acc:.3f}\n")

    # ---------------- SAVE ----------------
    MODEL_PATH = os.path.join(MODELS_DIR, f"radiology_resnet18_{name}_cpu.pth")
    META_PATH = os.path.join(MODELS_DIR, f"radiology_meta_{name}.joblib")

    torch.save(model.state_dict(), MODEL_PATH)

    meta = {
        "classes": list(info["label"].values()),
        "dataset": name,
        "trained_at": datetime.utcnow().isoformat(),
        "img_size": 224,
        "arch": "resnet18",
        "val_acc": round(val_acc, 4)
    }
    joblib.dump(meta, META_PATH)

    print(f"💾 Saved model → {MODEL_PATH}")
    print(f"📘 Metadata → {META_PATH}")
    print(f"🎉 Completed training for {name} ✅")


# ---------------- RUN ALL ----------------
if __name__ == "__main__":
    print("🏥 AI Health App — Multi-Dataset Trainer (CPU Edition)")
    print("=" * 80)
    for dataset in DATASETS:
        train_one_dataset(dataset)
    print("\n🎯 All MedMNIST models trained successfully!")

