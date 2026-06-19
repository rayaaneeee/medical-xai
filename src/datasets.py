"""
Dataset classes for ISIC skin lesion and NIH ChestX-ray14.
Both return (image_tensor, label) with consistent augmentation pipelines.
"""

import os
import json
from pathlib import Path

import numpy as np
import pandas as pd
from PIL import Image, ImageFile
import torch

ImageFile.LOAD_TRUNCATED_IMAGES = True
from torch.utils.data import Dataset, DataLoader
from torchvision import transforms


# ── ISIC ──────────────────────────────────────────────────────────────────────

ISIC_CLASSES = [
    "MEL",   # Melanoma
    "NV",    # Melanocytic nevus
    "BCC",   # Basal cell carcinoma
    "AK",    # Actinic keratosis
    "BKL",   # Benign keratosis
    "DF",    # Dermatofibroma
    "VASC",  # Vascular lesion
]

ISIC_CLASS_NAMES = {
    "MEL":  "Melanoma",
    "NV":   "Nevus",
    "BCC":  "Basal Cell Carcinoma",
    "AK":   "Actinic Keratosis",
    "BKL":  "Benign Keratosis",
    "DF":   "Dermatofibroma",
    "VASC": "Vascular Lesion",
}


class ISICDataset(Dataset):
    """
    ISIC 2019 skin lesion dataset.
    Expects:
        root/ISIC_2019_Training_Input/*.jpg
        root/ISIC_2019_Training_GroundTruth.csv
    """

    def __init__(self, root: str, split: str = "train", transform=None, val_frac: float = 0.15):
        self.root = Path(root)
        self.transform = transform
        self.classes = ISIC_CLASSES

        gt_path = self.root / "ISIC_2019_Training_GroundTruth.csv"
        df = pd.read_csv(gt_path)

        # one-hot → integer label
        df["label"] = df[ISIC_CLASSES].values.argmax(axis=1)

        rng = np.random.default_rng(42)
        idx = rng.permutation(len(df))
        n_val = int(len(df) * val_frac)
        val_idx = set(idx[:n_val])
        train_idx = set(idx[n_val:])

        if split == "train":
            df = df.iloc[sorted(train_idx)].reset_index(drop=True)
        elif split in ("val", "test"):
            df = df.iloc[sorted(val_idx)].reset_index(drop=True)
        else:
            raise ValueError(f"Unknown split: {split}")

        img_dir = self.root / "ISIC_2019_Training_Input"
        self.img_dir = img_dir
        # Filter to only images that are actually on disk (partial extraction OK)
        exists_mask = df["image"].apply(lambda name: (img_dir / f"{name}.jpg").exists())
        self.df = df[exists_mask].reset_index(drop=True)

    def __len__(self):
        return len(self.df)

    def __getitem__(self, idx):
        row = self.df.iloc[idx]
        img_path = self.img_dir / f"{row['image']}.jpg"
        try:
            img = Image.open(img_path).convert("RGB")
        except Exception:
            img = Image.new("RGB", (224, 224), 0)
        if self.transform:
            img = self.transform(img)
        return img, int(row["label"])


# ── NIH ChestX-ray14 ──────────────────────────────────────────────────────────

NIH_CLASSES = [
    "Atelectasis", "Cardiomegaly", "Effusion", "Infiltration",
    "Mass", "Nodule", "Pneumonia", "Pneumothorax",
    "Consolidation", "Edema", "Emphysema", "Fibrosis",
    "Pleural_Thickening", "Hernia",
]


class NIHChestDataset(Dataset):
    """
    NIH ChestX-ray14 dataset.
    Expects:
        root/images/*.png
        root/Data_Entry_2017.csv
        root/train_val_list.txt
        root/test_list.txt
    """

    def __init__(self, root: str, split: str = "train", transform=None):
        self.root = Path(root)
        self.transform = transform
        self.classes = NIH_CLASSES

        df = pd.read_csv(self.root / "Data_Entry_2017.csv")
        df.columns = df.columns.str.strip()

        if split in ("train", "val"):
            with open(self.root / "train_val_list.txt") as f:
                files = set(f.read().splitlines())
            df = df[df["Image Index"].isin(files)].reset_index(drop=True)
            rng = np.random.default_rng(42)
            idx = rng.permutation(len(df))
            n_val = int(len(df) * 0.15)
            if split == "val":
                df = df.iloc[sorted(idx[:n_val])].reset_index(drop=True)
            else:
                df = df.iloc[sorted(idx[n_val:])].reset_index(drop=True)
        else:
            with open(self.root / "test_list.txt") as f:
                files = set(f.read().splitlines())
            df = df[df["Image Index"].isin(files)].reset_index(drop=True)

        # Multi-hot encode labels
        def encode(finding_str):
            vec = np.zeros(len(NIH_CLASSES), dtype=np.float32)
            for f in finding_str.split("|"):
                f = f.strip()
                if f in NIH_CLASSES:
                    vec[NIH_CLASSES.index(f)] = 1.0
            return vec

        self.labels = np.stack(df["Finding Labels"].apply(encode).values)
        self.img_names = df["Image Index"].tolist()
        self.img_dir = self.root / "images"

    def __len__(self):
        return len(self.img_names)

    def __getitem__(self, idx):
        img_path = self.img_dir / self.img_names[idx]
        img = Image.open(img_path).convert("RGB")
        if self.transform:
            img = self.transform(img)
        return img, torch.tensor(self.labels[idx])


# ── Transforms ────────────────────────────────────────────────────────────────

def get_transforms(split: str, img_size: int = 224):
    mean = [0.485, 0.456, 0.406]
    std  = [0.229, 0.224, 0.225]

    if split == "train":
        return transforms.Compose([
            transforms.RandomResizedCrop(img_size, scale=(0.8, 1.0)),
            transforms.RandomHorizontalFlip(),
            transforms.RandomVerticalFlip(),
            transforms.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.1),
            transforms.RandomRotation(15),
            transforms.ToTensor(),
            transforms.Normalize(mean, std),
        ])
    else:
        return transforms.Compose([
            transforms.Resize(int(img_size * 1.14)),
            transforms.CenterCrop(img_size),
            transforms.ToTensor(),
            transforms.Normalize(mean, std),
        ])


def get_loaders(dataset: str, root: str, batch_size: int = 32, num_workers: int = 4, img_size: int = 224):
    Cls = ISICDataset if dataset == "isic" else NIHChestDataset

    train_ds = Cls(root, split="train", transform=get_transforms("train", img_size))
    val_ds   = Cls(root, split="val",   transform=get_transforms("val",   img_size))

    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True,
                              num_workers=num_workers, pin_memory=False)
    val_loader   = DataLoader(val_ds,   batch_size=batch_size, shuffle=False,
                              num_workers=num_workers, pin_memory=False)

    n_classes = len(train_ds.classes)
    return train_loader, val_loader, n_classes, train_ds.classes
