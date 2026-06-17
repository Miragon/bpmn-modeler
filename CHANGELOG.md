# Changelog

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
