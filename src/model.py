"""
EfficientNet-B0 backbone fine-tuned for ISIC (single-label) or NIH (multi-label).
Includes MC Dropout for uncertainty estimation.
"""

import torch
import torch.nn as nn
import timm


class MedicalClassifier(nn.Module):
    def __init__(
        self,
        n_classes: int,
        multilabel: bool = False,
        dropout_rate: float = 0.3,
        backbone: str = "efficientnet_b0",
    ):
        super().__init__()
        self.multilabel = multilabel
        self.dropout_rate = dropout_rate

        self.backbone = timm.create_model(backbone, pretrained=True, num_classes=0)
        feat_dim = self.backbone.num_features

        self.head = nn.Sequential(
            nn.Dropout(p=dropout_rate),
            nn.Linear(feat_dim, 256),
            nn.ReLU(inplace=True),
            nn.Dropout(p=dropout_rate),
            nn.Linear(256, n_classes),
        )

    def forward(self, x):
        feats = self.backbone(x)
        return self.head(feats)

    def enable_mc_dropout(self):
        """Put all Dropout layers in training mode while keeping BN in eval mode."""
        self.eval()
        for m in self.modules():
            if isinstance(m, nn.Dropout):
                m.train()

    @torch.no_grad()
    def predict_with_uncertainty(self, x, n_passes: int = 30):
        """
        MC Dropout inference.
        Returns:
            mean_probs: (batch, n_classes)
            uncertainty: (batch,) — predictive entropy
        """
        self.enable_mc_dropout()
        preds = []
        for _ in range(n_passes):
            logits = self.forward(x)
            if self.multilabel:
                probs = torch.sigmoid(logits)
            else:
                probs = torch.softmax(logits, dim=-1)
            preds.append(probs)

        preds = torch.stack(preds)          # (n_passes, batch, n_classes)
        mean_probs = preds.mean(dim=0)       # (batch, n_classes)

        # Predictive entropy as uncertainty measure
        eps = 1e-8
        entropy = -(mean_probs * (mean_probs + eps).log()).sum(dim=-1)  # (batch,)

        return mean_probs, entropy


def build_model(dataset: str, n_classes: int, dropout_rate: float = 0.3) -> MedicalClassifier:
    multilabel = dataset == "nih"
    return MedicalClassifier(
        n_classes=n_classes,
        multilabel=multilabel,
        dropout_rate=dropout_rate,
    )


def get_loss_fn(dataset: str, class_weights=None):
    if dataset == "nih":
        # Multi-label: BCE with optional pos_weight for class imbalance
        if class_weights is not None:
            return nn.BCEWithLogitsLoss(pos_weight=class_weights)
        return nn.BCEWithLogitsLoss()
    else:
        if class_weights is not None:
            return nn.CrossEntropyLoss(weight=class_weights)
        return nn.CrossEntropyLoss()
