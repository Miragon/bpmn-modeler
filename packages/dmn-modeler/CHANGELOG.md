# Changelog

## [0.10.0](https://github.com/Miragon/bpmn-modeler/compare/dmn-modeler-v0.9.0...dmn-modeler-v0.10.0) (2026-11-14)


### 🎉 New Features

* **bpmn-diff:** return one element's XML without its children and diagram data ([#2461](https://github.com/Miragon/bpmn-modeler/issues/2461)) [sync 93096fa] ([73dfe03](https://github.com/Miragon/bpmn-modeler/commit/73dfe030192cd30b4924658bccb1b3ba32b5b9d3))
* **bpmn-modeler:** add reloadDiagram that keeps the view across a re-import ([#2427](https://github.com/Miragon/bpmn-modeler/issues/2427)) ([f6ff334](https://github.com/Miragon/bpmn-modeler/commit/f6ff334f5b58d396f1b3335710799bf6d3c17177))
* **bpmn-modeler:** give the diff legend the miragon look ([#2436](https://github.com/Miragon/bpmn-modeler/issues/2436)) ([291a060](https://github.com/Miragon/bpmn-modeler/commit/291a060fc94452031a31e65a16992404f08fb91c))
* **bpmn-modeler:** keep both diff panes on the same subprocess plane ([#2443](https://github.com/Miragon/bpmn-modeler/issues/2443)) [sync 378c141] ([ed31c8d](https://github.com/Miragon/bpmn-modeler/commit/ed31c8d3e199115d1b75bc86904379d99a8ad89f))
* **bpmn-modeler:** publish the surface checks hosts duck-type ([#2420](https://github.com/Miragon/bpmn-modeler/issues/2420)) ([0109615](https://github.com/Miragon/bpmn-modeler/commit/01096152c1e9b00affcedd63751abfeb4c7af5bd))
* **bpmn-modeler:** restyle the diff view after Diagit's diff panel ([#2442](https://github.com/Miragon/bpmn-modeler/issues/2442)) ([c4f0e69](https://github.com/Miragon/bpmn-modeler/commit/c4f0e6970915672dc882d39dc6d5d791c1d24165))
* **model-navigation:** open and preview a start event's linked form ([#2460](https://github.com/Miragon/bpmn-modeler/issues/2460)) [sync f1dd92f] ([6414d46](https://github.com/Miragon/bpmn-modeler/commit/6414d464c797688f13f543dc058b9ab9b3a3c5f3))


### 🔨 Refactoring

* **dmn-modeler:** keep the diff viewer out of the published types ([#2432](https://github.com/Miragon/bpmn-modeler/issues/2432)) ([b26b0df](https://github.com/Miragon/bpmn-modeler/commit/b26b0dfacdc1556d6063f61a383acd13c3302bd3))
* **modeler-types:** render both diff legends from one component ([#2426](https://github.com/Miragon/bpmn-modeler/issues/2426)) ([d651f17](https://github.com/Miragon/bpmn-modeler/commit/d651f175559bf5c6968c311169a70efe1387676a))
* **shared:** build the properties-panel chrome once for every editor page ([#2435](https://github.com/Miragon/bpmn-modeler/issues/2435)) ([bc04fd8](https://github.com/Miragon/bpmn-modeler/commit/bc04fd85038752abe4136a7d9b95e33b12ee63d7))

## [0.9.0](https://github.com/Miragon/bpmn-modeler/compare/dmn-modeler-v0.8.0...dmn-modeler-v0.9.0) (2026-11-12)


### 🎉 New Features

* **bpmn-modeler:** keep hidden element templates out of new choices ([#2301](https://github.com/Miragon/bpmn-modeler/issues/2301)) [sync 2d6033d] ([e40e3c8](https://github.com/Miragon/bpmn-modeler/commit/e40e3c8bfaa5f74c88a80882d01e5f68c50d0541))
* **dmn-diff:** show DMN changes in a visual diff of DRD and decision tables ([#2359](https://github.com/Miragon/bpmn-modeler/issues/2359)) ([e66b46d](https://github.com/Miragon/bpmn-modeler/commit/e66b46d056f5c72b87a81152182a695249dc9937))
* fit the diagram to the view from a canvas button ([#2343](https://github.com/Miragon/bpmn-modeler/issues/2343)) ([00da896](https://github.com/Miragon/bpmn-modeler/commit/00da8960e5bbdf0cf0c5fd9c8518ff3495aa5775))
* **modeler-core:** list element templates and marketplaces in the add-on catalog ([#2296](https://github.com/Miragon/bpmn-modeler/issues/2296)) [sync d7dd275] ([4eab152](https://github.com/Miragon/bpmn-modeler/commit/4eab1525a247dd18626a3de5ee6d9a98783e86bf))
* replace the canvas focus reticle with a focus ring ([#2342](https://github.com/Miragon/bpmn-modeler/issues/2342)) ([3f64891](https://github.com/Miragon/bpmn-modeler/commit/3f648910c76288ec018eaa25a2d9743ca7b33f42))
* show the canvas keyboard focus as a dot on the fit button ([#2362](https://github.com/Miragon/bpmn-modeler/issues/2362)) ([0f56772](https://github.com/Miragon/bpmn-modeler/commit/0f567728f53e88561a6d28de68d18207ff94a9d3))


### 📔 Documentation

* rewrite READMEs for users, move package reference to the docs ([#2331](https://github.com/Miragon/bpmn-modeler/issues/2331)) ([6177741](https://github.com/Miragon/bpmn-modeler/commit/6177741ca798c7c86da068cabb1e4802cb187e6a))


### 🛠️ Misc

* **deps:** bump the bpmn-io group except @bpmn-io/properties-panel ([#2123](https://github.com/Miragon/bpmn-modeler/issues/2123)) ([4a03893](https://github.com/Miragon/bpmn-modeler/commit/4a0389337341a562ed9e2b366df1e175c7adf5cb))
* **deps:** bump the npm-minor-patch group across 1 directory with 24 updates ([#2334](https://github.com/Miragon/bpmn-modeler/issues/2334)) ([0f3f59d](https://github.com/Miragon/bpmn-modeler/commit/0f3f59db46031a56defb0a48e839c50de4f17a00))

## [0.8.0](https://github.com/Miragon/bpmn-modeler/compare/dmn-modeler-v0.7.0...dmn-modeler-v0.8.0) (2026-11-09)


### 🎉 New Features

* **modeler-core:** load approved workspace bpmn-js plugins in VS Code ([#2251](https://github.com/Miragon/bpmn-modeler/issues/2251)) [sync 5457858] ([7107b52](https://github.com/Miragon/bpmn-modeler/commit/7107b529e1d4d7f23f584420b315d2b4c38cfd35))

## [0.7.0](https://github.com/Miragon/bpmn-modeler/compare/dmn-modeler-v0.6.0...dmn-modeler-v0.7.0) (2026-11-08)


### 🎉 New Features

* **orca-plugin:** open .bpmn and .dmn files in Orca ([#2210](https://github.com/Miragon/bpmn-modeler/issues/2210)) [sync b7d4773] ([b40d944](https://github.com/Miragon/bpmn-modeler/commit/b40d944eb3207001ed7c4bbec45b83dd7dacfcbe))


### 🐞 Bug Fixes

* **dmn-modeler:** separate a rule's outputs in the simulation result ([#2257](https://github.com/Miragon/bpmn-modeler/issues/2257)) ([1b074dd](https://github.com/Miragon/bpmn-modeler/commit/1b074dd1d0d71c762eb9ff17d32e4b6bf8bcce57))


### 🔨 Refactoring

* import respelled value sets from their home ([#2203](https://github.com/Miragon/bpmn-modeler/issues/2203)) ([0a2785e](https://github.com/Miragon/bpmn-modeler/commit/0a2785ea9b3ac2a1db286bbbed8fee8a7b0cf945))
* **theme:** give the theme modes one home in modeler-types ([#2171](https://github.com/Miragon/bpmn-modeler/issues/2171)) ([ba79907](https://github.com/Miragon/bpmn-modeler/commit/ba79907c504b47522ce5227e41871466f5d6ce6f))


### 📔 Documentation

* write each README for one reader, its users or its developers ([#2253](https://github.com/Miragon/bpmn-modeler/issues/2253)) ([3d28322](https://github.com/Miragon/bpmn-modeler/commit/3d28322c3ad26e0038fb88fc90f3dd44dc4a1417))

## [0.6.0](https://github.com/Miragon/bpmn-modeler/compare/dmn-modeler-v0.5.0...dmn-modeler-v0.6.0) (2026-11-04)


### 🎉 New Features

* **bpmn-webview:** preview forms linked to user tasks ([#1929](https://github.com/Miragon/bpmn-modeler/issues/1929)) [sync 52ec1dd] ([d07a689](https://github.com/Miragon/bpmn-modeler/commit/d07a68985cdabf0daa9be4421048eb061b170a80))
* **editor:** edit element templates in a graphical builder ([#2047](https://github.com/Miragon/bpmn-modeler/issues/2047)) [sync cda8154] ([3e04c5a](https://github.com/Miragon/bpmn-modeler/commit/3e04c5a6512f5b3d947a7d424d50e684cec57123))
* **editor:** preview element templates beside their JSON ([#2028](https://github.com/Miragon/bpmn-modeler/issues/2028)) [sync be6babb] ([452b644](https://github.com/Miragon/bpmn-modeler/commit/452b6440f99984b9603ddb07a8c8d8d30cfa921f))
* **modeler-core:** configure automatic form preview ([#2146](https://github.com/Miragon/bpmn-modeler/issues/2146)) [sync 210c621] ([e346554](https://github.com/Miragon/bpmn-modeler/commit/e346554c625b2ca24223ab13243fdaea470ecef1))


### 🛠️ Misc

* **architecture-testing:** add the role folders and one rule set per workspace kind ([#2138](https://github.com/Miragon/bpmn-modeler/issues/2138)) ([12ff0d9](https://github.com/Miragon/bpmn-modeler/commit/12ff0d9db708da7289457d545cee116f3a6795ba))

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
