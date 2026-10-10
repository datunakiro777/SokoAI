"""Run in a Lightning.ai GPU Studio: python -m ml.train ..."""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path

import lightning as L
import torch
from PIL import Image
from torch import nn
from torch.utils.data import DataLoader, Dataset, WeightedRandomSampler
from torchvision import transforms
from lightning.pytorch.callbacks import EarlyStopping, ModelCheckpoint

from ml.manifest import load_catalog, load_manifest, validate_labels
from ml.model import BACKBONES, MushroomNet


MEAN = (0.485, 0.456, 0.406)
STD = (0.229, 0.224, 0.225)


class CenterSquare:
    def __call__(self, image: Image.Image) -> Image.Image:
        side = min(image.size)
        left = (image.width - side) // 2
        top = (image.height - side) // 2
        return image.crop((left, top, left + side, top + side))


TRAIN_TRANSFORM = transforms.Compose([
    CenterSquare(),
    transforms.RandomResizedCrop(224, scale=(0.75, 1.0)),
    transforms.RandomHorizontalFlip(),
    transforms.ColorJitter(brightness=0.22, contrast=0.22, saturation=0.16),
    transforms.ToTensor(),
    transforms.Normalize(MEAN, STD),
])
EVAL_TRANSFORM = transforms.Compose([
    CenterSquare(), transforms.Resize((224, 224)), transforms.ToTensor(), transforms.Normalize(MEAN, STD),
])


class MushroomDataset(Dataset):
    def __init__(self, rows: list[dict[str, str]], species_ids: list[str], *, augment: bool):
        self.rows = rows
        self.labels = {species_id: index for index, species_id in enumerate(species_ids)}
        self.transform = TRAIN_TRANSFORM if augment else EVAL_TRANSFORM

    def __len__(self) -> int:
        return len(self.rows)

    def __getitem__(self, index: int):
        row = self.rows[index]
        with Image.open(row["absolute_path"]) as source:
            image = self.transform(source.convert("RGB"))
        present = float(row["species_id"] != "__none__")
        species_index = self.labels.get(row["species_id"], -1)
        toxic = {"poisonous": 1.0, "edible": 0.0}.get(row["toxicity"], -1.0)
        return image, torch.tensor(present), torch.tensor(species_index), torch.tensor(toxic)


class MushroomDataModule(L.LightningDataModule):
    def __init__(self, rows: list[dict[str, str]], species_ids: list[str], batch_size: int, workers: int):
        super().__init__()
        self.rows = rows
        self.species_ids = species_ids
        self.batch_size = batch_size
        self.workers = workers

    def setup(self, stage: str | None = None):
        self.train_set = MushroomDataset([r for r in self.rows if r["split"] == "train"], self.species_ids, augment=True)
        self.val_set = MushroomDataset([r for r in self.rows if r["split"] == "validation"], self.species_ids, augment=False)

    def train_dataloader(self):
        labels = [row["species_id"] for row in self.train_set.rows]
        counts = Counter(labels)
        weights = [counts[label] ** -0.5 for label in labels]
        sampler = WeightedRandomSampler(weights, num_samples=len(weights), replacement=True)
        return DataLoader(self.train_set, batch_size=self.batch_size, sampler=sampler,
                          num_workers=self.workers, pin_memory=True)

    def val_dataloader(self):
        return DataLoader(self.val_set, batch_size=self.batch_size, shuffle=False,
                          num_workers=self.workers, pin_memory=True)


class MushroomModule(L.LightningModule):
    def __init__(self, backbone: str, species_count: int, learning_rate: float,
                 backbone_weights: str | None = None):
        super().__init__()
        self.save_hyperparameters(ignore=["backbone_weights"])
        self.network = MushroomNet(backbone, species_count, backbone_weights)
        self.learning_rate = learning_rate

    def _loss(self, batch):
        images, present, species, toxic = batch
        presence_logits, toxic_logits, species_logits = self.network(images)
        presence_loss = nn.functional.binary_cross_entropy_with_logits(presence_logits.flatten(), present)
        species_mask = species >= 0
        toxicity_mask = toxic >= 0
        species_loss = nn.functional.cross_entropy(species_logits[species_mask], species[species_mask]) if species_mask.any() else presence_loss * 0
        # Toxic-positive examples receive extra weight; threshold selection still uses independent calibration data.
        toxicity_loss = nn.functional.binary_cross_entropy_with_logits(
            toxic_logits.flatten()[toxicity_mask], toxic[toxicity_mask],
            pos_weight=torch.tensor(10.0, device=self.device),
        ) if toxicity_mask.any() else presence_loss * 0
        return presence_loss + species_loss + 2 * toxicity_loss

    def training_step(self, batch, batch_index):
        loss = self._loss(batch)
        self.log("train_loss", loss, on_epoch=True, on_step=False, prog_bar=True)
        return loss

    def validation_step(self, batch, batch_index):
        loss = self._loss(batch)
        self.log("val_loss", loss, on_epoch=True, on_step=False, prog_bar=True)

    def configure_optimizers(self):
        optimizer = torch.optim.AdamW(self.parameters(), lr=self.learning_rate, weight_decay=0.01)
        scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=self.trainer.max_epochs)
        return {"optimizer": optimizer, "lr_scheduler": scheduler}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--catalog", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--backbone", choices=sorted(BACKBONES), default="mobilenet_v3_large")
    parser.add_argument("--backbone-weights")
    parser.add_argument("--weights-provenance", help="JSON proof of commercial permission for optional starting weights")
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--epochs", type=int, default=40)
    parser.add_argument("--learning-rate", type=float, default=0.0003)
    args = parser.parse_args()

    if args.backbone_weights:
        if not args.weights_provenance:
            parser.error("Starting weights require --weights-provenance")
        provenance = json.loads(Path(args.weights_provenance).read_text(encoding="utf-8"))
        if provenance.get("commercial_use_cleared") is not True or not provenance.get("source"):
            parser.error("Starting weights are not documented as cleared for commercial use")

    rows = load_manifest(args.manifest)
    catalog = load_catalog(args.catalog)
    species_ids = validate_labels(rows, catalog)
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    (output / "species_ids.json").write_text(json.dumps(species_ids, indent=2), encoding="utf-8")
    (output / "training_config.json").write_text(json.dumps({
        "backbone": args.backbone, "species_count": len(species_ids),
        "manifest": str(Path(args.manifest).resolve()), "catalog": str(Path(args.catalog).resolve()),
        "backbone_weights": args.backbone_weights, "weights_provenance": args.weights_provenance,
    }, indent=2), encoding="utf-8")

    L.seed_everything(20261010, workers=True)
    data = MushroomDataModule(rows, species_ids, args.batch_size, args.workers)
    model = MushroomModule(args.backbone, len(species_ids), args.learning_rate, args.backbone_weights)
    callbacks = [
        ModelCheckpoint(dirpath=output / "checkpoints", filename="best", monitor="val_loss", mode="min", save_top_k=1),
        EarlyStopping(monitor="val_loss", patience=7, mode="min"),
    ]
    trainer = L.Trainer(accelerator="gpu", devices=1, precision="16-mixed", max_epochs=args.epochs,
                        callbacks=callbacks, default_root_dir=output, deterministic=True)
    trainer.fit(model, data)
    print(f"Best checkpoint: {callbacks[0].best_model_path}")


if __name__ == "__main__":
    main()
