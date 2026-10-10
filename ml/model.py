"""One mobile CNN with mushroom-presence, species, and toxicity heads."""

from __future__ import annotations

import torch
from torch import nn
from torchvision import models


BACKBONES = {"mobilenet_v3_large", "efficientnet_v2_s"}


class MushroomNet(nn.Module):
    def __init__(self, backbone: str, species_count: int, backbone_weights: str | None = None):
        super().__init__()
        if backbone == "mobilenet_v3_large":
            base = models.mobilenet_v3_large(weights=None)
        elif backbone == "efficientnet_v2_s":
            base = models.efficientnet_v2_s(weights=None)
        else:
            raise ValueError(f"Unsupported backbone: {backbone}")
        if backbone_weights:
            state = torch.load(backbone_weights, map_location="cpu", weights_only=True)
            if "state_dict" in state:
                state = state["state_dict"]
            base.load_state_dict(state, strict=False)
        feature_count = base.classifier[0].in_features if backbone == "mobilenet_v3_large" else base.classifier[1].in_features
        self.features = base.features
        self.pool = nn.AdaptiveAvgPool2d(1)
        self.presence = nn.Linear(feature_count, 1)
        self.toxic = nn.Linear(feature_count, 1)
        self.species = nn.Linear(feature_count, species_count)

    def forward(self, image: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        features = self.pool(self.features(image)).flatten(1)
        return self.presence(features), self.toxic(features), self.species(features)
