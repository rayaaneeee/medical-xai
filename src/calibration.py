"""
Post-hoc calibration via temperature scaling.
Also computes Expected Calibration Error (ECE) and plots reliability diagrams.
"""

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader
import matplotlib.pyplot as plt
from pathlib import Path
from scipy.optimize import minimize_scalar


class TemperatureScaler(nn.Module):
    """
    Wraps a trained model and learns a single temperature T on the val set.
    Calibrated logits = raw_logits / T.
    """

    def __init__(self, model: nn.Module):
        super().__init__()
        self.model = model
        self.temperature = nn.Parameter(torch.ones(1) * 1.5)

    def forward(self, x):
        logits = self.model(x)
        return logits / self.temperature.to(logits.device)

    def fit(self, val_loader: DataLoader, device: str = "cpu", multilabel: bool = False):
        self.model.eval()
        all_logits, all_labels = [], []

        with torch.no_grad():
            for imgs, labels in val_loader:
                imgs = imgs.to(device)
                logits = self.model(imgs)
                all_logits.append(logits.cpu())
                all_labels.append(labels.cpu())

        all_logits = torch.cat(all_logits)
        all_labels = torch.cat(all_labels)

        if multilabel:
            loss_fn = nn.BCEWithLogitsLoss()
            def nll(T):
                scaled = all_logits / T
                return loss_fn(scaled, all_labels.float()).item()
        else:
            loss_fn = nn.CrossEntropyLoss()
            def nll(T):
                scaled = all_logits / T
                return loss_fn(scaled, all_labels.long()).item()

        result = minimize_scalar(nll, bounds=(0.05, 10.0), method="bounded")
        self.temperature.data = torch.tensor([result.x])
        print(f"Optimal temperature: {result.x:.4f}  (NLL: {result.fun:.4f})")
        return self


def compute_ece(probs: np.ndarray, labels: np.ndarray, n_bins: int = 15) -> float:
    """Expected Calibration Error for single-label classification."""
    confidences = probs.max(axis=1)
    predictions = probs.argmax(axis=1)
    correct = (predictions == labels).astype(float)

    bins = np.linspace(0, 1, n_bins + 1)
    ece = 0.0
    for lo, hi in zip(bins[:-1], bins[1:]):
        mask = (confidences > lo) & (confidences <= hi)
        if mask.sum() == 0:
            continue
        bin_acc  = correct[mask].mean()
        bin_conf = confidences[mask].mean()
        ece += mask.mean() * abs(bin_acc - bin_conf)
    return float(ece)


def plot_reliability_diagram(
    probs_before: np.ndarray,
    probs_after: np.ndarray,
    labels: np.ndarray,
    save_path: str,
    n_bins: int = 15,
):
    """Side-by-side reliability diagrams before and after temperature scaling."""
    fig, axes = plt.subplots(1, 2, figsize=(12, 5))

    for ax, probs, title in zip(
        axes,
        [probs_before, probs_after],
        ["Before calibration", "After temperature scaling"],
    ):
        confidences = probs.max(axis=1)
        predictions = probs.argmax(axis=1)
        correct = (predictions == labels).astype(float)

        bins = np.linspace(0, 1, n_bins + 1)
        bin_accs, bin_confs, bin_counts = [], [], []

        for lo, hi in zip(bins[:-1], bins[1:]):
            mask = (confidences > lo) & (confidences <= hi)
            if mask.sum() == 0:
                bin_accs.append(0)
                bin_confs.append((lo + hi) / 2)
                bin_counts.append(0)
            else:
                bin_accs.append(correct[mask].mean())
                bin_confs.append(confidences[mask].mean())
                bin_counts.append(mask.sum())

        bin_confs = np.array(bin_confs)
        bin_accs = np.array(bin_accs)
        ece = compute_ece(probs, labels, n_bins)

        ax.bar(bin_confs, bin_accs, width=1.0 / n_bins, alpha=0.7,
               color="#4C72B0", edgecolor="white", label="Model")
        ax.plot([0, 1], [0, 1], "k--", linewidth=1.5, label="Perfect calibration")
        ax.fill_between(bin_confs, bin_accs, bin_confs,
                        alpha=0.2, color="red", label=f"Gap (ECE={ece:.3f})")
        ax.set_xlim(0, 1)
        ax.set_ylim(0, 1)
        ax.set_xlabel("Confidence", fontsize=12)
        ax.set_ylabel("Accuracy", fontsize=12)
        ax.set_title(title, fontsize=13, fontweight="bold")
        ax.legend(fontsize=10)
        ax.grid(alpha=0.3)

    plt.suptitle("Calibration: Reliability Diagram", fontsize=14, fontweight="bold", y=1.02)
    plt.tight_layout()
    plt.savefig(save_path, dpi=150, bbox_inches="tight")
    plt.close()
    print(f"Saved reliability diagram → {save_path}")


@torch.no_grad()
def collect_probs_and_labels(model, loader, device, multilabel=False):
    model.eval()
    all_probs, all_labels = [], []
    for imgs, labels in loader:
        imgs = imgs.to(device)
        logits = model(imgs)
        if multilabel:
            probs = torch.sigmoid(logits).cpu().numpy()
        else:
            probs = torch.softmax(logits, dim=-1).cpu().numpy()
        all_probs.append(probs)
        all_labels.append(labels.numpy())
    return np.concatenate(all_probs), np.concatenate(all_labels)
