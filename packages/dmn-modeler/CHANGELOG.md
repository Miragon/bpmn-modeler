# Changelog

## [0.5.0](https://github.com/Miragon/bpmn-modeler/compare/dmn-modeler-v0.4.0...dmn-modeler-v0.5.0) (2026-11-01)


### 🎉 New Features

* **bpmn-modeler:** translate popup-menu search keywords ([#1781](https://github.com/Miragon/bpmn-modeler/issues/1781)) [sync cae0009] ([432bbd7](https://github.com/Miragon/bpmn-modeler/commit/432bbd773e762ffa383631020639f90004f1b8e5))


### 🐞 Bug Fixes

* **bpmn-modeler:** flush panel input on save and read the bound engine ([#2064](https://github.com/Miragon/bpmn-modeler/issues/2064)) [sync 33c466b] ([66e60bb](https://github.com/Miragon/bpmn-modeler/commit/66e60bb7c28f0bd7e6b0dfe5b4ff367edf83d4ec))
* **bpmn-modeler:** keep theme in step across destroy and mode switches ([#1734](https://github.com/Miragon/bpmn-modeler/issues/1734)) ([6fb3ba9](https://github.com/Miragon/bpmn-modeler/commit/6fb3ba91f490f0c7e065cdf63d585a2d7d7971bd))
* **element-template-chooser:** show "1 property" for a single template property ([#1794](https://github.com/Miragon/bpmn-modeler/issues/1794)) [sync abfa4ee] ([965a8e8](https://github.com/Miragon/bpmn-modeler/commit/965a8e8ad927a1c07ca32b94fa2cff4899b799d4))
* **i18n:** offer every shipped language in the language settings ([#2006](https://github.com/Miragon/bpmn-modeler/issues/2006)) [sync bf9de92] ([fa0344d](https://github.com/Miragon/bpmn-modeler/commit/fa0344df48c474092b5f094b4d2461bdd90ee297))
* **modeler-core:** read the executable process id under any bpmn prefix ([#1949](https://github.com/Miragon/bpmn-modeler/issues/1949)) [sync db53e2e] ([52b0e3f](https://github.com/Miragon/bpmn-modeler/commit/52b0e3ff93e954fa59447237cc37a82d7b41cf6f))
* **modeler-core:** stop migration from stamping duplicate execution-platform attributes ([#1862](https://github.com/Miragon/bpmn-modeler/issues/1862)) [sync 18c157a] ([6aab597](https://github.com/Miragon/bpmn-modeler/commit/6aab5979a4576ee7190b6239f273a68c480931c6))
* **modeler-types:** flush pending edits before a save or a mode switch ([#2114](https://github.com/Miragon/bpmn-modeler/issues/2114)) ([a7eb551](https://github.com/Miragon/bpmn-modeler/commit/a7eb55170672bec09ab03dc7386a3b20eccb95b2))
* **modeler-types:** scan xml comments and cdata in document order ([#1970](https://github.com/Miragon/bpmn-modeler/issues/1970)) [sync 249398c] ([7d61046](https://github.com/Miragon/bpmn-modeler/commit/7d610469dd8abdf246f37f26ca9643a180dd385e))
* **shared:** hold a quickly narrowed properties panel at its minimum width ([#1698](https://github.com/Miragon/bpmn-modeler/issues/1698)) [sync f92e122] ([74417fa](https://github.com/Miragon/bpmn-modeler/commit/74417fac1d705768bac5a2fce16e30ca200f8e23))


### 🔨 Refactoring

* **modeler-core:** share document sync and surface lifecycles ([#1776](https://github.com/Miragon/bpmn-modeler/issues/1776)) ([f4c099f](https://github.com/Miragon/bpmn-modeler/commit/f4c099fbeef9c8ab0bc09338ad959569bf55614f))


### 📔 Documentation

* **bpmn-modeler:** document yarn berry resolutions for upstream carets ([#1782](https://github.com/Miragon/bpmn-modeler/issues/1782)) ([0246c4d](https://github.com/Miragon/bpmn-modeler/commit/0246c4d2595866a8cb86197ab3ad5e405295267e))


### 🛠️ Misc

* **architecture-testing:** keep the architecture spec under the test timeout on CI ([#2122](https://github.com/Miragon/bpmn-modeler/issues/2122)) ([2f8e905](https://github.com/Miragon/bpmn-modeler/commit/2f8e905b61eea0179f037257e7811747cb372731))
* **architecture-testing:** run the modeler package specs on the engine ([#2085](https://github.com/Miragon/bpmn-modeler/issues/2085)) ([286c9e0](https://github.com/Miragon/bpmn-modeler/commit/286c9e0302f5068bb1bb0e1eed7b02f8236aca02))
* **ci:** gate coverage reports on code changes and enforce thresholds ([#1682](https://github.com/Miragon/bpmn-modeler/issues/1682)) ([e2bf365](https://github.com/Miragon/bpmn-modeler/commit/e2bf3650949daf8d445466ace1eb769a89a87b4f))
* **ci:** raise drifted coverage floors and type-check spec files ([#1796](https://github.com/Miragon/bpmn-modeler/issues/1796)) ([88359d4](https://github.com/Miragon/bpmn-modeler/commit/88359d4ef080929e369a6736134e1cd282f0e17b))
* **ci:** run every vitest workspace from one target registry ([#1687](https://github.com/Miragon/bpmn-modeler/issues/1687)) ([b0c1940](https://github.com/Miragon/bpmn-modeler/commit/b0c19402c84b2a1f496fa20728e97f9a254b8885))
* **deps:** bump @bpmn-io/properties-panel from 3.56.1 to 3.57.0 in the bpmn-io group ([#1665](https://github.com/Miragon/bpmn-modeler/issues/1665)) ([00808c7](https://github.com/Miragon/bpmn-modeler/commit/00808c70f667d6eb6848e943ead9d7a2577105ca))
* **deps:** bump the npm-minor-patch group across 1 directory with 10 updates ([#1667](https://github.com/Miragon/bpmn-modeler/issues/1667)) ([4fb5db5](https://github.com/Miragon/bpmn-modeler/commit/4fb5db55c3e1f5891598189d720ed292691634ca))
* **deps:** bump the npm-minor-patch group across 1 directory with 8 updates ([#1758](https://github.com/Miragon/bpmn-modeler/issues/1758)) ([c1a1cd3](https://github.com/Miragon/bpmn-modeler/commit/c1a1cd3279cbf9137b337422ed71f05d416c9347))

## [0.4.0](https://github.com/Miragon/bpmn-modeler/compare/dmn-modeler-v0.3.1...dmn-modeler-v0.4.0) (2026-10-16)


### 🎉 New Features

* **bpmn-modeler:** replace the mode strip with a compact mode menu ([#1628](https://github.com/Miragon/bpmn-modeler/issues/1628)) [sync b0a66ca] ([aa2c372](https://github.com/Miragon/bpmn-modeler/commit/aa2c372235d66265aef8d60ef690c556d46f7d7a))
* **bpmn-webview:** search definitions of other models ([#1649](https://github.com/Miragon/bpmn-modeler/issues/1649)) [sync 1c48e83] ([f711e32](https://github.com/Miragon/bpmn-modeler/commit/f711e322353e87a383d3627b1b183066b3850fe1))


### 🛠️ Misc

* **deps:** bump the bpmn-io group across 1 directory with 12 updates ([#1644](https://github.com/Miragon/bpmn-modeler/issues/1644)) ([586f66f](https://github.com/Miragon/bpmn-modeler/commit/586f66f3e202646d636fdc480df926bd4552dfe2))
* **deps:** bump the npm-major group across 1 directory with 6 updates ([#1650](https://github.com/Miragon/bpmn-modeler/issues/1650)) ([be237db](https://github.com/Miragon/bpmn-modeler/commit/be237db00ec63fb25c9c717e669e23decead21fc))
* **deps:** bump the npm-minor-patch group across 1 directory with 26 updates ([#1655](https://github.com/Miragon/bpmn-modeler/issues/1655)) ([d0069a9](https://github.com/Miragon/bpmn-modeler/commit/d0069a96f6913cab84abf372f4c03c1bad64e9ba))
* **deps:** unblock dependabot major bumps and fix webview dev preview ([#1631](https://github.com/Miragon/bpmn-modeler/issues/1631)) ([c40e3d7](https://github.com/Miragon/bpmn-modeler/commit/c40e3d7b8848190da2cf207384d4d5d84389bc89))

## [0.3.1](https://github.com/Miragon/bpmn-modeler/compare/dmn-modeler-v0.3.0...dmn-modeler-v0.3.1) (2026-09-23)


### 🐞 Bug Fixes

* **dark-mode:** change color in property panel ([#1584](https://github.com/Miragon/bpmn-modeler/issues/1584)) ([d9bda28](https://github.com/Miragon/bpmn-modeler/commit/d9bda28190e5f09adc4eb8da8f5ebdc97866a7de))


### 🛠️ Misc

* **deps:** bump the npm-minor-patch group across 1 directory with 26 updates ([#1566](https://github.com/Miragon/bpmn-modeler/issues/1566)) ([1c798c6](https://github.com/Miragon/bpmn-modeler/commit/1c798c6cfc9e98a19d489d1aa65aa930453d5109))
* **deps:** bump the npm-minor-patch group across 1 directory with 9 updates ([#1579](https://github.com/Miragon/bpmn-modeler/issues/1579)) ([bff9451](https://github.com/Miragon/bpmn-modeler/commit/bff945149e4b616a270d0f9685e0d34b1f1f4d78))

## [0.3.0](https://github.com/Miragon/bpmn-modeler/compare/dmn-modeler-v0.2.0...dmn-modeler-v0.3.0) (2026-09-21)


### 🎉 New Features

* **bpmn-modeler:** stamp execution platform on engine-bound newDiagram ([#1536](https://github.com/Miragon/bpmn-modeler/issues/1536)) [sync e742f59] ([7418949](https://github.com/Miragon/bpmn-modeler/commit/74189491726340cf1cf110e1b85c6ca1331b2a2b))
* **dmn-modeler:** support empty (null) inputs in the dmn simulation ([#1568](https://github.com/Miragon/bpmn-modeler/issues/1568)) ([#1569](https://github.com/Miragon/bpmn-modeler/issues/1569)) ([11528f7](https://github.com/Miragon/bpmn-modeler/commit/11528f75e1ef9380481306a564b9c8963152bf55))


### 🐞 Bug Fixes

* **bpmn-modeler:** translate append menu and element template chooser ([#1547](https://github.com/Miragon/bpmn-modeler/issues/1547)) [sync 63b0493] ([95865ca](https://github.com/Miragon/bpmn-modeler/commit/95865ca280c149adec5ad31972e1a86b0852e7db))


### 🛠️ Misc

* **bpmn-modeler:** close the release-gate blind spots ([#1549](https://github.com/Miragon/bpmn-modeler/issues/1549)) ([90a07d5](https://github.com/Miragon/bpmn-modeler/commit/90a07d598f7fabeb04dcb1ca3fde8774dbfb9c68))
* **deps:** bump properties-panel, vite and archunit ([#1560](https://github.com/Miragon/bpmn-modeler/issues/1560)) ([e43a387](https://github.com/Miragon/bpmn-modeler/commit/e43a387ed71c18fa34821ae68bfb76725a9066d5))
* **deps:** bump the npm-major group across 1 directory with 5 updates ([#1527](https://github.com/Miragon/bpmn-modeler/issues/1527)) ([165049f](https://github.com/Miragon/bpmn-modeler/commit/165049f757243bad1e4e98fab16f90132c798048))

## [0.2.0](https://github.com/Miragon/bpmn-modeler/compare/dmn-modeler-v0.1.0...dmn-modeler-v0.2.0) (2026-09-13)


### 🎉 New Features

* **demo-webapp:** consume @miragon/dmn-modeler on the dmn page ([#1483](https://github.com/Miragon/bpmn-modeler/issues/1483)) ([b4c06a3](https://github.com/Miragon/bpmn-modeler/commit/b4c06a3428f887f36cfddf2b32642b07b484115e))
* **dmn-modeler:** container-scoped theming via data-dmn-theme ([#1475](https://github.com/Miragon/bpmn-modeler/issues/1475)) ([e2eb4b8](https://github.com/Miragon/bpmn-modeler/commit/e2eb4b89287ad4ef91c4918a0221f471f5c6d721))
* **dmn-modeler:** translate the dmn-js ui ([#1480](https://github.com/Miragon/bpmn-modeler/issues/1480)) ([4cf70dd](https://github.com/Miragon/bpmn-modeler/commit/4cf70ddd12974083c377c92b0f0bc44c33708adf))
* **dmn-webview:** extract the host-free dmn modeler into @miragon/dmn-modeler ([#1474](https://github.com/Miragon/bpmn-modeler/issues/1474)) ([383a949](https://github.com/Miragon/bpmn-modeler/commit/383a94943dd10a8e77fd5bf6d754112bbc0d0007))
* format diagram ([#1482](https://github.com/Miragon/bpmn-modeler/issues/1482)) [sync e724883] ([c1c02ea](https://github.com/Miragon/bpmn-modeler/commit/c1c02ea7670cd0d672223ceea8c3682f23f4ba40))


### 🐞 Bug Fixes

* **bpmn-modeler:** destroy partially initialised surfaces when a factory fails ([#1522](https://github.com/Miragon/bpmn-modeler/issues/1522)) ([9ac9031](https://github.com/Miragon/bpmn-modeler/commit/9ac90313fcafe2c1ca8657bc4ad4d258d8c6a40a))
* **bpmn-modeler:** keep restored viewport and clear empty selection ([#1518](https://github.com/Miragon/bpmn-modeler/issues/1518)) [sync fa5298c] ([4628843](https://github.com/Miragon/bpmn-modeler/commit/46288439b33fb94ee15c11962fcdda47c42be805))
* **modeler-types:** detect engine from the definitions root attributes ([#1524](https://github.com/Miragon/bpmn-modeler/issues/1524)) [sync f67a332] ([2a379d3](https://github.com/Miragon/bpmn-modeler/commit/2a379d3e0ad6317b9969f7a40193cb76d8943938))


### 🔨 Refactoring

* **bpmn-modeler:** trim redundant internal comments ([#1509](https://github.com/Miragon/bpmn-modeler/issues/1509)) ([5bd506b](https://github.com/Miragon/bpmn-modeler/commit/5bd506b0c0af4af135c483d18341f879f7cab8ab))


### 📔 Documentation

* refactor README for clarity and consistency ([92740d5](https://github.com/Miragon/bpmn-modeler/commit/92740d5eec49cb9bfbd721197157849d65c1398f))


### 🛠️ Misc

* **deps:** update dependencies and resolve critical vulnerabilities ([#1531](https://github.com/Miragon/bpmn-modeler/issues/1531)) ([6f4ac58](https://github.com/Miragon/bpmn-modeler/commit/6f4ac58b6d2f5b04fe520e169d8763971fa30967))
* **dmn-modeler:** add the npm publishing pipeline and release line ([#1484](https://github.com/Miragon/bpmn-modeler/issues/1484)) ([bc2658c](https://github.com/Miragon/bpmn-modeler/commit/bc2658c03f6ef1af18f812fb6550edce62924e42))
