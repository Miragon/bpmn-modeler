# Changelog

## [0.4.0](https://github.com/Miragon/bpmn-modeler/compare/orca-v0.3.1...orca-v0.4.0) (2026-11-14)


### 🎉 New Features

* **bpmn-diff:** return one element's XML without its children and diagram data ([#2461](https://github.com/Miragon/bpmn-modeler/issues/2461)) [sync 93096fa] ([73dfe03](https://github.com/Miragon/bpmn-modeler/commit/73dfe030192cd30b4924658bccb1b3ba32b5b9d3))
* **bpmn-modeler:** add reloadDiagram that keeps the view across a re-import ([#2427](https://github.com/Miragon/bpmn-modeler/issues/2427)) ([f6ff334](https://github.com/Miragon/bpmn-modeler/commit/f6ff334f5b58d396f1b3335710799bf6d3c17177))
* **bpmn-modeler:** give the diff legend the miragon look ([#2436](https://github.com/Miragon/bpmn-modeler/issues/2436)) [sync 291a060] ([22b9fb2](https://github.com/Miragon/bpmn-modeler/commit/22b9fb29502e4bd506631a78cd0a73e06718bc1e))
* **bpmn-modeler:** keep both diff panes on the same subprocess plane ([#2443](https://github.com/Miragon/bpmn-modeler/issues/2443)) [sync 378c141] ([ed31c8d](https://github.com/Miragon/bpmn-modeler/commit/ed31c8d3e199115d1b75bc86904379d99a8ad89f))
* **bpmn-modeler:** publish the surface checks hosts duck-type ([#2420](https://github.com/Miragon/bpmn-modeler/issues/2420)) ([0109615](https://github.com/Miragon/bpmn-modeler/commit/01096152c1e9b00affcedd63751abfeb4c7af5bd))
* **bpmn-modeler:** restyle the diff view after Diagit's diff panel ([#2442](https://github.com/Miragon/bpmn-modeler/issues/2442)) [sync c4f0e69] ([408237a](https://github.com/Miragon/bpmn-modeler/commit/408237a175ed62d21fa02dd4ac267538c644d3f4))
* **model-navigation:** open and preview a start event's linked form ([#2460](https://github.com/Miragon/bpmn-modeler/issues/2460)) [sync f1dd92f] ([6414d46](https://github.com/Miragon/bpmn-modeler/commit/6414d464c797688f13f543dc058b9ab9b3a3c5f3))
* **modeler-core:** open an add-on's details in an editor tab ([#2382](https://github.com/Miragon/bpmn-modeler/issues/2382)) [sync 63b09b6] ([7c28a72](https://github.com/Miragon/bpmn-modeler/commit/7c28a7204d9d75bdcb6a8d3226a048f2a1a2bf8c))


### 🐞 Bug Fixes

* **append-menu:** one rule for what counts as a template popup entry ([#2425](https://github.com/Miragon/bpmn-modeler/issues/2425)) [sync 59f7b92] ([858d1c6](https://github.com/Miragon/bpmn-modeler/commit/858d1c6db6208ea53c86cd8ed60875caa5ad6b36))


### 🔨 Refactoring

* **modeler-types:** decide once whether a document is blank ([#2410](https://github.com/Miragon/bpmn-modeler/issues/2410)) ([b382775](https://github.com/Miragon/bpmn-modeler/commit/b382775c4d87aab8bd4391c1a104ea0850c06e4c))
* **shared:** build the properties-panel chrome once for every editor page ([#2435](https://github.com/Miragon/bpmn-modeler/issues/2435)) ([bc04fd8](https://github.com/Miragon/bpmn-modeler/commit/bc04fd85038752abe4136a7d9b95e33b12ee63d7))


### 📔 Documentation

* **orca-plugin:** explain why the plugin shows no diagram diff ([#2399](https://github.com/Miragon/bpmn-modeler/issues/2399)) ([44d6254](https://github.com/Miragon/bpmn-modeler/commit/44d6254c36b8e0b8a4e68f028d2cf1c1a07b89fc))


### 🛠️ Misc

* **build:** share one vite preset across the modeler bundles ([#2437](https://github.com/Miragon/bpmn-modeler/issues/2437)) ([97d5991](https://github.com/Miragon/bpmn-modeler/commit/97d5991faf8805485831bc2f6b63ecfd91a09d15))
* **orca-plugin:** move to @miragon/modeler-shell 0.14.1 and its smaller Orca smoke ([#2376](https://github.com/Miragon/bpmn-modeler/issues/2376)) ([2158247](https://github.com/Miragon/bpmn-modeler/commit/2158247cdf7a8a54bd1493f956ebb12d8c0fd721))

## [0.3.1](https://github.com/Miragon/bpmn-modeler/compare/orca-v0.3.0...orca-v0.3.1) (2026-11-12)


### 🛠️ Misc

* **orca-plugin:** run the Orca smoke on Miragon/orca-modelers' shared Orca runtime ([#2369](https://github.com/Miragon/bpmn-modeler/issues/2369)) ([862b8a0](https://github.com/Miragon/bpmn-modeler/commit/862b8a02ff146857a91bf6d6706fbca7d02199f6))
* **orca-plugin:** take setup-orca and publish-plugin from Miragon/orca-plugin-kit ([#2375](https://github.com/Miragon/bpmn-modeler/issues/2375)) ([808c58c](https://github.com/Miragon/bpmn-modeler/commit/808c58c82ff379161b43a99d2d2011ea089088ba))

## [0.3.0](https://github.com/Miragon/bpmn-modeler/compare/orca-v0.2.0...orca-v0.3.0) (2026-11-12)


### 🎉 New Features

* **add-ons-webview:** render the add-on catalog in a host-neutral webview ([#2308](https://github.com/Miragon/bpmn-modeler/issues/2308)) [sync aace17c] ([799a005](https://github.com/Miragon/bpmn-modeler/commit/799a00522f925d9ee58d6f54f01c30a3b90c47db))
* **bpmn-modeler:** keep hidden element templates out of new choices ([#2301](https://github.com/Miragon/bpmn-modeler/issues/2301)) [sync 2d6033d] ([e40e3c8](https://github.com/Miragon/bpmn-modeler/commit/e40e3c8bfaa5f74c88a80882d01e5f68c50d0541))
* **dmn-diff:** show DMN changes in a visual diff of DRD and decision tables ([#2359](https://github.com/Miragon/bpmn-modeler/issues/2359)) [sync e66b46d] ([3171794](https://github.com/Miragon/bpmn-modeler/commit/317179489e12fcea5feff4361b130d558d23dba3))
* fit the diagram to the view from a canvas button ([#2343](https://github.com/Miragon/bpmn-modeler/issues/2343)) [sync 00da896] ([86091c1](https://github.com/Miragon/bpmn-modeler/commit/86091c149da7d5869d4a784554d6c7d26188b45b))
* **modeler-core:** add form engine and shared language selection ([#2341](https://github.com/Miragon/bpmn-modeler/issues/2341)) [sync c28a403] ([d152df2](https://github.com/Miragon/bpmn-modeler/commit/d152df2b63a9c887be2c6e5461d66538b7799664))
* **modeler-core:** list element templates and marketplaces in the add-on catalog ([#2296](https://github.com/Miragon/bpmn-modeler/issues/2296)) [sync d7dd275] ([4eab152](https://github.com/Miragon/bpmn-modeler/commit/4eab1525a247dd18626a3de5ee6d9a98783e86bf))
* open the add-ons that need review from a command in both hosts ([#2335](https://github.com/Miragon/bpmn-modeler/issues/2335)) [sync 18ddb38] ([16bf46d](https://github.com/Miragon/bpmn-modeler/commit/16bf46ddb234058eaa65e4a27e80f84d1dde248b))
* replace the canvas focus reticle with a focus ring ([#2342](https://github.com/Miragon/bpmn-modeler/issues/2342)) ([3f64891](https://github.com/Miragon/bpmn-modeler/commit/3f648910c76288ec018eaa25a2d9743ca7b33f42))
* show the canvas keyboard focus as a dot on the fit button ([#2362](https://github.com/Miragon/bpmn-modeler/issues/2362)) [sync 0f56772] ([370fd65](https://github.com/Miragon/bpmn-modeler/commit/370fd65108f77cc65dbf5218153d0a219c0a193f))


### 🐞 Bug Fixes

* **element-template-chooser:** preview the first choice of a required dropdown ([#2351](https://github.com/Miragon/bpmn-modeler/issues/2351)) [sync 64a5abf] ([949b86e](https://github.com/Miragon/bpmn-modeler/commit/949b86e48bab29990802551d28b9cc00d628d69c))
* **element-template-chooser:** show Boolean and Number values in the previews ([#2357](https://github.com/Miragon/bpmn-modeler/issues/2357)) [sync 7095db6] ([54d895d](https://github.com/Miragon/bpmn-modeler/commit/54d895dec7f0009e6ee1c3f92568a5c2b0166024))


### 📔 Documentation

* rewrite READMEs for users, move package reference to the docs ([#2331](https://github.com/Miragon/bpmn-modeler/issues/2331)) ([6177741](https://github.com/Miragon/bpmn-modeler/commit/6177741ca798c7c86da068cabb1e4802cb187e6a))


### 🛠️ Misc

* **deps:** bump the bpmn-io group except @bpmn-io/properties-panel ([#2123](https://github.com/Miragon/bpmn-modeler/issues/2123)) ([4a03893](https://github.com/Miragon/bpmn-modeler/commit/4a0389337341a562ed9e2b366df1e175c7adf5cb))
* **deps:** bump the npm-minor-patch group across 1 directory with 24 updates ([#2334](https://github.com/Miragon/bpmn-modeler/issues/2334)) ([0f3f59d](https://github.com/Miragon/bpmn-modeler/commit/0f3f59db46031a56defb0a48e839c50de4f17a00))

## [0.2.0](https://github.com/Miragon/bpmn-modeler/compare/orca-v0.1.1...orca-v0.2.0) (2026-11-09)


### 🎉 New Features

* **modeler-core:** load approved workspace bpmn-js plugins in VS Code ([#2251](https://github.com/Miragon/bpmn-modeler/issues/2251)) [sync 5457858] ([7107b52](https://github.com/Miragon/bpmn-modeler/commit/7107b529e1d4d7f23f584420b315d2b4c38cfd35))
* **orca-plugin:** open an example process from Orca's Try it button and + menu ([#2277](https://github.com/Miragon/bpmn-modeler/issues/2277)) ([41a7fee](https://github.com/Miragon/bpmn-modeler/commit/41a7fee508ae8ee70abc3be807e82f29fcf2737a))

## [0.1.1](https://github.com/Miragon/bpmn-modeler/compare/orca-v0.1.0...orca-v0.1.1) (2026-11-08)


### 🐞 Bug Fixes

* **orca-plugin:** ship the icon fonts as WOFF only, as Orca's directory refuses EOT files ([#2260](https://github.com/Miragon/bpmn-modeler/issues/2260)) ([5850437](https://github.com/Miragon/bpmn-modeler/commit/585043721f1fd45763c9e5f8824e037db7fed1b7))

## 0.1.0 (2026-11-08)


### 🎉 New Features

* **orca-plugin:** open .bpmn and .dmn files in Orca ([#2210](https://github.com/Miragon/bpmn-modeler/issues/2210)) ([b7d4773](https://github.com/Miragon/bpmn-modeler/commit/b7d4773f0aa9e80d757a87b8ed613a923e2d7db0))


### 📔 Documentation

* make the store images with the product-shots skill and rewrite the store READMEs ([#2254](https://github.com/Miragon/bpmn-modeler/issues/2254)) ([4eb590a](https://github.com/Miragon/bpmn-modeler/commit/4eb590a154b892e19ce9d6f1e06e7b25555d65dd))
* write each README for one reader, its users or its developers ([#2253](https://github.com/Miragon/bpmn-modeler/issues/2253)) ([3d28322](https://github.com/Miragon/bpmn-modeler/commit/3d28322c3ad26e0038fb88fc90f3dd44dc4a1417))
