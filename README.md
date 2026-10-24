# SokoAI

An offline iOS and Android mushroom field guide. The app bundles [BioCLIP 2](https://huggingface.co/imageomics/bioclip-2) (MIT), converted to TensorFlow Lite and restricted to the **51,406 fungal species** in its [TreeOfLife-200M](https://huggingface.co/datasets/imageomics/TreeOfLife-200M) species list (text embeddings CC0). BioCLIP 2 is a **species suggestion** model, not an eating-safety model. The app never reports a mushroom as safe to eat.

## What the app does

The user takes one photo of a mushroom and may add up to two more angles (underside, base). The model runs entirely on the phone and returns each photo's similarity to every fungal species. The app averages the photos' species probabilities and adds them up per genus. It has no poison probability output. The results are:

| Result | Rule |
| --- | --- |
| Not detected | No photo is similar enough to any fungal species (best similarity below 0.70); take a new photo. |
| Unknown | Image quality is poor, or no species or genus reaches a 60% match score. The closest three matches are still shown; do not eat. |
| Not safe to eat | A documented poisonous species matches, or a genus that includes deadly or seriously toxic species (*Amanita*, *Galerina*, *Lepiota*, *Cortinarius*, *Clitocybe*, *Inocybe*, *Gyromitra*) gets at least 5% of the match. This is a warning, not a validated diagnosis. |
| Uncertain | A species or genus reached a 60% match score and no warning applies. A possible match only; do not eat. |

The camera and results screen display a warning. Match scores are **uncalibrated**: they are not the chance a match is correct and never a poison probability. A [clinical study of mushroom identification apps](https://pubmed.ncbi.nlm.nih.gov/36794335/) found that photo-based apps could not reliably exclude poisonous mushrooms. The app does not upload photos or coordinates.

### History and species information

Every check is saved on the phone (`mobile/src/lib/history.ts`): its photos are copied into the app's document folder next to a JSON index, and the History screen lists them newest first. Nothing leaves the phone; deleting the app deletes the history.

Each species and each closest match opens a species page with its classification (kingdom to species, from TreeOfLife-200M), the toxicity this app can cite, and the introduction of its English Wikipedia article, or its genus's article when the species has none. The introductions come from the [2023-11-01 Wikipedia dump](https://huggingface.co/datasets/wikimedia/wikipedia) (CC BY-SA; the app credits each article and links to it) and are bundled for offline use. Rebuild them with `python -m ml.export_fungi_info --names txt_emb_species.json --mobile-dir mobile`. A missing toxicity record never means a species is safe.

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

The bundled model is BioCLIP 2's ViT-L/14 image encoder plus a fixed matrix of fungal species text embeddings, with dynamic-range int8 weights (349 MB, SHA-256 in `mobile/src/lib/fungiModel.ts`). It takes 224×224 RGB float32 pixels in NHWC order with values 0–255 and outputs cosine similarities. All weights are stored inside the flatbuffer: TFLite's C API, which the app uses, cannot read weights that the quantizer places after it by offset (invoke then fails with "Input tensor N lacks data"). Fully-connected layers quantize their inputs asymmetrically, because TFLite's ARM kernels return wrong results for these layers with symmetric input quantization when XNNPACK is not used. GitHub limits files to 100 MB, so it ships as four `.tflitepart` assets. On first use, the patched `react-native-fast-tflite` loader (`mobile/patches/`) joins them into one file in app storage and memory-maps it, instead of copying it onto the Java heap. That first launch therefore needs about 700 MB of free storage while the parts are copied. Rebuild it with `pip install -r ml/requirements.txt` and `python -m ml.export_bioclip2_fungi --mobile-dir mobile`.

## Model provenance

[BioCLIP 2](https://huggingface.co/imageomics/bioclip-2) is MIT-licensed. It was trained on TreeOfLife-200M, which draws on GBIF, EOL, BIOSCAN-5M and FathomNet images; confirm that this provenance meets your commercial requirements. The species text embeddings come from [TreeOfLife-200M](https://huggingface.co/datasets/imageomics/TreeOfLife-200M) (CC0). The [Danish Fungi](https://github.com/BohemianVRA/DanishFungiDataset/blob/main/README.md) photos used to measure accuracy are licensed for noncommercial use only and are not part of the app.

The interface uses [Host Grotesk](https://fonts.google.com/specimen/Host+Grotesk) (SIL Open Font License), bundled through `@expo-google-fonts/host-grotesk`.

The earlier iNaturalist preview model, the research pilot, and the untrained ONNX training pipeline were removed; they remain in git history before this change.

## Checks

```bash
cd mobile
npm run test
npm run lint
npm run typecheck
npx expo-doctor
```
