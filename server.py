"""
FastAPI backend for Medical XAI Platform.
Serves the frontend and exposes inference API.
"""

import io
import base64
import random
from pathlib import Path

import numpy as np
from PIL import Image
import torch

from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from src.model import MedicalClassifier
from src.gradcam import generate_gradcam
from src.datasets import ISIC_CLASS_NAMES, get_transforms
from src.device import get_device

# ── Setup ──────────────────────────────────────────────────────────────────────

app = FastAPI(title="Medical XAI API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="web/static"), name="static")

DEVICE = get_device()
_model_cache: dict = {}

DATA_DIR        = Path("data/isic/ISIC_2019_Training_Input")
BUNDLED_JSON    = Path("web/static/examples.json")
CKPT_DIR        = Path("checkpoints")


# ── Model loading ──────────────────────────────────────────────────────────────

def load_model(dataset: str = "isic"):
    if dataset in _model_cache:
        return _model_cache[dataset]

    ckpt_path = CKPT_DIR / f"{dataset}_calibrated.pt"
    if not ckpt_path.exists():
        ckpt_path = CKPT_DIR / f"{dataset}_best.pt"
    if not ckpt_path.exists():
        raise FileNotFoundError(f"No checkpoint for {dataset}")

    ckpt        = torch.load(ckpt_path, map_location=DEVICE)
    n_classes   = ckpt["n_classes"]
    class_names = ckpt["class_names"]
    dropout     = ckpt.get("dropout", 0.3)
    temperature = ckpt.get("temperature", 1.0)
    multilabel  = dataset == "nih"

    model = MedicalClassifier(n_classes=n_classes, multilabel=multilabel, dropout_rate=dropout)
    model.load_state_dict(ckpt["model_state"])
    model = model.to(DEVICE).eval()

    result = {"model": model, "class_names": class_names, "temperature": temperature, "multilabel": multilabel}
    _model_cache[dataset] = result
    return result


def pil_to_b64(img: Image.Image, quality: int = 85) -> str:
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality)
    return base64.b64encode(buf.getvalue()).decode()


# ── Routes ─────────────────────────────────────────────────────────────────────

@app.on_event("startup")
async def startup():
    load_model("isic")  # warm-up


@app.get("/", response_class=HTMLResponse)
async def index():
    return (Path("web/index.html")).read_text()


@app.get("/api/health")
async def health():
    return {"status": "ok", "device": str(DEVICE)}


@app.get("/api/examples")
async def examples():
    import json as _json
    # Use full dataset if available
    if DATA_DIR.exists():
        files = sorted(DATA_DIR.glob("ISIC_*.jpg"))[:200]
        sample = random.sample(files, min(9, len(files)))
        out = []
        for p in sample:
            img = Image.open(p).convert("RGB").resize((160, 160))
            out.append({"name": p.stem, "thumb": pil_to_b64(img, quality=70)})
        return {"images": out}
    # Fall back to pre-baked base64 JSON (works on HF Spaces with no data dir)
    if BUNDLED_JSON.exists():
        return {"images": _json.loads(BUNDLED_JSON.read_text())}
    return {"images": []}


@app.post("/api/predict")
async def predict(
    file:       UploadFile = File(...),
    dataset:    str = Form("isic"),
    cam_method: str = Form("gradcam"),
    n_passes:   int = Form(30),
):
    # Load image
    try:
        raw = await file.read()
        image = Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image file")

    # Load model
    try:
        m = load_model(dataset)
    except FileNotFoundError as e:
        raise HTTPException(status_code=503, detail=str(e))

    model       = m["model"]
    class_names = m["class_names"]
    temperature = m["temperature"]
    multilabel  = m["multilabel"]

    transform  = get_transforms("val")
    img_tensor = transform(image).unsqueeze(0)

    # Grad-CAM
    cam_key = {"gradcam": "gradcam", "gradcam++": "gradcam++", "eigencam": "eigencam"}.get(
        cam_method.lower().replace(" ", ""), "gradcam"
    )
    _, overlay_arr = generate_gradcam(model, img_tensor, device=DEVICE, method=cam_key)
    overlay_pil    = Image.fromarray(overlay_arr)

    # MC Dropout uncertainty
    mean_probs, entropy = model.predict_with_uncertainty(img_tensor.to(DEVICE), n_passes=n_passes)
    mean_probs  = mean_probs[0].cpu().numpy()
    uncertainty = float(entropy[0].cpu())

    # Rankings
    top_idx = np.argsort(mean_probs)[::-1]
    max_entropy    = float(np.log(len(class_names)))
    uncertainty_pct = min(100.0, uncertainty / max_entropy * 100)

    probs_list = [
        {
            "code":  class_names[i],
            "name":  ISIC_CLASS_NAMES.get(class_names[i], class_names[i]) if not multilabel else class_names[i],
            "prob":  float(mean_probs[i]),
        }
        for i in top_idx
    ]

    # Resize originals to reasonable size for web
    display_orig    = image.resize((400, 400), Image.LANCZOS)
    display_overlay = overlay_pil.resize((400, 400), Image.LANCZOS)

    return JSONResponse({
        "prediction":       probs_list[0]["name"],
        "prediction_code":  probs_list[0]["code"],
        "confidence":       float(mean_probs[top_idx[0]]),
        "probabilities":    probs_list,
        "uncertainty":      uncertainty,
        "uncertainty_pct":  uncertainty_pct,
        "temperature":      temperature,
        "n_passes":         n_passes,
        "original_b64":     pil_to_b64(display_orig),
        "gradcam_b64":      pil_to_b64(display_overlay),
    })


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="127.0.0.1", port=8000, reload=False)
