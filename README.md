# SokoAI

An offline iOS and Android mushroom field guide. The app bundles [BioCLIP 2](https://huggingface.co/imageomics/bioclip-2) (MIT), converted to TensorFlow Lite and restricted to the **51,406 fungal species** in its [TreeOfLife-200M](https://huggingface.co/datasets/imageomics/TreeOfLife-200M) species list (text embeddings CC0). The repository also keeps a reproducible Lightning/PyTorch training and evaluation pipeline. BioCLIP 2 is a **species suggestion** model, not an eating-safety model. The `likelyEdible` verdict remains disabled.

## What the app does

The user takes one photo of a mushroom and may add up to two more angles (underside, base). The model runs entirely on the phone and returns each photo's similarity to every fungal species. The app averages the photos' species probabilities and adds them up per genus. It has no poison probability output. The results are:

| Result | Rule |
| --- | --- |
| Not detected | No photo is similar enough to any fungal species (best similarity below 0.70); take a new photo. |
| Unknown | Image quality is poor, or no species or genus reaches a 60% match score. The closest three matches are still shown; do not eat. |
| Not safe to eat | A documented poisonous species matches, or a genus that includes deadly or seriously toxic species (*Amanita*, *Galerina*, *Lepiota*, *Cortinarius*, *Clitocybe*, *Inocybe*, *Gyromitra*) gets at least 5% of the match. This is a warning, not a validated diagnosis. |
| Uncertain | A species or genus reached a 60% match score and no warning applies. A possible match only; do not eat. |
| Likely edible | Reserved for a separately validated model that passes the release gate below. Never produced by BioCLIP 2. |

The camera and results screen display a warning. Match scores are **uncalibrated**: they are not the chance a match is correct and never a poison probability. A [clinical study of mushroom identification apps](https://pubmed.ncbi.nlm.nih.gov/36794335/) found that photo-based apps could not reliably exclude poisonous mushrooms. The app does not upload photos or coordinates.

### Measured behavior

Measured on held-out [Danish Fungi 2024](https://huggingface.co/datasets/maxvonk/danish-fungi-2024-pairs-800px) photos (expert-labelled, but only six common genera, and BioCLIP 2 may have seen some of these photos during training, so real-world accuracy is likely lower):

* Top-1 species 37%, top-5 species 69%, top-1 genus 87% when ranking all 51,406 species.
* With the app's thresholds on 300 photos: a species was named for 35 (31 correct) and a genus for 238 (231 correct); 49 of 50 photos of the toxic genera above got the warning.
* Not detected: 50 of 50 everyday-object photos ([Imagenette](https://github.com/fastai/imagenette)), 48 of 50 plant photos and 49 of 50 animal photos.
* The genus warning misses toxic species in mostly harmless genera (for example *Agaricus xanthodermus* or *Russula emetica*).

## Run the mobile app

```bash
cd mobile
npm ci
npx expo start --dev-client
```

The model uses native TensorFlow Lite through `react-native-fast-tflite`, so Expo Go cannot run it. The installed test APK contains the model; inference does not need network access. A development build needs Metro for its JavaScript during testing, while the `preview` APK bundles the JavaScript too. See [Expo development builds](https://docs.expo.dev/develop/development-builds/introduction/) for the device setup.

### Android test builds

For a standalone test install, run `npx eas-cli@latest build --platform android --profile preview` from `mobile/`, then install the APK from its Expo build page. It opens without Expo Go or Metro. For live editing, build the `development` profile instead, install that APK, start Metro with `npx expo start --dev-client --lan`, and open the project in SokoAI. A local alternative is `npx expo run:android --device` after installing Android Studio and its SDK. This model has not passed specimen-level field evaluation; no result grants permission to eat a mushroom. Each photo takes roughly 80 billion multiply-adds, so expect a few seconds per photo on a phone.

The bundled model is BioCLIP 2's ViT-L/14 image encoder plus a fixed matrix of fungal species text embeddings, with dynamic-range int8 weights (349 MB, SHA-256 in `mobile/src/lib/fungiModel.ts`). It takes 224×224 RGB float32 pixels in NHWC order with values 0–255 and outputs cosine similarities. GitHub limits files to 100 MB, so it ships as four `.tflitepart` assets. On first use, the patched `react-native-fast-tflite` loader (`mobile/patches/`) joins them into one file in app storage and memory-maps it, instead of copying it onto the Java heap. That first launch therefore needs about 700 MB of free storage while the parts are copied. Rebuild it with `pip install -r ml/requirements-bioclip.txt` and `python -m ml.export_bioclip2_fungi --mobile-dir mobile`.

## Data needed for a commercial model

1. Gather expert-checked, **specimen-level** cap/underside/base photos of edible, poisonous, difficult look-alike, unfamiliar, and non-mushroom examples. Prioritize real field photos from Georgia/Caucasus, varied phones, seasons, lighting, ages, and damaged specimens. Confirm species and toxicity independently of the image model; ambiguous labels belong in the unknown group.
2. Record the **license for each photo**, photographer, source URL, observation ID, and physical specimen ID. The loader accepts only `CC0`, `CC-BY-4.0`, or `OWNED` with documented commercial rights. CC BY needs attribution and a license link. Review contractual or other rights separately.
3. Keep all photos of a physical specimen in one split: `train`, `validation`, `calibration`, or `test`. The test set must have three views per specimen and no repeated specimen IDs. Manually audit duplicates and label quality; file hashing catches identical images but cannot catch near duplicates.
4. Reserve **at least 2,995 independent poisonous test specimens** from the supported region, with dangerous look-alikes represented, plus unfamiliar species and non-mushroom cases. This is a minimum for the aggregate bound, not a guarantee for every species.

Useful starting points:

| Source | Use for this commercial app |
| --- | --- |
| [iNaturalist observations/photos](https://www.inaturalist.org/pages/terms) | **Exclude from commercial AI training** under its current Terms of Use, which prohibit using any iNaturalist data to train commercial AI, even when individual photos have permissive licenses. Obtain explicit permission before considering this source. Its separately [released model-files repository](https://github.com/inaturalist/model-files) carries an MIT license for the small pretrained model the app bundled before BioCLIP 2. |
| [BioCLIP 2](https://huggingface.co/imageomics/bioclip-2) | Bundled model, MIT license. It was trained on TreeOfLife-200M, which draws on GBIF, EOL, BIOSCAN-5M and FathomNet images; confirm that this provenance meets your commercial requirements. |
| [GBIF occurrence media](https://techdocs.gbif.org/en/data-publishing/multimedia-publishing) | Candidate discovery source; the media license can differ from the occurrence license. Verify each image separately. |
| [Danish Fungi 2020/2024](https://github.com/BohemianVRA/DanishFungiDataset/blob/main/README.md) | Strong research benchmark, but its authors say the data and models are **noncommercial only**; exclude from commercial training unless separate permission is secured. |
| [FungiTastic](https://github.com/BohemianVRA/FungiTastic) | Useful open-set and distribution-shift benchmark design. The repository’s code license does not establish rights to every underlying photo; exclude photos until their commercial terms are verified. |
| [USDA FoodData Central](https://fdc.nal.usda.gov/api-guide/) | Nutrition lookup during catalog preparation only. Bundle a verified exact-species record and its FDC ID offline. Do not infer wild-species nutrition from a generic mushroom entry. |

The dataset format is a CSV with these columns:

```text
specimen_id,observation_id,photo_path,view,species_id,toxicity,license,photographer,source_url,split,region,lookalike_group
```

`view` is `cap`, `underside`, or `base`; `unspecified` is accepted for training-only pilot photos. Every test specimen must have the three named views. `species_id=__none__` denotes a non-mushroom. The catalog is a JSON array of objects with `id`, `scientificName`, `toxicity` (`poisonous`, `edible`, `unknown`), and a `toxicitySource` for any edible/poisonous label. Optional `commonName` and `nutrition` may be included. Nutrition needs `sourceId`, `caloriesKcal`, `proteinG`, `carbsG`, and `fatG` per 100 g. IDs must exactly match between CSV and catalog. Only test specimens may have species IDs absent from the trained catalog.

### Retired research pilot

The earlier four-species research pilot and its weights were removed from the mobile bundle. Its community-labeled, single-view photos were inadequate for eating-safety evaluation. The `ml.collect_inat` research collector remains in source history for reproducibility, but its output must not be used for commercial training under current iNaturalist Terms. Use independently sourced, commercially cleared, expert-labeled specimens for future training. For Lightning.ai, clone this repository into a Studio, install `ml/requirements.txt`, and train on that cleared dataset.

## CNN choice and Lightning.ai workflow

The implemented model offers **MobileNetV3-Large**, **EfficientNetV2-S**, and a compact GroupNorm CNN for scratch training, each with shared image features and mushroom-presence, species, and poisonous heads. [MobileNetV3](https://openaccess.thecvf.com/content_ICCV_2019/html/Howard_Searching_for_MobileNetV3_ICCV_2019_paper.html) was designed for phone latency; [EfficientNetV2](https://proceedings.mlr.press/v139/tan21a.html) is a strong accuracy/efficiency comparison. None is assumed best for this dataset: select on validation data by false-safe behavior, edible coverage, calibration, and measured device latency/size. Use starting weights only with documented commercial permission. Scalar temperature scaling follows [Guo et al.](https://proceedings.mlr.press/v70/guo17a.html); calibration must be checked on independent field data.

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

The `ml.install_model` command packages a future ONNX candidate for review:

```bash
python -m ml.install_model --model-dir ml/models/v1 --report ml/reports/v1.json --mobile-dir mobile --preview
```

The current mobile app runs only the pretrained TFLite preview and does not load this ONNX candidate. Native ONNX integration, matching preprocessing, and full camera-to-model parity and latency checks on both target phones are still required before a trained candidate can be used in the app. The `likelyEdible` verdict stays disabled until the independent release gate is met.

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
