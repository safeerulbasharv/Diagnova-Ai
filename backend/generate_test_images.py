# generate_test_images.py
import os
from medmnist import PneumoniaMNIST, BloodMNIST, RetinaMNIST, DermaMNIST, INFO
from torchvision import transforms
from PIL import Image
from tqdm import tqdm

# Output folder
OUT_DIR = "test_images"
os.makedirs(OUT_DIR, exist_ok=True)

# Datasets to export
DATASETS = {
    "pneumoniamnist": PneumoniaMNIST,
    "bloodmnist": BloodMNIST,
    "retinamnist": RetinaMNIST,
    "dermamnist": DermaMNIST
}

# Helper: get label name
def get_label_name(dataset, label_idx):
    info = INFO[dataset]
    classes = list(info["label"].values())
    label_idx = int(label_idx)
    if 0 <= label_idx < len(classes):
        return classes[label_idx].replace(" ", "_")
    return f"label{label_idx}"

# Start export
print("\n🏥 Generating MedMNIST test images...\n")
for name, cls in DATASETS.items():
    print(f"================================================================================")
    print(f"🧠 Dataset: {name.upper()}")
    info = INFO[name]
    print(f"📊 Description: {info['description']}")
    print(f"📦 Classes: {len(info['label'])} | Size: {info['n_samples']['test']} test samples")
    print("================================================================================")

    # Download dataset (auto skips if already cached)
    ds = cls(split="test", download=True)
    print(f"⬇️  Downloaded and ready: {len(ds)} test samples.\n")

    # Save 10 test samples with labels
    for i in tqdm(range(10), desc=f"Saving {name} samples", ncols=80):
        img, label = ds[i]
        if not isinstance(img, Image.Image):
            img = transforms.ToPILImage()(img)

        label_name = get_label_name(name, label)
        path = os.path.join(OUT_DIR, f"{name}_{i}_{label_name}.jpg")
        img.save(path)

    print(f"✅ Saved 10 test images for {name} → {OUT_DIR}/")
    print()

print("\n🎉 All MedMNIST test images generated successfully!")
print(f"📂 Check folder: {os.path.abspath(OUT_DIR)}")

