# Changelog

## [1.18.0](https://github.com/Miragon/bpmn-modeler/compare/intellij-v1.17.0...intellij-v1.18.0) (2026-11-14)


### 🎉 New Features

* **add-ons-webview:** show the review open with Allow at its end ([#2380](https://github.com/Miragon/bpmn-modeler/issues/2380)) [sync 9d6d328] ([4f0b92f](https://github.com/Miragon/bpmn-modeler/commit/4f0b92f693602b77cc44ae5f54998fe6cd7786fe))
* **add-ons-webview:** show what needs attention first and drop the tabs and chips ([#2379](https://github.com/Miragon/bpmn-modeler/issues/2379)) [sync d683178] ([3d8f9a4](https://github.com/Miragon/bpmn-modeler/commit/3d8f9a4dc5bd8fd81253f142d562c21883391ca6))
* **bpmn-diff:** return one element's XML without its children and diagram data ([#2461](https://github.com/Miragon/bpmn-modeler/issues/2461)) [sync 93096fa] ([73dfe03](https://github.com/Miragon/bpmn-modeler/commit/73dfe030192cd30b4924658bccb1b3ba32b5b9d3))
* **bpmn-modeler:** add reloadDiagram that keeps the view across a re-import ([#2427](https://github.com/Miragon/bpmn-modeler/issues/2427)) [sync f6ff334] ([8bef1be](https://github.com/Miragon/bpmn-modeler/commit/8bef1be1fd38eb7f914e89feace8d6f2bf7cab94))
* **bpmn-modeler:** give the diff legend the miragon look ([#2436](https://github.com/Miragon/bpmn-modeler/issues/2436)) [sync 291a060] ([22b9fb2](https://github.com/Miragon/bpmn-modeler/commit/22b9fb29502e4bd506631a78cd0a73e06718bc1e))
* **bpmn-modeler:** keep both diff panes on the same subprocess plane ([#2443](https://github.com/Miragon/bpmn-modeler/issues/2443)) [sync 378c141] ([ed31c8d](https://github.com/Miragon/bpmn-modeler/commit/ed31c8d3e199115d1b75bc86904379d99a8ad89f))
* **bpmn-modeler:** publish the surface checks hosts duck-type ([#2420](https://github.com/Miragon/bpmn-modeler/issues/2420)) [sync 0109615] ([1f47b5a](https://github.com/Miragon/bpmn-modeler/commit/1f47b5a38278b9fff5224042fe261cf98a727f47))
* **bpmn-modeler:** restyle the diff view after Diagit's diff panel ([#2442](https://github.com/Miragon/bpmn-modeler/issues/2442)) [sync c4f0e69] ([408237a](https://github.com/Miragon/bpmn-modeler/commit/408237a175ed62d21fa02dd4ac267538c644d3f4))
* **model-navigation:** open and preview a start event's linked form ([#2460](https://github.com/Miragon/bpmn-modeler/issues/2460)) [sync f1dd92f] ([6414d46](https://github.com/Miragon/bpmn-modeler/commit/6414d464c797688f13f543dc058b9ab9b3a3c5f3))
* **modeler-core:** open an add-on's details in an editor tab ([#2382](https://github.com/Miragon/bpmn-modeler/issues/2382)) [sync 63b09b6] ([7c28a72](https://github.com/Miragon/bpmn-modeler/commit/7c28a7204d9d75bdcb6a8d3226a048f2a1a2bf8c))
* **vscode-plugin:** give Add-ons and Deploy their own activity bar containers ([#2381](https://github.com/Miragon/bpmn-modeler/issues/2381)) ([746ec23](https://github.com/Miragon/bpmn-modeler/commit/746ec23044dff4d0abf0a78786fda6bfa99e87f4))


### 🐞 Bug Fixes

* **append-menu:** one rule for what counts as a template popup entry ([#2425](https://github.com/Miragon/bpmn-modeler/issues/2425)) [sync 59f7b92] ([858d1c6](https://github.com/Miragon/bpmn-modeler/commit/858d1c6db6208ea53c86cd8ed60875caa5ad6b36))
* **vscode-plugin:** open a file as an editor while an unrelated compare tab is open ([#2402](https://github.com/Miragon/bpmn-modeler/issues/2402)) [sync d662666] ([c3d25ed](https://github.com/Miragon/bpmn-modeler/commit/c3d25ed5c5ba8476ec3b1c063f12a7bdd80e1f4d))
* **vscode-plugin:** open a second diff tab of the same file as a diff ([#2444](https://github.com/Miragon/bpmn-modeler/issues/2444)) [sync 98ef49e] ([690e2d5](https://github.com/Miragon/bpmn-modeler/commit/690e2d5da3c1d64a1aa9c17ba1f1df2446f1a76b))


### 🔨 Refactoring

* **intellij-plugin:** give each host-replicated state one registration ([#2415](https://github.com/Miragon/bpmn-modeler/issues/2415)) ([3642b73](https://github.com/Miragon/bpmn-modeler/commit/3642b73d099ebcfd17d66ef26fe794476eee6c97))
* **modeler-bridge:** reuse the core's innermost root and basename ([#2418](https://github.com/Miragon/bpmn-modeler/issues/2418)) ([f674ad3](https://github.com/Miragon/bpmn-modeler/commit/f674ad33894f0f8d9b60fa3b916bee6256d8b4cb))
* **modeler-core:** build the completion and new-file texts in the core ([#2411](https://github.com/Miragon/bpmn-modeler/issues/2411)) ([722bde7](https://github.com/Miragon/bpmn-modeler/commit/722bde71ea328bb7eec6006c7a529a9b09cddb7c))
* **modeler-core:** make EditorHandle the only document port ([#2438](https://github.com/Miragon/bpmn-modeler/issues/2438)) ([5cae0bd](https://github.com/Miragon/bpmn-modeler/commit/5cae0bdf606534d06c4b6a3ff43c278b99c65fd5))
* **shared:** build the properties-panel chrome once for every editor page ([#2435](https://github.com/Miragon/bpmn-modeler/issues/2435)) ([bc04fd8](https://github.com/Miragon/bpmn-modeler/commit/bc04fd85038752abe4136a7d9b95e33b12ee63d7))
* **shared:** give the flush reply table one home across hosts ([#2416](https://github.com/Miragon/bpmn-modeler/issues/2416)) ([cc45e75](https://github.com/Miragon/bpmn-modeler/commit/cc45e753497c67efc6dfd6a02806c90e9be5f3da))


### 📔 Documentation

* **adr:** trim and re-split the architecture decision records ([#2315](https://github.com/Miragon/bpmn-modeler/issues/2315)) ([5050def](https://github.com/Miragon/bpmn-modeler/commit/5050def57121ce86b4106bc3af64476ed5a5f737))
* **changelog:** note the allowance per repository for vs code 1.22.0 and intellij 1.17.0 ([#2465](https://github.com/Miragon/bpmn-modeler/issues/2465)) ([cc92368](https://github.com/Miragon/bpmn-modeler/commit/cc9236834db1333529dec7383e0507fb244b0a9d))


### 🛠️ Misc

* **intellij-plugin:** pin the Kotlin half of the RPC contracts ([#2392](https://github.com/Miragon/bpmn-modeler/issues/2392)) ([af28ecc](https://github.com/Miragon/bpmn-modeler/commit/af28ecc986966c75d62216de9720de24d3167c7d))

## [1.17.0](https://github.com/Miragon/bpmn-modeler/compare/intellij-v1.16.0...intellij-v1.17.0) (2026-11-12)


### ⚠️ Allowing plugins and rule packages

You now allow a bpmn-js plugin or a bpmnlint rule package once per repository. The allowance covers it in every worktree of that repository, later changes included, so a pull, a branch switch or an update no longer asks again. Outside a git repository it covers the add-on's folder. A new add-on, another repository and a second clone ask once. Approvals from earlier versions are kept as allowances; going back to an earlier version asks again. Revoke an add-on before you check out code you do not trust. In a project you did not trust in the IDE, no plugin loads and no rule package runs; the bundled lint rules still do. The IDE counts a project it never asked you about as not trusted. See [Project trust](https://miragon.github.io/bpmn-modeler/intellij/getting-started#project-trust).

### 🎉 New Features

* **add-ons-webview:** render the add-on catalog in a host-neutral webview ([#2308](https://github.com/Miragon/bpmn-modeler/issues/2308)) [sync aace17c] ([799a005](https://github.com/Miragon/bpmn-modeler/commit/799a00522f925d9ee58d6f54f01c30a3b90c47db))
* **add-ons-webview:** show add-ons as a searchable list with a detail pane ([#2327](https://github.com/Miragon/bpmn-modeler/issues/2327)) ([f7fad7c](https://github.com/Miragon/bpmn-modeler/commit/f7fad7c11e646e1d35726fe5fb7df0d8ba7c1479))
* **bpmn-modeler:** keep hidden element templates out of new choices ([#2301](https://github.com/Miragon/bpmn-modeler/issues/2301)) [sync 2d6033d] ([e40e3c8](https://github.com/Miragon/bpmn-modeler/commit/e40e3c8bfaa5f74c88a80882d01e5f68c50d0541))
* call the artifacts view add-ons ([#2326](https://github.com/Miragon/bpmn-modeler/issues/2326)) ([1e2f3a6](https://github.com/Miragon/bpmn-modeler/commit/1e2f3a6fd73cd5598642ede3fd9c66bbe6aa684a))
* **dmn-diff:** show DMN changes in a visual diff of DRD and decision tables ([#2359](https://github.com/Miragon/bpmn-modeler/issues/2359)) ([e66b46d](https://github.com/Miragon/bpmn-modeler/commit/e66b46d056f5c72b87a81152182a695249dc9937))
* fit the diagram to the view from a canvas button ([#2343](https://github.com/Miragon/bpmn-modeler/issues/2343)) [sync 00da896] ([86091c1](https://github.com/Miragon/bpmn-modeler/commit/86091c149da7d5869d4a784554d6c7d26188b45b))
* **intellij-plugin:** keep element template switches per user in intellij ([#2307](https://github.com/Miragon/bpmn-modeler/issues/2307)) ([cb671dd](https://github.com/Miragon/bpmn-modeler/commit/cb671ddb8e2bbac813b09363e59055c0f8b1935a))
* **intellij-plugin:** manage add-ons in the artifacts tab of the bpmn modeler tool window ([#2310](https://github.com/Miragon/bpmn-modeler/issues/2310)) ([e3d0b8c](https://github.com/Miragon/bpmn-modeler/commit/e3d0b8cd32b4e831747c228b7fce828ab295f172))
* **intellij-plugin:** run no workspace code in a project you did not trust ([#2361](https://github.com/Miragon/bpmn-modeler/issues/2361)) ([781d9bb](https://github.com/Miragon/bpmn-modeler/commit/781d9bb6b38c3a9ea253a7dbd386e9897cde3516))
* **modeler-core:** add form engine and shared language selection ([#2341](https://github.com/Miragon/bpmn-modeler/issues/2341)) ([c28a403](https://github.com/Miragon/bpmn-modeler/commit/c28a403a9b3e887169b9773062a2da0889604525))
* **modeler-core:** allow workspace code per repository and add-on ([#2358](https://github.com/Miragon/bpmn-modeler/issues/2358)) [sync 192d740] ([9c038a7](https://github.com/Miragon/bpmn-modeler/commit/9c038a7d1a00765fb3dbc041115a0752884c5029))
* **modeler-core:** follow approval changes everywhere and prune the plugin cache ([#2286](https://github.com/Miragon/bpmn-modeler/issues/2286)) [sync a49ab82] ([2df7b5f](https://github.com/Miragon/bpmn-modeler/commit/2df7b5f8d2697042a192b46f780f35ecb86c8bf9))
* **modeler-core:** host-neutral add-on catalog for the artifacts view ([#2289](https://github.com/Miragon/bpmn-modeler/issues/2289)) [sync 68770b6] ([0d8ae72](https://github.com/Miragon/bpmn-modeler/commit/0d8ae722f85e58db2a38d89c56310b47ef16b24b))
* **modeler-core:** list element templates and marketplaces in the add-on catalog ([#2296](https://github.com/Miragon/bpmn-modeler/issues/2296)) [sync d7dd275] ([4eab152](https://github.com/Miragon/bpmn-modeler/commit/4eab1525a247dd18626a3de5ee6d9a98783e86bf))
* **modeler-core:** offer a marketplace update when the workspace has fetched nothing ([#2318](https://github.com/Miragon/bpmn-modeler/issues/2318)) [sync 4c128e7] ([70d3686](https://github.com/Miragon/bpmn-modeler/commit/70d368635801e73175de263dbee89a9a7be7c057))
* **modeler-core:** tell which repository holds workspace code ([#2346](https://github.com/Miragon/bpmn-modeler/issues/2346)) [sync cc6eacf] ([4f9aefc](https://github.com/Miragon/bpmn-modeler/commit/4f9aefc6029230fdebf2690b23fab4a1684b8e0a))
* **modeler-core:** turn element templates and their sources off per user ([#2304](https://github.com/Miragon/bpmn-modeler/issues/2304)) [sync 48bab6d] ([3f9636f](https://github.com/Miragon/bpmn-modeler/commit/3f9636fb809a3066a10f13c8b9f808577bf2c199))
* open the add-ons that need review from a command in both hosts ([#2335](https://github.com/Miragon/bpmn-modeler/issues/2335)) ([18ddb38](https://github.com/Miragon/bpmn-modeler/commit/18ddb38f93f3d9567d6b76353d812bad75cdb1ea))
* replace the canvas focus reticle with a focus ring ([#2342](https://github.com/Miragon/bpmn-modeler/issues/2342)) [sync 3f64891] ([62a7f36](https://github.com/Miragon/bpmn-modeler/commit/62a7f360915853d666ac0178fb70cdb3b4d9d5e7))
* show the canvas keyboard focus as a dot on the fit button ([#2362](https://github.com/Miragon/bpmn-modeler/issues/2362)) [sync 0f56772] ([370fd65](https://github.com/Miragon/bpmn-modeler/commit/370fd65108f77cc65dbf5218153d0a219c0a193f))
* show the miragon comet as the bpmn modeler container icon ([#2322](https://github.com/Miragon/bpmn-modeler/issues/2322)) ([f4f87fb](https://github.com/Miragon/bpmn-modeler/commit/f4f87fb2cc73510014e78544729751eaa1e42598))


### 🐞 Bug Fixes

* **add-ons-webview:** render the newest state when the host answers at once ([#2323](https://github.com/Miragon/bpmn-modeler/issues/2323)) [sync 3538366] ([4fe6128](https://github.com/Miragon/bpmn-modeler/commit/4fe61285fb152f9cc52f0de037eda7867bda1be9))
* **element-template-chooser:** preview the first choice of a required dropdown ([#2351](https://github.com/Miragon/bpmn-modeler/issues/2351)) [sync 64a5abf] ([949b86e](https://github.com/Miragon/bpmn-modeler/commit/949b86e48bab29990802551d28b9cc00d628d69c))
* **element-template-chooser:** show Boolean and Number values in the previews ([#2357](https://github.com/Miragon/bpmn-modeler/issues/2357)) [sync 7095db6] ([54d895d](https://github.com/Miragon/bpmn-modeler/commit/54d895dec7f0009e6ee1c3f92568a5c2b0166024))
* **intellij-plugin:** write approvals as changes the host merges ([#2279](https://github.com/Miragon/bpmn-modeler/issues/2279)) ([2e017bc](https://github.com/Miragon/bpmn-modeler/commit/2e017bc3d9cb42a5ac9da77e46b4c4c5b04ac0cf))
* **modeler-bridge:** report the files a late linux watch missed while arming ([#2302](https://github.com/Miragon/bpmn-modeler/issues/2302)) [sync 6d38092] ([aeb71f3](https://github.com/Miragon/bpmn-modeler/commit/aeb71f3ea51d94c519b1c5551a396fa770aadaee))
* **modeler-bridge:** watch a folder that does not exist yet once it appears ([#2299](https://github.com/Miragon/bpmn-modeler/issues/2299)) [sync f469851] ([5b962a6](https://github.com/Miragon/bpmn-modeler/commit/5b962a629fa0d1ba87b9da934b4c74e53e836cb0))


### 📔 Documentation

* rewrite READMEs for users, move package reference to the docs ([#2331](https://github.com/Miragon/bpmn-modeler/issues/2331)) ([6177741](https://github.com/Miragon/bpmn-modeler/commit/6177741ca798c7c86da068cabb1e4802cb187e6a))


### 🛠️ Misc

* **deps:** bump org.jetbrains.intellij.platform from 2.19.0 to 2.20.0 in /apps/intellij-plugin in the gradle-minor-patch group ([#2312](https://github.com/Miragon/bpmn-modeler/issues/2312)) ([618a9e1](https://github.com/Miragon/bpmn-modeler/commit/618a9e190e17a95ada259e377e9baed6b835ad4d))
* signal the brand mode to the add-ons view ([#2325](https://github.com/Miragon/bpmn-modeler/issues/2325)) ([4a7d838](https://github.com/Miragon/bpmn-modeler/commit/4a7d8386241cee629cdee903280ea9528045a484))

## [1.16.0](https://github.com/Miragon/bpmn-modeler/compare/intellij-v1.15.0...intellij-v1.16.0) (2026-11-09)


### 🎉 New Features

* **intellij-plugin:** load approved workspace bpmn-js plugins ([#2252](https://github.com/Miragon/bpmn-modeler/issues/2252)) ([838040d](https://github.com/Miragon/bpmn-modeler/commit/838040d0ec00a078029ba2a2d81f123d8895d22a))
* **modeler-core:** ask before running workspace bpmnlint rule packages ([#2274](https://github.com/Miragon/bpmn-modeler/issues/2274)) [sync 2e9b592] ([3689d27](https://github.com/Miragon/bpmn-modeler/commit/3689d27e068213a421c54ca366c099c1bd79073c))
* **modeler-core:** load approved workspace bpmn-js plugins in VS Code ([#2251](https://github.com/Miragon/bpmn-modeler/issues/2251)) [sync 5457858] ([7107b52](https://github.com/Miragon/bpmn-modeler/commit/7107b529e1d4d7f23f584420b315d2b4c38cfd35))


### 🐞 Bug Fixes

* **modeler-core:** run no workspace code in host linting outside rule packages ([#2272](https://github.com/Miragon/bpmn-modeler/issues/2272)) [sync 2bce0e5] ([9f8498f](https://github.com/Miragon/bpmn-modeler/commit/9f8498f4613bb198ab92d3bdbb11c991894ac9fa))

## [1.15.0](https://github.com/Miragon/bpmn-modeler/compare/intellij-v1.14.0...intellij-v1.15.0) (2026-11-08)


### 🎉 New Features

* **orca-plugin:** open .bpmn and .dmn files in Orca ([#2210](https://github.com/Miragon/bpmn-modeler/issues/2210)) ([b7d4773](https://github.com/Miragon/bpmn-modeler/commit/b7d4773f0aa9e80d757a87b8ed613a923e2d7db0))


### 🐞 Bug Fixes

* **bpmn-modeler:** fit a diagram with the same gap to the palette as to the right edge ([#2255](https://github.com/Miragon/bpmn-modeler/issues/2255)) [sync b691b66] ([dc13bc8](https://github.com/Miragon/bpmn-modeler/commit/dc13bc8377a1ed0b22b6d0dc6a7e6f55ac8a7f1e))
* **bpmn-modeler:** keep the mode chip beside the token simulation toggle when the toggle grows ([#2258](https://github.com/Miragon/bpmn-modeler/issues/2258)) [sync 2e8ec37] ([276369a](https://github.com/Miragon/bpmn-modeler/commit/276369a55e28880d6a09462c66ac4a07c1ce7699))
* **deployment-webview:** check start-instance auth fields like deploy ([#2197](https://github.com/Miragon/bpmn-modeler/issues/2197)) [sync 755b32e] ([c099cf4](https://github.com/Miragon/bpmn-modeler/commit/c099cf4bd2d0a13c1683eea8ded4f8aa1385c267))
* **modeler-bridge:** keep the spinner until every run of its title ends ([#2189](https://github.com/Miragon/bpmn-modeler/issues/2189)) [sync b34a0cb] ([6b25d19](https://github.com/Miragon/bpmn-modeler/commit/6b25d198dc4860d3c5f884b45d399a99a705c95a))
* **modeler-bridge:** show no sync error when IntelliJ fails an edit ([#2186](https://github.com/Miragon/bpmn-modeler/issues/2186)) [sync 8456263] ([80af90e](https://github.com/Miragon/bpmn-modeler/commit/80af90e40a9df69cd118f68d6401e2fcebb794f3))
* **modeler-core:** follow the C8 API version in requests and form hints ([#2209](https://github.com/Miragon/bpmn-modeler/issues/2209)) [sync 80bf642] ([8bfb20f](https://github.com/Miragon/bpmn-modeler/commit/8bfb20fc8c5541bbdfc3451f99723086cf90ad25))
* **modeler-core:** say a marketplace is already registered, not added ([#2201](https://github.com/Miragon/bpmn-modeler/issues/2201)) [sync d974411] ([5bef969](https://github.com/Miragon/bpmn-modeler/commit/5bef9696ffc888574b31657b706453c1b6a51928))
* **modeler-core:** start new model files with the XML declaration ([#2198](https://github.com/Miragon/bpmn-modeler/issues/2198)) ([0a57387](https://github.com/Miragon/bpmn-modeler/commit/0a5738752bbeb6168ae458c4f2fcd61450f65392))


### 🔨 Refactoring

* **modeler-core:** build the marketplace add and remove texts ([#2172](https://github.com/Miragon/bpmn-modeler/issues/2172)) ([75786e9](https://github.com/Miragon/bpmn-modeler/commit/75786e96ad9ebea4ac0e7b787b91a23a5b30f6f2))
* **modeler-core:** give the colour themes and engines one home ([#2207](https://github.com/Miragon/bpmn-modeler/issues/2207)) ([7f49d8b](https://github.com/Miragon/bpmn-modeler/commit/7f49d8b17b34ecc2541289c277056b355fec3bd6))
* **webviews:** move three webviews into their role folders ([#2180](https://github.com/Miragon/bpmn-modeler/issues/2180)) ([72c4e69](https://github.com/Miragon/bpmn-modeler/commit/72c4e6963c676ccc18e8f6343343fddd99e75f17))


### 📔 Documentation

* make the store images with the product-shots skill and rewrite the store READMEs ([#2254](https://github.com/Miragon/bpmn-modeler/issues/2254)) ([4eb590a](https://github.com/Miragon/bpmn-modeler/commit/4eb590a154b892e19ce9d6f1e06e7b25555d65dd))
* write each README for one reader, its users or its developers ([#2253](https://github.com/Miragon/bpmn-modeler/issues/2253)) ([3d28322](https://github.com/Miragon/bpmn-modeler/commit/3d28322c3ad26e0038fb88fc90f3dd44dc4a1417))


### 🛠️ Misc

* **intellij-plugin:** pin the default modes to the surface modes ([#2177](https://github.com/Miragon/bpmn-modeler/issues/2177)) ([180b8cc](https://github.com/Miragon/bpmn-modeler/commit/180b8cc20d6235eb06c525d8f5baa8c0152cfb12))
* **intellij-plugin:** pin the script completion matchers to the core ([#2208](https://github.com/Miragon/bpmn-modeler/issues/2208)) ([7267b86](https://github.com/Miragon/bpmn-modeler/commit/7267b86c14f2824f7ee461a65fc0c6cc4d837c9d))

## [1.14.0](https://github.com/Miragon/bpmn-modeler/compare/intellij-v1.13.0...intellij-v1.14.0) (2026-11-05)


### 🎉 New Features

* **bpmn-webview:** remember the properties panel width per editor ([#2159](https://github.com/Miragon/bpmn-modeler/issues/2159)) [sync 757d979] ([cb30944](https://github.com/Miragon/bpmn-modeler/commit/cb3094473377c3129d1d66d5b3a60f53173e0afc))

## [1.13.0](https://github.com/Miragon/bpmn-modeler/compare/intellij-v1.12.0...intellij-v1.13.0) (2026-11-04)


### 🎉 New Features

* **bpmn-webview:** preview forms linked to user tasks ([#1929](https://github.com/Miragon/bpmn-modeler/issues/1929)) [sync 52ec1dd] ([d07a689](https://github.com/Miragon/bpmn-modeler/commit/d07a68985cdabf0daa9be4421048eb061b170a80))
* **editor:** edit element templates in a graphical builder ([#2047](https://github.com/Miragon/bpmn-modeler/issues/2047)) ([cda8154](https://github.com/Miragon/bpmn-modeler/commit/cda8154423447e2ab21d7e173f01eca17d113b98))
* **editor:** preview element templates beside their JSON ([#2028](https://github.com/Miragon/bpmn-modeler/issues/2028)) ([be6babb](https://github.com/Miragon/bpmn-modeler/commit/be6babb12c2463e10ed311bc726618eda839bf72))
* **modeler-core:** configure automatic form preview ([#2146](https://github.com/Miragon/bpmn-modeler/issues/2146)) ([210c621](https://github.com/Miragon/bpmn-modeler/commit/210c6212e74365579d127fa1972a44204f4f783a))


### 🐞 Bug Fixes

* **model-navigation:** resolve qname calledElement to its namespace ([#2156](https://github.com/Miragon/bpmn-modeler/issues/2156)) [sync 22adf90] ([0ed4ce1](https://github.com/Miragon/bpmn-modeler/commit/0ed4ce187dd6ee016d4928a7627e7993c66de233))


### 🔨 Refactoring

* **modeler-bridge:** move every file into its role folder ([#2141](https://github.com/Miragon/bpmn-modeler/issues/2141)) ([ad3bc35](https://github.com/Miragon/bpmn-modeler/commit/ad3bc35974372990b04aed653a11b48c59a42ec6))


### 🛠️ Misc

* **deps:** bump com.google.code.gson:gson from 2.14.0 to 2.15.0 in /apps/intellij-plugin in the gradle-minor-patch group ([#2149](https://github.com/Miragon/bpmn-modeler/issues/2149)) ([7706f54](https://github.com/Miragon/bpmn-modeler/commit/7706f54ed9dfaccae267f1153d053d01a490ee30))
* **intellij-plugin:** send host-to-core methods only through a typed enum ([#2136](https://github.com/Miragon/bpmn-modeler/issues/2136)) ([1dbdcd3](https://github.com/Miragon/bpmn-modeler/commit/1dbdcd3b2f8aae6f1fb8897fe790d576327e3958))

## [1.12.0](https://github.com/Miragon/bpmn-modeler/compare/intellij-v1.11.0...intellij-v1.12.0) (2026-11-01)


### 🎉 New Features

* **append-menu:** show element descriptions and match search keywords ([#1761](https://github.com/Miragon/bpmn-modeler/issues/1761)) [sync 7c7a424] ([d8357d8](https://github.com/Miragon/bpmn-modeler/commit/d8357d81aa31dd2ee520368d0e61fb903b9fe359))
* **bpmn-modeler:** publish command-stack and format subscriptions ([#2042](https://github.com/Miragon/bpmn-modeler/issues/2042)) [sync d86ef79] ([a23e288](https://github.com/Miragon/bpmn-modeler/commit/a23e288f14007d1dea6a277a8bec3b2cdd1364aa))
* **bpmn-modeler:** replace camunda-bpmn-js popup-menu features with our own ([#1777](https://github.com/Miragon/bpmn-modeler/issues/1777)) [sync 2adc83c] ([e064d78](https://github.com/Miragon/bpmn-modeler/commit/e064d787acd52ad60571fbf0e8128b0d4f55ba45))
* **bpmn-modeler:** translate popup-menu search keywords ([#1781](https://github.com/Miragon/bpmn-modeler/issues/1781)) [sync cae0009] ([432bbd7](https://github.com/Miragon/bpmn-modeler/commit/432bbd773e762ffa383631020639f90004f1b8e5))
* **bpmn-modeler:** update favourite elements on a live surface ([#1743](https://github.com/Miragon/bpmn-modeler/issues/1743)) [sync f1103b1] ([c759d76](https://github.com/Miragon/bpmn-modeler/commit/c759d76c7f1d01e8d5f137480bbe1a39febb259a))
* **deployment:** support ${env:VAR} references in target fields ([#1575](https://github.com/Miragon/bpmn-modeler/issues/1575)) ([d3f657b](https://github.com/Miragon/bpmn-modeler/commit/d3f657bc5a49a45f7b098495766af850b7e39bb5))


### 🐞 Bug Fixes

* **append-menu:** prefer the most specific type for a translated pick ([#1702](https://github.com/Miragon/bpmn-modeler/issues/1702)) [sync 2e0509f] ([6161050](https://github.com/Miragon/bpmn-modeler/commit/6161050a22953480db64fc5fc527f8aeadce653a))
* **bpmn-clipboard:** keep text field copies from carrying stale elements ([#1696](https://github.com/Miragon/bpmn-modeler/issues/1696)) [sync c5943c5] ([ec958f7](https://github.com/Miragon/bpmn-modeler/commit/ec958f7af472d53d0a441f1a30c1495ca766836f))
* **bpmn-diff:** step to boundary events next to their host activity ([#1749](https://github.com/Miragon/bpmn-modeler/issues/1749)) [sync 0003cbb] ([f4caf03](https://github.com/Miragon/bpmn-modeler/commit/f4caf03438148e94866ba5744f318bce8bd38a56))
* **bpmn-diff:** walk an embedded sub-process when the stepper reaches it ([#1748](https://github.com/Miragon/bpmn-modeler/issues/1748)) [sync 12c5e02] ([3648d45](https://github.com/Miragon/bpmn-modeler/commit/3648d4580fdc95a551b9261fb4ce6053bb30a96a))
* **bpmn-modeler:** arm the initial viewport fit on modeler imports ([#1741](https://github.com/Miragon/bpmn-modeler/issues/1741)) [sync 18ef8a6] ([367e1d6](https://github.com/Miragon/bpmn-modeler/commit/367e1d6e36c189d6d0dcd5529b486d9bab3d0158))
* **bpmn-modeler:** export CleanupStatus from the root entry and /design ([#2061](https://github.com/Miragon/bpmn-modeler/issues/2061)) [sync 8e3efca] ([b1e6bb2](https://github.com/Miragon/bpmn-modeler/commit/b1e6bb2f0cd5a51198c831b7717419132fb380ec))
* **bpmn-modeler:** export the layout outcome types from /design ([#2045](https://github.com/Miragon/bpmn-modeler/issues/2045)) [sync 76e2ea6] ([bb6ae7a](https://github.com/Miragon/bpmn-modeler/commit/bb6ae7ae48cc24045a2f49bd1b219db41672b3e8))
* **bpmn-modeler:** flush panel input on save and read the bound engine ([#2064](https://github.com/Miragon/bpmn-modeler/issues/2064)) [sync 33c466b] ([66e60bb](https://github.com/Miragon/bpmn-modeler/commit/66e60bb7c28f0bd7e6b0dfe5b4ff367edf83d4ec))
* **bpmn-modeler:** import plugin css at the pinned versions ([#1675](https://github.com/Miragon/bpmn-modeler/issues/1675)) [sync b0c2e84] ([9115a99](https://github.com/Miragon/bpmn-modeler/commit/9115a997a62228547f77c6576b00d56e89e03cda))
* **bpmn-modeler:** keep theme in step across destroy and mode switches ([#1734](https://github.com/Miragon/bpmn-modeler/issues/1734)) [sync 6fb3ba9] ([2a993a8](https://github.com/Miragon/bpmn-modeler/commit/2a993a866761ac52e2dd35fec0feedc76981be4b))
* **bpmn-modeler:** route ignored lint push warnings through onWarning ([#1735](https://github.com/Miragon/bpmn-modeler/issues/1735)) [sync f315dab] ([cd49835](https://github.com/Miragon/bpmn-modeler/commit/cd4983564ec06ef3b774431cba263a354113af14))
* **bpmn-webview:** give the diff pane a language-only message router ([#1769](https://github.com/Miragon/bpmn-modeler/issues/1769)) [sync b64e364] ([e89b6e4](https://github.com/Miragon/bpmn-modeler/commit/e89b6e4a16c3902d33d678e25bc6f20724990d96))
* **bpmn-webview:** honour favourite elements in design mode ([#1744](https://github.com/Miragon/bpmn-modeler/issues/1744)) [sync 0ee9666] ([99dcccd](https://github.com/Miragon/bpmn-modeler/commit/99dcccd0fc553e0690811470702b6e3a6782ea10))
* **bpmn-webview:** keep host settings and script locks on rebuilt modelers ([#1731](https://github.com/Miragon/bpmn-modeler/issues/1731)) [sync 0a4028b] ([ad637c3](https://github.com/Miragon/bpmn-modeler/commit/ad637c318ba938572592ab377d3087e139f2b13b))
* **bpmn-webview:** time out unanswered clipboard and definition-search requests ([#1730](https://github.com/Miragon/bpmn-modeler/issues/1730)) [sync 39a43bd] ([a497553](https://github.com/Miragon/bpmn-modeler/commit/a49755366d8d9bc58b17c400297cee64b1a649f7))
* **deployment-webview:** block target actions during a target reload ([#1885](https://github.com/Miragon/bpmn-modeler/issues/1885)) [sync 0c9f18c] ([832e8d1](https://github.com/Miragon/bpmn-modeler/commit/832e8d1f65205cf4550c3bb5884d9e439582f082))
* **element-template-chooser:** show "1 property" for a single template property ([#1794](https://github.com/Miragon/bpmn-modeler/issues/1794)) [sync abfa4ee] ([965a8e8](https://github.com/Miragon/bpmn-modeler/commit/965a8e8ad927a1c07ca32b94fa2cff4899b799d4))
* **element-template-chooser:** show only the type field as task type ([#1701](https://github.com/Miragon/bpmn-modeler/issues/1701)) [sync f4be0c6] ([e2bec2d](https://github.com/Miragon/bpmn-modeler/commit/e2bec2df516d5c82944404c11999c5dad0c8110f))
* **i18n:** offer every shipped language in the language settings ([#2006](https://github.com/Miragon/bpmn-modeler/issues/2006)) ([bf9de92](https://github.com/Miragon/bpmn-modeler/commit/bf9de9200c062a70c666d9acc603ca1861fcebc0))
* **inline-scripting:** close script tabs whose task changed while hidden ([#1737](https://github.com/Miragon/bpmn-modeler/issues/1737)) [sync 81f43e4] ([362b9fe](https://github.com/Miragon/bpmn-modeler/commit/362b9fe1bde7bec58d2f04a9f92ee4188efa32c4))
* **inline-scripting:** skip script writes to morphed script tasks ([#1703](https://github.com/Miragon/bpmn-modeler/issues/1703)) [sync 781a2f6] ([8c9633e](https://github.com/Miragon/bpmn-modeler/commit/8c9633ee9913541e7c44f383f36257f7fde17296))
* **intellij-plugin:** dispose a tab closed during a respawn re-register ([#1921](https://github.com/Miragon/bpmn-modeler/issues/1921)) ([5e2d5a8](https://github.com/Miragon/bpmn-modeler/commit/5e2d5a828f427751588c3630592718f9c5ba9a5b))
* **intellij-plugin:** flush pending webview edits before IntelliJ saves ([#1928](https://github.com/Miragon/bpmn-modeler/issues/1928)) ([966f0a0](https://github.com/Miragon/bpmn-modeler/commit/966f0a058e695bd90b3743d642adc496e79236f9))
* **intellij-plugin:** harden bridge I/O, settings apply and log labels ([#2113](https://github.com/Miragon/bpmn-modeler/issues/2113)) ([d2dbb9a](https://github.com/Miragon/bpmn-modeler/commit/d2dbb9a903544a2c4c1b7f4324fc3de1bd94aa65))
* **intellij-plugin:** keep unsynced page edits across a bridge respawn ([#1899](https://github.com/Miragon/bpmn-modeler/issues/1899)) ([5459e21](https://github.com/Miragon/bpmn-modeler/commit/5459e215f12ee0bb11e8d726761c62ae93fa573e))
* **intellij-plugin:** reply to every core request handled on the EDT, even when the handler throws ([#1860](https://github.com/Miragon/bpmn-modeler/issues/1860)) ([246fe90](https://github.com/Miragon/bpmn-modeler/commit/246fe90c6961d4671d91ea54072487c189f22b74))
* **intellij-plugin:** restore focus, sessions and lint choice on respawn ([#2069](https://github.com/Miragon/bpmn-modeler/issues/2069)) ([18e7582](https://github.com/Miragon/bpmn-modeler/commit/18e75827a56b414a8868956ea7b39ada4688dd3d))
* **intellij-plugin:** say how many more items a destructive confirmation removes ([#1850](https://github.com/Miragon/bpmn-modeler/issues/1850)) ([52480bc](https://github.com/Miragon/bpmn-modeler/commit/52480bcee57decee35141f7b1e38f6f5dcb0c643))
* **intellij-plugin:** show the bridge's lint state after a respawn ([#1872](https://github.com/Miragon/bpmn-modeler/issues/1872)) ([98d1d57](https://github.com/Miragon/bpmn-modeler/commit/98d1d57d9859fe2c708be84955d2ccbe2aee3a82))
* **modeler-bridge:** focus the canvas of the active IntelliJ editor ([#1848](https://github.com/Miragon/bpmn-modeler/issues/1848)) [sync 3246fca] ([4979ab8](https://github.com/Miragon/bpmn-modeler/commit/4979ab87bee51a577ca0a07532e1d4ea05feab5f))
* **modeler-bridge:** hold the workspace adapters to one contract suite ([#1903](https://github.com/Miragon/bpmn-modeler/issues/1903)) [sync 09e7da6] ([631d4ed](https://github.com/Miragon/bpmn-modeler/commit/631d4ed2b1aadf3a8538bd6bb4586f023ed7d15e))
* **modeler-bridge:** honour the lint off-button when the host runs the linter ([#1859](https://github.com/Miragon/bpmn-modeler/issues/1859)) [sync 8bdf632] ([4e0b774](https://github.com/Miragon/bpmn-modeler/commit/4e0b774dde4f90a1b075c9d8a7262f7a7b7365c4))
* **modeler-bridge:** keep the stack when logging an error to idea.log ([#1849](https://github.com/Miragon/bpmn-modeler/issues/1849)) [sync 89b8227] ([b58d861](https://github.com/Miragon/bpmn-modeler/commit/b58d861856287759934eb20b0608aa866c9eb572))
* **modeler-bridge:** keep UNC roots in findFiles and watcher paths ([#1875](https://github.com/Miragon/bpmn-modeler/issues/1875)) [sync 3c1de14] ([a09e7fb](https://github.com/Miragon/bpmn-modeler/commit/a09e7fb7f4b87f01da85b65f897e5bcfdcf8cf55))
* **modeler-bridge:** keep UNC roots in inline-script file paths ([#1900](https://github.com/Miragon/bpmn-modeler/issues/1900)) [sync 4bca19c] ([11f4b0e](https://github.com/Miragon/bpmn-modeler/commit/11f4b0e0e98983ccb38cf2397cfeccb18d6812be))
* **modeler-bridge:** log handler error stacks and show thrown strings ([#1993](https://github.com/Miragon/bpmn-modeler/issues/1993)) ([46cd894](https://github.com/Miragon/bpmn-modeler/commit/46cd894aaaac4f1791d9b8fe5fade82414fb21d4))
* **modeler-bridge:** report a marketplace whose registration could not be saved ([#1795](https://github.com/Miragon/bpmn-modeler/issues/1795)) [sync b58be8e] ([14078de](https://github.com/Miragon/bpmn-modeler/commit/14078de9a85c1daa66b598cb03bb2a060cc3314c))
* **modeler-bridge:** report watcher paths with forward slashes on Windows ([#1853](https://github.com/Miragon/bpmn-modeler/issues/1853)) [sync c45cfa0] ([45e6cd4](https://github.com/Miragon/bpmn-modeler/commit/45e6cd410103d89838b460ff055d6ab1055ee04d))
* **modeler-bridge:** time out lost replies, mirror only accepted writes ([#2062](https://github.com/Miragon/bpmn-modeler/issues/2062)) [sync 9307a68] ([3cb03d2](https://github.com/Miragon/bpmn-modeler/commit/3cb03d2e56c08663f6f7411d7605a11f619771a4))
* **modeler-core:** correct engine detection and intellij document sync ([#2109](https://github.com/Miragon/bpmn-modeler/issues/2109)) [sync 39e3282] ([1e0d0de](https://github.com/Miragon/bpmn-modeler/commit/1e0d0def6d237a5c293af4faa4dbde1c5b79487f))
* **modeler-core:** count failed script writes in Generate Script Files ([#1968](https://github.com/Miragon/bpmn-modeler/issues/1968)) [sync df96549] ([c0a40ab](https://github.com/Miragon/bpmn-modeler/commit/c0a40ab4f801b4d2e95f6b283e50041f58859112))
* **modeler-core:** dismiss cancelled prompts in deployment commands ([#2002](https://github.com/Miragon/bpmn-modeler/issues/2002)) [sync dad58ab] ([ca8ae7e](https://github.com/Miragon/bpmn-modeler/commit/ca8ae7e68dc68b614c882b08fc978469a7a95a4e))
* **modeler-core:** drop host lint runs that finish after their session moved on ([#1944](https://github.com/Miragon/bpmn-modeler/issues/1944)) [sync fe469e1] ([4ed3982](https://github.com/Miragon/bpmn-modeler/commit/4ed3982dab0761c674915452206ebf114fd0d0fb))
* **modeler-core:** drop lint work for an editor that closed mid-discovery ([#2003](https://github.com/Miragon/bpmn-modeler/issues/2003)) [sync 74ffdb3] ([932f8de](https://github.com/Miragon/bpmn-modeler/commit/932f8ded30c367df5f94e470734bed23388a2ccb))
* **modeler-core:** drop marketplace templates a refresh no longer serves ([#1844](https://github.com/Miragon/bpmn-modeler/issues/1844)) [sync dec6866] ([2f87a09](https://github.com/Miragon/bpmn-modeler/commit/2f87a090d7e3b119bb74a75491bbb016ff64321f))
* **modeler-core:** find .bpmnlintrc in drive-root workspaces with one ancestor walk ([#1839](https://github.com/Miragon/bpmn-modeler/issues/1839)) [sync 55c9104] ([f050957](https://github.com/Miragon/bpmn-modeler/commit/f0509579791b06df989614a506dc04d4121d9eae))
* **modeler-core:** flush and save before the sidebar deploys a diagram ([#1886](https://github.com/Miragon/bpmn-modeler/issues/1886)) [sync 17adc2d] ([98dc707](https://github.com/Miragon/bpmn-modeler/commit/98dc707d4e67950fd5cea74fe465b0fae5dfa62c))
* **modeler-core:** flush the webview's pending edits before Deploy Diagram saves ([#1861](https://github.com/Miragon/bpmn-modeler/issues/1861)) [sync 06903a4] ([dd6dabb](https://github.com/Miragon/bpmn-modeler/commit/dd6dabb351338b272f9fed7c5c91ec98c52c49de))
* **modeler-core:** follow whole-folder events and keep links and caches ([#2067](https://github.com/Miragon/bpmn-modeler/issues/2067)) ([7a1dd74](https://github.com/Miragon/bpmn-modeler/commit/7a1dd744733cd87d6ceeef2ec6be71cfd97f02f4))
* **modeler-core:** generate webview csp nonces from a csprng ([#1750](https://github.com/Miragon/bpmn-modeler/issues/1750)) [sync 387900b] ([97cc04d](https://github.com/Miragon/bpmn-modeler/commit/97cc04d78a128a277e754cc3b048170fb043f988))
* **modeler-core:** hand a blurred command target to the focused diagram ([#1957](https://github.com/Miragon/bpmn-modeler/issues/1957)) [sync 7154a00] ([c467e39](https://github.com/Miragon/bpmn-modeler/commit/c467e39c2089d3756ce0b817320491ee1712a159))
* **modeler-core:** keep commands on the focused diagram ([#1938](https://github.com/Miragon/bpmn-modeler/issues/1938)) [sync 66bbace] ([5175552](https://github.com/Miragon/bpmn-modeler/commit/51755522c4d8812ca842cddeec7d7be32b8e1d12))
* **modeler-core:** keep lint, template and marketplace state consistent ([#2111](https://github.com/Miragon/bpmn-modeler/issues/2111)) [sync 30f39b9] ([0e5feba](https://github.com/Miragon/bpmn-modeler/commit/0e5febaa692d108e71505162635b7827e040f2eb))
* **modeler-core:** keep the focused editor's engine and lint status when another BPMN editor blurs or closes ([#1855](https://github.com/Miragon/bpmn-modeler/issues/1855)) [sync 4140060] ([2bbbd18](https://github.com/Miragon/bpmn-modeler/commit/2bbbd188531950706b49fdf093a245b4184d1b66))
* **modeler-core:** match a camunda:class file on a path-segment boundary in navigation as the code-link map does ([#1840](https://github.com/Miragon/bpmn-modeler/issues/1840)) [sync 73519ba] ([862426a](https://github.com/Miragon/bpmn-modeler/commit/862426a338c1dd894dfe85c9fc0e8136ef7e84ab))
* **modeler-core:** migrate open diagrams from their editor content instead of disk ([#1856](https://github.com/Miragon/bpmn-modeler/issues/1856)) [sync ffd110a] ([b5e3487](https://github.com/Miragon/bpmn-modeler/commit/b5e3487a32584fc27e5f921cf5d20f832842456e))
* **modeler-core:** never drop a picked engine version silently ([#1901](https://github.com/Miragon/bpmn-modeler/issues/1901)) [sync d2bce4c] ([3226dfc](https://github.com/Miragon/bpmn-modeler/commit/3226dfcc35f0619ef55c6552fede04fee00204aa))
* **modeler-core:** normalise settings once for every host ([#1941](https://github.com/Miragon/bpmn-modeler/issues/1941)) ([c3811a0](https://github.com/Miragon/bpmn-modeler/commit/c3811a0b0901f712baecc2fd73e8abd24c147096))
* **modeler-core:** re-resolve the definition-search and form-status scope when workspace folders change ([#1843](https://github.com/Miragon/bpmn-modeler/issues/1843)) [sync f5236fd] ([38ab290](https://github.com/Miragon/bpmn-modeler/commit/38ab290c7982045a5a45ab2940dd427e693eaa2f))
* **modeler-core:** read the executable process id under any bpmn prefix ([#1949](https://github.com/Miragon/bpmn-modeler/issues/1949)) [sync db53e2e] ([52b0e3f](https://github.com/Miragon/bpmn-modeler/commit/52b0e3ff93e954fa59447237cc37a82d7b41cf6f))
* **modeler-core:** repair deployment delete, cancel, menu and state saves ([#2110](https://github.com/Miragon/bpmn-modeler/issues/2110)) ([8925099](https://github.com/Miragon/bpmn-modeler/commit/89250994d35621cf7eb66414ad03265c7667db74))
* **modeler-core:** report an engine-accepted deploy as deployed when saving its credentials or ledger row fails ([#1854](https://github.com/Miragon/bpmn-modeler/issues/1854)) ([d9cb259](https://github.com/Miragon/bpmn-modeler/commit/d9cb259e2b0d73bff82785041e9e379282d4fde7))
* **modeler-core:** share one script file store between both hosts ([#2010](https://github.com/Miragon/bpmn-modeler/issues/2010)) [sync d1efc1b] ([e60c653](https://github.com/Miragon/bpmn-modeler/commit/e60c653132078ff3ca33966131c8c1368b0b4a23))
* **modeler-core:** show status items only for the focused editor ([#1895](https://github.com/Miragon/bpmn-modeler/issues/1895)) [sync 2da9ab8] ([9d7e0af](https://github.com/Miragon/bpmn-modeler/commit/9d7e0af88df9dc1f824fd84fc0e9845e7588331e))
* **modeler-core:** skip a diagram migrate all cannot read or rewrite ([#2004](https://github.com/Miragon/bpmn-modeler/issues/2004)) [sync 81284d1] ([66fcde5](https://github.com/Miragon/bpmn-modeler/commit/66fcde502f624ac790116aabefd525d12501e9d6))
* **modeler-core:** skip host script write-back to morphed script tasks ([#1726](https://github.com/Miragon/bpmn-modeler/issues/1726)) [sync 3c36f22] ([0d16462](https://github.com/Miragon/bpmn-modeler/commit/0d1646261baf94256095ee47f72379060016fcd8))
* **modeler-core:** skip the same folders in every workspace listing ([#2112](https://github.com/Miragon/bpmn-modeler/issues/2112)) [sync efd4dad] ([88e7024](https://github.com/Miragon/bpmn-modeler/commit/88e7024b5f906eb5fc748a69f3b1d02b60a0d5fa))
* **modeler-core:** stop a deploy when the save before it fails ([#1935](https://github.com/Miragon/bpmn-modeler/issues/1935)) ([de51658](https://github.com/Miragon/bpmn-modeler/commit/de516583ab0758b38d1a2f4176474fbfccfde08c))
* **modeler-core:** stop migration from stamping duplicate execution-platform attributes ([#1862](https://github.com/Miragon/bpmn-modeler/issues/1862)) [sync 18c157a] ([6aab597](https://github.com/Miragon/bpmn-modeler/commit/6aab5979a4576ee7190b6239f273a68c480931c6))
* **modeler-core:** warn when an added marketplace fetched nothing ([#1948](https://github.com/Miragon/bpmn-modeler/issues/1948)) ([a652ae5](https://github.com/Miragon/bpmn-modeler/commit/a652ae5058a0e5aa6b814d987f3328d264b51766))
* **modeler-core:** watch element templates when the config folder setting is empty ([#1865](https://github.com/Miragon/bpmn-modeler/issues/1865)) [sync 9593933] ([e2fb0e5](https://github.com/Miragon/bpmn-modeler/commit/e2fb0e5237987f2edab77bb034abbe6ac1fcfb45))
* **modeler-types:** flush pending edits before a save or a mode switch ([#2114](https://github.com/Miragon/bpmn-modeler/issues/2114)) [sync a7eb551] ([27eb7ff](https://github.com/Miragon/bpmn-modeler/commit/27eb7ffd6cc3de71442754d197e0469e52cc4714))
* **modeler-types:** scan xml comments and cdata in document order ([#1970](https://github.com/Miragon/bpmn-modeler/issues/1970)) [sync 249398c] ([7d61046](https://github.com/Miragon/bpmn-modeler/commit/7d610469dd8abdf246f37f26ca9643a180dd385e))
* **shared:** hold a quickly narrowed properties panel at its minimum width ([#1698](https://github.com/Miragon/bpmn-modeler/issues/1698)) [sync f92e122] ([74417fa](https://github.com/Miragon/bpmn-modeler/commit/74417fac1d705768bac5a2fce16e30ca200f8e23))
* **shared:** keep properties-panel groups collapsed after a rebuild ([#1728](https://github.com/Miragon/bpmn-modeler/issues/1728)) [sync 08610dc] ([59ff23e](https://github.com/Miragon/bpmn-modeler/commit/59ff23eff098235154ff150d97944488f2698fde))
* **vscode-plugin:** keep credential pairs whole and UNC servers in paths ([#2066](https://github.com/Miragon/bpmn-modeler/issues/2066)) [sync f531682] ([1ae272d](https://github.com/Miragon/bpmn-modeler/commit/1ae272d83faee3d37f5871228f8ce47a0fc3b9c1))
* **webviews:** add a content security policy to the bpmn and dmn webviews ([#1798](https://github.com/Miragon/bpmn-modeler/issues/1798)) ([4d58fab](https://github.com/Miragon/bpmn-modeler/commit/4d58fabdb0e671c9759c78b93fed200de28a4d47))
* **webviews:** keep a properties-panel toggle made while the editor opens ([#1851](https://github.com/Miragon/bpmn-modeler/issues/1851)) [sync 766f0de] ([19f0e1d](https://github.com/Miragon/bpmn-modeler/commit/19f0e1da0734707cb442f33cf67840fde8074c06))
* **webviews:** pin the boot restore invariants and paint early diff highlights ([#1792](https://github.com/Miragon/bpmn-modeler/issues/1792)) [sync 2f3bd53] ([da11f71](https://github.com/Miragon/bpmn-modeler/commit/da11f719187043a73501319d3ca48663731c63d2))


### 🔨 Refactoring

* **modeler-bridge:** send status slots to IntelliJ ([#1995](https://github.com/Miragon/bpmn-modeler/issues/1995)) ([4169151](https://github.com/Miragon/bpmn-modeler/commit/41691519383cf650774e86f63002b91a37523589))
* **modeler-core:** build the token prompt in the core ([#2046](https://github.com/Miragon/bpmn-modeler/issues/2046)) ([6b0a2e8](https://github.com/Miragon/bpmn-modeler/commit/6b0a2e8c1b7822ba8b8d16f3d1593a7784589e97))
* **modeler-core:** delete unused disposeEngineVersionStatus ([#1893](https://github.com/Miragon/bpmn-modeler/issues/1893)) ([07c965c](https://github.com/Miragon/bpmn-modeler/commit/07c965c54100eb110c5a898b31c74bb7e281eb39))
* **modeler-core:** drop the feature-shaped picker methods ([#2041](https://github.com/Miragon/bpmn-modeler/issues/2041)) ([6de5c36](https://github.com/Miragon/bpmn-modeler/commit/6de5c36ad45def4b6f25f019d9674d97304aa0b7))
* **modeler-core:** drop the widget-shaped status methods ([#2039](https://github.com/Miragon/bpmn-modeler/issues/2039)) ([5aa51d0](https://github.com/Miragon/bpmn-modeler/commit/5aa51d0898d1acdaf7a02ef967d32afb1649cf54))
* **modeler-core:** load and save deployment state as one snapshot ([#2029](https://github.com/Miragon/bpmn-modeler/issues/2029)) ([fc2b3fa](https://github.com/Miragon/bpmn-modeler/commit/fc2b3fa662373bfaa53ce95db779f3d9f26f8207))
* **modeler-core:** remove the script-variable manifest and its declare-variable quick fix ([#1858](https://github.com/Miragon/bpmn-modeler/issues/1858)) ([989637b](https://github.com/Miragon/bpmn-modeler/commit/989637b4a763204699efd1c6dcb5cb22858c1d1c))
* **modeler-core:** show the bpmnlint status through its status slot ([#2001](https://github.com/Miragon/bpmn-modeler/issues/2001)) ([a891b94](https://github.com/Miragon/bpmn-modeler/commit/a891b943b572e5e55a7ec54a87ba0f9a9322e29d))
* **shared:** check host channels strictly and fix stale docs ([#1994](https://github.com/Miragon/bpmn-modeler/issues/1994)) ([040af7b](https://github.com/Miragon/bpmn-modeler/commit/040af7b0fa5ff09f0c3c2e8c611ffaf495f985be))


### 📔 Documentation

* **modeler-core:** fix references after the kernel and editorSession split ([#1933](https://github.com/Miragon/bpmn-modeler/issues/1933)) ([8c809e9](https://github.com/Miragon/bpmn-modeler/commit/8c809e93bdf98b85b3c3f22007c9e0e1d92ab0c6))


### 🛠️ Misc

* **ci:** show coverage in the job summary and drop codecov ([#2097](https://github.com/Miragon/bpmn-modeler/issues/2097)) ([fb89b28](https://github.com/Miragon/bpmn-modeler/commit/fb89b28ea2cd10b3e83c1e8146b5c9d8c3e237a1))
* **deps:** bump gradle-wrapper from 9.8.1 to 9.8.2 in /apps/intellij-plugin in the gradle-minor-patch group ([#1925](https://github.com/Miragon/bpmn-modeler/issues/1925)) ([93fbab7](https://github.com/Miragon/bpmn-modeler/commit/93fbab7df32e22c3a471043daac62b9ce3b1fc71))
* **intellij-plugin:** compile the shipped plugin at kotlin api 2.1 ([#1873](https://github.com/Miragon/bpmn-modeler/issues/1873)) ([d1d4236](https://github.com/Miragon/bpmn-modeler/commit/d1d42363ea2ecca472e86ca238e4d2035105bd38))
* **intellij-plugin:** enforce a jacoco coverage floor ([#1797](https://github.com/Miragon/bpmn-modeler/issues/1797)) ([c4be3d4](https://github.com/Miragon/bpmn-modeler/commit/c4be3d4f5f6b68e99044657ead10947abe6647fa))
* **intellij-plugin:** pin one kotlin handler per core-to-host method ([#1898](https://github.com/Miragon/bpmn-modeler/issues/1898)) ([e2917de](https://github.com/Miragon/bpmn-modeler/commit/e2917de694be445d984003370bd08955fe3f761f))
* **intellij-plugin:** stop the random 'parent project disposed' failures in the unit tests ([#1863](https://github.com/Miragon/bpmn-modeler/issues/1863)) ([539e8ff](https://github.com/Miragon/bpmn-modeler/commit/539e8ff152660ada63481a4ee484d938da64fc32))

## [1.11.0](https://github.com/Miragon/bpmn-modeler/compare/intellij-v1.10.2...intellij-v1.11.0) (2026-10-16)


### 🎉 New Features

* **bpmn-modeler:** replace the mode strip with a compact mode menu ([#1628](https://github.com/Miragon/bpmn-modeler/issues/1628)) [sync b0a66ca] ([aa2c372](https://github.com/Miragon/bpmn-modeler/commit/aa2c372235d66265aef8d60ef690c556d46f7d7a))
* **bpmn-webview:** search definitions of other models ([#1649](https://github.com/Miragon/bpmn-modeler/issues/1649)) [sync 1c48e83] ([f711e32](https://github.com/Miragon/bpmn-modeler/commit/f711e322353e87a383d3627b1b183066b3850fe1))
* replace the komet icons with the bpmn and dmn modeler icons ([#1630](https://github.com/Miragon/bpmn-modeler/issues/1630)) ([4aa0fb2](https://github.com/Miragon/bpmn-modeler/commit/4aa0fb2f7b47d3693755a76f09b28277daf266cd))


### 🐞 Bug Fixes

* **bpmn-modeler:** bump bpmn-js-bpmnlint to 0.25.0 for diagram-js theme tokens ([#1656](https://github.com/Miragon/bpmn-modeler/issues/1656)) [sync f93e3ba] ([f417014](https://github.com/Miragon/bpmn-modeler/commit/f4170147e554110ecbe35affa200685d5f897bf9))
* **bpmn-modeler:** bump bpmnlint to 11.15.0 and drop the core rule patch ([#1640](https://github.com/Miragon/bpmn-modeler/issues/1640)) [sync 680fae4] ([18bc4f1](https://github.com/Miragon/bpmn-modeler/commit/18bc4f1134262ed097bfe6fcd9bc428ab70cde97))
* **bpmn-modeler:** fix quadratic bpmnlint overlap and bpmndi rules ([#1609](https://github.com/Miragon/bpmn-modeler/issues/1609)) [sync 0966e35] ([15f5ccd](https://github.com/Miragon/bpmn-modeler/commit/15f5ccdcbfa07a3e445dfc9c32aa8e75599486d5))
* **bpmn-modeler:** stop duplicating and rebuilding transaction boundaries ([#1620](https://github.com/Miragon/bpmn-modeler/issues/1620)) [sync 9c9ea61] ([e5b29be](https://github.com/Miragon/bpmn-modeler/commit/e5b29be2ddfb14ae7bb09f3d270635f749d0550a))
* **bpmn-modeler:** stop redundant lint runs and overlay rebuilds ([#1606](https://github.com/Miragon/bpmn-modeler/issues/1606)) [sync a506d75] ([33aa226](https://github.com/Miragon/bpmn-modeler/commit/33aa226070d4d756fa5691b33f61df6d88167f7e))
* **bpmn-webview:** apply the configured locale before the first import ([#1617](https://github.com/Miragon/bpmn-modeler/issues/1617)) [sync 63d01ce] ([df3d535](https://github.com/Miragon/bpmn-modeler/commit/df3d5357f21facb22528218e94b7b7438b11ecb8))
* **bpmn-webview:** focus the canvas when an editor tab becomes active ([#1659](https://github.com/Miragon/bpmn-modeler/issues/1659)) [sync 7aac2ff] ([da916b3](https://github.com/Miragon/bpmn-modeler/commit/da916b3f201dd6fe7a747b80a3778fdc64e7b93d))
* **deps:** dedupe bpmn-js, diagram-js and bpmn-moddle in the lockfile ([#1618](https://github.com/Miragon/bpmn-modeler/issues/1618)) [sync d7bc492] ([d411af5](https://github.com/Miragon/bpmn-modeler/commit/d411af568dbff7634c766768cf17b3ba67925af6))
* **intellij-plugin:** cut XML transport cost between JCEF, JVM and bridge ([#1651](https://github.com/Miragon/bpmn-modeler/issues/1651)) ([d931f7e](https://github.com/Miragon/bpmn-modeler/commit/d931f7e4f8bed45719c9bd4ce8084d3731caf2e9))
* **modeler-core:** shorten the host open path and per-edit host work ([#1645](https://github.com/Miragon/bpmn-modeler/issues/1645)) [sync 575fc55] ([543558b](https://github.com/Miragon/bpmn-modeler/commit/543558b46961a90a579d6b47bb7935530f24d567))


### 🔨 Refactoring

* **bpmn-webview:** split the single webview bundle into lazy chunks ([#1638](https://github.com/Miragon/bpmn-modeler/issues/1638)) ([22f9707](https://github.com/Miragon/bpmn-modeler/commit/22f97073ee0b1685a725240e10b6380b7d52bee8))


### 🛠️ Misc

* **deps:** bump gradle-wrapper from 9.7.1 to 9.8.0 in /apps/intellij-plugin in the gradle-minor-patch group ([#1616](https://github.com/Miragon/bpmn-modeler/issues/1616)) ([246ff04](https://github.com/Miragon/bpmn-modeler/commit/246ff04c1a1de03107e1f892e847da4f61e86edc))
* **deps:** bump the gradle-minor-patch group in /apps/intellij-plugin with 2 updates ([#1641](https://github.com/Miragon/bpmn-modeler/issues/1641)) ([1e647ac](https://github.com/Miragon/bpmn-modeler/commit/1e647ac0e6757ff9964af30a8f7c851c95c9da9c))

## [1.10.2](https://github.com/Miragon/bpmn-modeler/compare/intellij-v1.10.1...intellij-v1.10.2) (2026-09-28)


### 🐞 Bug Fixes

* **bpmn-modeler:** hide lint toolbar during token simulation ([#1601](https://github.com/Miragon/bpmn-modeler/issues/1601)) [sync c6bc75f] ([f2daef3](https://github.com/Miragon/bpmn-modeler/commit/f2daef3a9ba0f667ce58bc62f6c6d75fb4179e34))
* **bpmn-modeler:** keep lint issue list above neighbouring icons ([#1602](https://github.com/Miragon/bpmn-modeler/issues/1602)) [sync c269238] ([59f84d4](https://github.com/Miragon/bpmn-modeler/commit/59f84d4250b193619700ca65ae76ec44c7e2b71d))
* **modeler-bridge:** stop file watchers from freezing the bridge on large repos ([#1588](https://github.com/Miragon/bpmn-modeler/issues/1588)) [sync 328775a] ([073f014](https://github.com/Miragon/bpmn-modeler/commit/073f014452f759b9f71e34cb9a54d99dd063dc03))

## [1.10.1](https://github.com/Miragon/bpmn-modeler/compare/intellij-v1.10.0...intellij-v1.10.1) (2026-09-23)


### 🐞 Bug Fixes

* **dark-mode:** change color in property panel ([#1584](https://github.com/Miragon/bpmn-modeler/issues/1584)) [sync d9bda28] ([6ba2dfe](https://github.com/Miragon/bpmn-modeler/commit/6ba2dfe1dd4ea59bbf015cbe96dbaf503b370481))
* **intellij-plugin:** restore cmd+c/x/v in properties-panel text inputs ([#1585](https://github.com/Miragon/bpmn-modeler/issues/1585)) ([4340e6b](https://github.com/Miragon/bpmn-modeler/commit/4340e6bc34ea222a758b6aacf49616dffe0a1605))


### 🛠️ Misc

* **deps:** bump org.jetbrains.intellij.platform from 2.18.1 to 2.19.0 in /apps/intellij-plugin in the gradle-minor-patch group across 1 directory ([#1577](https://github.com/Miragon/bpmn-modeler/issues/1577)) ([a23769a](https://github.com/Miragon/bpmn-modeler/commit/a23769a7abe5774604af39584c35305e794eb44d))

## [1.10.0](https://github.com/Miragon/bpmn-modeler/compare/intellij-v1.9.0...intellij-v1.10.0) (2026-09-21)


### 🎉 New Features

* **bpmn-modeler:** fit a sub-process to the viewport on first drilldown ([#1425](https://github.com/Miragon/bpmn-modeler/issues/1425)) [sync 72efe5b] ([fec20ca](https://github.com/Miragon/bpmn-modeler/commit/fec20ca127621548d37dac32f9f537756e4c2923))
* **deployment:** add named deployment targets and endpoint overrides ([#1552](https://github.com/Miragon/bpmn-modeler/issues/1552)) ([77f36e5](https://github.com/Miragon/bpmn-modeler/commit/77f36e5ebfcb7c9e73f9341ff9fce50cc51eee2b))
* **deployment:** create target from entered form data via New ([#1562](https://github.com/Miragon/bpmn-modeler/issues/1562)) [sync 91f6167] ([dd1f42c](https://github.com/Miragon/bpmn-modeler/commit/dd1f42cfd8526ebf6428775695bfcc8137e173c3))


### 🐞 Bug Fixes

* **bpmn-modeler:** translate append menu and element template chooser ([#1547](https://github.com/Miragon/bpmn-modeler/issues/1547)) [sync 63b0493] ([95865ca](https://github.com/Miragon/bpmn-modeler/commit/95865ca280c149adec5ad31972e1a86b0852e7db))
* **editor:** bump bpmnlint to 11.14.0 with bundled superfluous-label ([#1564](https://github.com/Miragon/bpmn-modeler/issues/1564)) [sync e121ad1] ([257135c](https://github.com/Miragon/bpmn-modeler/commit/257135c96563568d3989457d13c9d3e617aba060))


### 📔 Documentation

* **adr:** consolidate decisions into living topic records ([#1554](https://github.com/Miragon/bpmn-modeler/issues/1554)) ([583663d](https://github.com/Miragon/bpmn-modeler/commit/583663da6052b10c6bba16b297829d697ea18123))


### 🛠️ Misc

* **deps:** bump org.jetbrains.kotlin.jvm from 2.4.10 to 2.4.20 in /apps/intellij-plugin in the gradle-minor-patch group ([#1544](https://github.com/Miragon/bpmn-modeler/issues/1544)) ([1586a10](https://github.com/Miragon/bpmn-modeler/commit/1586a10fafecd99c81f448cb85718f6cbaee2bcb))

## [1.9.0](https://github.com/Miragon/bpmn-modeler/compare/intellij-v1.8.0...intellij-v1.9.0) (2026-09-14)


### 🎉 New Features

* **bpmn-modeler:** stamp execution platform on engine-bound newDiagram ([#1536](https://github.com/Miragon/bpmn-modeler/issues/1536)) [sync e742f59] ([7418949](https://github.com/Miragon/bpmn-modeler/commit/74189491726340cf1cf110e1b85c6ca1331b2a2b))


### 🐞 Bug Fixes

* **bpmn-modeler:** keep panel-host flex layout under the diagram shell ([#1541](https://github.com/Miragon/bpmn-modeler/issues/1541)) [sync 69391c5] ([b2cce93](https://github.com/Miragon/bpmn-modeler/commit/b2cce934ce8213b9708caea64ec1f7c7caf4facf))

## [1.8.0](https://github.com/Miragon/bpmn-modeler/compare/intellij-v1.7.1...intellij-v1.8.0) (2026-09-13)


### 🎉 New Features

* **bpmn-modeler:** add capabilities.modelNavigation on /design ([#1457](https://github.com/Miragon/bpmn-modeler/issues/1457)) [sync ca82ae1] ([47cb2a9](https://github.com/Miragon/bpmn-modeler/commit/47cb2a9b80fcdd21b678333ff1a6a65c34659f73))
* **bpmn-modeler:** add capabilities.modelNavigation on /viewer ([#1458](https://github.com/Miragon/bpmn-modeler/issues/1458)) [sync fe59e3c] ([9c7ddf4](https://github.com/Miragon/bpmn-modeler/commit/9c7ddf4f2d55bb851cf73f97c800fe4d573c4815))
* **bpmn-modeler:** add engine-neutral createDesigner() on /design subpath ([#1437](https://github.com/Miragon/bpmn-modeler/issues/1437)) [sync 7a43774] ([c144a7f](https://github.com/Miragon/bpmn-modeler/commit/c144a7f6bd0c14f0038bd86ee3d8275a4608d61b))
* **bpmn-modeler:** add engine-neutral properties-panel lib with mode filter ([#1451](https://github.com/Miragon/bpmn-modeler/issues/1451)) [sync 860badb] ([cca21d7](https://github.com/Miragon/bpmn-modeler/commit/cca21d7369134fe5f56339272528176d77680b1c))
* **bpmn-modeler:** add opt-in readonly properties panel on /viewer ([#1455](https://github.com/Miragon/bpmn-modeler/issues/1455)) [sync fc045c0] ([13ffbcc](https://github.com/Miragon/bpmn-modeler/commit/13ffbcca9be16b9b5552b9e90c4367feaa5c2e1d))
* **bpmn-modeler:** add public view-state capture/restore on all handles ([#1450](https://github.com/Miragon/bpmn-modeler/issues/1450)) [sync fb1f042] ([f693325](https://github.com/Miragon/bpmn-modeler/commit/f6933253d83fb73e3bd925b9d1ff91885c18e911))
* **bpmn-modeler:** add readonly createViewer() on /viewer subpath ([#1433](https://github.com/Miragon/bpmn-modeler/issues/1433)) [sync 03d6c6b] ([f36fcda](https://github.com/Miragon/bpmn-modeler/commit/f36fcda5bc63bcb5673de6ed1f270ef90b9f8830))
* **bpmn-modeler:** add runtime design/implement mode on createModeler ([#1452](https://github.com/Miragon/bpmn-modeler/issues/1452)) [sync 786a045] ([f6e6d2c](https://github.com/Miragon/bpmn-modeler/commit/f6e6d2cfd39c24a7793ea0397375c9fef70e503b))
* **bpmn-modeler:** add view/design/implement session on /mode subpath ([#1469](https://github.com/Miragon/bpmn-modeler/issues/1469)) [sync ddc666f] ([6fa15c9](https://github.com/Miragon/bpmn-modeler/commit/6fa15c9b8d3fa5c953bebd48c166ae10aa8ce05e))
* **bpmn-modeler:** mode-invariant minimap, token simulation and focus reticle ([#1471](https://github.com/Miragon/bpmn-modeler/issues/1471)) [sync 6b20f9a] ([75ff878](https://github.com/Miragon/bpmn-modeler/commit/75ff87854ee292811b3099cfee4f9d069958b603))
* **bpmn-modeler:** opt-in linting on /design and per-mode lint configs ([#1472](https://github.com/Miragon/bpmn-modeler/issues/1472)) [sync 5141b8a] ([84fd907](https://github.com/Miragon/bpmn-modeler/commit/84fd9078b7ffd1ac7d22977f12fb18a3682f2391))
* **bpmn-modeler:** theme per instance via data-bpmn-theme attribute ([#1429](https://github.com/Miragon/bpmn-modeler/issues/1429)) ([35011ef](https://github.com/Miragon/bpmn-modeler/commit/35011ef81df19b5cdef29eef2835f6acbe1086ea))
* **bpmn-webview:** add linting tiers with lazy in-page bpmnlint ([#1385](https://github.com/Miragon/bpmn-modeler/issues/1385)) ([903d074](https://github.com/Miragon/bpmn-modeler/commit/903d074d6721f77bf6bd8be85b905bd8d19a69bf))
* **bpmn-webview:** add view/design/implement mode switch to the hosts ([#1468](https://github.com/Miragon/bpmn-modeler/issues/1468)) ([46a0d58](https://github.com/Miragon/bpmn-modeler/commit/46a0d58a7ade3a77da273b7a8356bd2f39a867ec))
* **demo-webapp:** consume @miragon/dmn-modeler on the dmn page ([#1483](https://github.com/Miragon/bpmn-modeler/issues/1483)) [sync b4c06a3] ([bd62532](https://github.com/Miragon/bpmn-modeler/commit/bd625322225168d4a7fad4e2c5318dfeaa803717))
* **dmn-modeler:** container-scoped theming via data-dmn-theme ([#1475](https://github.com/Miragon/bpmn-modeler/issues/1475)) [sync e2eb4b8] ([82f457b](https://github.com/Miragon/bpmn-modeler/commit/82f457b7c8dbbfdf3b5d614c9678080c2d2db7f5))
* **dmn-modeler:** translate the dmn-js ui ([#1480](https://github.com/Miragon/bpmn-modeler/issues/1480)) [sync 4cf70dd] ([4c22b32](https://github.com/Miragon/bpmn-modeler/commit/4c22b32423b2ac437b65cf8e2f560cbedaa7eba3))
* **form-editor:** display form input and output values ([#1432](https://github.com/Miragon/bpmn-modeler/issues/1432)) [sync 92a1cb6] ([d4d540a](https://github.com/Miragon/bpmn-modeler/commit/d4d540a327a3a07f44d7c455150084df55dc70ce))
* form-io editor ([#1363](https://github.com/Miragon/bpmn-modeler/issues/1363)) ([9c079e0](https://github.com/Miragon/bpmn-modeler/commit/9c079e0d980aa94b93d907083db5d92a06c3f822))
* format diagram ([#1482](https://github.com/Miragon/bpmn-modeler/issues/1482)) ([e724883](https://github.com/Miragon/bpmn-modeler/commit/e724883f10d2758fdf7f74415bcbdec7fa59c335))
* **properties-panel:** vendor upstream element-type header icons ([#1512](https://github.com/Miragon/bpmn-modeler/issues/1512)) [sync 9e33736] ([1914104](https://github.com/Miragon/bpmn-modeler/commit/191410473953948cf715d3537a3b27e88b372c80))


### 🐞 Bug Fixes

* **append-menu:** honor the bpmn type chosen for a multi-type template ([#1517](https://github.com/Miragon/bpmn-modeler/issues/1517)) [sync 9e63dff] ([86bf226](https://github.com/Miragon/bpmn-modeler/commit/86bf226554dbbb18bab0d600f5151f7c98430d0d))
* **bpmn-modeler:** destroy partially initialised surfaces when a factory fails ([#1522](https://github.com/Miragon/bpmn-modeler/issues/1522)) [sync 9ac9031] ([e0ddaf3](https://github.com/Miragon/bpmn-modeler/commit/e0ddaf355663a9ea4ecc5063acfe2196901dfec3))
* **bpmn-modeler:** keep restored viewport and clear empty selection ([#1518](https://github.com/Miragon/bpmn-modeler/issues/1518)) [sync fa5298c] ([4628843](https://github.com/Miragon/bpmn-modeler/commit/46288439b33fb94ee15c11962fcdda47c42be805))
* **bpmn-modeler:** make mode-session recreate transaction-safe ([#1515](https://github.com/Miragon/bpmn-modeler/issues/1515)) [sync 7c4a85d] ([6187228](https://github.com/Miragon/bpmn-modeler/commit/618722897daac1a6e16d6bc0fc36f7c529a7c23f))
* **bpmn-modeler:** make text clipboard polyfill per-instance and disposable ([#1513](https://github.com/Miragon/bpmn-modeler/issues/1513)) [sync 88d0a93] ([1f48285](https://github.com/Miragon/bpmn-modeler/commit/1f48285c4c343213a1f741a98a44dd555c51cabb))
* **bpmn-modeler:** open subprocess diagrams during diff navigation ([#1532](https://github.com/Miragon/bpmn-modeler/issues/1532)) [sync 1cf38a0] ([40b9806](https://github.com/Miragon/bpmn-modeler/commit/40b9806896653dfd5392799d091a3a1ccb24c5f6))
* **bpmn-modeler:** report failing debounced saves once via onError ([#1497](https://github.com/Miragon/bpmn-modeler/issues/1497)) ([#1528](https://github.com/Miragon/bpmn-modeler/issues/1528)) [sync 3b665ba] ([a75dad7](https://github.com/Miragon/bpmn-modeler/commit/a75dad78876284499e702bf767bc13e0b0831dbc))
* **bpmn-modeler:** reset host lint config on payload-free handback ([#1526](https://github.com/Miragon/bpmn-modeler/issues/1526)) [sync 36dae2f] ([8676667](https://github.com/Miragon/bpmn-modeler/commit/86766673bfe0489ac95703f33d8b067d45f963fd))
* **bpmn-modeler:** start backward diff navigation at the last change ([#1525](https://github.com/Miragon/bpmn-modeler/issues/1525)) [sync 87de742] ([20c17d1](https://github.com/Miragon/bpmn-modeler/commit/20c17d1a5e99057c874e6d2cf6f9789024e2720f))
* **bpmn-modeler:** stop debounced callbacks firing after destroy ([#1523](https://github.com/Miragon/bpmn-modeler/issues/1523)) [sync 9414cc9] ([52587fc](https://github.com/Miragon/bpmn-modeler/commit/52587fc1608c60dbccbf3f1dcae19b8e9e54207f))
* **bpmn-modeler:** support packed packages in nested installs ([#1508](https://github.com/Miragon/bpmn-modeler/issues/1508)) [sync bbefb36] ([a20df6f](https://github.com/Miragon/bpmn-modeler/commit/a20df6fd6f23bf41a7e0c97c3de257e8037b0e67))
* **diff:** detect execution property changes across engines ([#1510](https://github.com/Miragon/bpmn-modeler/issues/1510)) [sync 23bf6d9] ([39868c2](https://github.com/Miragon/bpmn-modeler/commit/39868c24c8d1aaffc625f7471122c0db17eefe31))
* **intellij:** sync bundled webview (04be5a5) ([88c9b77](https://github.com/Miragon/bpmn-modeler/commit/88c9b771298a10f393f285787770b2ea7b54ca4d))
* **intellij:** sync bundled webview (0753439) ([38755c4](https://github.com/Miragon/bpmn-modeler/commit/38755c49d3da94fa96320bd054fe6c7af4f896af))
* **intellij:** sync bundled webview (22ecded) ([542dd03](https://github.com/Miragon/bpmn-modeler/commit/542dd030fa4afe8c841d3d65b0949adb63bc72f3))
* **intellij:** sync bundled webview (2dd39d3) ([7c322d5](https://github.com/Miragon/bpmn-modeler/commit/7c322d59033e6dcd4c4f77ec25688ab8cf9972dd))
* **intellij:** sync bundled webview (473f813) ([b337947](https://github.com/Miragon/bpmn-modeler/commit/b33794748644ecd02beffd6466c41c3fcc9902fb))
* **intellij:** sync bundled webview (5536855) ([e67cf41](https://github.com/Miragon/bpmn-modeler/commit/e67cf4100dcc34d67a536c5117cc64cb3a0260cb))
* **intellij:** sync bundled webview (7ac7c81) ([cf351ce](https://github.com/Miragon/bpmn-modeler/commit/cf351cea07ce41d0d1b72f560e623c1739666bd9))
* **intellij:** sync bundled webview (d511d32) ([bbc2195](https://github.com/Miragon/bpmn-modeler/commit/bbc2195c1478fdc23833c1a04ce07c229357e8ea))
* **intellij:** sync bundled webview (d794d70) ([e0826f5](https://github.com/Miragon/bpmn-modeler/commit/e0826f51f0b7e5db4a6ecc70434cb25e7c3fd55c))
* **intellij:** sync bundled webview (e56dc7e) ([8307abd](https://github.com/Miragon/bpmn-modeler/commit/8307abd07d13e3456dd15a47c9961cba264104f3))
* **intellij:** sync bundled webview (e8f9c0e) ([5be1d56](https://github.com/Miragon/bpmn-modeler/commit/5be1d5656d67d153e3195c0ce538b81cd08533d3))
* **modeler-types:** detect engine from the definitions root attributes ([#1524](https://github.com/Miragon/bpmn-modeler/issues/1524)) [sync f67a332] ([2a379d3](https://github.com/Miragon/bpmn-modeler/commit/2a379d3e0ad6317b9969f7a40193cb76d8943938))
* sync bundled sources (8c8014e) ([44c2d33](https://github.com/Miragon/bpmn-modeler/commit/44c2d33724b72438edbc0660a93aa5606ee65d77))


### 📔 Documentation

* **bpmn-modeler:** clean up extraction-era comments ([#1400](https://github.com/Miragon/bpmn-modeler/issues/1400)) ([a8db080](https://github.com/Miragon/bpmn-modeler/commit/a8db0805c8744f522de9e9bb020dec0f6a39a5fb))
* form editor ([#1435](https://github.com/Miragon/bpmn-modeler/issues/1435)) ([e444009](https://github.com/Miragon/bpmn-modeler/commit/e4440092c7e3a1b2f242a47418abfae30bed2e2c))
* introduce ADR decision log under docs/adr ([#1386](https://github.com/Miragon/bpmn-modeler/issues/1386)) ([24e4065](https://github.com/Miragon/bpmn-modeler/commit/24e4065a5032597ada87bc170fae3ef9efe1ece3))


### 🛠️ Misc

* **deps:** bump gradle-wrapper from 9.7.0 to 9.7.1 in /apps/intellij-plugin in the gradle-minor-patch group across 1 directory ([#1365](https://github.com/Miragon/bpmn-modeler/issues/1365)) ([f6ddb9f](https://github.com/Miragon/bpmn-modeler/commit/f6ddb9f79cacf2c4a5a6c6de3ebb1f6a632e1d00))

## [1.7.1](https://github.com/Miragon/bpmn-modeler/compare/intellij-v1.7.0...intellij-v1.7.1) (2026-08-25)


### 🐞 Bug Fixes

* **intellij:** sync bundled webview (cebe5c6) ([fa5a5d3](https://github.com/Miragon/bpmn-modeler/commit/fa5a5d39714972959b4056b7015d182f59cd4900))

## [1.7.0](https://github.com/Miragon/bpmn-modeler/compare/intellij-v1.6.1...intellij-v1.7.0) (2026-08-19)


### 🎉 New Features

* **intellij:** offer raw XML text diff in the BPMN diff view ([#1282](https://github.com/Miragon/bpmn-modeler/issues/1282)) ([#1318](https://github.com/Miragon/bpmn-modeler/issues/1318)) ([25a640e](https://github.com/Miragon/bpmn-modeler/commit/25a640ea9027542b4833f213930601fa7d37f6d6))


### 🐞 Bug Fixes

* **bpmn-webview:** render diagrams when the canvas mounts at zero size ([#1338](https://github.com/Miragon/bpmn-modeler/issues/1338)) ([3642a8f](https://github.com/Miragon/bpmn-modeler/commit/3642a8fdfb7514e899fac7c2a2b8f7285f628ab1))
* **intellij:** sync bundled webview (1b35a62) ([7c00551](https://github.com/Miragon/bpmn-modeler/commit/7c0055104dd2054ab66a5ef2cd6cc7a480f31085))


### 🛠️ Misc

* **deps:** bump the gradle-minor-patch group across 1 directory with 2 updates ([#1313](https://github.com/Miragon/bpmn-modeler/issues/1313)) ([5fdebd1](https://github.com/Miragon/bpmn-modeler/commit/5fdebd117202964f16d7da4598e7f5e86d692262))

## [1.6.1](https://github.com/Miragon/bpmn-modeler/compare/intellij-v1.6.0...intellij-v1.6.1) (2026-07-21)


### 🐞 Bug Fixes

* **intellij:** sync bundled webview (8a81d8d) ([cda29c3](https://github.com/Miragon/bpmn-modeler/commit/cda29c333ddee153918a3cfb2b62dfe928f3a883))
* **intellij:** theme properties-panel input text for JCEF dark mode ([#1290](https://github.com/Miragon/bpmn-modeler/issues/1290)) ([7b41c85](https://github.com/Miragon/bpmn-modeler/commit/7b41c853bb844eacbc16f81ef3f17f2f44b632e0))


### 🛠️ Misc

* **deps:** bump the gradle-minor-patch group in /apps/intellij-plugin with 3 updates ([#1285](https://github.com/Miragon/bpmn-modeler/issues/1285)) ([35d97ce](https://github.com/Miragon/bpmn-modeler/commit/35d97ce8e2be301b72623bcc6f92294663d01afe))

## [1.6.0](https://github.com/Miragon/bpmn-modeler/compare/intellij-v1.5.0...intellij-v1.6.0) (2026-07-17)


### 🎉 New Features

* add Reload Modeler command and port modeler commands to IntelliJ ([#1271](https://github.com/Miragon/bpmn-modeler/issues/1271)) ([4a02932](https://github.com/Miragon/bpmn-modeler/commit/4a029329b13252698b9bbc246c03727bca85ff90))
* edit inline scripts in real files with a single-writer lock ([#1264](https://github.com/Miragon/bpmn-modeler/issues/1264)) ([970ef1f](https://github.com/Miragon/bpmn-modeler/commit/970ef1fd4f49bf49ae4167021e861d5e521c4ee7))
* **intellij:** modernize the .bpmn file icon in the project tree ([#1276](https://github.com/Miragon/bpmn-modeler/issues/1276)) ([7c98ddb](https://github.com/Miragon/bpmn-modeler/commit/7c98ddbc9a742c61021d44bf9d715ef5b0ba458d))


### 🐞 Bug Fixes

* **intellij:** sync bundled webview (0f60900) ([0090606](https://github.com/Miragon/bpmn-modeler/commit/00906065a107098b2c5b960f0c354d66f07c71f2))
* **intellij:** sync bundled webview (2a026af) ([12d2571](https://github.com/Miragon/bpmn-modeler/commit/12d2571f3d07a3f7ef16639d2844f88569edec76))
* **intellij:** sync bundled webview (3a6a290) ([adbb574](https://github.com/Miragon/bpmn-modeler/commit/adbb5743a04793f618d0d5dcd250035a31d677db))
* **intellij:** sync bundled webview (4df40fd) ([e98e498](https://github.com/Miragon/bpmn-modeler/commit/e98e4989c0156e8fb525cf3a0fa120fdb763bae6))
* **intellij:** sync bundled webview (a0df4a0) ([eba5d17](https://github.com/Miragon/bpmn-modeler/commit/eba5d17bffbb9a7fe11dd2b3f37d07612f4a2ca0))
* **intellij:** sync bundled webview (a8fee1f) ([120cf75](https://github.com/Miragon/bpmn-modeler/commit/120cf752534f87a6708abbf105942cf14e050d1c))
* **intellij:** sync bundled webview (b59dddc) ([9439c50](https://github.com/Miragon/bpmn-modeler/commit/9439c50ffe20827166a8e36b3dde2ddf7fbf33d2))
* **intellij:** sync bundled webview (edac76c) ([955322e](https://github.com/Miragon/bpmn-modeler/commit/955322e7b2c6998c89d30a762c5bbe743043f96b))


### 📔 Documentation

* **intellij-plugin:** render architecture diagram as mermaid ([#1265](https://github.com/Miragon/bpmn-modeler/issues/1265)) ([cf974e8](https://github.com/Miragon/bpmn-modeler/commit/cf974e8960592bb735f0d8b2dbed7b33242d1e3b))


### 🛠️ Misc

* **deps:** bump org.jetbrains.intellij.platform from 2.17.0 to 2.18.0 in /apps/intellij-plugin in the gradle-minor-patch group ([#1267](https://github.com/Miragon/bpmn-modeler/issues/1267)) ([486a079](https://github.com/Miragon/bpmn-modeler/commit/486a0799145feff71ffb96f4e49a5c2ae45e895b))

## [1.5.0](https://github.com/Miragon/bpmn-modeler/compare/intellij-v1.4.0...intellij-v1.5.0) (2026-07-08)


### 🎉 New Features

* **templates:** add element template marketplace for GitHub/GitLab repos ([#1184](https://github.com/Miragon/bpmn-modeler/issues/1184)) ([05e86b6](https://github.com/Miragon/bpmn-modeler/commit/05e86b65e26583b1d1d24110dd9c07664a128f19))

## [1.4.0](https://github.com/Miragon/bpmn-modeler/compare/intellij-v1.3.0...intellij-v1.4.0) (2026-07-08)


### 🎉 New Features

* **intellij-plugin:** show loading spinner while element templates load ([#1234](https://github.com/Miragon/bpmn-modeler/issues/1234)) ([c1044f3](https://github.com/Miragon/bpmn-modeler/commit/c1044f347d8c7c907c4186fe648f7fe3204a60dc))


### 🐞 Bug Fixes

* **intellij-plugin:** make Ctrl+Z/Ctrl+Y undo/redo work on the canvas ([#1236](https://github.com/Miragon/bpmn-modeler/issues/1236)) ([6bd15fb](https://github.com/Miragon/bpmn-modeler/commit/6bd15fbec223a97b1b1ca893f4cf699b7395f718))


### 📔 Documentation

* **intellij:** switch install guide to jetbrains marketplace ([#1215](https://github.com/Miragon/bpmn-modeler/issues/1215)) ([6104f0e](https://github.com/Miragon/bpmn-modeler/commit/6104f0e28aadb507e64e394fb72e4e13b82ebc7a))


### 🛠️ Misc

* **release:** rework release-please into independent per-host lines ([#1237](https://github.com/Miragon/bpmn-modeler/issues/1237)) ([98dcec2](https://github.com/Miragon/bpmn-modeler/commit/98dcec2261c61e2e85aac46141987f7e6af0f33f))
