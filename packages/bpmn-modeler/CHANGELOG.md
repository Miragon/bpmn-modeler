# Changelog

## [1.0.0](https://github.com/Miragon/bpmn-modeler/compare/bpmn-modeler-v0.2.0...bpmn-modeler-v1.0.0) (2026-09-04)


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
* **bpmn-modeler:** allow passing custom moddleExtensions to createModeler ([#1412](https://github.com/Miragon/bpmn-modeler/issues/1412)) ([22ecded](https://github.com/Miragon/bpmn-modeler/commit/22ecded679bbf32827614db14e64f68ecd0661a9))
* **bpmn-modeler:** export detectEngine(xml) engine-detection helper ([#1415](https://github.com/Miragon/bpmn-modeler/issues/1415)) ([d794d70](https://github.com/Miragon/bpmn-modeler/commit/d794d7064cf9adb79709a2804599e043993aad39))
* **bpmn-modeler:** freeze a typed contract for the core bpmn-js services ([#1410](https://github.com/Miragon/bpmn-modeler/issues/1410)) ([38208a3](https://github.com/Miragon/bpmn-modeler/commit/38208a30808e5a73d152ad7aff9e062fb89283d6))
* **bpmn-modeler:** make the lint stack injectable via /lint subpath ([#1430](https://github.com/Miragon/bpmn-modeler/issues/1430)) ([5536855](https://github.com/Miragon/bpmn-modeler/commit/5536855cfef04842ddcbd58d23da8717c10508cc))
* **bpmn-modeler:** theme per instance via data-bpmn-theme attribute ([#1429](https://github.com/Miragon/bpmn-modeler/issues/1429)) ([35011ef](https://github.com/Miragon/bpmn-modeler/commit/35011ef81df19b5cdef29eef2835f6acbe1086ea))
* **demo-webapp:** add canvas-side mode strip for view/design/implement ([#1459](https://github.com/Miragon/bpmn-modeler/issues/1459)) ([a3e5c27](https://github.com/Miragon/bpmn-modeler/commit/a3e5c27a80c4f2dbab52e0bbc588dba5f2c5751f))
* form-io editor ([#1363](https://github.com/Miragon/bpmn-modeler/issues/1363)) ([9c079e0](https://github.com/Miragon/bpmn-modeler/commit/9c079e0d980aa94b93d907083db5d92a06c3f822))


### 🐞 Bug Fixes

* **append-menu:** restore flat menu entries under camunda-bpmn-js 5.33 ([#1428](https://github.com/Miragon/bpmn-modeler/issues/1428)) ([d512d6c](https://github.com/Miragon/bpmn-modeler/commit/d512d6cec9d0c043ad35f5d24c46e2501621ee9b))


### 🔨 Refactoring

* **bpmn-modeler:** move diff rendering primitives to /viewer subpath ([#1449](https://github.com/Miragon/bpmn-modeler/issues/1449)) ([0220101](https://github.com/Miragon/bpmn-modeler/commit/0220101c6f0605797e8cffe5a857f0dd668a1d29))
* **shared:** move webview panel chrome from modeler-types to shared ([#1454](https://github.com/Miragon/bpmn-modeler/issues/1454)) ([2093954](https://github.com/Miragon/bpmn-modeler/commit/2093954111bb2ebd02d05c36996d74a0b4e30fd4))


### 🛠️ Misc

* **deps:** bump the npm-minor-patch group across 1 directory with 29 updates ([#1414](https://github.com/Miragon/bpmn-modeler/issues/1414)) ([2dd39d3](https://github.com/Miragon/bpmn-modeler/commit/2dd39d3e9d590a51a4ce1572d22523f82548cf0d))
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
