"""
Grad-CAM heatmap generation and overlay utilities.
Uses pytorch-grad-cam library for robust implementation.
"""

import numpy as np
import cv2
from PIL import Image
import torch
import torch.nn.functional as F
from pathlib import Path

from pytorch_grad_cam import GradCAM, GradCAMPlusPlus, EigenCAM
from pytorch_grad_cam.utils.model_targets import ClassifierOutputTarget
from pytorch_grad_cam.utils.image import show_cam_on_image


def get_target_layer(model):
    """Returns the last conv layer of EfficientNet backbone for Grad-CAM."""
    # timm EfficientNet: last block in features
    backbone = model.backbone
    # Walk to the last block
    if hasattr(backbone, "blocks"):
        return backbone.blocks[-1]
    # fallback
    return list(backbone.children())[-2]


def generate_gradcam(
    model,
    img_tensor: torch.Tensor,
    target_class: int | None = None,
    method: str = "gradcam",
    device: str = "cpu",
) -> tuple[np.ndarray, np.ndarray]:
    """
    Generate Grad-CAM heatmap for a single image.

    Args:
        model: trained MedicalClassifier
        img_tensor: (1, 3, H, W) — preprocessed, on CPU
        target_class: class index to explain; None = predicted class
        method: 'gradcam' | 'gradcam++' | 'eigencam'

    Returns:
        cam: (H, W) float in [0, 1]
        overlay: (H, W, 3) uint8 RGB with heatmap blended over the original image
    """
    model.eval()
    target_layer = get_target_layer(model)

    cam_cls = {"gradcam": GradCAM, "gradcam++": GradCAMPlusPlus, "eigencam": EigenCAM}[method]

    targets = [ClassifierOutputTarget(target_class)] if target_class is not None else None

    with cam_cls(model=model, target_layers=[target_layer]) as cam:
        grayscale_cam = cam(input_tensor=img_tensor.to(device), targets=targets)
        grayscale_cam = grayscale_cam[0]  # (H, W)

    # Reconstruct the original RGB image from the normalized tensor for overlay
    mean = np.array([0.485, 0.456, 0.406])
    std  = np.array([0.229, 0.224, 0.225])
    img_np = img_tensor[0].permute(1, 2, 0).numpy()
    img_np = std * img_np + mean
    img_np = np.clip(img_np, 0, 1).astype(np.float32)

    overlay = show_cam_on_image(img_np, grayscale_cam, use_rgb=True)
    return grayscale_cam, overlay


def save_gradcam_grid(
    model,
    dataset,
    device: str,
    save_path: str,
    n_images: int = 8,
    method: str = "gradcam",
):
    """
    Save a grid of N images with their Grad-CAM overlays side by side.
    Useful for README screenshots.
    """
    import matplotlib.pyplot as plt
    from torch.utils.data import DataLoader
    from src.datasets import get_transforms

    val_transform = get_transforms("val")
    # Temporarily swap transform
    orig_transform = dataset.transform
    dataset.transform = val_transform

    loader = DataLoader(dataset, batch_size=n_images, shuffle=True)
    imgs, labels = next(iter(loader))

    fig, axes = plt.subplots(n_images, 2, figsize=(8, 4 * n_images))
    fig.suptitle("Original vs Grad-CAM", fontsize=16, fontweight="bold")

    for i in range(n_images):
        img_t = imgs[i:i+1]
        cam, overlay = generate_gradcam(model, img_t, device=device, method=method)

        # Original
        mean = np.array([0.485, 0.456, 0.406])
        std  = np.array([0.229, 0.224, 0.225])
        orig = std * imgs[i].permute(1, 2, 0).numpy() + mean
        orig = np.clip(orig, 0, 1)

        label_name = dataset.classes[labels[i]] if hasattr(labels[i], "item") else str(labels[i].item())

        axes[i, 0].imshow(orig)
        axes[i, 0].set_title(f"Label: {label_name}", fontsize=9)
        axes[i, 0].axis("off")

        axes[i, 1].imshow(overlay)
        axes[i, 1].set_title("Grad-CAM", fontsize=9)
        axes[i, 1].axis("off")

    plt.tight_layout()
    plt.savefig(save_path, dpi=120, bbox_inches="tight")
    plt.close()
    dataset.transform = orig_transform
    print(f"Saved Grad-CAM grid → {save_path}")
