# Changelog

## [1.0.0](https://github.com/Miragon/bpmn-modeler/compare/bpmn-modeler-v0.2.0...bpmn-modeler-v1.0.0) (2026-09-11)


### ⚠ BREAKING CHANGES

* **bpmn-modeler:** make the lint stack injectable via /lint subpath ([#1430](https://github.com/Miragon/bpmn-modeler/issues/1430))

### 🎉 New Features

* **bpmn-modeler:** add capabilities.modelNavigation on /design ([#1457](https://github.com/Miragon/bpmn-modeler/issues/1457)) ([ca82ae1](https://github.com/Miragon/bpmn-modeler/commit/ca82ae17682b4cf68678ff49f6fdef70b7bf460a))
* **bpmn-modeler:** add capabilities.modelNavigation on /viewer ([#1458](https://github.com/Miragon/bpmn-modeler/issues/1458)) ([fe59e3c](https://github.com/Miragon/bpmn-modeler/commit/fe59e3cdc8762265b7fac5bd12a02ff124b4e28f))
* **bpmn-modeler:** add engine-neutral createDesigner() on /design subpath ([#1437](https://github.com/Miragon/bpmn-modeler/issues/1437)) ([7a43774](https://github.com/Miragon/bpmn-modeler/commit/7a437747b29dadd600312d1bb8c48ca88af6b9fc))
* **bpmn-modeler:** add engine-neutral properties-panel lib with mode filter ([#1451](https://github.com/Miragon/bpmn-modeler/issues/1451)) ([860badb](https://github.com/Miragon/bpmn-modeler/commit/860badbc85d9b8e772fc42c8f893f3dc2c25022b))
* **bpmn-modeler:** add opt-in readonly properties panel on /viewer ([#1455](https://github.com/Miragon/bpmn-modeler/issues/1455)) ([fc045c0](https://github.com/Miragon/bpmn-modeler/commit/fc045c0d77ccdaba14ce68817bf81caf14e2c202))
* **bpmn-modeler:** add public view-state capture/restore on all handles ([#1450](https://github.com/Miragon/bpmn-modeler/issues/1450)) ([fb1f042](https://github.com/Miragon/bpmn-modeler/commit/fb1f04272018bd08451d71c6f7f1aea63d14b4e7))
* **bpmn-modeler:** add readonly createViewer() on /viewer subpath ([#1433](https://github.com/Miragon/bpmn-modeler/issues/1433)) ([03d6c6b](https://github.com/Miragon/bpmn-modeler/commit/03d6c6bc4add529c52f256cce9729523116d22ac))
* **bpmn-modeler:** add runtime design/implement mode on createModeler ([#1452](https://github.com/Miragon/bpmn-modeler/issues/1452)) ([786a045](https://github.com/Miragon/bpmn-modeler/commit/786a04582ee359b559aab90f70b26e99fb621496))
* **bpmn-modeler:** add view/design/implement session on /mode subpath ([#1469](https://github.com/Miragon/bpmn-modeler/issues/1469)) ([ddc666f](https://github.com/Miragon/bpmn-modeler/commit/ddc666f2be8cc63cf0757dbdb56814a97d80585c))
* **bpmn-modeler:** allow passing custom moddleExtensions to createModeler ([#1412](https://github.com/Miragon/bpmn-modeler/issues/1412)) ([22ecded](https://github.com/Miragon/bpmn-modeler/commit/22ecded679bbf32827614db14e64f68ecd0661a9))
* **bpmn-modeler:** export detectEngine(xml) engine-detection helper ([#1415](https://github.com/Miragon/bpmn-modeler/issues/1415)) ([d794d70](https://github.com/Miragon/bpmn-modeler/commit/d794d7064cf9adb79709a2804599e043993aad39))
* **bpmn-modeler:** freeze a typed contract for the core bpmn-js services ([#1410](https://github.com/Miragon/bpmn-modeler/issues/1410)) ([38208a3](https://github.com/Miragon/bpmn-modeler/commit/38208a30808e5a73d152ad7aff9e062fb89283d6))
* **bpmn-modeler:** make the lint stack injectable via /lint subpath ([#1430](https://github.com/Miragon/bpmn-modeler/issues/1430)) ([5536855](https://github.com/Miragon/bpmn-modeler/commit/5536855cfef04842ddcbd58d23da8717c10508cc))
* **bpmn-modeler:** mode-invariant minimap, token simulation and focus reticle ([#1471](https://github.com/Miragon/bpmn-modeler/issues/1471)) ([6b20f9a](https://github.com/Miragon/bpmn-modeler/commit/6b20f9a84e352a9bf718102e80003ca748c93d23))
* **bpmn-modeler:** opt-in linting on /design and per-mode lint configs ([#1472](https://github.com/Miragon/bpmn-modeler/issues/1472)) ([5141b8a](https://github.com/Miragon/bpmn-modeler/commit/5141b8aec8d6e4674e0d76df5f25ca4ec1935ae3))
* **bpmn-modeler:** theme per instance via data-bpmn-theme attribute ([#1429](https://github.com/Miragon/bpmn-modeler/issues/1429)) ([35011ef](https://github.com/Miragon/bpmn-modeler/commit/35011ef81df19b5cdef29eef2835f6acbe1086ea))
* **bpmn-webview:** add view/design/implement mode switch to the hosts ([#1468](https://github.com/Miragon/bpmn-modeler/issues/1468)) ([46a0d58](https://github.com/Miragon/bpmn-modeler/commit/46a0d58a7ade3a77da273b7a8356bd2f39a867ec))
* **demo-webapp:** add canvas-side mode strip for view/design/implement ([#1459](https://github.com/Miragon/bpmn-modeler/issues/1459)) ([a3e5c27](https://github.com/Miragon/bpmn-modeler/commit/a3e5c27a80c4f2dbab52e0bbc588dba5f2c5751f))
* **demo-webapp:** consume @miragon/dmn-modeler on the dmn page ([#1483](https://github.com/Miragon/bpmn-modeler/issues/1483)) ([b4c06a3](https://github.com/Miragon/bpmn-modeler/commit/b4c06a3428f887f36cfddf2b32642b07b484115e))
* **dmn-modeler:** container-scoped theming via data-dmn-theme ([#1475](https://github.com/Miragon/bpmn-modeler/issues/1475)) ([e2eb4b8](https://github.com/Miragon/bpmn-modeler/commit/e2eb4b89287ad4ef91c4918a0221f471f5c6d721))
* **dmn-modeler:** translate the dmn-js ui ([#1480](https://github.com/Miragon/bpmn-modeler/issues/1480)) ([4cf70dd](https://github.com/Miragon/bpmn-modeler/commit/4cf70ddd12974083c377c92b0f0bc44c33708adf))
* **dmn-webview:** extract the host-free dmn modeler into @miragon/dmn-modeler ([#1474](https://github.com/Miragon/bpmn-modeler/issues/1474)) ([383a949](https://github.com/Miragon/bpmn-modeler/commit/383a94943dd10a8e77fd5bf6d754112bbc0d0007))
* form-io editor ([#1363](https://github.com/Miragon/bpmn-modeler/issues/1363)) ([9c079e0](https://github.com/Miragon/bpmn-modeler/commit/9c079e0d980aa94b93d907083db5d92a06c3f822))
* format diagram ([#1482](https://github.com/Miragon/bpmn-modeler/issues/1482)) ([e724883](https://github.com/Miragon/bpmn-modeler/commit/e724883f10d2758fdf7f74415bcbdec7fa59c335))
* **properties-panel:** vendor upstream element-type header icons ([#1512](https://github.com/Miragon/bpmn-modeler/issues/1512)) ([9e33736](https://github.com/Miragon/bpmn-modeler/commit/9e33736fa9601290f7ac1a45f06c8b5101a28880))


### 🐞 Bug Fixes

* **append-menu:** restore flat menu entries under camunda-bpmn-js 5.33 ([#1428](https://github.com/Miragon/bpmn-modeler/issues/1428)) ([d512d6c](https://github.com/Miragon/bpmn-modeler/commit/d512d6cec9d0c043ad35f5d24c46e2501621ee9b))
* **bpmn-modeler:** destroy partially initialised surfaces when a factory fails ([#1522](https://github.com/Miragon/bpmn-modeler/issues/1522)) ([9ac9031](https://github.com/Miragon/bpmn-modeler/commit/9ac90313fcafe2c1ca8657bc4ad4d258d8c6a40a))
* **bpmn-modeler:** keep restored viewport and clear empty selection ([#1518](https://github.com/Miragon/bpmn-modeler/issues/1518)) ([fa5298c](https://github.com/Miragon/bpmn-modeler/commit/fa5298c1ce1d4c45e42ca63d8ff465694b37b09d))
* **bpmn-modeler:** make mode-session recreate transaction-safe ([#1515](https://github.com/Miragon/bpmn-modeler/issues/1515)) ([7c4a85d](https://github.com/Miragon/bpmn-modeler/commit/7c4a85d4815d2d198e934a620f10bf427b7bbe89))
* **bpmn-modeler:** make text clipboard polyfill per-instance and disposable ([#1513](https://github.com/Miragon/bpmn-modeler/issues/1513)) ([88d0a93](https://github.com/Miragon/bpmn-modeler/commit/88d0a93412020220a966ab50ebd29398b00015a8))
* **bpmn-modeler:** stop debounced callbacks firing after destroy ([#1523](https://github.com/Miragon/bpmn-modeler/issues/1523)) ([9414cc9](https://github.com/Miragon/bpmn-modeler/commit/9414cc993092492560798ec99c13bed9d19cbad5))
* **bpmn-modeler:** support packed packages in nested installs ([#1508](https://github.com/Miragon/bpmn-modeler/issues/1508)) ([bbefb36](https://github.com/Miragon/bpmn-modeler/commit/bbefb36fd3ffe01fd9cc5bd6e0b736120a86eb88))
* **diff:** detect execution property changes across engines ([#1510](https://github.com/Miragon/bpmn-modeler/issues/1510)) ([23bf6d9](https://github.com/Miragon/bpmn-modeler/commit/23bf6d92a7a580bee3e4d2ef357d9c48851c64f1))
* **properties-panel:** reconcile selection made before panel subscribes ([#1521](https://github.com/Miragon/bpmn-modeler/issues/1521)) ([2c623eb](https://github.com/Miragon/bpmn-modeler/commit/2c623ebc1e81cde838da340823c6c64e031a8645))


### 🔨 Refactoring

* **bpmn-modeler:** move diff rendering primitives to /viewer subpath ([#1449](https://github.com/Miragon/bpmn-modeler/issues/1449)) ([0220101](https://github.com/Miragon/bpmn-modeler/commit/0220101c6f0605797e8cffe5a857f0dd668a1d29))
* **bpmn-modeler:** trim redundant internal comments ([#1509](https://github.com/Miragon/bpmn-modeler/issues/1509)) ([5bd506b](https://github.com/Miragon/bpmn-modeler/commit/5bd506b0c0af4af135c483d18341f879f7cab8ab))
* **dmn-webview:** replace singleton with per-instance facade ([#1473](https://github.com/Miragon/bpmn-modeler/issues/1473)) ([f4ce218](https://github.com/Miragon/bpmn-modeler/commit/f4ce21857fe6498260f8cad0ac1758d7fe7e86a6))
* **dmn-webview:** rewire as a thin host adapter over @miragon/dmn-modeler ([#1476](https://github.com/Miragon/bpmn-modeler/issues/1476)) ([447236f](https://github.com/Miragon/bpmn-modeler/commit/447236f9efe4af3f7eaa2e824e4a6c6f354ceacc))
* **shared:** move webview panel chrome from modeler-types to shared ([#1454](https://github.com/Miragon/bpmn-modeler/issues/1454)) ([2093954](https://github.com/Miragon/bpmn-modeler/commit/2093954111bb2ebd02d05c36996d74a0b4e30fd4))


### 📔 Documentation

* update print statement from 'Hello' to 'Goodbye' ([d37f7e2](https://github.com/Miragon/bpmn-modeler/commit/d37f7e213f3380c486a08f1a61f10085da51b84d))


### 🛠️ Misc

* **agents:** share Claude and Codex setup and refresh guides ([#1507](https://github.com/Miragon/bpmn-modeler/issues/1507)) ([05c00ef](https://github.com/Miragon/bpmn-modeler/commit/05c00efdc014e311c52ce1837e1ec7835ff942be))
* **deps:** bump the npm-minor-patch group across 1 directory with 29 updates ([#1414](https://github.com/Miragon/bpmn-modeler/issues/1414)) ([2dd39d3](https://github.com/Miragon/bpmn-modeler/commit/2dd39d3e9d590a51a4ce1572d22523f82548cf0d))
* **dmn-modeler:** add the npm publishing pipeline and release line ([#1484](https://github.com/Miragon/bpmn-modeler/issues/1484)) ([bc2658c](https://github.com/Miragon/bpmn-modeler/commit/bc2658c03f6ef1af18f812fb6550edce62924e42))
* **main:** release vscode 1.11.0 ([#1369](https://github.com/Miragon/bpmn-modeler/issues/1369)) ([bff0d93](https://github.com/Miragon/bpmn-modeler/commit/bff0d93a8534baf70bd04c9ffc368697bfcd5fc9))
* **release:** make bpmn-modeler the root release component ([#1431](https://github.com/Miragon/bpmn-modeler/issues/1431)) ([719127d](https://github.com/Miragon/bpmn-modeler/commit/719127d2798e993b90e490b8f03bafea18968678))

## [0.2.0](https://github.com/Miragon/bpmn-modeler/compare/bpmn-modeler-v0.1.0...bpmn-modeler-v0.2.0) (2026-08-31)


### 🎉 New Features

* **bpmn-webview:** add a public diff api to @miragon/bpmn-modeler ([#1396](https://github.com/Miragon/bpmn-modeler/issues/1396)) ([473f813](https://github.com/Miragon/bpmn-modeler/commit/473f8137418b9d608c1a099334280fc6051356de))
* **bpmn-webview:** extract the host-free modeler into @miragon/bpmn-modeler ([#1393](https://github.com/Miragon/bpmn-modeler/issues/1393)) ([e8f9c0e](https://github.com/Miragon/bpmn-modeler/commit/e8f9c0e1caeeffbacd833ed94cf68d91c2b9f185))


### 🔨 Refactoring

* **bpmn-webview:** rewire as a thin host adapter over @miragon/bpmn-modeler ([#1395](https://github.com/Miragon/bpmn-modeler/issues/1395)) ([04be5a5](https://github.com/Miragon/bpmn-modeler/commit/04be5a5af47d7ea8e2c5283d47d3e53cc0406abb))


### 📔 Documentation

* **bpmn-modeler:** clean up extraction-era comments ([#1400](https://github.com/Miragon/bpmn-modeler/issues/1400)) ([a8db080](https://github.com/Miragon/bpmn-modeler/commit/a8db0805c8744f522de9e9bb020dec0f6a39a5fb))
* change description of BPMN modeler to opinionated ([528c28f](https://github.com/Miragon/bpmn-modeler/commit/528c28f07dc8b1145cda06e57ba83b462ddd5f87))


### 🛠️ Misc

* **bpmn-modeler:** add the npm publishing pipeline ([#1397](https://github.com/Miragon/bpmn-modeler/issues/1397)) ([e56dc7e](https://github.com/Miragon/bpmn-modeler/commit/e56dc7e1daa8ab64233b75af7d2c41b94f63668c))
