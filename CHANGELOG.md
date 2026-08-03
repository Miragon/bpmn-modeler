# Changelog

## [1.6.1](https://github.com/Miragon/bpmn-modeler/compare/vscode-v1.6.0...vscode-v1.6.1) (2026-08-03)


### 🐞 Bug Fixes

* standalone release action fails ([#1296](https://github.com/Miragon/bpmn-modeler/issues/1296)) ([efa429a](https://github.com/Miragon/bpmn-modeler/commit/efa429a3a051d65cd8866fd1b8ed6642bb677376))

## [1.6.0](https://github.com/Miragon/bpmn-modeler/compare/vscode-v1.5.0...vscode-v1.6.0) (2026-08-03)


### 🎉 New Features

* **dmn-webview:** integrate DMN decision-table simulation ([#1295](https://github.com/Miragon/bpmn-modeler/issues/1295)) ([0b9f655](https://github.com/Miragon/bpmn-modeler/commit/0b9f655c7bd4868269514fbe3b9c052a71a3afed))
* **modeler-bridge:** apply .bpmnlintrc in the IntelliJ host ([#1291](https://github.com/Miragon/bpmn-modeler/issues/1291)) ([8a81d8d](https://github.com/Miragon/bpmn-modeler/commit/8a81d8defad3a0953f12f1826e797ff0c005ce09))
* package standalone modeler for linux ([#1260](https://github.com/Miragon/bpmn-modeler/issues/1260)) ([4a6d17c](https://github.com/Miragon/bpmn-modeler/commit/4a6d17cb7fa7cebf65a46817fb257a7ec05ad6c4))


### 🐞 Bug Fixes

* **intellij:** theme properties-panel input text for JCEF dark mode ([#1290](https://github.com/Miragon/bpmn-modeler/issues/1290)) ([7b41c85](https://github.com/Miragon/bpmn-modeler/commit/7b41c853bb844eacbc16f81ef3f17f2f44b632e0))
* **release:** sync intellij manifest to released 1.6.0 ([#1289](https://github.com/Miragon/bpmn-modeler/issues/1289)) ([2dd3e15](https://github.com/Miragon/bpmn-modeler/commit/2dd3e158a57673078d17fb71d0e0c26eda258bdc))


### 🛠️ Misc

* **deps:** bump the github-actions-all group with 3 updates ([#1292](https://github.com/Miragon/bpmn-modeler/issues/1292)) ([363d9bd](https://github.com/Miragon/bpmn-modeler/commit/363d9bdf0f22baf234bf16e34ebf3c081f18dc72))
* **deps:** bump the github-actions-all group with 5 updates ([#1284](https://github.com/Miragon/bpmn-modeler/issues/1284)) ([d4d96b3](https://github.com/Miragon/bpmn-modeler/commit/d4d96b38769903a74e62d944f1fb8cb21b28c471))
* **intellij:** commit one bundled-webview marker per release cycle ([#1280](https://github.com/Miragon/bpmn-modeler/issues/1280)) ([883136a](https://github.com/Miragon/bpmn-modeler/commit/883136a827dda030c2b42b78cced1042b9ae4f12))
* **main:** release intellij 1.6.1 ([#1279](https://github.com/Miragon/bpmn-modeler/issues/1279)) ([2584d31](https://github.com/Miragon/bpmn-modeler/commit/2584d31c67e0dffbf4ff561d4df5ce1cac47e900))

## [1.5.0](https://github.com/Miragon/bpmn-modeler/compare/vscode-v1.4.0...vscode-v1.5.0) (2026-07-17)


### 🎉 New Features

* add Reload Modeler command and port modeler commands to IntelliJ ([#1271](https://github.com/Miragon/bpmn-modeler/issues/1271)) ([4a02932](https://github.com/Miragon/bpmn-modeler/commit/4a029329b13252698b9bbc246c03727bca85ff90))
* **bpmn-webview:** add canvas focus indicator ([#1277](https://github.com/Miragon/bpmn-modeler/issues/1277)) ([edac76c](https://github.com/Miragon/bpmn-modeler/commit/edac76c98f12d145fc74bdfd3cdc03bdb0f72e58))
* **bpmn-webview:** add keyboard focus and append-menu arrow navigation ([#1269](https://github.com/Miragon/bpmn-modeler/issues/1269)) ([a0df4a0](https://github.com/Miragon/bpmn-modeler/commit/a0df4a0d9a700f694a893abd54cb6a1df20d748a))
* **demo-webapp:** add static online demo of the BPMN/DMN modeler ([#1270](https://github.com/Miragon/bpmn-modeler/issues/1270)) ([3a6a290](https://github.com/Miragon/bpmn-modeler/commit/3a6a290b9dd9b7f3b502b76636ff3161dc0e6a5f))
* **docs:** link intellij jetbrains marketplace download ([#1257](https://github.com/Miragon/bpmn-modeler/issues/1257)) ([ac6a6df](https://github.com/Miragon/bpmn-modeler/commit/ac6a6df1bfaa714c27e7474f480b0315f9b433ac))
* edit inline scripts in real files with a single-writer lock ([#1264](https://github.com/Miragon/bpmn-modeler/issues/1264)) ([970ef1f](https://github.com/Miragon/bpmn-modeler/commit/970ef1fd4f49bf49ae4167021e861d5e521c4ee7))
* **intellij:** modernize the .bpmn file icon in the project tree ([#1276](https://github.com/Miragon/bpmn-modeler/issues/1276)) ([7c98ddb](https://github.com/Miragon/bpmn-modeler/commit/7c98ddbc9a742c61021d44bf9d715ef5b0ba458d))
* **vscode-plugin:** add new bpmn/dmn model commands under a shared palette category ([#1256](https://github.com/Miragon/bpmn-modeler/issues/1256)) ([4df40fd](https://github.com/Miragon/bpmn-modeler/commit/4df40fd0a9e27862a187a4f2e34202bd31ec8fe5))
* **vscode-plugin:** improve inline-script intellisense and manifest robustness ([#1262](https://github.com/Miragon/bpmn-modeler/issues/1262)) ([2a026af](https://github.com/Miragon/bpmn-modeler/commit/2a026afd2ac96cbee16e71243e82ea48aaea9d2d))


### 🐞 Bug Fixes

* **bpmn-webview:** move focus indicator to top right corner ([#1278](https://github.com/Miragon/bpmn-modeler/issues/1278)) ([0f60900](https://github.com/Miragon/bpmn-modeler/commit/0f60900b4c646a9af692dd7f24df4c991ff3a1d1))
* **demo-webapp:** make the Netlify monorepo build install cleanly ([#1272](https://github.com/Miragon/bpmn-modeler/issues/1272)) ([6a9a774](https://github.com/Miragon/bpmn-modeler/commit/6a9a774ca2be40dee4702d279823c54b6445188f))
* **demo-webapp:** point the Netlify publish dir at the repo-root dist/demo ([#1273](https://github.com/Miragon/bpmn-modeler/issues/1273)) ([9793975](https://github.com/Miragon/bpmn-modeler/commit/9793975c0858a81c015d24fc5acfb748ef02fb91))
* **release:** repair vscode auto-publish and intellij release line ([#1249](https://github.com/Miragon/bpmn-modeler/issues/1249)) ([323847c](https://github.com/Miragon/bpmn-modeler/commit/323847c0b5e0c1c444f695cf12ca6efb36fe3cb6))
* **templates:** stop keychain popup when adding a public marketplace ([#1253](https://github.com/Miragon/bpmn-modeler/issues/1253)) ([b59dddc](https://github.com/Miragon/bpmn-modeler/commit/b59dddc30b89500bb0eb1f5a6073d95a13243084))
* **vscode:** recover from unregistered marketplaces settings key ([#1252](https://github.com/Miragon/bpmn-modeler/issues/1252)) ([222ec01](https://github.com/Miragon/bpmn-modeler/commit/222ec0149e4bebad36ed98bf122d6149b9d57338))


### 🔨 Refactoring

* **bpmn-i18n:** enforce locale key-parity and fix key drift ([#1254](https://github.com/Miragon/bpmn-modeler/issues/1254)) ([a8fee1f](https://github.com/Miragon/bpmn-modeler/commit/a8fee1ffdca28543e303b41f259457d8a9cd7967))


### 📔 Documentation

* add apps and libs overview readmes ([#1268](https://github.com/Miragon/bpmn-modeler/issues/1268)) ([53c7ee5](https://github.com/Miragon/bpmn-modeler/commit/53c7ee5c3eadc12c23687e67dff3a759c7313147))


### 🛠️ Misc

* **agent:** refresh stale settings, docs and gitignore ([#1263](https://github.com/Miragon/bpmn-modeler/issues/1263)) ([15552b7](https://github.com/Miragon/bpmn-modeler/commit/15552b7630048975edd4840768e30c6457286bd9))
* **conductor:** add run targets for dmn and deployment webviews ([#1258](https://github.com/Miragon/bpmn-modeler/issues/1258)) ([1b13af9](https://github.com/Miragon/bpmn-modeler/commit/1b13af954848f5a6368635d52eb5ced96ac67906))
* **deps:** bump the github-actions-all group with 4 updates ([#1266](https://github.com/Miragon/bpmn-modeler/issues/1266)) ([88057a2](https://github.com/Miragon/bpmn-modeler/commit/88057a275ac158c1ed80449de7a9dce7e2dd4eeb))

## [1.4.0](https://github.com/Miragon/bpmn-modeler/compare/vscode-v1.3.0...vscode-v1.4.0) (2026-07-08)


### 🎉 New Features

* **intellij-plugin:** show loading spinner while element templates load ([#1234](https://github.com/Miragon/bpmn-modeler/issues/1234)) ([c1044f3](https://github.com/Miragon/bpmn-modeler/commit/c1044f347d8c7c907c4186fe648f7fe3204a60dc))
* **templates:** add element template marketplace for GitHub/GitLab repos ([#1184](https://github.com/Miragon/bpmn-modeler/issues/1184)) ([05e86b6](https://github.com/Miragon/bpmn-modeler/commit/05e86b65e26583b1d1d24110dd9c07664a128f19))


### 🐞 Bug Fixes

* **bpmn-webview:** make element template search fuzzy and rank results ([#1232](https://github.com/Miragon/bpmn-modeler/issues/1232)) ([a950760](https://github.com/Miragon/bpmn-modeler/commit/a95076041afb7c66432cb9b727db4941a2084c54))
* **intellij-plugin:** make Ctrl+Z/Ctrl+Y undo/redo work on the canvas ([#1236](https://github.com/Miragon/bpmn-modeler/issues/1236)) ([6bd15fb](https://github.com/Miragon/bpmn-modeler/commit/6bd15fbec223a97b1b1ca893f4cf699b7395f718))


### 📔 Documentation

* **intellij:** switch install guide to jetbrains marketplace ([#1215](https://github.com/Miragon/bpmn-modeler/issues/1215)) ([6104f0e](https://github.com/Miragon/bpmn-modeler/commit/6104f0e28aadb507e64e394fb72e4e13b82ebc7a))


### 🛠️ Misc

* **conductor:** replace autostart with selectable run targets ([#1240](https://github.com/Miragon/bpmn-modeler/issues/1240)) ([8fe0c58](https://github.com/Miragon/bpmn-modeler/commit/8fe0c58465609bc4d0afa1d74fabb48180b70b13))
* **main:** release intellij 1.4.0 ([#1243](https://github.com/Miragon/bpmn-modeler/issues/1243)) ([9e768fc](https://github.com/Miragon/bpmn-modeler/commit/9e768fc88916ba0a43d7713b7d4d27f54cdf1d24))
* **release:** rework release-please into independent per-host lines ([#1237](https://github.com/Miragon/bpmn-modeler/issues/1237)) ([98dcec2](https://github.com/Miragon/bpmn-modeler/commit/98dcec2261c61e2e85aac46141987f7e6af0f33f))

## [1.3.0](https://github.com/Miragon/bpmn-modeler/compare/v1.2.1...v1.3.0) (2026-07-07)


### 🎉 New Features

* **logging:** improve output channel logging ([#1214](https://github.com/Miragon/bpmn-modeler/issues/1214)) ([00c06b7](https://github.com/Miragon/bpmn-modeler/commit/00c06b7be8a336d846f29945e01f51e33b319b5f))
* **vscode-plugin:** add get-started walkthrough for onboarding ([#1230](https://github.com/Miragon/bpmn-modeler/issues/1230)) ([f36d5fb](https://github.com/Miragon/bpmn-modeler/commit/f36d5fb52cdcb885a2007dbdccb3328af0743cb5))


### 🐞 Bug Fixes

* **intellij-plugin:** mitigate out-of-process JCEF rendering jank ([#1205](https://github.com/Miragon/bpmn-modeler/issues/1205)) ([60af8c3](https://github.com/Miragon/bpmn-modeler/commit/60af8c3dca80fa993a459ae10d914f4940c647fd))
* **vscode-plugin:** find element templates on Windows + VS Code ([#1213](https://github.com/Miragon/bpmn-modeler/issues/1213)) ([8f5e5d7](https://github.com/Miragon/bpmn-modeler/commit/8f5e5d7b6be4eda7029818c2b3e00aca03a306e9))
* **vscode-plugin:** open code-link implementation in a persistent tab ([#1226](https://github.com/Miragon/bpmn-modeler/issues/1226)) ([#1227](https://github.com/Miragon/bpmn-modeler/issues/1227)) ([428f219](https://github.com/Miragon/bpmn-modeler/commit/428f2192019f6a19865fa28f70355d659431ca7b))
* **vscode-plugin:** show search spinner inside the navigation selection list ([#1229](https://github.com/Miragon/bpmn-modeler/issues/1229)) ([94de398](https://github.com/Miragon/bpmn-modeler/commit/94de398e8d377cd8581c772ae75fe4a74776d696))


### 🛠️ Misc

* **ci:** pin github actions to commit shas ([#1228](https://github.com/Miragon/bpmn-modeler/issues/1228)) ([5a5777a](https://github.com/Miragon/bpmn-modeler/commit/5a5777af5604111d656d6a1fdec8140f2c2f051a))
* **deps:** bump the github-actions-all group with 2 updates ([#1221](https://github.com/Miragon/bpmn-modeler/issues/1221)) ([84c800f](https://github.com/Miragon/bpmn-modeler/commit/84c800fe4c404db69c96ed5826ba45585629e896))
* **deps:** bump the gradle-minor-patch group in /apps/intellij-plugin with 3 updates ([#1222](https://github.com/Miragon/bpmn-modeler/issues/1222)) ([878a1cf](https://github.com/Miragon/bpmn-modeler/commit/878a1cfff896f436fbd4942777d05c0ad8d63db4))
* **intellij-plugin:** auto-publish signed plugin to jetbrains marketplace ([#1216](https://github.com/Miragon/bpmn-modeler/issues/1216)) ([3999c50](https://github.com/Miragon/bpmn-modeler/commit/3999c5066cb79bb44d9db0df94f3f3b0b47a75d0))

## [1.2.1](https://github.com/Miragon/bpmn-modeler/compare/v1.2.0...v1.2.1) (2026-07-03)


### 🐞 Bug Fixes

* **bpmn-webview:** keep diagram readable in dark mode during token simulation ([#1208](https://github.com/Miragon/bpmn-modeler/issues/1208)) ([c4d6f0d](https://github.com/Miragon/bpmn-modeler/commit/c4d6f0d6aa428b81e0c53b5744930ddef87e21ef))
* **intellij-plugin:** fix JCEF module dependency and drop internal plugin lookup on 2026.2 ([#1206](https://github.com/Miragon/bpmn-modeler/issues/1206)) ([c52323f](https://github.com/Miragon/bpmn-modeler/commit/c52323f8c9a123265c00bc9a2c30935e6426c732))
* **intellij-plugin:** resolve JetBrains Marketplace verification rejection ([#1203](https://github.com/Miragon/bpmn-modeler/issues/1203)) ([54007d4](https://github.com/Miragon/bpmn-modeler/commit/54007d4ffb2e80b9403d00b4f2e2728f0559b50e))


### 🛠️ Misc

* **deps:** bump the npm-minor-patch group across 1 directory with 39 updates ([#1194](https://github.com/Miragon/bpmn-modeler/issues/1194)) ([42c77c4](https://github.com/Miragon/bpmn-modeler/commit/42c77c4bdeb964242a1d2c520f7f4d20a2010b20))
* **intellij-plugin:** add local dev/test tooling and dark-mode preview ([#1209](https://github.com/Miragon/bpmn-modeler/issues/1209)) ([e41b42f](https://github.com/Miragon/bpmn-modeler/commit/e41b42f4cc5314a299f7b64fffcc8810a4ef5561))
* **release:** silence release pipeline warnings ([#1201](https://github.com/Miragon/bpmn-modeler/issues/1201)) ([fc2eeac](https://github.com/Miragon/bpmn-modeler/commit/fc2eeac67d963a3b8c806aa8f0b540deab619491))

## [1.2.0](https://github.com/Miragon/bpmn-modeler/compare/v1.1.2...v1.2.0) (2026-07-01)


### 🎉 New Features

* **dmn-webview:** follow VS Code color theme ([#1164](https://github.com/Miragon/bpmn-modeler/issues/1164)) ([5f0a513](https://github.com/Miragon/bpmn-modeler/commit/5f0a5131f1e746b0979d6098bdfc5d73df70c4b2))
* **editor:** integrate bpmnlint for in-modeler validation ([#1176](https://github.com/Miragon/bpmn-modeler/issues/1176)) ([0002f57](https://github.com/Miragon/bpmn-modeler/commit/0002f571c7a73463718daa8c1b8679f9c1fa6c6e))
* **intellij:** add icon and follow IDE color theme in deployment webview ([#1180](https://github.com/Miragon/bpmn-modeler/issues/1180)) ([a6f5def](https://github.com/Miragon/bpmn-modeler/commit/a6f5def012d51ef0c2c5ca10c93765eaf39729a0))
* **scripting:** add *.bpmn.vars.json process-variable manifest override ([#1182](https://github.com/Miragon/bpmn-modeler/issues/1182)) ([d117909](https://github.com/Miragon/bpmn-modeler/commit/d1179099bbe509ef6e2d81e1df3abf23ba8868d4))
* **scripting:** add Camunda SPIN script completion ([#1181](https://github.com/Miragon/bpmn-modeler/issues/1181)) ([69c02de](https://github.com/Miragon/bpmn-modeler/commit/69c02dec05f9590aad6255b104849ee8dafff375))


### 🐞 Bug Fixes

* **bpmn-webview:** keep side-by-side text editor focused while typing ([#1178](https://github.com/Miragon/bpmn-modeler/issues/1178)) ([450b2b5](https://github.com/Miragon/bpmn-modeler/commit/450b2b5bed807f91c80d4548dc66fa8fa61304c4))
* **vscode-plugin:** stop contributing Miragon workbench themes ([#1190](https://github.com/Miragon/bpmn-modeler/issues/1190)) ([#1192](https://github.com/Miragon/bpmn-modeler/issues/1192)) ([c24e15a](https://github.com/Miragon/bpmn-modeler/commit/c24e15a041fc7047aff306dc89bff37ac1b4d7c2))


### 🔨 Refactoring

* **bridge:** explicit causation for write echoes and acked persists ([#1179](https://github.com/Miragon/bpmn-modeler/issues/1179)) ([4387cf2](https://github.com/Miragon/bpmn-modeler/commit/4387cf2db0149e0120ddff449bf48aee06070842))
* **webview:** rename vscode host channel to host-neutral HostApi ([#1183](https://github.com/Miragon/bpmn-modeler/issues/1183)) ([b747c82](https://github.com/Miragon/bpmn-modeler/commit/b747c82c2c544dfd0517fb8cf825540206e778f4))


### 🛠️ Misc

* **ci:** pin github actions to exact version tags ([#1170](https://github.com/Miragon/bpmn-modeler/issues/1170)) ([89e876b](https://github.com/Miragon/bpmn-modeler/commit/89e876b7ef98901f626ada1c722f512567d1b908))
* **deps:** bump gradle-wrapper from 9.5.1 to 9.6.0 in /apps/intellij-plugin in the gradle-minor-patch group ([#1187](https://github.com/Miragon/bpmn-modeler/issues/1187)) ([1b7722e](https://github.com/Miragon/bpmn-modeler/commit/1b7722ebccb6b95fab3ad01317c6288b240d1bc3))
* **deps:** bump org.junit:junit-bom from 5.11.4 to 6.1.0 in /apps/intellij-plugin in the gradle-major group ([#1167](https://github.com/Miragon/bpmn-modeler/issues/1167)) ([887a2e5](https://github.com/Miragon/bpmn-modeler/commit/887a2e57b4fcfbb4e7fe27a72cea6ae1c2890fb5))
* **deps:** bump the github-actions-all group with 2 updates ([#1186](https://github.com/Miragon/bpmn-modeler/issues/1186)) ([5ed8bd3](https://github.com/Miragon/bpmn-modeler/commit/5ed8bd34434e547c6d7cab896e6f689d0d1f43a2))
* **deps:** bump the github-actions-all group with 5 updates ([#1166](https://github.com/Miragon/bpmn-modeler/issues/1166)) ([e8ade97](https://github.com/Miragon/bpmn-modeler/commit/e8ade9754e80a97396b07e0f3239e247750ecbaa))
* **deps:** bump the npm-major group across 1 directory with 3 updates ([#1168](https://github.com/Miragon/bpmn-modeler/issues/1168)) ([c89cf17](https://github.com/Miragon/bpmn-modeler/commit/c89cf17296edb563f2b70ea7c367fd31070e9cf3))
* **deps:** bump the npm-minor-patch group across 1 directory with 46 updates ([#1175](https://github.com/Miragon/bpmn-modeler/issues/1175)) ([7371fd8](https://github.com/Miragon/bpmn-modeler/commit/7371fd8cfbe665b5254376b1ea4116fc82fa75ed))
* **intellij-plugin:** add JUnit 5 bridge harness + PR test/coverage CI ([#1163](https://github.com/Miragon/bpmn-modeler/issues/1163)) ([2ddc1f6](https://github.com/Miragon/bpmn-modeler/commit/2ddc1f6851eff3df32ab3852758c02452911cf30))
* **modeler-bridge:** single-source-of-truth for the host↔core RPC protocol ([#1161](https://github.com/Miragon/bpmn-modeler/issues/1161)) ([bb2b2cb](https://github.com/Miragon/bpmn-modeler/commit/bb2b2cb94e94edd9a7c851eff22b02c05c04c7ea))
* publish to Open VSX Marketplace ([#1191](https://github.com/Miragon/bpmn-modeler/issues/1191)) ([520b38f](https://github.com/Miragon/bpmn-modeler/commit/520b38f1120692a6b797971dec723ed3c18a2054))
* **release:** move intellij plugin version out of build.gradle.kts ([#1165](https://github.com/Miragon/bpmn-modeler/issues/1165)) ([aa8e1ae](https://github.com/Miragon/bpmn-modeler/commit/aa8e1aea0f39b6cd5e1e9a16c6abfed19efe0b09))
* standardize portless dev scripts and pin portless dependency ([#1174](https://github.com/Miragon/bpmn-modeler/issues/1174)) ([ae4a83f](https://github.com/Miragon/bpmn-modeler/commit/ae4a83f8dfa751e79b255f95ae02b361ef844c35))

## [1.1.2](https://github.com/Miragon/bpmn-modeler/compare/v1.1.1...v1.1.2) (2026-06-17)


### 🐞 Bug Fixes

* **standalone:** restore installer builds and stop release-please loop ([#1158](https://github.com/Miragon/bpmn-modeler/issues/1158)) ([9115cd8](https://github.com/Miragon/bpmn-modeler/commit/9115cd8c59f899691be9afc0f88a8f1c709e6487))


### 🛠️ Misc

* **ci:** add cost-tuned CodeQL advanced-setup workflow ([#1159](https://github.com/Miragon/bpmn-modeler/issues/1159)) ([bbd017a](https://github.com/Miragon/bpmn-modeler/commit/bbd017ab71b36bc8eab926c347e7c9b54a92f2e0))
* **release:** refresh updatePlugins.xml for v1.1.1 ([f67831f](https://github.com/Miragon/bpmn-modeler/commit/f67831fa9e878ce6060addf5828121e24e851733))

## [1.1.1](https://github.com/Miragon/bpmn-modeler/compare/v1.1.0...v1.1.1) (2026-06-17)


### 🛠️ Misc

* **release:** fan out host publishing and fix download page ([#1156](https://github.com/Miragon/bpmn-modeler/issues/1156)) ([3a85ac1](https://github.com/Miragon/bpmn-modeler/commit/3a85ac1359a18495e7cd1fdcee41197b55f8657f))
* **release:** refresh updatePlugins.xml for v1.1.0 ([ae6c980](https://github.com/Miragon/bpmn-modeler/commit/ae6c9805667f505606173147da9c6ff41b1f557e))

## [1.1.0](https://github.com/Miragon/bpmn-modeler/compare/v1.0.1...v1.1.0) (2026-06-16)


### 🎉 New Features

* **bpmn-webview:** close properties panel with a single click ([#1133](https://github.com/Miragon/bpmn-modeler/issues/1133)) ([3ccd74e](https://github.com/Miragon/bpmn-modeler/commit/3ccd74e13b87d5485cf33630d9fde7d484d3df93))
* **codeLink:** navigate from BPMN tasks to their source code ([#1075](https://github.com/Miragon/bpmn-modeler/issues/1075)) ([f9dc414](https://github.com/Miragon/bpmn-modeler/commit/f9dc414d5c7b7e83b09831ed59bb840b2d3181a4))
* **deployment:** Camunda 7 & 8 deployment on the IntelliJ host ([#1096](https://github.com/Miragon/bpmn-modeler/issues/1096)) ([f9bea50](https://github.com/Miragon/bpmn-modeler/commit/f9bea50f519f83b572ff878403403ba964f7d9ca))
* **dmn-webview:** add open/close and resize for the properties panel ([#1139](https://github.com/Miragon/bpmn-modeler/issues/1139)) ([78866e8](https://github.com/Miragon/bpmn-modeler/commit/78866e83b7c89b261b696e83854dc5760f6d399e))
* **intellij:** add scriptTask "Edit Script" via the bridge ([#1097](https://github.com/Miragon/bpmn-modeler/issues/1097)) ([c50b1fb](https://github.com/Miragon/bpmn-modeler/commit/c50b1fba359967ed3ecac9b496c4701839d6f546))
* **intellij:** Camunda code completion for the "Edit Script" editor ([#1098](https://github.com/Miragon/bpmn-modeler/issues/1098)) ([2d0610e](https://github.com/Miragon/bpmn-modeler/commit/2d0610e490247b442853cd117a08cfcefcdc78b6))
* **intellij:** cross-platform element-templates watcher via chokidar ([#1085](https://github.com/Miragon/bpmn-modeler/issues/1085)) ([6534fe6](https://github.com/Miragon/bpmn-modeler/commit/6534fe609b001262fc6f211366d2ddaf032e0c2c))
* **intellij:** distribute plugin via GitHub Releases + Pages ([#1109](https://github.com/Miragon/bpmn-modeler/issues/1109)) ([f43bd93](https://github.com/Miragon/bpmn-modeler/commit/f43bd93c85cb1afedab6b358cc3aab7525c18383))
* **intellij:** follow IDE color theme in JCEF webview ([#1124](https://github.com/Miragon/bpmn-modeler/issues/1124)) ([5a779b9](https://github.com/Miragon/bpmn-modeler/commit/5a779b90629926c672fa2c67775fda2c93f2b560))
* **intellij:** host foundation — bridge, supervisor, plugin skeleton ([#1082](https://github.com/Miragon/bpmn-modeler/issues/1082)) ([a95cd0a](https://github.com/Miragon/bpmn-modeler/commit/a95cd0a725d37dc4a51334a4fa709de951663269))
* **intellij:** implement Picker host port with JBPopup ([#1087](https://github.com/Miragon/bpmn-modeler/issues/1087)) ([93f41e4](https://github.com/Miragon/bpmn-modeler/commit/93f41e414e5a228b0eb19b9ffc0bc386dde3bfdb))
* **intellij:** implement Settings host port ([#1088](https://github.com/Miragon/bpmn-modeler/issues/1088)) ([c054266](https://github.com/Miragon/bpmn-modeler/commit/c054266eb52a339becbbeb7d204b398751105a15))
* **intellij:** marketplace-ready listing polish ([#1112](https://github.com/Miragon/bpmn-modeler/issues/1112)) ([48ba1ee](https://github.com/Miragon/bpmn-modeler/commit/48ba1eebe2f9104c43dcec69267879c1a6498dfe))
* **intellij:** promote BPMN diff to production ([#1089](https://github.com/Miragon/bpmn-modeler/issues/1089)) ([7b848c7](https://github.com/Miragon/bpmn-modeler/commit/7b848c78767034e4de7df6a6d07aaddafcc6a16a))
* **intellij:** promote bpmn editor to production over the core seam ([#1086](https://github.com/Miragon/bpmn-modeler/issues/1086)) ([3270a84](https://github.com/Miragon/bpmn-modeler/commit/3270a84bbe8a51f594703df8395b2e64dd9715fa))
* **intellij:** SecretStore host port backed by PasswordSafe ([#1084](https://github.com/Miragon/bpmn-modeler/issues/1084)) ([6a53644](https://github.com/Miragon/bpmn-modeler/commit/6a53644c344be646c176198d5b78a5f4d69fa61c))
* **intellij:** wire clipboard port to the IntelliJ system clipboard ([#1083](https://github.com/Miragon/bpmn-modeler/issues/1083)) ([a593b55](https://github.com/Miragon/bpmn-modeler/commit/a593b55394204ea97fbab57efabb87a9872f6d9a))
* **intellij:** wire model navigation through the bridge ([#1095](https://github.com/Miragon/bpmn-modeler/issues/1095)) ([f80e56a](https://github.com/Miragon/bpmn-modeler/commit/f80e56af95ab742d530cc11a12a11a6737f15bf3))
* **modeler-cli:** ship modeler as a Node-free Bun binary ([#1081](https://github.com/Miragon/bpmn-modeler/issues/1081)) ([3b3bf2f](https://github.com/Miragon/bpmn-modeler/commit/3b3bf2fe173d5394089fd4fecc0b8d7d00771508))
* **scriptTask:** process-variable IntelliSense for inline BPMN scripts ([#1121](https://github.com/Miragon/bpmn-modeler/issues/1121)) ([a94c692](https://github.com/Miragon/bpmn-modeler/commit/a94c69212ef909706e8738cadd7a4c281150af04))
* **standalone:** support Windows NSIS builds ([#1143](https://github.com/Miragon/bpmn-modeler/issues/1143)) ([6c2a2cd](https://github.com/Miragon/bpmn-modeler/commit/6c2a2cd74e37b837c62186ad797065300280dd56))


### 🐞 Bug Fixes

* **bpmn-webview:** apply element colour changes in dark mode ([#1135](https://github.com/Miragon/bpmn-modeler/issues/1135)) ([6728af5](https://github.com/Miragon/bpmn-modeler/commit/6728af5c54aae6da508350a320a5c15988743c9c))
* **bpmn-webview:** fit diagram to viewport on fresh open ([#1152](https://github.com/Miragon/bpmn-modeler/issues/1152)) ([f7f6a40](https://github.com/Miragon/bpmn-modeler/commit/f7f6a406626f885abf143d0c4ae51bcb9e244f62))
* intelliJ migration review fixes + repo cleanup ([#1107](https://github.com/Miragon/bpmn-modeler/issues/1107)) ([fac6a58](https://github.com/Miragon/bpmn-modeler/commit/fac6a582de3da75f33523806e2bd189cf252948f))
* **intellij:** give properties-panel inputs a contrasting fill in JCEF ([#1142](https://github.com/Miragon/bpmn-modeler/issues/1142)) ([637c9b2](https://github.com/Miragon/bpmn-modeler/commit/637c9b2bea79acf41a06a3b4dc2a6a4b7acc7002))
* **intellij:** remove until-build upper bound so plugin installs on newer IDEs ([#1111](https://github.com/Miragon/bpmn-modeler/issues/1111)) ([294943e](https://github.com/Miragon/bpmn-modeler/commit/294943eafa91df9112f2bcc0ecc848d199aabb3c))
* **intellij:** spawn the modeler bridge off the EDT to stop IDE freezes ([#1138](https://github.com/Miragon/bpmn-modeler/issues/1138)) ([9fa6a54](https://github.com/Miragon/bpmn-modeler/commit/9fa6a54467be937069540358f2e62e2ad0bc203e))
* **modeler-bridge:** poll on Windows so chokidar stops locking element-templates ([#1153](https://github.com/Miragon/bpmn-modeler/issues/1153)) ([80bdb71](https://github.com/Miragon/bpmn-modeler/commit/80bdb7194579a67321ee70868b7047a821e3dcbb))


### 🔨 Refactoring

* **bridge:** decompose createBridge() into per-feature composition modules ([#1137](https://github.com/Miragon/bpmn-modeler/issues/1137)) ([6ee94c1](https://github.com/Miragon/bpmn-modeler/commit/6ee94c1e003284c6137158d600ec4a604ed7e413))
* **intellij:** split CoreProcess into supervisor, RPC channel, and feature routers ([#1140](https://github.com/Miragon/bpmn-modeler/issues/1140)) ([e9f8fc5](https://github.com/Miragon/bpmn-modeler/commit/e9f8fc50c96061f8a3838859ff3d0ef18e7dfb89))
* **modeler-core:** extract vscode-free engine package ([#1080](https://github.com/Miragon/bpmn-modeler/issues/1080)) ([92467dc](https://github.com/Miragon/bpmn-modeler/commit/92467dcb76bb6ea3ffc3214f8506adc6d7999a5c))


### 📔 Documentation

* **agent:** add commit conventions guide and disable Claude attribution ([#1074](https://github.com/Miragon/bpmn-modeler/issues/1074)) ([d9101ad](https://github.com/Miragon/bpmn-modeler/commit/d9101adffd7a7a5e2234a42b23152110aced5868))
* **libs:** add readmes for previously undocumented libraries ([#1125](https://github.com/Miragon/bpmn-modeler/issues/1125)) ([c140e21](https://github.com/Miragon/bpmn-modeler/commit/c140e21234fa3e4e7eda94b515eac67b50410802))
* **readme:** left-align header and fix broken badges ([#1144](https://github.com/Miragon/bpmn-modeler/issues/1144)) ([51d4756](https://github.com/Miragon/bpmn-modeler/commit/51d4756616ef00fce6ddf7d8b63c1bba49452b54))


### 🛠️ Misc

* **ci:** mint App token for intellij publish instead of RELEASE_PAT ([#1154](https://github.com/Miragon/bpmn-modeler/issues/1154)) ([0e3512f](https://github.com/Miragon/bpmn-modeler/commit/0e3512fc3afa0fe5295bd2ef94d67f5e0231b5d2))
* **ci:** skip codecov report on package.json-only changes ([#1151](https://github.com/Miragon/bpmn-modeler/issues/1151)) ([324592e](https://github.com/Miragon/bpmn-modeler/commit/324592e30938505badbc7620432debf85b1586ba))
* **ci:** tier dependabot cooldown, split major from minor+patch, cover gradle ([#1126](https://github.com/Miragon/bpmn-modeler/issues/1126)) ([fa9023c](https://github.com/Miragon/bpmn-modeler/commit/fa9023c2aad37ff8841a8ff1b81d9d6db6b66760))
* **deps:** bump actions/cache from 4 to 5 in the github-actions-all group ([#1078](https://github.com/Miragon/bpmn-modeler/issues/1078)) ([0976c45](https://github.com/Miragon/bpmn-modeler/commit/0976c450d5111068d5a2767b4cda78b958b6d759))
* **deps:** bump codecov/codecov-action from 6 to 7 in the github-actions-all group ([#1090](https://github.com/Miragon/bpmn-modeler/issues/1090)) ([a911e97](https://github.com/Miragon/bpmn-modeler/commit/a911e97cfdd6093fa593f97304cad240c32c602c))
* **deps:** bump gradle-wrapper from 8.11.1 to 9.5.1 in /apps/intellij-plugin in the gradle-major group across 1 directory ([#1129](https://github.com/Miragon/bpmn-modeler/issues/1129)) ([c5a2d6e](https://github.com/Miragon/bpmn-modeler/commit/c5a2d6e9df87754ce64e606d9fc1d88000b55b77))
* **deps:** bump the github-actions-all group with 2 updates ([#1128](https://github.com/Miragon/bpmn-modeler/issues/1128)) ([af7c245](https://github.com/Miragon/bpmn-modeler/commit/af7c2458509479b1edba9890cdb59535279df0fa))
* **deps:** bump the gradle-minor-patch group in /apps/intellij-plugin with 3 updates ([#1127](https://github.com/Miragon/bpmn-modeler/issues/1127)) ([aa9bbdc](https://github.com/Miragon/bpmn-modeler/commit/aa9bbdc764d9f3d5bc9c7adcee0136508fb66a22))
* **deps:** extract create-append-c7 polyfill to its own repo, consume from npm ([#1077](https://github.com/Miragon/bpmn-modeler/issues/1077)) ([c8598f0](https://github.com/Miragon/bpmn-modeler/commit/c8598f05a7318d5f6e41c04e46785ce965dfb481))
* migrate conductor.json to .conductor/settings.toml ([#1094](https://github.com/Miragon/bpmn-modeler/issues/1094)) ([1b02902](https://github.com/Miragon/bpmn-modeler/commit/1b0290289004c171947f036b03aaae1878cd0cc5))
* **release:** bump intellij plugin to 0.1.1 ([43d13df](https://github.com/Miragon/bpmn-modeler/commit/43d13dffefdebe5b5c21a44a714ebadd5d7ebddf))
* **release:** bump intellij plugin to 0.1.2 ([e44ced1](https://github.com/Miragon/bpmn-modeler/commit/e44ced10aa4c8531e6913eed6a83d7ac0bd20a27))
* **release:** refresh updatePlugins.xml for intellij-v0.1.1 ([9449b26](https://github.com/Miragon/bpmn-modeler/commit/9449b267a4837611c9e8fa14aef313e3611f2768))
* **release:** refresh updatePlugins.xml for intellij-v0.1.2 ([b0e2876](https://github.com/Miragon/bpmn-modeler/commit/b0e2876f87f3911e555fc257d9889d1241a55e50))
* **release:** unify versioning across hosts via release-please ([#1146](https://github.com/Miragon/bpmn-modeler/issues/1146)) ([87cce01](https://github.com/Miragon/bpmn-modeler/commit/87cce0190042af396f54f09385aca99a888bac7c))
