# Changelog

## [1.17.0](https://github.com/Miragon/bpmn-modeler/compare/vscode-v1.16.0...vscode-v1.17.0) (2026-10-31)


### 🎉 New Features

* **append-menu:** show element descriptions and match search keywords ([#1761](https://github.com/Miragon/bpmn-modeler/issues/1761)) [sync 7c7a424] ([d8357d8](https://github.com/Miragon/bpmn-modeler/commit/d8357d81aa31dd2ee520368d0e61fb903b9fe359))
* **bpmn-modeler:** publish command-stack and format subscriptions ([#2042](https://github.com/Miragon/bpmn-modeler/issues/2042)) [sync d86ef79] ([a23e288](https://github.com/Miragon/bpmn-modeler/commit/a23e288f14007d1dea6a277a8bec3b2cdd1364aa))
* **bpmn-modeler:** replace camunda-bpmn-js popup-menu features with our own ([#1777](https://github.com/Miragon/bpmn-modeler/issues/1777)) [sync 2adc83c] ([e064d78](https://github.com/Miragon/bpmn-modeler/commit/e064d787acd52ad60571fbf0e8128b0d4f55ba45))
* **bpmn-modeler:** translate popup-menu search keywords ([#1781](https://github.com/Miragon/bpmn-modeler/issues/1781)) [sync cae0009] ([432bbd7](https://github.com/Miragon/bpmn-modeler/commit/432bbd773e762ffa383631020639f90004f1b8e5))
* **bpmn-modeler:** update favourite elements on a live surface ([#1743](https://github.com/Miragon/bpmn-modeler/issues/1743)) [sync f1103b1] ([c759d76](https://github.com/Miragon/bpmn-modeler/commit/c759d76c7f1d01e8d5f137480bbe1a39febb259a))
* **deployment:** support ${env:VAR} references in target fields ([#1575](https://github.com/Miragon/bpmn-modeler/issues/1575)) ([d3f657b](https://github.com/Miragon/bpmn-modeler/commit/d3f657bc5a49a45f7b098495766af850b7e39bb5))
* **standalone:** add builtin-extension-pack to standalone app ([#1961](https://github.com/Miragon/bpmn-modeler/issues/1961)) [sync 0ecd09c] ([5d81450](https://github.com/Miragon/bpmn-modeler/commit/5d8145098b5b84427aa6e6902704f5c927a38061))


### 🐞 Bug Fixes

* **append-menu:** prefer the most specific type for a translated pick ([#1702](https://github.com/Miragon/bpmn-modeler/issues/1702)) [sync 2e0509f] ([6161050](https://github.com/Miragon/bpmn-modeler/commit/6161050a22953480db64fc5fc527f8aeadce653a))
* **bpmn-clipboard:** keep text field copies from carrying stale elements ([#1696](https://github.com/Miragon/bpmn-modeler/issues/1696)) [sync c5943c5] ([ec958f7](https://github.com/Miragon/bpmn-modeler/commit/ec958f7af472d53d0a441f1a30c1495ca766836f))
* **bpmn-diff:** step to boundary events next to their host activity ([#1749](https://github.com/Miragon/bpmn-modeler/issues/1749)) [sync 0003cbb] ([f4caf03](https://github.com/Miragon/bpmn-modeler/commit/f4caf03438148e94866ba5744f318bce8bd38a56))
* **bpmn-diff:** walk an embedded sub-process when the stepper reaches it ([#1748](https://github.com/Miragon/bpmn-modeler/issues/1748)) [sync 12c5e02] ([3648d45](https://github.com/Miragon/bpmn-modeler/commit/3648d4580fdc95a551b9261fb4ce6053bb30a96a))
* **bpmn-modeler:** arm the initial viewport fit on modeler imports ([#1741](https://github.com/Miragon/bpmn-modeler/issues/1741)) [sync 18ef8a6] ([367e1d6](https://github.com/Miragon/bpmn-modeler/commit/367e1d6e36c189d6d0dcd5529b486d9bab3d0158))
* **bpmn-modeler:** export CleanupStatus from the root entry and /design ([#2061](https://github.com/Miragon/bpmn-modeler/issues/2061)) [sync 8e3efca] ([b1e6bb2](https://github.com/Miragon/bpmn-modeler/commit/b1e6bb2f0cd5a51198c831b7717419132fb380ec))
* **bpmn-modeler:** export the layout outcome types from /design ([#2045](https://github.com/Miragon/bpmn-modeler/issues/2045)) [sync 76e2ea6] ([bb6ae7a](https://github.com/Miragon/bpmn-modeler/commit/bb6ae7ae48cc24045a2f49bd1b219db41672b3e8))
* **bpmn-modeler:** flush panel input on save and read the bound engine ([#2064](https://github.com/Miragon/bpmn-modeler/issues/2064)) ([33c466b](https://github.com/Miragon/bpmn-modeler/commit/33c466be90e40c05cffd9449e498fbb71ffd1633))
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
* **intellij-plugin:** flush pending webview edits before IntelliJ saves ([#1928](https://github.com/Miragon/bpmn-modeler/issues/1928)) [sync 966f0a0] ([85be077](https://github.com/Miragon/bpmn-modeler/commit/85be077bc658d64afb053b99a1be95128e6b1132))
* **intellij-plugin:** keep unsynced page edits across a bridge respawn ([#1899](https://github.com/Miragon/bpmn-modeler/issues/1899)) [sync 5459e21] ([f449d73](https://github.com/Miragon/bpmn-modeler/commit/f449d73c4ae410b45975be910f41058228d8573b))
* **intellij-plugin:** restore focus, sessions and lint choice on respawn ([#2069](https://github.com/Miragon/bpmn-modeler/issues/2069)) ([18e7582](https://github.com/Miragon/bpmn-modeler/commit/18e75827a56b414a8868956ea7b39ada4688dd3d))
* **intellij-plugin:** say how many more items a destructive confirmation removes ([#1850](https://github.com/Miragon/bpmn-modeler/issues/1850)) ([52480bc](https://github.com/Miragon/bpmn-modeler/commit/52480bcee57decee35141f7b1e38f6f5dcb0c643))
* **modeler-bridge:** hold the workspace adapters to one contract suite ([#1903](https://github.com/Miragon/bpmn-modeler/issues/1903)) [sync 09e7da6] ([631d4ed](https://github.com/Miragon/bpmn-modeler/commit/631d4ed2b1aadf3a8538bd6bb4586f023ed7d15e))
* **modeler-bridge:** honour the lint off-button when the host runs the linter ([#1859](https://github.com/Miragon/bpmn-modeler/issues/1859)) [sync 8bdf632] ([4e0b774](https://github.com/Miragon/bpmn-modeler/commit/4e0b774dde4f90a1b075c9d8a7262f7a7b7365c4))
* **modeler-bridge:** keep UNC roots in findFiles and watcher paths ([#1875](https://github.com/Miragon/bpmn-modeler/issues/1875)) [sync 3c1de14] ([a09e7fb](https://github.com/Miragon/bpmn-modeler/commit/a09e7fb7f4b87f01da85b65f897e5bcfdcf8cf55))
* **modeler-bridge:** log handler error stacks and show thrown strings ([#1993](https://github.com/Miragon/bpmn-modeler/issues/1993)) ([46cd894](https://github.com/Miragon/bpmn-modeler/commit/46cd894aaaac4f1791d9b8fe5fade82414fb21d4))
* **modeler-bridge:** report a marketplace whose registration could not be saved ([#1795](https://github.com/Miragon/bpmn-modeler/issues/1795)) [sync b58be8e] ([14078de](https://github.com/Miragon/bpmn-modeler/commit/14078de9a85c1daa66b598cb03bb2a060cc3314c))
* **modeler-bridge:** report watcher paths with forward slashes on Windows ([#1853](https://github.com/Miragon/bpmn-modeler/issues/1853)) [sync c45cfa0] ([45e6cd4](https://github.com/Miragon/bpmn-modeler/commit/45e6cd410103d89838b460ff055d6ab1055ee04d))
* **modeler-bridge:** time out lost replies, mirror only accepted writes ([#2062](https://github.com/Miragon/bpmn-modeler/issues/2062)) [sync 9307a68] ([3cb03d2](https://github.com/Miragon/bpmn-modeler/commit/3cb03d2e56c08663f6f7411d7605a11f619771a4))
* **modeler-core:** count failed script writes in Generate Script Files ([#1968](https://github.com/Miragon/bpmn-modeler/issues/1968)) ([df96549](https://github.com/Miragon/bpmn-modeler/commit/df96549ae4e1bff5c9945ef767681388ee81d004))
* **modeler-core:** dismiss cancelled prompts in deployment commands ([#2002](https://github.com/Miragon/bpmn-modeler/issues/2002)) [sync dad58ab] ([ca8ae7e](https://github.com/Miragon/bpmn-modeler/commit/ca8ae7e68dc68b614c882b08fc978469a7a95a4e))
* **modeler-core:** drop lint work for an editor that closed mid-discovery ([#2003](https://github.com/Miragon/bpmn-modeler/issues/2003)) [sync 74ffdb3] ([932f8de](https://github.com/Miragon/bpmn-modeler/commit/932f8ded30c367df5f94e470734bed23388a2ccb))
* **modeler-core:** drop marketplace templates a refresh no longer serves ([#1844](https://github.com/Miragon/bpmn-modeler/issues/1844)) [sync dec6866] ([2f87a09](https://github.com/Miragon/bpmn-modeler/commit/2f87a090d7e3b119bb74a75491bbb016ff64321f))
* **modeler-core:** find .bpmnlintrc in drive-root workspaces with one ancestor walk ([#1839](https://github.com/Miragon/bpmn-modeler/issues/1839)) [sync 55c9104] ([f050957](https://github.com/Miragon/bpmn-modeler/commit/f0509579791b06df989614a506dc04d4121d9eae))
* **modeler-core:** flush and save before the sidebar deploys a diagram ([#1886](https://github.com/Miragon/bpmn-modeler/issues/1886)) [sync 17adc2d] ([98dc707](https://github.com/Miragon/bpmn-modeler/commit/98dc707d4e67950fd5cea74fe465b0fae5dfa62c))
* **modeler-core:** flush the webview's pending edits before Deploy Diagram saves ([#1861](https://github.com/Miragon/bpmn-modeler/issues/1861)) ([06903a4](https://github.com/Miragon/bpmn-modeler/commit/06903a42e3dc9426ecdfb7e92e758867e74a0ecb))
* **modeler-core:** generate webview csp nonces from a csprng ([#1750](https://github.com/Miragon/bpmn-modeler/issues/1750)) ([387900b](https://github.com/Miragon/bpmn-modeler/commit/387900bd8e5a27fe71e096e23aeb50532b517fc8))
* **modeler-core:** hand a blurred command target to the focused diagram ([#1957](https://github.com/Miragon/bpmn-modeler/issues/1957)) [sync 7154a00] ([c467e39](https://github.com/Miragon/bpmn-modeler/commit/c467e39c2089d3756ce0b817320491ee1712a159))
* **modeler-core:** keep commands on the focused diagram ([#1938](https://github.com/Miragon/bpmn-modeler/issues/1938)) ([66bbace](https://github.com/Miragon/bpmn-modeler/commit/66bbace661971008a302b142588e748d2f1dd948))
* **modeler-core:** keep the focused editor's engine and lint status when another BPMN editor blurs or closes ([#1855](https://github.com/Miragon/bpmn-modeler/issues/1855)) [sync 4140060] ([2bbbd18](https://github.com/Miragon/bpmn-modeler/commit/2bbbd188531950706b49fdf093a245b4184d1b66))
* **modeler-core:** match a camunda:class file on a path-segment boundary in navigation as the code-link map does ([#1840](https://github.com/Miragon/bpmn-modeler/issues/1840)) [sync 73519ba] ([862426a](https://github.com/Miragon/bpmn-modeler/commit/862426a338c1dd894dfe85c9fc0e8136ef7e84ab))
* **modeler-core:** migrate open diagrams from their editor content instead of disk ([#1856](https://github.com/Miragon/bpmn-modeler/issues/1856)) [sync ffd110a] ([b5e3487](https://github.com/Miragon/bpmn-modeler/commit/b5e3487a32584fc27e5f921cf5d20f832842456e))
* **modeler-core:** never drop a picked engine version silently ([#1901](https://github.com/Miragon/bpmn-modeler/issues/1901)) ([d2bce4c](https://github.com/Miragon/bpmn-modeler/commit/d2bce4cb2e0bfac18f644dc787edab52eceb89f6))
* **modeler-core:** normalise settings once for every host ([#1941](https://github.com/Miragon/bpmn-modeler/issues/1941)) ([c3811a0](https://github.com/Miragon/bpmn-modeler/commit/c3811a0b0901f712baecc2fd73e8abd24c147096))
* **modeler-core:** re-resolve the definition-search and form-status scope when workspace folders change ([#1843](https://github.com/Miragon/bpmn-modeler/issues/1843)) [sync f5236fd] ([38ab290](https://github.com/Miragon/bpmn-modeler/commit/38ab290c7982045a5a45ab2940dd427e693eaa2f))
* **modeler-core:** read the executable process id under any bpmn prefix ([#1949](https://github.com/Miragon/bpmn-modeler/issues/1949)) [sync db53e2e] ([52b0e3f](https://github.com/Miragon/bpmn-modeler/commit/52b0e3ff93e954fa59447237cc37a82d7b41cf6f))
* **modeler-core:** report an engine-accepted deploy as deployed when saving its credentials or ledger row fails ([#1854](https://github.com/Miragon/bpmn-modeler/issues/1854)) [sync d9cb259] ([59ebf49](https://github.com/Miragon/bpmn-modeler/commit/59ebf49338d98fbd1f098b20da9f0e7717d49a73))
* **modeler-core:** share one script file store between both hosts ([#2010](https://github.com/Miragon/bpmn-modeler/issues/2010)) ([d1efc1b](https://github.com/Miragon/bpmn-modeler/commit/d1efc1be9e0e46f762da02aa687d119d7c6a2055))
* **modeler-core:** show status items only for the focused editor ([#1895](https://github.com/Miragon/bpmn-modeler/issues/1895)) [sync 2da9ab8] ([9d7e0af](https://github.com/Miragon/bpmn-modeler/commit/9d7e0af88df9dc1f824fd84fc0e9845e7588331e))
* **modeler-core:** skip a diagram migrate all cannot read or rewrite ([#2004](https://github.com/Miragon/bpmn-modeler/issues/2004)) [sync 81284d1] ([66fcde5](https://github.com/Miragon/bpmn-modeler/commit/66fcde502f624ac790116aabefd525d12501e9d6))
* **modeler-core:** skip host script write-back to morphed script tasks ([#1726](https://github.com/Miragon/bpmn-modeler/issues/1726)) [sync 3c36f22] ([0d16462](https://github.com/Miragon/bpmn-modeler/commit/0d1646261baf94256095ee47f72379060016fcd8))
* **modeler-core:** stop a deploy when the save before it fails ([#1935](https://github.com/Miragon/bpmn-modeler/issues/1935)) ([de51658](https://github.com/Miragon/bpmn-modeler/commit/de516583ab0758b38d1a2f4176474fbfccfde08c))
* **modeler-core:** stop migration from stamping duplicate execution-platform attributes ([#1862](https://github.com/Miragon/bpmn-modeler/issues/1862)) [sync 18c157a] ([6aab597](https://github.com/Miragon/bpmn-modeler/commit/6aab5979a4576ee7190b6239f273a68c480931c6))
* **modeler-core:** warn when an added marketplace fetched nothing ([#1948](https://github.com/Miragon/bpmn-modeler/issues/1948)) ([a652ae5](https://github.com/Miragon/bpmn-modeler/commit/a652ae5058a0e5aa6b814d987f3328d264b51766))
* **modeler-core:** watch element templates when the config folder setting is empty ([#1865](https://github.com/Miragon/bpmn-modeler/issues/1865)) [sync 9593933] ([e2fb0e5](https://github.com/Miragon/bpmn-modeler/commit/e2fb0e5237987f2edab77bb034abbe6ac1fcfb45))
* **modeler-types:** scan xml comments and cdata in document order ([#1970](https://github.com/Miragon/bpmn-modeler/issues/1970)) ([249398c](https://github.com/Miragon/bpmn-modeler/commit/249398cc17d5102ad57844538ad28fda2b0f6c09))
* **shared:** hold a quickly narrowed properties panel at its minimum width ([#1698](https://github.com/Miragon/bpmn-modeler/issues/1698)) [sync f92e122] ([74417fa](https://github.com/Miragon/bpmn-modeler/commit/74417fac1d705768bac5a2fce16e30ca200f8e23))
* **shared:** keep properties-panel groups collapsed after a rebuild ([#1728](https://github.com/Miragon/bpmn-modeler/issues/1728)) [sync 08610dc] ([59ff23e](https://github.com/Miragon/bpmn-modeler/commit/59ff23eff098235154ff150d97944488f2698fde))
* **vscode-plugin:** keep credential pairs whole and UNC servers in paths ([#2066](https://github.com/Miragon/bpmn-modeler/issues/2066)) ([f531682](https://github.com/Miragon/bpmn-modeler/commit/f5316824fd24032a1ce819bde433cb1bf9040eae))
* **vscode-plugin:** keep untitled diagram scripts in the OS temp folder ([#1915](https://github.com/Miragon/bpmn-modeler/issues/1915)) ([af0b480](https://github.com/Miragon/bpmn-modeler/commit/af0b480be27b7a29ef11f8db2b420360e3108528))
* **vscode-plugin:** let a later template status cancel the auto-hide ([#1896](https://github.com/Miragon/bpmn-modeler/issues/1896)) ([e1d3710](https://github.com/Miragon/bpmn-modeler/commit/e1d3710564594c2cd1eb2c7ef2430a5c3da5816e))
* **vscode-plugin:** write the exported svg next to the requested diagram ([#1955](https://github.com/Miragon/bpmn-modeler/issues/1955)) ([5ca1e1f](https://github.com/Miragon/bpmn-modeler/commit/5ca1e1fda4157a1784aea17f9dadcb5bfaffb019))
* **webviews:** add a content security policy to the bpmn and dmn webviews ([#1798](https://github.com/Miragon/bpmn-modeler/issues/1798)) ([4d58fab](https://github.com/Miragon/bpmn-modeler/commit/4d58fabdb0e671c9759c78b93fed200de28a4d47))
* **webviews:** keep a properties-panel toggle made while the editor opens ([#1851](https://github.com/Miragon/bpmn-modeler/issues/1851)) [sync 766f0de] ([19f0e1d](https://github.com/Miragon/bpmn-modeler/commit/19f0e1da0734707cb442f33cf67840fde8074c06))
* **webviews:** pin the boot restore invariants and paint early diff highlights ([#1792](https://github.com/Miragon/bpmn-modeler/issues/1792)) [sync 2f3bd53] ([da11f71](https://github.com/Miragon/bpmn-modeler/commit/da11f719187043a73501319d3ca48663731c63d2))


### 🔨 Refactoring

* deepen webview session, document sync, protocol and view state ([#1764](https://github.com/Miragon/bpmn-modeler/issues/1764)) ([c6a8407](https://github.com/Miragon/bpmn-modeler/commit/c6a840742cc14b60724e064de8ef353202955c65))
* **modeler-core:** add an in-memory host kit and move specs onto it ([#1773](https://github.com/Miragon/bpmn-modeler/issues/1773)) ([347c937](https://github.com/Miragon/bpmn-modeler/commit/347c9379c1bbea6bc36bf48c2f93d3aa62de6e0b))
* **modeler-core:** add generic choose and confirm prompts ([#2018](https://github.com/Miragon/bpmn-modeler/issues/2018)) ([e3362cc](https://github.com/Miragon/bpmn-modeler/commit/e3362cc6e62b0546ce041686d9994a104c32fef4))
* **modeler-core:** build the engine and confirmation prompts in the core ([#2021](https://github.com/Miragon/bpmn-modeler/issues/2021)) ([5e607fc](https://github.com/Miragon/bpmn-modeler/commit/5e607fc7dff954cf0c29b6bf48f3f78936403010))
* **modeler-core:** build the script language prompt in the core ([#2033](https://github.com/Miragon/bpmn-modeler/issues/2033)) ([a6da2ec](https://github.com/Miragon/bpmn-modeler/commit/a6da2ecba96bcb8f6452e7e376090c0a05dced4a))
* **modeler-core:** build the token prompt in the core ([#2046](https://github.com/Miragon/bpmn-modeler/issues/2046)) ([6b0a2e8](https://github.com/Miragon/bpmn-modeler/commit/6b0a2e8c1b7822ba8b8d16f3d1593a7784589e97))
* **modeler-core:** clear the marketplace and diff leftovers ([#1991](https://github.com/Miragon/bpmn-modeler/issues/1991)) ([5b0aed7](https://github.com/Miragon/bpmn-modeler/commit/5b0aed7ea4f9ae989385f8cbf41cf9954d5c63ef))
* **modeler-core:** delete unused disposeEngineVersionStatus ([#1893](https://github.com/Miragon/bpmn-modeler/issues/1893)) ([07c965c](https://github.com/Miragon/bpmn-modeler/commit/07c965c54100eb110c5a898b31c74bb7e281eb39))
* **modeler-core:** drop the feature-shaped picker methods ([#2041](https://github.com/Miragon/bpmn-modeler/issues/2041)) ([6de5c36](https://github.com/Miragon/bpmn-modeler/commit/6de5c36ad45def4b6f25f019d9674d97304aa0b7))
* **modeler-core:** drop the widget-shaped status methods ([#2039](https://github.com/Miragon/bpmn-modeler/issues/2039)) ([5aa51d0](https://github.com/Miragon/bpmn-modeler/commit/5aa51d0898d1acdaf7a02ef967d32afb1649cf54))
* **modeler-core:** give setting keys, changes and section one home ([#1969](https://github.com/Miragon/bpmn-modeler/issues/1969)) ([00d7dff](https://github.com/Miragon/bpmn-modeler/commit/00d7dff3f5cafe00d9bfa2a12efb40a3dea4026d))
* **modeler-core:** load and save deployment state as one snapshot ([#2029](https://github.com/Miragon/bpmn-modeler/issues/2029)) ([fc2b3fa](https://github.com/Miragon/bpmn-modeler/commit/fc2b3fa662373bfaa53ce95db779f3d9f26f8207))
* **modeler-core:** move feature-owned ports into their features ([#1916](https://github.com/Miragon/bpmn-modeler/issues/1916)) ([eb68ca4](https://github.com/Miragon/bpmn-modeler/commit/eb68ca4fdd253e91dcdea5ed4dccbba0fc21149d))
* **modeler-core:** name setting changes by a closed SettingKey ([#1964](https://github.com/Miragon/bpmn-modeler/issues/1964)) ([3eb457f](https://github.com/Miragon/bpmn-modeler/commit/3eb457ff46716d8407edd721d2d5a29b5e00f18f))
* **modeler-core:** open located files through one shared flow ([#1956](https://github.com/Miragon/bpmn-modeler/issues/1956)) ([581939e](https://github.com/Miragon/bpmn-modeler/commit/581939e9332ae617d5c94c6b47807953b2ee0ab3))
* **modeler-core:** pick the bpmnlint indicator in the domain ([#1934](https://github.com/Miragon/bpmn-modeler/issues/1934)) ([cbb9bcb](https://github.com/Miragon/bpmn-modeler/commit/cbb9bcbacfd0836856ff2a774792c3995224f0c4))
* **modeler-core:** remove the script-variable manifest and its declare-variable quick fix ([#1858](https://github.com/Miragon/bpmn-modeler/issues/1858)) ([989637b](https://github.com/Miragon/bpmn-modeler/commit/989637b4a763204699efd1c6dcb5cb22858c1d1c))
* **modeler-core:** render status items through slots ([#1967](https://github.com/Miragon/bpmn-modeler/issues/1967)) ([568f8cc](https://github.com/Miragon/bpmn-modeler/commit/568f8ccf06ef8393fdf6bda3e825f097ff2bfdeb))
* **modeler-core:** run editor sessions and host features once in the core ([#1775](https://github.com/Miragon/bpmn-modeler/issues/1775)) ([99789e5](https://github.com/Miragon/bpmn-modeler/commit/99789e56f8a7390180b1fb111ee2a11a08f2b824))
* **modeler-core:** share document sync and surface lifecycles ([#1776](https://github.com/Miragon/bpmn-modeler/issues/1776)) ([f4c099f](https://github.com/Miragon/bpmn-modeler/commit/f4c099fbeef9c8ab0bc09338ad959569bf55614f))
* **modeler-core:** show the bpmnlint status through its status slot ([#2001](https://github.com/Miragon/bpmn-modeler/issues/2001)) ([a891b94](https://github.com/Miragon/bpmn-modeler/commit/a891b943b572e5e55a7ec54a87ba0f9a9322e29d))
* **modeler-types:** move process variables out of the protocol ([#2005](https://github.com/Miragon/bpmn-modeler/issues/2005)) ([3c7f693](https://github.com/Miragon/bpmn-modeler/commit/3c7f6931faddb0cb9f71d5d5cdec995e81d66591))
* **shared:** check host channels strictly and fix stale docs ([#1994](https://github.com/Miragon/bpmn-modeler/issues/1994)) ([040af7b](https://github.com/Miragon/bpmn-modeler/commit/040af7b0fa5ff09f0c3c2e8c611ffaf495f985be))
* **vscode-plugin:** build every webview shell's csp in one place ([#1992](https://github.com/Miragon/bpmn-modeler/issues/1992)) ([db1e504](https://github.com/Miragon/bpmn-modeler/commit/db1e504a974ba4a67b74307b6be97000353f96be))
* **vscode-plugin:** run vs code's bpmn editor on the core feature ([#2026](https://github.com/Miragon/bpmn-modeler/issues/2026)) ([03fa99e](https://github.com/Miragon/bpmn-modeler/commit/03fa99e19a46d8ec0ef899e9bfde1f8efa5a5011))


### 📔 Documentation

* **readme:** replace the preview image with a demo gif ([#1756](https://github.com/Miragon/bpmn-modeler/issues/1756)) ([c9a0ba9](https://github.com/Miragon/bpmn-modeler/commit/c9a0ba9fad38144af0b6e7484deec3205eec8fcd))


### 🛠️ Misc

* **ci:** raise drifted coverage floors and type-check spec files ([#1796](https://github.com/Miragon/bpmn-modeler/issues/1796)) ([88359d4](https://github.com/Miragon/bpmn-modeler/commit/88359d4ef080929e369a6736134e1cd282f0e17b))
* **ci:** run every vitest workspace from one target registry ([#1687](https://github.com/Miragon/bpmn-modeler/issues/1687)) ([b0c1940](https://github.com/Miragon/bpmn-modeler/commit/b0c19402c84b2a1f496fa20728e97f9a254b8885))
* **deps:** bump the npm-minor-patch group across 1 directory with 10 updates ([#1667](https://github.com/Miragon/bpmn-modeler/issues/1667)) ([4fb5db5](https://github.com/Miragon/bpmn-modeler/commit/4fb5db55c3e1f5891598189d720ed292691634ca))
* **deps:** bump the npm-minor-patch group across 1 directory with 8 updates ([#1758](https://github.com/Miragon/bpmn-modeler/issues/1758)) ([c1a1cd3](https://github.com/Miragon/bpmn-modeler/commit/c1a1cd3279cbf9137b337422ed71f05d416c9347))
* **modeler-core:** align host kit defaults and error logs with the hosts ([#1878](https://github.com/Miragon/bpmn-modeler/issues/1878)) ([639a4cd](https://github.com/Miragon/bpmn-modeler/commit/639a4cdd561b4444a917799406eb931829e8d030))
* **modeler-core:** cover layout reporting, script batches and bridge features ([#1690](https://github.com/Miragon/bpmn-modeler/issues/1690)) ([9a2e207](https://github.com/Miragon/bpmn-modeler/commit/9a2e2073e2a033192065bc5e8afebdbc13571935))
* pin partial-deploy, credential and bridge reply failure paths ([#1874](https://github.com/Miragon/bpmn-modeler/issues/1874)) ([546a7a4](https://github.com/Miragon/bpmn-modeler/commit/546a7a4d13772fb31435881d8b2182c1f5b0dfc2))
* replace the browser demo with a real VS Code smoke test ([#1718](https://github.com/Miragon/bpmn-modeler/issues/1718)) ([92b2b6e](https://github.com/Miragon/bpmn-modeler/commit/92b2b6e8faa090c31b4b507b9018bb0344460dde))
* **repo-checks:** ban import cycles and unstable workspace dependencies ([#2086](https://github.com/Miragon/bpmn-modeler/issues/2086)) ([d81bb67](https://github.com/Miragon/bpmn-modeler/commit/d81bb677c435aa09f758c2e323c4f69c8149fa3c))
* **vscode-plugin:** close base-uri and form-action in two shells ([#1897](https://github.com/Miragon/bpmn-modeler/issues/1897)) ([9eb762d](https://github.com/Miragon/bpmn-modeler/commit/9eb762d8067275ed277ba35514a5f43b7fdfddeb))
* **vscode-plugin:** cover deployment persistence, form editor and host adapters ([#1689](https://github.com/Miragon/bpmn-modeler/issues/1689)) ([ed0a5bd](https://github.com/Miragon/bpmn-modeler/commit/ed0a5bd0a7677f392db125427853a11b6e891dc5))
* **vscode-plugin:** cover status bar, notifier, html and form values ([#1880](https://github.com/Miragon/bpmn-modeler/issues/1880)) ([a1bf62f](https://github.com/Miragon/bpmn-modeler/commit/a1bf62f7aac3fea7c4f39d65a3286750df537632))
* **vscode-plugin:** move the architecture spec off archunit ([#2084](https://github.com/Miragon/bpmn-modeler/issues/2084)) ([6ba1acd](https://github.com/Miragon/bpmn-modeler/commit/6ba1acd9651bfd5a21efd06d4c7211b7ef6dd20f))

## [1.16.0](https://github.com/Miragon/bpmn-modeler/compare/vscode-v1.15.0...vscode-v1.16.0) (2026-10-16)


### 🎉 New Features

* **bpmn-webview:** search definitions of other models ([#1649](https://github.com/Miragon/bpmn-modeler/issues/1649)) ([1c48e83](https://github.com/Miragon/bpmn-modeler/commit/1c48e833c934a5523e81d01cba882317c3b8f140))


### 🐞 Bug Fixes

* **bpmn-modeler:** bump bpmn-js-bpmnlint to 0.25.0 for diagram-js theme tokens ([#1656](https://github.com/Miragon/bpmn-modeler/issues/1656)) [sync f93e3ba] ([f417014](https://github.com/Miragon/bpmn-modeler/commit/f4170147e554110ecbe35affa200685d5f897bf9))
* **bpmn-modeler:** bump bpmnlint to 11.15.0 and drop the core rule patch ([#1640](https://github.com/Miragon/bpmn-modeler/issues/1640)) [sync 680fae4] ([18bc4f1](https://github.com/Miragon/bpmn-modeler/commit/18bc4f1134262ed097bfe6fcd9bc428ab70cde97))
* **bpmn-webview:** focus the canvas when an editor tab becomes active ([#1659](https://github.com/Miragon/bpmn-modeler/issues/1659)) ([7aac2ff](https://github.com/Miragon/bpmn-modeler/commit/7aac2ff5c64425370f5169224720dc6122335f77))
* **modeler-core:** shorten the host open path and per-edit host work ([#1645](https://github.com/Miragon/bpmn-modeler/issues/1645)) ([575fc55](https://github.com/Miragon/bpmn-modeler/commit/575fc551c337b09b28ad7c80626dec9e54c7479a))


### 🔨 Refactoring

* **bpmn-webview:** split the single webview bundle into lazy chunks ([#1638](https://github.com/Miragon/bpmn-modeler/issues/1638)) ([22f9707](https://github.com/Miragon/bpmn-modeler/commit/22f97073ee0b1685a725240e10b6380b7d52bee8))


### 🛠️ Misc

* **deps:** bump the bpmn-io group across 1 directory with 12 updates ([#1644](https://github.com/Miragon/bpmn-modeler/issues/1644)) ([586f66f](https://github.com/Miragon/bpmn-modeler/commit/586f66f3e202646d636fdc480df926bd4552dfe2))
* **deps:** bump the npm-major group across 1 directory with 6 updates ([#1650](https://github.com/Miragon/bpmn-modeler/issues/1650)) ([be237db](https://github.com/Miragon/bpmn-modeler/commit/be237db00ec63fb25c9c717e669e23decead21fc))
* **deps:** bump the npm-minor-patch group across 1 directory with 26 updates ([#1655](https://github.com/Miragon/bpmn-modeler/issues/1655)) ([d0069a9](https://github.com/Miragon/bpmn-modeler/commit/d0069a96f6913cab84abf372f4c03c1bad64e9ba))
* **deps:** unblock dependabot major bumps and fix webview dev preview ([#1631](https://github.com/Miragon/bpmn-modeler/issues/1631)) ([c40e3d7](https://github.com/Miragon/bpmn-modeler/commit/c40e3d7b8848190da2cf207384d4d5d84389bc89))

## [1.15.0](https://github.com/Miragon/bpmn-modeler/compare/vscode-v1.14.2...vscode-v1.15.0) (2026-10-08)


### 🎉 New Features

* **bpmn-modeler:** replace the mode strip with a compact mode menu ([#1628](https://github.com/Miragon/bpmn-modeler/issues/1628)) [sync b0a66ca] ([aa2c372](https://github.com/Miragon/bpmn-modeler/commit/aa2c372235d66265aef8d60ef690c556d46f7d7a))
* replace the komet icons with the bpmn and dmn modeler icons ([#1630](https://github.com/Miragon/bpmn-modeler/issues/1630)) ([4aa0fb2](https://github.com/Miragon/bpmn-modeler/commit/4aa0fb2f7b47d3693755a76f09b28277daf266cd))


### 🐞 Bug Fixes

* **bpmn-modeler:** fix quadratic bpmnlint overlap and bpmndi rules ([#1609](https://github.com/Miragon/bpmn-modeler/issues/1609)) [sync 0966e35] ([15f5ccd](https://github.com/Miragon/bpmn-modeler/commit/15f5ccdcbfa07a3e445dfc9c32aa8e75599486d5))
* **bpmn-modeler:** stop duplicating and rebuilding transaction boundaries ([#1620](https://github.com/Miragon/bpmn-modeler/issues/1620)) [sync 9c9ea61] ([e5b29be](https://github.com/Miragon/bpmn-modeler/commit/e5b29be2ddfb14ae7bb09f3d270635f749d0550a))
* **bpmn-modeler:** stop redundant lint runs and overlay rebuilds ([#1606](https://github.com/Miragon/bpmn-modeler/issues/1606)) [sync a506d75] ([33aa226](https://github.com/Miragon/bpmn-modeler/commit/33aa226070d4d756fa5691b33f61df6d88167f7e))
* **bpmn-webview:** apply the configured locale before the first import ([#1617](https://github.com/Miragon/bpmn-modeler/issues/1617)) [sync 63d01ce] ([df3d535](https://github.com/Miragon/bpmn-modeler/commit/df3d5357f21facb22528218e94b7b7438b11ecb8))
* **deps:** dedupe bpmn-js, diagram-js and bpmn-moddle in the lockfile ([#1618](https://github.com/Miragon/bpmn-modeler/issues/1618)) [sync d7bc492] ([d411af5](https://github.com/Miragon/bpmn-modeler/commit/d411af568dbff7634c766768cf17b3ba67925af6))
* **standalone:** bump electron to 42.11.8 for security advisories ([#1615](https://github.com/Miragon/bpmn-modeler/issues/1615)) [sync 84bd712] ([e21650b](https://github.com/Miragon/bpmn-modeler/commit/e21650bf23f6c88d3f376e8751007b1bcfed7d91))
* **standalone:** bump electron-builder to 26.17.0 to restore macos signing ([#1623](https://github.com/Miragon/bpmn-modeler/issues/1623)) [sync 7b65ca5] ([aee60fa](https://github.com/Miragon/bpmn-modeler/commit/aee60faeb7eb739e7f09d0421df367c8f279de9b))
* **standalone:** restore packaged file search with Theia 1.76 ([#1610](https://github.com/Miragon/bpmn-modeler/issues/1610)) [sync 6816f03] ([b77a011](https://github.com/Miragon/bpmn-modeler/commit/b77a011148de042aebac65dd32a3468425b1e850))

## [1.14.2](https://github.com/Miragon/bpmn-modeler/compare/vscode-v1.14.1...vscode-v1.14.2) (2026-09-28)


### 🐞 Bug Fixes

* **bpmn-modeler:** hide lint toolbar during token simulation ([#1601](https://github.com/Miragon/bpmn-modeler/issues/1601)) [sync c6bc75f] ([f2daef3](https://github.com/Miragon/bpmn-modeler/commit/f2daef3a9ba0f667ce58bc62f6c6d75fb4179e34))
* **bpmn-modeler:** keep lint issue list above neighbouring icons ([#1602](https://github.com/Miragon/bpmn-modeler/issues/1602)) [sync c269238] ([59f84d4](https://github.com/Miragon/bpmn-modeler/commit/59f84d4250b193619700ca65ae76ec44c7e2b71d))
* **modeler-bridge:** stop file watchers from freezing the bridge on large repos ([#1588](https://github.com/Miragon/bpmn-modeler/issues/1588)) [sync 328775a] ([073f014](https://github.com/Miragon/bpmn-modeler/commit/073f014452f759b9f71e34cb9a54d99dd063dc03))

## [1.14.1](https://github.com/Miragon/bpmn-modeler/compare/vscode-v1.14.0...vscode-v1.14.1) (2026-09-23)


### 🐞 Bug Fixes

* **dark-mode:** change color in property panel ([#1584](https://github.com/Miragon/bpmn-modeler/issues/1584)) [sync d9bda28] ([6ba2dfe](https://github.com/Miragon/bpmn-modeler/commit/6ba2dfe1dd4ea59bbf015cbe96dbaf503b370481))
* support git in linux standalone app ([#1576](https://github.com/Miragon/bpmn-modeler/issues/1576)) [sync 679668f] ([a3015e1](https://github.com/Miragon/bpmn-modeler/commit/a3015e1bd32d47824c3ddca70cce0a6c3f3d1092))


### 🛠️ Misc

* **deps:** bump the npm-minor-patch group across 1 directory with 26 updates ([#1566](https://github.com/Miragon/bpmn-modeler/issues/1566)) ([1c798c6](https://github.com/Miragon/bpmn-modeler/commit/1c798c6cfc9e98a19d489d1aa65aa930453d5109))
* **deps:** bump the npm-minor-patch group across 1 directory with 9 updates ([#1579](https://github.com/Miragon/bpmn-modeler/issues/1579)) ([bff9451](https://github.com/Miragon/bpmn-modeler/commit/bff945149e4b616a270d0f9685e0d34b1f1f4d78))

## [1.14.0](https://github.com/Miragon/bpmn-modeler/compare/vscode-v1.13.0...vscode-v1.14.0) (2026-09-21)


### 🎉 New Features

* **bpmn-modeler:** fit a sub-process to the viewport on first drilldown ([#1425](https://github.com/Miragon/bpmn-modeler/issues/1425)) [sync 72efe5b] ([fec20ca](https://github.com/Miragon/bpmn-modeler/commit/fec20ca127621548d37dac32f9f537756e4c2923))
* **deployment:** add named deployment targets and endpoint overrides ([#1552](https://github.com/Miragon/bpmn-modeler/issues/1552)) ([77f36e5](https://github.com/Miragon/bpmn-modeler/commit/77f36e5ebfcb7c9e73f9341ff9fce50cc51eee2b))
* **deployment:** create target from entered form data via New ([#1562](https://github.com/Miragon/bpmn-modeler/issues/1562)) [sync 91f6167] ([dd1f42c](https://github.com/Miragon/bpmn-modeler/commit/dd1f42cfd8526ebf6428775695bfcc8137e173c3))
* **dmn-modeler:** support empty (null) inputs in the dmn simulation ([#1568](https://github.com/Miragon/bpmn-modeler/issues/1568)) ([#1569](https://github.com/Miragon/bpmn-modeler/issues/1569)) [sync 11528f7] ([7bef417](https://github.com/Miragon/bpmn-modeler/commit/7bef41757fbba940edc4c50528b185dad6fc812d))


### 🐞 Bug Fixes

* **bpmn-modeler:** translate append menu and element template chooser ([#1547](https://github.com/Miragon/bpmn-modeler/issues/1547)) [sync 63b0493] ([95865ca](https://github.com/Miragon/bpmn-modeler/commit/95865ca280c149adec5ad31972e1a86b0852e7db))
* **editor:** bump bpmnlint to 11.14.0 with bundled superfluous-label ([#1564](https://github.com/Miragon/bpmn-modeler/issues/1564)) [sync e121ad1] ([257135c](https://github.com/Miragon/bpmn-modeler/commit/257135c96563568d3989457d13c9d3e617aba060))


### 🛠️ Misc

* **bpmn-modeler:** close the release-gate blind spots ([#1549](https://github.com/Miragon/bpmn-modeler/issues/1549)) ([90a07d5](https://github.com/Miragon/bpmn-modeler/commit/90a07d598f7fabeb04dcb1ca3fde8774dbfb9c68))
* **deps:** bump properties-panel, vite and archunit ([#1560](https://github.com/Miragon/bpmn-modeler/issues/1560)) ([e43a387](https://github.com/Miragon/bpmn-modeler/commit/e43a387ed71c18fa34821ae68bfb76725a9066d5))
* **deps:** bump the npm-major group across 1 directory with 5 updates ([#1527](https://github.com/Miragon/bpmn-modeler/issues/1527)) ([165049f](https://github.com/Miragon/bpmn-modeler/commit/165049f757243bad1e4e98fab16f90132c798048))

## [1.13.0](https://github.com/Miragon/bpmn-modeler/compare/vscode-v1.12.0...vscode-v1.13.0) (2026-09-14)


### 🎉 New Features

* **bpmn-modeler:** stamp execution platform on engine-bound newDiagram ([#1536](https://github.com/Miragon/bpmn-modeler/issues/1536)) [sync e742f59] ([7418949](https://github.com/Miragon/bpmn-modeler/commit/74189491726340cf1cf110e1b85c6ca1331b2a2b))


### 🐞 Bug Fixes

* **bpmn-modeler:** keep panel-host flex layout under the diagram shell ([#1541](https://github.com/Miragon/bpmn-modeler/issues/1541)) [sync 69391c5] ([b2cce93](https://github.com/Miragon/bpmn-modeler/commit/b2cce934ce8213b9708caea64ec1f7c7caf4facf))

## [1.12.0](https://github.com/Miragon/bpmn-modeler/compare/vscode-v1.11.0...vscode-v1.12.0) (2026-09-13)


### 🎉 New Features

* **bpmn-modeler:** add capabilities.modelNavigation on /design ([#1457](https://github.com/Miragon/bpmn-modeler/issues/1457)) [sync ca82ae1] ([47cb2a9](https://github.com/Miragon/bpmn-modeler/commit/47cb2a9b80fcdd21b678333ff1a6a65c34659f73))
* **bpmn-modeler:** add capabilities.modelNavigation on /viewer ([#1458](https://github.com/Miragon/bpmn-modeler/issues/1458)) [sync fe59e3c] ([9c7ddf4](https://github.com/Miragon/bpmn-modeler/commit/9c7ddf4f2d55bb851cf73f97c800fe4d573c4815))
* **bpmn-modeler:** add engine-neutral createDesigner() on /design subpath ([#1437](https://github.com/Miragon/bpmn-modeler/issues/1437)) [sync 7a43774] ([c144a7f](https://github.com/Miragon/bpmn-modeler/commit/c144a7f6bd0c14f0038bd86ee3d8275a4608d61b))
* **bpmn-modeler:** add engine-neutral properties-panel lib with mode filter ([#1451](https://github.com/Miragon/bpmn-modeler/issues/1451)) [sync 860badb] ([cca21d7](https://github.com/Miragon/bpmn-modeler/commit/cca21d7369134fe5f56339272528176d77680b1c))
* **bpmn-modeler:** add opt-in readonly properties panel on /viewer ([#1455](https://github.com/Miragon/bpmn-modeler/issues/1455)) [sync fc045c0] ([13ffbcc](https://github.com/Miragon/bpmn-modeler/commit/13ffbcca9be16b9b5552b9e90c4367feaa5c2e1d))
* **bpmn-modeler:** add public view-state capture/restore on all handles ([#1450](https://github.com/Miragon/bpmn-modeler/issues/1450)) [sync fb1f042] ([f693325](https://github.com/Miragon/bpmn-modeler/commit/f6933253d83fb73e3bd925b9d1ff91885c18e911))
* **bpmn-modeler:** add runtime design/implement mode on createModeler ([#1452](https://github.com/Miragon/bpmn-modeler/issues/1452)) [sync 786a045] ([f6e6d2c](https://github.com/Miragon/bpmn-modeler/commit/f6e6d2cfd39c24a7793ea0397375c9fef70e503b))
* **bpmn-modeler:** add view/design/implement session on /mode subpath ([#1469](https://github.com/Miragon/bpmn-modeler/issues/1469)) ([ddc666f](https://github.com/Miragon/bpmn-modeler/commit/ddc666f2be8cc63cf0757dbdb56814a97d80585c))
* **bpmn-modeler:** mode-invariant minimap, token simulation and focus reticle ([#1471](https://github.com/Miragon/bpmn-modeler/issues/1471)) [sync 6b20f9a] ([75ff878](https://github.com/Miragon/bpmn-modeler/commit/75ff87854ee292811b3099cfee4f9d069958b603))
* **bpmn-modeler:** opt-in linting on /design and per-mode lint configs ([#1472](https://github.com/Miragon/bpmn-modeler/issues/1472)) [sync 5141b8a] ([84fd907](https://github.com/Miragon/bpmn-modeler/commit/84fd9078b7ffd1ac7d22977f12fb18a3682f2391))
* **bpmn-webview:** add view/design/implement mode switch to the hosts ([#1468](https://github.com/Miragon/bpmn-modeler/issues/1468)) ([46a0d58](https://github.com/Miragon/bpmn-modeler/commit/46a0d58a7ade3a77da273b7a8356bd2f39a867ec))
* **demo-webapp:** consume @miragon/dmn-modeler on the dmn page ([#1483](https://github.com/Miragon/bpmn-modeler/issues/1483)) [sync b4c06a3] ([bd62532](https://github.com/Miragon/bpmn-modeler/commit/bd625322225168d4a7fad4e2c5318dfeaa803717))
* **dmn-modeler:** container-scoped theming via data-dmn-theme ([#1475](https://github.com/Miragon/bpmn-modeler/issues/1475)) ([e2eb4b8](https://github.com/Miragon/bpmn-modeler/commit/e2eb4b89287ad4ef91c4918a0221f471f5c6d721))
* **dmn-modeler:** translate the dmn-js ui ([#1480](https://github.com/Miragon/bpmn-modeler/issues/1480)) ([4cf70dd](https://github.com/Miragon/bpmn-modeler/commit/4cf70ddd12974083c377c92b0f0bc44c33708adf))
* **dmn-webview:** extract the host-free dmn modeler into @miragon/dmn-modeler ([#1474](https://github.com/Miragon/bpmn-modeler/issues/1474)) [sync 383a949] ([463e1c7](https://github.com/Miragon/bpmn-modeler/commit/463e1c72a4b90bd44689a1848100a05e6560a9e4))
* format diagram ([#1482](https://github.com/Miragon/bpmn-modeler/issues/1482)) ([e724883](https://github.com/Miragon/bpmn-modeler/commit/e724883f10d2758fdf7f74415bcbdec7fa59c335))
* **properties-panel:** vendor upstream element-type header icons ([#1512](https://github.com/Miragon/bpmn-modeler/issues/1512)) [sync 9e33736] ([1914104](https://github.com/Miragon/bpmn-modeler/commit/191410473953948cf715d3537a3b27e88b372c80))


### 🐞 Bug Fixes

* **append-menu:** honor the bpmn type chosen for a multi-type template ([#1517](https://github.com/Miragon/bpmn-modeler/issues/1517)) [sync 9e63dff] ([86bf226](https://github.com/Miragon/bpmn-modeler/commit/86bf226554dbbb18bab0d600f5151f7c98430d0d))
* **bpmn-modeler:** destroy partially initialised surfaces when a factory fails ([#1522](https://github.com/Miragon/bpmn-modeler/issues/1522)) ([9ac9031](https://github.com/Miragon/bpmn-modeler/commit/9ac90313fcafe2c1ca8657bc4ad4d258d8c6a40a))
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
* **modeler-types:** detect engine from the definitions root attributes ([#1524](https://github.com/Miragon/bpmn-modeler/issues/1524)) [sync f67a332] ([2a379d3](https://github.com/Miragon/bpmn-modeler/commit/2a379d3e0ad6317b9969f7a40193cb76d8943938))
* **vscode-plugin:** edit and save documents on any writable file system, not only file: ([#1519](https://github.com/Miragon/bpmn-modeler/issues/1519)) ([c2aa225](https://github.com/Miragon/bpmn-modeler/commit/c2aa225c56d2287b299ea7d1fdb53551be7beeb0))


### 🛠️ Misc

* **deps:** update dependencies and resolve critical vulnerabilities ([#1531](https://github.com/Miragon/bpmn-modeler/issues/1531)) ([6f4ac58](https://github.com/Miragon/bpmn-modeler/commit/6f4ac58b6d2f5b04fe520e169d8763971fa30967))

## [1.11.0](https://github.com/Miragon/bpmn-modeler/compare/vscode-v1.10.0...vscode-v1.11.0) (2026-09-02)


### 🎉 New Features

* **bpmn-modeler:** add readonly createViewer() on /viewer subpath ([#1433](https://github.com/Miragon/bpmn-modeler/issues/1433)) [sync 03d6c6b] ([f36fcda](https://github.com/Miragon/bpmn-modeler/commit/f36fcda5bc63bcb5673de6ed1f270ef90b9f8830))
* **bpmn-modeler:** theme per instance via data-bpmn-theme attribute ([#1429](https://github.com/Miragon/bpmn-modeler/issues/1429)) ([35011ef](https://github.com/Miragon/bpmn-modeler/commit/35011ef81df19b5cdef29eef2835f6acbe1086ea))
* **bpmn-webview:** add a public diff api to @miragon/bpmn-modeler ([#1396](https://github.com/Miragon/bpmn-modeler/issues/1396)) ([473f813](https://github.com/Miragon/bpmn-modeler/commit/473f8137418b9d608c1a099334280fc6051356de))
* **bpmn-webview:** add linting tiers with lazy in-page bpmnlint ([#1385](https://github.com/Miragon/bpmn-modeler/issues/1385)) ([903d074](https://github.com/Miragon/bpmn-modeler/commit/903d074d6721f77bf6bd8be85b905bd8d19a69bf))
* **bpmn-webview:** extract the host-free modeler into @miragon/bpmn-modeler ([#1393](https://github.com/Miragon/bpmn-modeler/issues/1393)) ([e8f9c0e](https://github.com/Miragon/bpmn-modeler/commit/e8f9c0e1caeeffbacd833ed94cf68d91c2b9f185))
* **editor:** move the default lint path in-page for hosted sessions ([#1389](https://github.com/Miragon/bpmn-modeler/issues/1389)) ([baf506a](https://github.com/Miragon/bpmn-modeler/commit/baf506acc657f9e24fa0bf0e45072edb6d8a1a8b))
* **editor:** run workspace .bpmnlintrc in-page, escalate on unresolved rules ([#1391](https://github.com/Miragon/bpmn-modeler/issues/1391)) ([2e547cf](https://github.com/Miragon/bpmn-modeler/commit/2e547cfb084899d2ef99738c8d3252c77a8a4483))
* **form-editor:** display form input and output values ([#1432](https://github.com/Miragon/bpmn-modeler/issues/1432)) ([92a1cb6](https://github.com/Miragon/bpmn-modeler/commit/92a1cb658e7a1c7aecbc1f11adf35a2b48f77947))
* form-io editor ([#1363](https://github.com/Miragon/bpmn-modeler/issues/1363)) ([9c079e0](https://github.com/Miragon/bpmn-modeler/commit/9c079e0d980aa94b93d907083db5d92a06c3f822))


### 🐞 Bug Fixes

* **dmn-webview:** theme the simulation controls for dark mode ([#1434](https://github.com/Miragon/bpmn-modeler/issues/1434)) [sync c7ad290] ([ba8a783](https://github.com/Miragon/bpmn-modeler/commit/ba8a7839e96ff832aeb0eff60fdba22f539b7b02))
* sync bundled sources (8c8014e) ([44c2d33](https://github.com/Miragon/bpmn-modeler/commit/44c2d33724b72438edbc0660a93aa5606ee65d77))


### 🔨 Refactoring

* **bpmn-webview:** replace vsCodeBridge with per-feature capability ports ([#1380](https://github.com/Miragon/bpmn-modeler/issues/1380)) ([3141f94](https://github.com/Miragon/bpmn-modeler/commit/3141f94a393a72cd4aa5ee521fbe1c1c27ddcaf8))
* **shared:** split public modeler types from the host protocol ([#1381](https://github.com/Miragon/bpmn-modeler/issues/1381)) ([6c64396](https://github.com/Miragon/bpmn-modeler/commit/6c6439609fc191946254a752a0503db028d0df31))


### 📔 Documentation

* **bpmn-modeler:** clean up extraction-era comments ([#1400](https://github.com/Miragon/bpmn-modeler/issues/1400)) ([a8db080](https://github.com/Miragon/bpmn-modeler/commit/a8db0805c8744f522de9e9bb020dec0f6a39a5fb))


### 🛠️ Misc

* **deps:** bump the npm-minor-patch group across 1 directory with 29 updates ([#1414](https://github.com/Miragon/bpmn-modeler/issues/1414)) ([2dd39d3](https://github.com/Miragon/bpmn-modeler/commit/2dd39d3e9d590a51a4ce1572d22523f82548cf0d))
* **release:** make bpmn-modeler the root release component ([#1431](https://github.com/Miragon/bpmn-modeler/issues/1431)) ([719127d](https://github.com/Miragon/bpmn-modeler/commit/719127d2798e993b90e490b8f03bafea18968678))

## [1.10.0](https://github.com/Miragon/bpmn-modeler/compare/vscode-v1.9.0...vscode-v1.10.0) (2026-08-25)


### 🎉 New Features

* **bpmn-webview:** navigate diagrams with tab/shift+tab along flows ([#1362](https://github.com/Miragon/bpmn-modeler/issues/1362)) ([2ea565c](https://github.com/Miragon/bpmn-modeler/commit/2ea565ccd354531b4e79f6bf2369cea6217deb52))
* standalone app open editors on a second screen ([#1346](https://github.com/Miragon/bpmn-modeler/issues/1346)) ([c9a21d1](https://github.com/Miragon/bpmn-modeler/commit/c9a21d1c81d8caf9e86445567a02ff5345e41a17))


### 🐞 Bug Fixes

* **ci:** focus renamed i18n-extras/core workspaces in publish jobs ([#1359](https://github.com/Miragon/bpmn-modeler/issues/1359)) ([c742eec](https://github.com/Miragon/bpmn-modeler/commit/c742eec52a72d0659167a72002a6b1f3d82fa737))


### 🛠️ Misc

* **main:** release intellij 1.7.1 ([#1340](https://github.com/Miragon/bpmn-modeler/issues/1340)) ([a853296](https://github.com/Miragon/bpmn-modeler/commit/a853296a9da28c22ffd72b0944c5b70d619f4bc1))

## [1.9.0](https://github.com/Miragon/bpmn-modeler/compare/vscode-v1.8.0...vscode-v1.9.0) (2026-08-22)


### 🎉 New Features

* **bpmn-webview:** persist drill-down plane across tab switches and re-imports ([#1352](https://github.com/Miragon/bpmn-modeler/issues/1352)) ([df1fa2e](https://github.com/Miragon/bpmn-modeler/commit/df1fa2ea3e86eb9fdee135bb24f945151847a474))
* **editor:** let users turn BPMN linting off ([#1358](https://github.com/Miragon/bpmn-modeler/issues/1358)) ([2a66c5f](https://github.com/Miragon/bpmn-modeler/commit/2a66c5ff89b12799365f1d74fa947b497d65407f))
* **i18n:** consume shared @miragon/bpmn-modeler-i18n, shrink local overlay ([#1348](https://github.com/Miragon/bpmn-modeler/issues/1348)) ([9b3b847](https://github.com/Miragon/bpmn-modeler/commit/9b3b847799276f1a229f904d5c0e7179530e6018))
* **infrastructure:** source bpmnlint rules from @miragon/bpmnlint-plugin-rules ([#1344](https://github.com/Miragon/bpmn-modeler/issues/1344)) ([380ea88](https://github.com/Miragon/bpmn-modeler/commit/380ea8827c0e327d93e35c92542c5cb3c121f372))


### 🐞 Bug Fixes

* **bpmn-webview:** keep zoom stable across VS Code tab switches ([#1353](https://github.com/Miragon/bpmn-modeler/issues/1353)) ([a91c5cd](https://github.com/Miragon/bpmn-modeler/commit/a91c5cd6085cac323c3ed4ea4c246f3fcdb869e8))
* **bpmn-webview:** make optional-FEEL inputs legible in dark mode ([#1350](https://github.com/Miragon/bpmn-modeler/issues/1350)) ([83c72ce](https://github.com/Miragon/bpmn-modeler/commit/83c72cecdfc9601d5dad6ca2f30e56ee2e4bf9e2))
* **diff:** opt the BPMN editor into VS Code diff resolution ([#1349](https://github.com/Miragon/bpmn-modeler/issues/1349)) ([de74772](https://github.com/Miragon/bpmn-modeler/commit/de74772a150be43baaec8532595d17a8db2ed1f1))


### 🛠️ Misc

* **deps:** bump @miragon/bpmnlint-plugin-rules to 0.10.0 ([#1356](https://github.com/Miragon/bpmn-modeler/issues/1356)) ([e76f823](https://github.com/Miragon/bpmn-modeler/commit/e76f823c3986af654325ef81b767c677cf02a277))

## [1.8.0](https://github.com/Miragon/bpmn-modeler/compare/vscode-v1.7.0...vscode-v1.8.0) (2026-08-20)


### 🎉 New Features

* **bpmn:** enable uniform standard-size lint rule in the miragon layer ([#1335](https://github.com/Miragon/bpmn-modeler/issues/1335)) ([2ca96c7](https://github.com/Miragon/bpmn-modeler/commit/2ca96c7ce74992460dbd49c16812d994baff932b))
* **bpmn:** lint diagrams by default, per execution platform ([#1334](https://github.com/Miragon/bpmn-modeler/issues/1334)) ([a729fd5](https://github.com/Miragon/bpmn-modeler/commit/a729fd5acb4cb499ebdcffc0bfc05ecaca646234))
* **vscode-plugin:** focus a BPMN lint finding's element on the canvas ([#1339](https://github.com/Miragon/bpmn-modeler/issues/1339)) ([cebe5c6](https://github.com/Miragon/bpmn-modeler/commit/cebe5c6adfd550df5de412fd6c514e21cde3f1ec))


### 🐞 Bug Fixes

* **bpmn-webview:** render diagrams when the canvas mounts at zero size ([#1338](https://github.com/Miragon/bpmn-modeler/issues/1338)) ([3642a8f](https://github.com/Miragon/bpmn-modeler/commit/3642a8fdfb7514e899fac7c2a2b8f7285f628ab1))
* **service:** skip element-template load for disposed editors ([#1315](https://github.com/Miragon/bpmn-modeler/issues/1315)) ([e51b3a6](https://github.com/Miragon/bpmn-modeler/commit/e51b3a625b5f853c64e5a95aafdedd886d8587e6))
* standalone toggle standard texteditor ([#1323](https://github.com/Miragon/bpmn-modeler/issues/1323)) ([7226b49](https://github.com/Miragon/bpmn-modeler/commit/7226b498271cf9fe30d66b95509c133c86c5df7e))


### 🔨 Refactoring

* **shared:** centralize engine label and execution-platform mappings ([#1329](https://github.com/Miragon/bpmn-modeler/issues/1329)) ([b0caba2](https://github.com/Miragon/bpmn-modeler/commit/b0caba2c2345283fd0b27a6f4d769b0fc8eafb66))


### 📔 Documentation

* condense comment-style guidance to favor clean code ([#1337](https://github.com/Miragon/bpmn-modeler/issues/1337)) ([060fe48](https://github.com/Miragon/bpmn-modeler/commit/060fe488837179dbd3f428655e0fd607db319ba0))


### 🛠️ Misc

* **deps:** bump the github-actions-all group with 2 updates ([#1325](https://github.com/Miragon/bpmn-modeler/issues/1325)) ([e5dc84e](https://github.com/Miragon/bpmn-modeler/commit/e5dc84e8731d02f632756d466b9a353284b90414))
* **deps:** bump the npm-major group across 1 directory with 8 updates ([#1314](https://github.com/Miragon/bpmn-modeler/issues/1314)) ([dcf42b9](https://github.com/Miragon/bpmn-modeler/commit/dcf42b9cfa3cbc4160720a7fdee90f9f801bc05c))
* **main:** release intellij 1.7.0 ([#1312](https://github.com/Miragon/bpmn-modeler/issues/1312)) ([dd6f22f](https://github.com/Miragon/bpmn-modeler/commit/dd6f22fe2d590e00c8d327e0aecd4629bd426a63))
* **release:** gate release publishing behind a single approval ([#1317](https://github.com/Miragon/bpmn-modeler/issues/1317)) ([c2ff14e](https://github.com/Miragon/bpmn-modeler/commit/c2ff14e07635fc37955c895434787c19ad33012f))

## [1.7.0](https://github.com/Miragon/bpmn-modeler/compare/vscode-v1.6.1...vscode-v1.7.0) (2026-08-13)


### 🎉 New Features

* support custom bpmnlint ([#1308](https://github.com/Miragon/bpmn-modeler/issues/1308)) ([ed54f73](https://github.com/Miragon/bpmn-modeler/commit/ed54f7364bf101c72b2eec7934df6e97557680b1))


### 🐞 Bug Fixes

* [#1300](https://github.com/Miragon/bpmn-modeler/issues/1300) color theme resets ([#1301](https://github.com/Miragon/bpmn-modeler/issues/1301)) ([062c3f8](https://github.com/Miragon/bpmn-modeler/commit/062c3f85b90e95235a4b61ac8c8164f0bd5c356f))


### 🛠️ Misc

* **ci:** scope build push trigger to main ([#1310](https://github.com/Miragon/bpmn-modeler/issues/1310)) ([aaa6f18](https://github.com/Miragon/bpmn-modeler/commit/aaa6f186f8ea1e242b47062349fcf40b5c4168c4))
* **deps:** bump @emaarco/dmn-js-simulation to 0.2.0 ([#1303](https://github.com/Miragon/bpmn-modeler/issues/1303)) ([d61e260](https://github.com/Miragon/bpmn-modeler/commit/d61e2605443eca8f77374baa7d6f8dec832664d2))
* **deps:** bump the github-actions-all group across 1 directory with 4 updates ([#1305](https://github.com/Miragon/bpmn-modeler/issues/1305)) ([6553e61](https://github.com/Miragon/bpmn-modeler/commit/6553e618c9a8de8d39f1dc8968ad05c697d36cba))
* **deps:** bump the github-actions-all group with 3 updates ([#1298](https://github.com/Miragon/bpmn-modeler/issues/1298)) ([d6357e3](https://github.com/Miragon/bpmn-modeler/commit/d6357e374f7a25709f574f4f804fc1fc879a0856))
* **repo:** add knip unused-code guardrail ([#1311](https://github.com/Miragon/bpmn-modeler/issues/1311)) ([1b35a62](https://github.com/Miragon/bpmn-modeler/commit/1b35a623889a1b90b78b04efe4b86e02ff99879e))

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
