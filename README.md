# SokoAI

An offline iOS and Android mushroom field guide with a three-photo camera flow. This repository contains the mobile app and a reproducible Lightning/PyTorch training and evaluation pipeline. **No trained model or mushroom photo dataset is included.** Until a real model is installed, the app opens the camera but makes no identification or eating-risk prediction. Its `likelyEdible` verdict is disabled by default.

## What the app does

The user photographs the cap, underside, and stem/base of one specimen. A packaged ONNX model, when available, runs entirely on the phone and estimates mushroom presence, species, and poisonous evidence. The results are:

| Result | Rule |
| --- | --- |
| Not detected | No mushroom passes the presence check; take new photos. |
| Unknown | Mushroom present, but the species is uncertain or the supported region is unverified; do not eat. |
| Not safe to eat | A documented poisonous species is identified with high confidence, or the calibrated poisonous score is high. |
| Likely edible | Every view passes, a known edible species and edible score exceed the configured thresholds, no poisonous look-alike remains plausible, and the independent release gate passed. The app still says **“Do not eat based on this app alone.”** |
| Uncertain | All other assessments; do not eat. |

The camera and results screen display a warning. Nutrition is bundled offline **only** when a likely-edible result has an exact species entry whose USDA FoodData Central record was manually verified. A score is an estimate, never proof that eating is safe. A [clinical study of mushroom identification apps](https://pubmed.ncbi.nlm.nih.gov/36794335/) found that photo-based apps could not reliably exclude poisonous mushrooms.

The initial region is Georgia/Caucasus. Location is checked on the device and is required for a regional assessment; the app does not upload photos or coordinates. The rough location bounds are only a coarse screen and require field validation before release.

## Run the mobile app

```bash
cd mobile
npm ci
npx expo start
```

This app uses `onnxruntime-react-native`, so camera/model testing requires an Expo **development build** rather than Expo Go. The current app has no trained model, so the camera flow ends with “Analysis unavailable.” The bundle is configured for iOS and Android, but a signed device build has not been produced here. See [Expo development builds](https://docs.expo.dev/develop/development-builds/introduction/) and [EAS Build](https://docs.expo.dev/build/introduction/) for the device setup.

### Preview on Android with Expo Go

For the current camera and screen preview, install the **SDK 57** Android build of [Expo Go](https://expo.dev/go), then run `npx expo start --go --clear` in `mobile/` and scan the new QR code inside Expo Go. Expo Go cannot test the ONNX native runtime once a model is installed. If the phone cannot reach the project, keep phone and computer on the same Wi-Fi network; if that fails, restart with `npx expo start --go --tunnel --clear` and scan the new QR code. A blue error screen may also reflect an SDK mismatch: check the detailed message and use the matching Expo Go build. These connection steps follow [Expo's device troubleshooting guide](https://docs.expo.dev/get-started/start-developing/) and [SDK mismatch guide](https://docs.expo.dev/troubleshooting/expo-go-version-mismatch/).

## Data needed for a commercial model

1. Gather expert-checked, **specimen-level** cap/underside/base photos of edible, poisonous, difficult look-alike, unfamiliar, and non-mushroom examples. Prioritize real field photos from Georgia/Caucasus, varied phones, seasons, lighting, ages, and damaged specimens. Confirm species and toxicity independently of the image model; ambiguous labels belong in the unknown group.
2. Record the **license for each photo**, photographer, source URL, observation ID, and physical specimen ID. The loader accepts only `CC0`, `CC-BY-4.0`, or `OWNED` with documented commercial rights. CC BY needs attribution and a license link. Review contractual or other rights separately.
3. Keep all photos of a physical specimen in one split: `train`, `validation`, `calibration`, or `test`. The test set must have three views per specimen and no repeated specimen IDs. Manually audit duplicates and label quality; file hashing catches identical images but cannot catch near duplicates.
4. Reserve **at least 2,995 independent poisonous test specimens** from the supported region, with dangerous look-alikes represented, plus unfamiliar species and non-mushroom cases. This is a minimum for the aggregate bound, not a guarantee for every species.

Useful starting points:

| Source | Use for this commercial app |
| --- | --- |
| [iNaturalist observations/photos](https://www.inaturalist.org/pages/developers) | Candidate source after filtering each **photo** to CC0 or CC BY and checking provenance and expert labels. Its [default photo license is CC BY-NC](https://help.inaturalist.org/en/support/solutions/articles/151000169918), which is excluded. |
| [GBIF occurrence media](https://techdocs.gbif.org/en/data-publishing/multimedia-publishing) | Candidate discovery source; the media license can differ from the occurrence license. Verify each image separately. |
| [Danish Fungi 2020/2024](https://github.com/BohemianVRA/DanishFungiDataset/blob/main/README.md) | Strong research benchmark, but its authors say the data and models are **noncommercial only**; exclude from commercial training unless separate permission is secured. |
| [FungiTastic](https://github.com/BohemianVRA/FungiTastic) | Useful open-set and distribution-shift benchmark design. The repository’s code license does not establish rights to every underlying photo; exclude photos until their commercial terms are verified. |
| [USDA FoodData Central](https://fdc.nal.usda.gov/api-guide/) | Nutrition lookup during catalog preparation only. Bundle a verified exact-species record and its FDC ID offline. Do not infer wild-species nutrition from a generic mushroom entry. |

The dataset format is a CSV with these columns:

```text
specimen_id,observation_id,photo_path,view,species_id,toxicity,license,photographer,source_url,split,region,lookalike_group
```

`view` is `cap`, `underside`, or `base`; `unspecified` is accepted for training-only pilot photos. Every test specimen must have the three named views. `species_id=__none__` denotes a non-mushroom. The catalog is a JSON array of objects with `id`, `scientificName`, `toxicity` (`poisonous`, `edible`, `unknown`), and a `toxicitySource` for any edible/poisonous label. Optional `commonName` and `nutrition` may be included. Nutrition needs `sourceId`, `caloriesKcal`, `proteinG`, `carbsG`, and `fatG` per 100 g. IDs must exactly match between CSV and catalog. Only test specimens may have species IDs absent from the trained catalog.

### CC0 pilot run

`ml.collect_inat` downloads one CC0 photo per exact-species, research-grade iNaturalist observation and saves the source response and per-photo provenance. CC0 is a public-domain dedication, so the pilot does not rely on noncommercial or attribution-restricted photo licenses. The four mushroom species and a tree negative control are only a pipeline check. Community identifications are not expert-verified specimen labels, observation IDs do not prove two observations depict different physical specimens, and the photos have no verified cap/underside/base views. The pilot has no untouched test set and cannot support a likely-edible verdict.

```bash
python -m ml.collect_inat --per-class 40
python -m ml.train --manifest ml/data/inat-pilot/manifest.csv --catalog ml/data/inat-pilot/catalog.json --output ml/runs/inat-pilot --backbone mobilenet_v3_large --epochs 4 --workers 0 --accelerator cpu
python -m ml.pilot_report --manifest ml/data/inat-pilot/manifest.csv --checkpoint ml/runs/inat-pilot/checkpoints/best.ckpt --species-ids ml/runs/inat-pilot/species_ids.json --output ml/reports/inat-pilot.json
```

The collector saves photos and provenance under ignored `ml/data/`, training checkpoints under ignored `ml/runs/`, and validation diagnostics under ignored `ml/reports/`. Neither is installed in the app. The pilot report uses a 0.5 threshold on uncalibrated single-photo scores and cannot establish eating safety. For Lightning.ai, clone this repository into a Studio, install `ml/requirements.txt`, and run the same collector and training commands there; choose a GPU after reviewing Studio usage costs and change `--accelerator` to `gpu`.

## CNN choice and Lightning.ai workflow

The implemented model compares **MobileNetV3-Large** with **EfficientNetV2-S**, each with shared image features and mushroom-presence, species, and poisonous heads. [MobileNetV3](https://openaccess.thecvf.com/content_ICCV_2019/html/Howard_Searching_for_MobileNetV3_ICCV_2019_paper.html) was designed for phone latency; [EfficientNetV2](https://proceedings.mlr.press/v139/tan21a.html) is a strong accuracy/efficiency comparison. Neither is assumed best for this dataset: select on validation data by false-safe behavior, edible coverage, calibration, and measured device latency/size. Use starting weights only with documented commercial permission. Scalar temperature scaling follows [Guo et al.](https://proceedings.mlr.press/v70/guo17a.html); calibration must be checked on independent field data.

In a [Lightning AI Studio](https://lightning.ai/docs/overview/ai-studio/) with a GPU, put this repository and the licensed photos in the Studio, then run from the repository root:

```bash
python -m pip install -r ml/requirements.txt
python -m ml.train --manifest ml/data/manifest.csv --catalog ml/data/catalog.json --output ml/runs/mobilenet --backbone mobilenet_v3_large
python -m ml.train --manifest ml/data/manifest.csv --catalog ml/data/catalog.json --output ml/runs/efficientnet --backbone efficientnet_v2_s
```

Train/checkpoint selection uses only `train` and `validation`. Keep `calibration` separate for temperature fitting and any final operating-threshold selection. The currently coded thresholds (99.9% edible, 99% species, 0.1% poisonous look-alike) are **proposals**; they must be reviewed against calibration specimens and frozen before the untouched test run. Export and calibrate the selected checkpoint:

```bash
python -m ml.export --run ml/runs/mobilenet --checkpoint ml/runs/mobilenet/checkpoints/best.ckpt --catalog ml/data/catalog.json --output ml/models/v1
python -m ml.calibrate --manifest ml/data/manifest.csv --model-dir ml/models/v1
python -m ml.evaluate --manifest ml/data/manifest.csv --model-dir ml/models/v1 --report ml/reports/v1.json
```

`ml.evaluate` performs one candidate-rule evaluation on the untouched test split and records specimen-level decisions, per-poisonous-species results, look-alike errors, unfamiliar-species errors, non-mushroom errors, edible coverage, and unknown/uncertain rate. If you inspect test decisions and change the model, catalog, calibration, or thresholds, that set is no longer untouched; collect a new independent test set.

For a development build after an evaluated model is available:

```bash
python -m ml.install_model --model-dir ml/models/v1 --report ml/reports/v1.json --mobile-dir mobile --preview
```

The preview bundle always keeps `likelyEdible` off. Omitting `--preview` is allowed only when the report matches the ONNX/model metadata, the Python and mobile decision code, the mobile preprocessing code, and the release gate. Run a full camera-to-ONNX parity check and latency test on both target phones before any commercial build.

## Release metric

**Likely edible is the positive verdict.** The primary metric is `false-safe rate = poisonous specimens called likely edible / all poisonous specimens tested`. Also report `edible coverage = genuinely edible specimens called likely edible / all edible specimens tested`, the uncertain/unknown rate, and results by poisonous species. Zero edible coverage fails this implementation’s release gate.

The gate requires **zero observed false-safe decisions**, at least **2,995 independent poisonous specimens**, and a **one-sided 95% exact binomial upper bound ≤0.1%**. With zero errors, the bound is `1 - 0.05^(1/n)` ([NIST exact binomial method](https://itl.nist.gov/div898/software/dataplot/refman2/auxillar/exacbino.htm)). Look-alike, unfamiliar, and non-mushroom cohorts must be present with no likely-edible errors. This statistical criterion does **not** prove future false positives cannot happen. Re-run independent validation after every model or catalog update; without the gate, keep `likelyEdible` disabled.

## Checks

```bash
python3 -m unittest discover -s ml/tests -v
cd mobile
npm run test
npm run lint
npm run typecheck
npx expo-doctor
```
