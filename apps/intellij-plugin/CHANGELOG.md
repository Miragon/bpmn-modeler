# Changelog

## [1.4.0](https://github.com/Miragon/bpmn-modeler/compare/intellij-v1.3.0...intellij-v1.4.0) (2026-07-08)


### 🎉 New Features

* **codeLink:** navigate from BPMN tasks to their source code ([#1075](https://github.com/Miragon/bpmn-modeler/issues/1075)) ([f9dc414](https://github.com/Miragon/bpmn-modeler/commit/f9dc414d5c7b7e83b09831ed59bb840b2d3181a4))
* **deployment:** Camunda 7 & 8 deployment on the IntelliJ host ([#1096](https://github.com/Miragon/bpmn-modeler/issues/1096)) ([f9bea50](https://github.com/Miragon/bpmn-modeler/commit/f9bea50f519f83b572ff878403403ba964f7d9ca))
* **intellij-plugin:** show loading spinner while element templates load ([#1234](https://github.com/Miragon/bpmn-modeler/issues/1234)) ([c1044f3](https://github.com/Miragon/bpmn-modeler/commit/c1044f347d8c7c907c4186fe648f7fe3204a60dc))
* **intellij:** add icon and follow IDE color theme in deployment webview ([#1180](https://github.com/Miragon/bpmn-modeler/issues/1180)) ([a6f5def](https://github.com/Miragon/bpmn-modeler/commit/a6f5def012d51ef0c2c5ca10c93765eaf39729a0))
* **intellij:** add scriptTask "Edit Script" via the bridge ([#1097](https://github.com/Miragon/bpmn-modeler/issues/1097)) ([c50b1fb](https://github.com/Miragon/bpmn-modeler/commit/c50b1fba359967ed3ecac9b496c4701839d6f546))
* **intellij:** Camunda code completion for the "Edit Script" editor ([#1098](https://github.com/Miragon/bpmn-modeler/issues/1098)) ([2d0610e](https://github.com/Miragon/bpmn-modeler/commit/2d0610e490247b442853cd117a08cfcefcdc78b6))
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
* **logging:** improve output channel logging ([#1214](https://github.com/Miragon/bpmn-modeler/issues/1214)) ([00c06b7](https://github.com/Miragon/bpmn-modeler/commit/00c06b7be8a336d846f29945e01f51e33b319b5f))
* **scripting:** add *.bpmn.vars.json process-variable manifest override ([#1182](https://github.com/Miragon/bpmn-modeler/issues/1182)) ([d117909](https://github.com/Miragon/bpmn-modeler/commit/d1179099bbe509ef6e2d81e1df3abf23ba8868d4))
* **scripting:** add Camunda SPIN script completion ([#1181](https://github.com/Miragon/bpmn-modeler/issues/1181)) ([69c02de](https://github.com/Miragon/bpmn-modeler/commit/69c02dec05f9590aad6255b104849ee8dafff375))
* **scriptTask:** process-variable IntelliSense for inline BPMN scripts ([#1121](https://github.com/Miragon/bpmn-modeler/issues/1121)) ([a94c692](https://github.com/Miragon/bpmn-modeler/commit/a94c69212ef909706e8738cadd7a4c281150af04))


### 🐞 Bug Fixes

* intelliJ migration review fixes + repo cleanup ([#1107](https://github.com/Miragon/bpmn-modeler/issues/1107)) ([fac6a58](https://github.com/Miragon/bpmn-modeler/commit/fac6a582de3da75f33523806e2bd189cf252948f))
* **intellij-plugin:** fix JCEF module dependency and drop internal plugin lookup on 2026.2 ([#1206](https://github.com/Miragon/bpmn-modeler/issues/1206)) ([c52323f](https://github.com/Miragon/bpmn-modeler/commit/c52323f8c9a123265c00bc9a2c30935e6426c732))
* **intellij-plugin:** make Ctrl+Z/Ctrl+Y undo/redo work on the canvas ([#1236](https://github.com/Miragon/bpmn-modeler/issues/1236)) ([6bd15fb](https://github.com/Miragon/bpmn-modeler/commit/6bd15fbec223a97b1b1ca893f4cf699b7395f718))
* **intellij-plugin:** mitigate out-of-process JCEF rendering jank ([#1205](https://github.com/Miragon/bpmn-modeler/issues/1205)) ([60af8c3](https://github.com/Miragon/bpmn-modeler/commit/60af8c3dca80fa993a459ae10d914f4940c647fd))
* **intellij-plugin:** resolve JetBrains Marketplace verification rejection ([#1203](https://github.com/Miragon/bpmn-modeler/issues/1203)) ([54007d4](https://github.com/Miragon/bpmn-modeler/commit/54007d4ffb2e80b9403d00b4f2e2728f0559b50e))
* **intellij:** give properties-panel inputs a contrasting fill in JCEF ([#1142](https://github.com/Miragon/bpmn-modeler/issues/1142)) ([637c9b2](https://github.com/Miragon/bpmn-modeler/commit/637c9b2bea79acf41a06a3b4dc2a6a4b7acc7002))
* **intellij:** remove until-build upper bound so plugin installs on newer IDEs ([#1111](https://github.com/Miragon/bpmn-modeler/issues/1111)) ([294943e](https://github.com/Miragon/bpmn-modeler/commit/294943eafa91df9112f2bcc0ecc848d199aabb3c))
* **intellij:** spawn the modeler bridge off the EDT to stop IDE freezes ([#1138](https://github.com/Miragon/bpmn-modeler/issues/1138)) ([9fa6a54](https://github.com/Miragon/bpmn-modeler/commit/9fa6a54467be937069540358f2e62e2ad0bc203e))


### 🔨 Refactoring

* **bridge:** explicit causation for write echoes and acked persists ([#1179](https://github.com/Miragon/bpmn-modeler/issues/1179)) ([4387cf2](https://github.com/Miragon/bpmn-modeler/commit/4387cf2db0149e0120ddff449bf48aee06070842))
* **intellij:** split CoreProcess into supervisor, RPC channel, and feature routers ([#1103](https://github.com/Miragon/bpmn-modeler/issues/1103)) ([#1140](https://github.com/Miragon/bpmn-modeler/issues/1140)) ([e9f8fc5](https://github.com/Miragon/bpmn-modeler/commit/e9f8fc50c96061f8a3838859ff3d0ef18e7dfb89))


### 📔 Documentation

* **intellij:** switch install guide to jetbrains marketplace ([#1215](https://github.com/Miragon/bpmn-modeler/issues/1215)) ([6104f0e](https://github.com/Miragon/bpmn-modeler/commit/6104f0e28aadb507e64e394fb72e4e13b82ebc7a))


### 🛠️ Misc

* **ci:** tier dependabot cooldown, split major from minor+patch, cover gradle ([#1126](https://github.com/Miragon/bpmn-modeler/issues/1126)) ([fa9023c](https://github.com/Miragon/bpmn-modeler/commit/fa9023c2aad37ff8841a8ff1b81d9d6db6b66760))
* **deps:** bump gradle-wrapper from 8.11.1 to 9.5.1 in /apps/intellij-plugin in the gradle-major group across 1 directory ([#1129](https://github.com/Miragon/bpmn-modeler/issues/1129)) ([c5a2d6e](https://github.com/Miragon/bpmn-modeler/commit/c5a2d6e9df87754ce64e606d9fc1d88000b55b77))
* **deps:** bump gradle-wrapper from 9.5.1 to 9.6.0 in /apps/intellij-plugin in the gradle-minor-patch group ([#1187](https://github.com/Miragon/bpmn-modeler/issues/1187)) ([1b7722e](https://github.com/Miragon/bpmn-modeler/commit/1b7722ebccb6b95fab3ad01317c6288b240d1bc3))
* **deps:** bump org.junit:junit-bom from 5.11.4 to 6.1.0 in /apps/intellij-plugin in the gradle-major group ([#1167](https://github.com/Miragon/bpmn-modeler/issues/1167)) ([887a2e5](https://github.com/Miragon/bpmn-modeler/commit/887a2e57b4fcfbb4e7fe27a72cea6ae1c2890fb5))
* **deps:** bump the gradle-minor-patch group in /apps/intellij-plugin with 3 updates ([#1127](https://github.com/Miragon/bpmn-modeler/issues/1127)) ([aa9bbdc](https://github.com/Miragon/bpmn-modeler/commit/aa9bbdc764d9f3d5bc9c7adcee0136508fb66a22))
* **deps:** bump the gradle-minor-patch group in /apps/intellij-plugin with 3 updates ([#1222](https://github.com/Miragon/bpmn-modeler/issues/1222)) ([878a1cf](https://github.com/Miragon/bpmn-modeler/commit/878a1cfff896f436fbd4942777d05c0ad8d63db4))
* **intellij-plugin:** add JUnit 5 bridge harness + PR test/coverage CI ([#1163](https://github.com/Miragon/bpmn-modeler/issues/1163)) ([2ddc1f6](https://github.com/Miragon/bpmn-modeler/commit/2ddc1f6851eff3df32ab3852758c02452911cf30))
* **intellij-plugin:** add local dev/test tooling and dark-mode preview ([#1209](https://github.com/Miragon/bpmn-modeler/issues/1209)) ([e41b42f](https://github.com/Miragon/bpmn-modeler/commit/e41b42f4cc5314a299f7b64fffcc8810a4ef5561))
* **intellij-plugin:** auto-publish signed plugin to jetbrains marketplace ([#1216](https://github.com/Miragon/bpmn-modeler/issues/1216)) ([3999c50](https://github.com/Miragon/bpmn-modeler/commit/3999c5066cb79bb44d9db0df94f3f3b0b47a75d0))
* **main:** release 1.1.0 ([#1150](https://github.com/Miragon/bpmn-modeler/issues/1150)) ([594bd06](https://github.com/Miragon/bpmn-modeler/commit/594bd06d0b6517679aa58366c609d6909e7e4ed3))
* **main:** release 1.1.1 ([#1155](https://github.com/Miragon/bpmn-modeler/issues/1155)) ([dc5b27b](https://github.com/Miragon/bpmn-modeler/commit/dc5b27b6febe1cfd636d13aad4c2c831f67b439c))
* **main:** release 1.1.2 ([#1157](https://github.com/Miragon/bpmn-modeler/issues/1157)) ([071721b](https://github.com/Miragon/bpmn-modeler/commit/071721b490e1bf017015c7d8a753aff9e7b8d210))
* **main:** release 1.2.0 ([#1162](https://github.com/Miragon/bpmn-modeler/issues/1162)) ([4b3f02b](https://github.com/Miragon/bpmn-modeler/commit/4b3f02b84bc975c0e6f3e1aa6ee749c5fe6700b0))
* **main:** release 1.2.1 ([#1195](https://github.com/Miragon/bpmn-modeler/issues/1195)) ([22702bf](https://github.com/Miragon/bpmn-modeler/commit/22702bfd973a20fd4531df5909da071baddb06c9))
* **main:** release 1.3.0 ([#1218](https://github.com/Miragon/bpmn-modeler/issues/1218)) ([5b5699e](https://github.com/Miragon/bpmn-modeler/commit/5b5699ebce6ddf951561c8eab27d56f1212075c7))
* **release:** bump intellij plugin to 0.1.1 ([43d13df](https://github.com/Miragon/bpmn-modeler/commit/43d13dffefdebe5b5c21a44a714ebadd5d7ebddf))
* **release:** bump intellij plugin to 0.1.2 ([e44ced1](https://github.com/Miragon/bpmn-modeler/commit/e44ced10aa4c8531e6913eed6a83d7ac0bd20a27))
* **release:** move intellij plugin version out of build.gradle.kts ([#1165](https://github.com/Miragon/bpmn-modeler/issues/1165)) ([aa8e1ae](https://github.com/Miragon/bpmn-modeler/commit/aa8e1aea0f39b6cd5e1e9a16c6abfed19efe0b09))
* **release:** rework release-please into independent per-host lines ([#1237](https://github.com/Miragon/bpmn-modeler/issues/1237)) ([98dcec2](https://github.com/Miragon/bpmn-modeler/commit/98dcec2261c61e2e85aac46141987f7e6af0f33f))
* **release:** unify versioning across hosts via release-please ([#1146](https://github.com/Miragon/bpmn-modeler/issues/1146)) ([87cce01](https://github.com/Miragon/bpmn-modeler/commit/87cce0190042af396f54f09385aca99a888bac7c))
