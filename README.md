---
title: DermAI Skin Lesion Classification
emoji: 🔬
colorFrom: blue
colorTo: purple
sdk: docker
pinned: false
license: mit
short_description: EfficientNet-B0 with Grad-CAM and uncertainty
---

# DermAI — Medical Imaging with Explainability

EfficientNet-B0 classifier on ISIC 2019 dermoscopy images with:

- **Grad-CAM / Grad-CAM++ / EigenCAM** — visual heatmaps of model attention
- **Temperature Scaling** — calibrated confidence (ECE 0.030)
- **MC Dropout** — uncertainty quantification via 30 stochastic passes

**AUC-ROC: 0.9630** across 7 skin lesion classes.

Built end-to-end by **Toumi Rayane**.

> ⚠️ Research demo — not for clinical use.
