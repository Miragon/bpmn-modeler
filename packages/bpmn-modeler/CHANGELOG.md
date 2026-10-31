# Changelog

## [1.4.0](https://github.com/Miragon/bpmn-modeler/compare/bpmn-modeler-v1.3.0...bpmn-modeler-v1.4.0) (2026-10-31)


### 🎉 New Features

* **append-menu:** show element descriptions and match search keywords ([#1761](https://github.com/Miragon/bpmn-modeler/issues/1761)) ([7c7a424](https://github.com/Miragon/bpmn-modeler/commit/7c7a424c39e4eebadd217734589b8deaff5a2725))
* **bpmn-modeler:** publish command-stack and format subscriptions ([#2042](https://github.com/Miragon/bpmn-modeler/issues/2042)) ([d86ef79](https://github.com/Miragon/bpmn-modeler/commit/d86ef793f230394821a38633e691502791007aba))
* **bpmn-modeler:** replace camunda-bpmn-js popup-menu features with our own ([#1777](https://github.com/Miragon/bpmn-modeler/issues/1777)) ([2adc83c](https://github.com/Miragon/bpmn-modeler/commit/2adc83c2e699cf8d28381235887ebebe355efd1d))
* **bpmn-modeler:** translate popup-menu search keywords ([#1781](https://github.com/Miragon/bpmn-modeler/issues/1781)) ([cae0009](https://github.com/Miragon/bpmn-modeler/commit/cae000979c1e85521890089f0d2e286f789d5bcb))
* **bpmn-modeler:** update favourite elements on a live surface ([#1743](https://github.com/Miragon/bpmn-modeler/issues/1743)) ([f1103b1](https://github.com/Miragon/bpmn-modeler/commit/f1103b1d765d172ebd7ba54093518dfdfd4bfd39))


### 🐞 Bug Fixes

* **append-menu:** map palette entries to bpmn types through a catalog ([#1723](https://github.com/Miragon/bpmn-modeler/issues/1723)) ([2e0509f](https://github.com/Miragon/bpmn-modeler/commit/2e0509f30f070414037f31f7f0bfc2e10043c8a3))
* **append-menu:** prefer the most specific type for a translated pick ([#1702](https://github.com/Miragon/bpmn-modeler/issues/1702)) ([2e0509f](https://github.com/Miragon/bpmn-modeler/commit/2e0509f30f070414037f31f7f0bfc2e10043c8a3))
* **bpmn-clipboard:** keep text field copies from carrying stale elements ([#1696](https://github.com/Miragon/bpmn-modeler/issues/1696)) ([c5943c5](https://github.com/Miragon/bpmn-modeler/commit/c5943c540ed1d50c4b8b8305f1d22b850915ab5e))
* **bpmn-diff:** step to boundary events next to their host activity ([#1749](https://github.com/Miragon/bpmn-modeler/issues/1749)) ([0003cbb](https://github.com/Miragon/bpmn-modeler/commit/0003cbbed4b7ddde14696b2b5c569095a977a3c1))
* **bpmn-diff:** walk an embedded sub-process when the stepper reaches it ([#1748](https://github.com/Miragon/bpmn-modeler/issues/1748)) ([12c5e02](https://github.com/Miragon/bpmn-modeler/commit/12c5e026f72db97d8e49c52eef057629d2490474))
* **bpmn-modeler:** arm the initial viewport fit on modeler imports ([#1741](https://github.com/Miragon/bpmn-modeler/issues/1741)) ([18ef8a6](https://github.com/Miragon/bpmn-modeler/commit/18ef8a6de5493bd87521176229e28df5b3b2de23))
* **bpmn-modeler:** export CleanupStatus from the root entry and /design ([#2061](https://github.com/Miragon/bpmn-modeler/issues/2061)) ([8e3efca](https://github.com/Miragon/bpmn-modeler/commit/8e3efca7a6a46016ba14e3e523580427412b86d0))
* **bpmn-modeler:** export the layout outcome types from /design ([#2045](https://github.com/Miragon/bpmn-modeler/issues/2045)) ([76e2ea6](https://github.com/Miragon/bpmn-modeler/commit/76e2ea6022da080d61bc2e9ddb6d3e427a5f5e9e))
* **bpmn-modeler:** flush panel input on save and read the bound engine ([#2064](https://github.com/Miragon/bpmn-modeler/issues/2064)) ([33c466b](https://github.com/Miragon/bpmn-modeler/commit/33c466be90e40c05cffd9449e498fbb71ffd1633))
* **bpmn-modeler:** import plugin css at the pinned versions ([#1675](https://github.com/Miragon/bpmn-modeler/issues/1675)) ([b0c2e84](https://github.com/Miragon/bpmn-modeler/commit/b0c2e84c991e86100d9f81b3044f93dbc1cc380e))
* **bpmn-modeler:** keep theme in step across destroy and mode switches ([#1734](https://github.com/Miragon/bpmn-modeler/issues/1734)) ([6fb3ba9](https://github.com/Miragon/bpmn-modeler/commit/6fb3ba91f490f0c7e065cdf63d585a2d7d7971bd))
* **bpmn-modeler:** readable popup-menu highlight and search in dark theme ([#1779](https://github.com/Miragon/bpmn-modeler/issues/1779)) ([ca854b4](https://github.com/Miragon/bpmn-modeler/commit/ca854b445681ef05ecabcc90cc7dbcda704a2633))
* **bpmn-modeler:** route ignored lint push warnings through onWarning ([#1735](https://github.com/Miragon/bpmn-modeler/issues/1735)) ([f315dab](https://github.com/Miragon/bpmn-modeler/commit/f315dabaab1e20b1928cd5e4e6255b44017ca54c))
* **element-template-chooser:** show "1 property" for a single template property ([#1794](https://github.com/Miragon/bpmn-modeler/issues/1794)) ([abfa4ee](https://github.com/Miragon/bpmn-modeler/commit/abfa4eeca4487745b62d94fc1badc8d3ba8e4d41))
* **element-template-chooser:** show only the type field as task type ([#1701](https://github.com/Miragon/bpmn-modeler/issues/1701)) ([f4be0c6](https://github.com/Miragon/bpmn-modeler/commit/f4be0c6bbe3d72a82650bc08a9d7841337d40c45))
* **i18n:** offer every shipped language in the language settings ([#2006](https://github.com/Miragon/bpmn-modeler/issues/2006)) ([bf9de92](https://github.com/Miragon/bpmn-modeler/commit/bf9de9200c062a70c666d9acc603ca1861fcebc0))
* **inline-scripting:** close script tabs whose task changed while hidden ([#1737](https://github.com/Miragon/bpmn-modeler/issues/1737)) ([81f43e4](https://github.com/Miragon/bpmn-modeler/commit/81f43e47633ec19d18b9bb8ee98a7a0a77bbe581))
* **inline-scripting:** read a script task's format from the attribute the format write targets ([#1838](https://github.com/Miragon/bpmn-modeler/issues/1838)) ([fa79f03](https://github.com/Miragon/bpmn-modeler/commit/fa79f03a853f6ca57906e95cdbd312897e1eb2f4))
* **inline-scripting:** skip script writes to morphed script tasks ([#1703](https://github.com/Miragon/bpmn-modeler/issues/1703)) ([781a2f6](https://github.com/Miragon/bpmn-modeler/commit/781a2f69a539029b20be5d5d2056a2443ecce135))
* **modeler-bridge:** log handler error stacks and show thrown strings ([#1993](https://github.com/Miragon/bpmn-modeler/issues/1993)) ([46cd894](https://github.com/Miragon/bpmn-modeler/commit/46cd894aaaac4f1791d9b8fe5fade82414fb21d4))
* **modeler-core:** read the executable process id under any bpmn prefix ([#1949](https://github.com/Miragon/bpmn-modeler/issues/1949)) ([db53e2e](https://github.com/Miragon/bpmn-modeler/commit/db53e2e78cfef7c47375c7f7dd53a545569dfee9))
* **modeler-core:** skip host script write-back to morphed script tasks ([#1726](https://github.com/Miragon/bpmn-modeler/issues/1726)) ([3c36f22](https://github.com/Miragon/bpmn-modeler/commit/3c36f22e384f9677daa7ecf56b8a096a4177d1fe))
* **modeler-core:** stop migration from stamping duplicate execution-platform attributes ([#1862](https://github.com/Miragon/bpmn-modeler/issues/1862)) ([18c157a](https://github.com/Miragon/bpmn-modeler/commit/18c157a46906822c2ab09df5be27926ee9a8fb4f))
* **modeler-types:** log import warning messages instead of [object Object] ([#1697](https://github.com/Miragon/bpmn-modeler/issues/1697)) ([3929e10](https://github.com/Miragon/bpmn-modeler/commit/3929e10a354e1dd5fe0505562275015792962cf6))
* **modeler-types:** scan xml comments and cdata in document order ([#1970](https://github.com/Miragon/bpmn-modeler/issues/1970)) ([249398c](https://github.com/Miragon/bpmn-modeler/commit/249398cc17d5102ad57844538ad28fda2b0f6c09))


### 🔨 Refactoring

* **bpmn-modeler:** compose c7/c8 modelers on bpmn-js/lib/Modeler ([#1676](https://github.com/Miragon/bpmn-modeler/issues/1676)) ([ab57dd9](https://github.com/Miragon/bpmn-modeler/commit/ab57dd9172f37fa20c349adbf06c87372d71df75))
* **bpmn-modeler:** drop unreachable export and favourites branches ([#1738](https://github.com/Miragon/bpmn-modeler/issues/1738)) ([1983573](https://github.com/Miragon/bpmn-modeler/commit/1983573b33b7ea6b3b73c9f01072d912104d0fb8))
* **bpmn-modeler:** run the lint tier through a pure reducer ([#1904](https://github.com/Miragon/bpmn-modeler/issues/1904)) ([45f6b0e](https://github.com/Miragon/bpmn-modeler/commit/45f6b0eb3fdd26788d44a36c59514877e6c60766))
* **bpmn-modeler:** share surface plumbing across the facades ([#1753](https://github.com/Miragon/bpmn-modeler/issues/1753)) ([f28c022](https://github.com/Miragon/bpmn-modeler/commit/f28c022d891d29e9ecfb291c87e4f03106f6daf0))
* break the import cycles in four workspaces ([#2082](https://github.com/Miragon/bpmn-modeler/issues/2082)) ([1277d20](https://github.com/Miragon/bpmn-modeler/commit/1277d2008f6feb541686ec049651e6ef657de2eb))
* deepen webview session, document sync, protocol and view state ([#1764](https://github.com/Miragon/bpmn-modeler/issues/1764)) ([c6a8407](https://github.com/Miragon/bpmn-modeler/commit/c6a840742cc14b60724e064de8ef353202955c65))
* **modeler-core:** add an in-memory host kit and move specs onto it ([#1773](https://github.com/Miragon/bpmn-modeler/issues/1773)) ([347c937](https://github.com/Miragon/bpmn-modeler/commit/347c9379c1bbea6bc36bf48c2f93d3aa62de6e0b))
* **modeler-core:** move the shared vocabulary into kernel/ ([#1920](https://github.com/Miragon/bpmn-modeler/issues/1920)) ([67fa3d8](https://github.com/Miragon/bpmn-modeler/commit/67fa3d8329e6530cf146dce6cf5d1e437574afe3))
* **modeler-core:** share document sync and surface lifecycles ([#1776](https://github.com/Miragon/bpmn-modeler/issues/1776)) ([f4c099f](https://github.com/Miragon/bpmn-modeler/commit/f4c099fbeef9c8ab0bc09338ad959569bf55614f))
* **modeler-types:** address script surfaces from one table ([#1965](https://github.com/Miragon/bpmn-modeler/issues/1965)) ([9fc28c6](https://github.com/Miragon/bpmn-modeler/commit/9fc28c6d0007c2e37bc34ac31970dd29fb0408cc))
* **modeler-types:** give ReferenceKind one home ([#1966](https://github.com/Miragon/bpmn-modeler/issues/1966)) ([f887739](https://github.com/Miragon/bpmn-modeler/commit/f887739f996c741a8a517a03fa76b35d1dff951e))
* **modeler-types:** move process variables out of the protocol ([#2005](https://github.com/Miragon/bpmn-modeler/issues/2005)) ([3c7f693](https://github.com/Miragon/bpmn-modeler/commit/3c7f6931faddb0cb9f71d5d5cdec995e81d66591))


### 📔 Documentation

* **bpmn-modeler:** document post-destroy throws and lint no-throw scope ([#1736](https://github.com/Miragon/bpmn-modeler/issues/1736)) ([622cfd2](https://github.com/Miragon/bpmn-modeler/commit/622cfd2a070e206d2045553868677e588b1ddf94))
* **bpmn-modeler:** document yarn berry resolutions for upstream carets ([#1782](https://github.com/Miragon/bpmn-modeler/issues/1782)) ([0246c4d](https://github.com/Miragon/bpmn-modeler/commit/0246c4d2595866a8cb86197ab3ad5e405295267e))
* **bpmn-modeler:** say that subscribing after destroy throws ([#2048](https://github.com/Miragon/bpmn-modeler/issues/2048)) ([8c5109b](https://github.com/Miragon/bpmn-modeler/commit/8c5109ba0100732c71166301962545f66667d837))
* **modeler-core:** fix references after the kernel and editorSession split ([#1933](https://github.com/Miragon/bpmn-modeler/issues/1933)) ([8c809e9](https://github.com/Miragon/bpmn-modeler/commit/8c809e93bdf98b85b3c3f22007c9e0e1d92ab0c6))
* **readme:** replace the preview image with a demo gif ([#1756](https://github.com/Miragon/bpmn-modeler/issues/1756)) ([c9a0ba9](https://github.com/Miragon/bpmn-modeler/commit/c9a0ba9fad38144af0b6e7484deec3205eec8fcd))
* rework the docs site into a compact, picture-led manual ([#1715](https://github.com/Miragon/bpmn-modeler/issues/1715)) ([22f4d0d](https://github.com/Miragon/bpmn-modeler/commit/22f4d0da7864e182f54de0013cfd8b2c524ca059))


### 🛠️ Misc

* **agents:** add a test-first skill and let Claude Code read AGENTS.md directly ([#1837](https://github.com/Miragon/bpmn-modeler/issues/1837)) ([9d1697c](https://github.com/Miragon/bpmn-modeler/commit/9d1697cc9ba918ccc1d6befe019f6cf36b0fd4c4))
* **append-menu:** cover the append menu and element template chooser ([#1693](https://github.com/Miragon/bpmn-modeler/issues/1693)) ([e13eae7](https://github.com/Miragon/bpmn-modeler/commit/e13eae781de9c0759c0bd935fbe9d86091e78fd3))
* **architecture-testing:** add the engine and run the core spec on it ([#2083](https://github.com/Miragon/bpmn-modeler/issues/2083)) ([fcd2ad6](https://github.com/Miragon/bpmn-modeler/commit/fcd2ad6729c569a09d6cae5154a880c79f260178))
* **architecture-testing:** run the modeler package specs on the engine ([#2085](https://github.com/Miragon/bpmn-modeler/issues/2085)) ([286c9e0](https://github.com/Miragon/bpmn-modeler/commit/286c9e0302f5068bb1bb0e1eed7b02f8236aca02))
* **bpmn-modeler:** cover modeler and designer surfaces and the mode switch ([#1695](https://github.com/Miragon/bpmn-modeler/issues/1695)) ([3ccbfa7](https://github.com/Miragon/bpmn-modeler/commit/3ccbfa7d01ec64bb2bd58d1b3b14a548052b92be))
* **bpmn-modeler:** pin append-menu clamping and panel undo re-renders ([#1879](https://github.com/Miragon/bpmn-modeler/issues/1879)) ([41995d5](https://github.com/Miragon/bpmn-modeler/commit/41995d51bcb93e6db21aa81f1b071909b412aba9))
* **bpmn-modeler:** pin template chooser, make four specs catch no-ops ([#1877](https://github.com/Miragon/bpmn-modeler/issues/1877)) ([eda3d93](https://github.com/Miragon/bpmn-modeler/commit/eda3d93463c003a0c9733eff39a4550e751b6500))
* **bpmn-modeler:** pin that a design edit survives the mode switch ([#1876](https://github.com/Miragon/bpmn-modeler/issues/1876)) ([8092cbd](https://github.com/Miragon/bpmn-modeler/commit/8092cbd54d4a010051a1a70be1583589859bc1b5))
* **bpmn-modeler:** pin the inline-scripting wiring in a real browser ([#1732](https://github.com/Miragon/bpmn-modeler/issues/1732)) ([e24c39d](https://github.com/Miragon/bpmn-modeler/commit/e24c39d1fa3347af9c3bf9212fdf63c8e8ccb767))
* **ci:** accept non-closing issue references in the pr issue gate ([#1705](https://github.com/Miragon/bpmn-modeler/issues/1705)) ([9187a27](https://github.com/Miragon/bpmn-modeler/commit/9187a27f675d4dc92dc9b384c75974560fae0bbf))
* **ci:** gate coverage reports on code changes and enforce thresholds ([#1682](https://github.com/Miragon/bpmn-modeler/issues/1682)) ([e2bf365](https://github.com/Miragon/bpmn-modeler/commit/e2bf3650949daf8d445466ace1eb769a89a87b4f))
* **ci:** raise drifted coverage floors and type-check spec files ([#1796](https://github.com/Miragon/bpmn-modeler/issues/1796)) ([88359d4](https://github.com/Miragon/bpmn-modeler/commit/88359d4ef080929e369a6736134e1cd282f0e17b))
* **ci:** run every vitest workspace from one target registry ([#1687](https://github.com/Miragon/bpmn-modeler/issues/1687)) ([b0c1940](https://github.com/Miragon/bpmn-modeler/commit/b0c19402c84b2a1f496fa20728e97f9a254b8885))
* **deps:** bump @bpmn-io/properties-panel from 3.56.1 to 3.57.0 in the bpmn-io group ([#1665](https://github.com/Miragon/bpmn-modeler/issues/1665)) ([00808c7](https://github.com/Miragon/bpmn-modeler/commit/00808c70f667d6eb6848e943ead9d7a2577105ca))
* **deps:** bump @miragon/bpmnlint-plugin-rules from 0.12.0 to 0.12.1 in the bpmnlint group ([#1664](https://github.com/Miragon/bpmn-modeler/issues/1664)) ([7a7772b](https://github.com/Miragon/bpmn-modeler/commit/7a7772bc370d675cd70cd7f9b0812172bd1864e3))
* **deps:** bump @miragon/bpmnlint-plugin-rules from 0.12.1 to 0.13.0 in the bpmnlint group ([#1707](https://github.com/Miragon/bpmn-modeler/issues/1707)) ([64b186f](https://github.com/Miragon/bpmn-modeler/commit/64b186fa9e4e18ad79972f2133e21da9fb31a341))
* **deps:** bump @miragon/bpmnlint-plugin-rules from 0.13.0 to 0.15.0 in the bpmnlint group ([#1922](https://github.com/Miragon/bpmn-modeler/issues/1922)) ([a463873](https://github.com/Miragon/bpmn-modeler/commit/a463873d2a61ee9faea4984e4a618987fcca157d))
* **deps:** bump the npm-minor-patch group across 1 directory with 10 updates ([#1667](https://github.com/Miragon/bpmn-modeler/issues/1667)) ([4fb5db5](https://github.com/Miragon/bpmn-modeler/commit/4fb5db55c3e1f5891598189d720ed292691634ca))
* **deps:** bump the npm-minor-patch group across 1 directory with 8 updates ([#1758](https://github.com/Miragon/bpmn-modeler/issues/1758)) ([c1a1cd3](https://github.com/Miragon/bpmn-modeler/commit/c1a1cd3279cbf9137b337422ed71f05d416c9347))
* ignore vitest browser-mode failure artifacts ([#1762](https://github.com/Miragon/bpmn-modeler/issues/1762)) ([1038566](https://github.com/Miragon/bpmn-modeler/commit/1038566eab039a54c1ddabff3c273ee0878f5aa7))
* **main:** release dmn-modeler 0.4.0 ([#1629](https://github.com/Miragon/bpmn-modeler/issues/1629)) ([e719185](https://github.com/Miragon/bpmn-modeler/commit/e71918526b2222ead2d8518d48ed0e459da568cd))
* **main:** release intellij 1.11.0 ([#1632](https://github.com/Miragon/bpmn-modeler/issues/1632)) ([a54491b](https://github.com/Miragon/bpmn-modeler/commit/a54491bcb1574d2b02dd1d76ff2210ac14a172e6))
* **main:** release vscode 1.16.0 ([#1633](https://github.com/Miragon/bpmn-modeler/issues/1633)) ([6e0898a](https://github.com/Miragon/bpmn-modeler/commit/6e0898ab2ae395e588e84b67fa8e30706bbfa53a))
* **modeler-core:** add a report-only Stryker mutation run for domain rules ([#1836](https://github.com/Miragon/bpmn-modeler/issues/1836)) ([606cf25](https://github.com/Miragon/bpmn-modeler/commit/606cf2559cc2588362949e5aef347645882bf503))
* pin document-change, flush-lock and panel-edit invariants ([#1791](https://github.com/Miragon/bpmn-modeler/issues/1791)) ([4523272](https://github.com/Miragon/bpmn-modeler/commit/45232721515ed4850eaf72c7b5431e241c28d90d))
* **properties-panel:** cover the neutral property groups and script buttons ([#1694](https://github.com/Miragon/bpmn-modeler/issues/1694)) ([f5021a2](https://github.com/Miragon/bpmn-modeler/commit/f5021a2c8ea2beb34d20b1383a8b71d9e7eb0d05))
* **properties-panel:** typecheck the workspace in ci ([#1729](https://github.com/Miragon/bpmn-modeler/issues/1729)) ([7cda886](https://github.com/Miragon/bpmn-modeler/commit/7cda886442773b8478f476748a98191ac35abdb8))
* **release:** combine release-please prs into one ([#1680](https://github.com/Miragon/bpmn-modeler/issues/1680)) ([2c813cc](https://github.com/Miragon/bpmn-modeler/commit/2c813ccb7510f965992fa8ef516052149a79e661))
* replace the acceptance gate with collaborator-only pull requests ([#2007](https://github.com/Miragon/bpmn-modeler/issues/2007)) ([6f47518](https://github.com/Miragon/bpmn-modeler/commit/6f47518e8c33d1f60d8981966447c8bd5a080527))
* replace the browser demo with a real VS Code smoke test ([#1718](https://github.com/Miragon/bpmn-modeler/issues/1718)) ([92b2b6e](https://github.com/Miragon/bpmn-modeler/commit/92b2b6e8faa090c31b4b507b9018bb0344460dde))
* **repo-checks:** ban import cycles and unstable workspace dependencies ([#2086](https://github.com/Miragon/bpmn-modeler/issues/2086)) ([d81bb67](https://github.com/Miragon/bpmn-modeler/commit/d81bb677c435aa09f758c2e323c4f69c8149fa3c))
* **shared:** cover the panel resizer, protocol messages, flow order and clipboard ([#1691](https://github.com/Miragon/bpmn-modeler/issues/1691)) ([e9586f3](https://github.com/Miragon/bpmn-modeler/commit/e9586f3274792e01a8d033f5564b20caf0433f90))
* **shared:** lint the shared library source ([#1747](https://github.com/Miragon/bpmn-modeler/issues/1747)) ([f16b03e](https://github.com/Miragon/bpmn-modeler/commit/f16b03e186ddad789a32ea90038753f845b0e57d))
* **vscode-plugin:** move the architecture spec off archunit ([#2084](https://github.com/Miragon/bpmn-modeler/issues/2084)) ([6ba1acd](https://github.com/Miragon/bpmn-modeler/commit/6ba1acd9651bfd5a21efd06d4c7211b7ef6dd20f))

## [1.3.0](https://github.com/Miragon/bpmn-modeler/compare/bpmn-modeler-v1.2.2...bpmn-modeler-v1.3.0) (2026-10-16)


### 🎉 New Features

* **bpmn-modeler:** replace the mode strip with a compact mode menu ([#1628](https://github.com/Miragon/bpmn-modeler/issues/1628)) ([b0a66ca](https://github.com/Miragon/bpmn-modeler/commit/b0a66cafa3eb077d49c6e54576238c054ed67f6d))
* **bpmn-webview:** search definitions of other models ([#1649](https://github.com/Miragon/bpmn-modeler/issues/1649)) ([1c48e83](https://github.com/Miragon/bpmn-modeler/commit/1c48e833c934a5523e81d01cba882317c3b8f140))


### 🐞 Bug Fixes

* **bpmn-modeler:** bump bpmn-js-bpmnlint to 0.25.0 for diagram-js theme tokens ([#1656](https://github.com/Miragon/bpmn-modeler/issues/1656)) ([f93e3ba](https://github.com/Miragon/bpmn-modeler/commit/f93e3bafe47e80ded0364cb1cf192349cce9cbb8))
* **bpmn-modeler:** bump bpmnlint to 11.15.0 and drop the core rule patch ([#1640](https://github.com/Miragon/bpmn-modeler/issues/1640)) ([680fae4](https://github.com/Miragon/bpmn-modeler/commit/680fae4f9316de550cae34b4cb9b38a065ba5197))
* **bpmn-modeler:** fix quadratic bpmnlint overlap and bpmndi rules ([#1609](https://github.com/Miragon/bpmn-modeler/issues/1609)) ([0966e35](https://github.com/Miragon/bpmn-modeler/commit/0966e35f1abd08589c0e1c9535484ea906efc6dc))
* **bpmn-modeler:** stop duplicating and rebuilding transaction boundaries ([#1620](https://github.com/Miragon/bpmn-modeler/issues/1620)) ([9c9ea61](https://github.com/Miragon/bpmn-modeler/commit/9c9ea61421f7a0013067d33882b1e1ef1b775ce6))
* **bpmn-modeler:** stop redundant lint runs and overlay rebuilds ([#1606](https://github.com/Miragon/bpmn-modeler/issues/1606)) ([a506d75](https://github.com/Miragon/bpmn-modeler/commit/a506d75a3f0405ce339d83fc5fb3fc8ccf7cb719))
* **bpmn-webview:** apply the configured locale before the first import ([#1617](https://github.com/Miragon/bpmn-modeler/issues/1617)) ([63d01ce](https://github.com/Miragon/bpmn-modeler/commit/63d01ce4b3df3f4746d1d44cc44fab914566181e))
* **deps:** dedupe bpmn-js, diagram-js and bpmn-moddle in the lockfile ([#1618](https://github.com/Miragon/bpmn-modeler/issues/1618)) ([d7bc492](https://github.com/Miragon/bpmn-modeler/commit/d7bc492cef4333f543805c79550446287d357c5d))
* **modeler-core:** shorten the host open path and per-edit host work ([#1645](https://github.com/Miragon/bpmn-modeler/issues/1645)) ([575fc55](https://github.com/Miragon/bpmn-modeler/commit/575fc551c337b09b28ad7c80626dec9e54c7479a))
* **standalone:** bump electron to 42.11.8 for security advisories ([#1615](https://github.com/Miragon/bpmn-modeler/issues/1615)) ([84bd712](https://github.com/Miragon/bpmn-modeler/commit/84bd71203b3af66b30c80a95a9f6963a507da401))
* **standalone:** bump electron-builder to 26.17.0 to restore macos signing ([#1623](https://github.com/Miragon/bpmn-modeler/issues/1623)) ([7b65ca5](https://github.com/Miragon/bpmn-modeler/commit/7b65ca55631cf6c89a55b93f1113e48b762b384c))
* **standalone:** restore packaged file search with Theia 1.76 ([#1610](https://github.com/Miragon/bpmn-modeler/issues/1610)) ([6816f03](https://github.com/Miragon/bpmn-modeler/commit/6816f03d7a9339d84d3eeb6382d9f84a475d1545))


### 🔨 Refactoring

* **bpmn-webview:** split the single webview bundle into lazy chunks ([#1638](https://github.com/Miragon/bpmn-modeler/issues/1638)) ([22f9707](https://github.com/Miragon/bpmn-modeler/commit/22f97073ee0b1685a725240e10b6380b7d52bee8))


### 🛠️ Misc

* **bpmn-modeler:** add a large-model generator and perf harness ([#1605](https://github.com/Miragon/bpmn-modeler/issues/1605)) ([75b6616](https://github.com/Miragon/bpmn-modeler/commit/75b66169bc2a87be2a1043e9614309f0637dead9))
* **deps:** bump @miragon/bpmnlint-plugin-rules from 0.10.1 to 0.11.1 in the bpmnlint group ([#1634](https://github.com/Miragon/bpmn-modeler/issues/1634)) ([4a44c3b](https://github.com/Miragon/bpmn-modeler/commit/4a44c3bedfecad682b7822c7d3200fd8049f2ec4))
* **deps:** bump @miragon/bpmnlint-plugin-rules from 0.11.1 to 0.12.0 in the bpmnlint group across 1 directory ([#1653](https://github.com/Miragon/bpmn-modeler/issues/1653)) ([e48efe2](https://github.com/Miragon/bpmn-modeler/commit/e48efe2230fcb4214a7ec84da971bb1fd7b56b9c))
* **deps:** bump the bpmn-io group across 1 directory with 12 updates ([#1644](https://github.com/Miragon/bpmn-modeler/issues/1644)) ([586f66f](https://github.com/Miragon/bpmn-modeler/commit/586f66f3e202646d636fdc480df926bd4552dfe2))
* **deps:** bump the npm-major group across 1 directory with 6 updates ([#1650](https://github.com/Miragon/bpmn-modeler/issues/1650)) ([be237db](https://github.com/Miragon/bpmn-modeler/commit/be237db00ec63fb25c9c717e669e23decead21fc))
* **deps:** bump the npm-minor-patch group across 1 directory with 26 updates ([#1655](https://github.com/Miragon/bpmn-modeler/issues/1655)) ([d0069a9](https://github.com/Miragon/bpmn-modeler/commit/d0069a96f6913cab84abf372f4c03c1bad64e9ba))
* **deps:** unblock dependabot major bumps and fix webview dev preview ([#1631](https://github.com/Miragon/bpmn-modeler/issues/1631)) ([c40e3d7](https://github.com/Miragon/bpmn-modeler/commit/c40e3d7b8848190da2cf207384d4d5d84389bc89))
* **main:** release intellij 1.10.2 ([#1589](https://github.com/Miragon/bpmn-modeler/issues/1589)) ([05ef3b7](https://github.com/Miragon/bpmn-modeler/commit/05ef3b7ce08f2b17f212d0908cf98b63609d7fd4))
* **main:** release vscode 1.14.2 ([#1590](https://github.com/Miragon/bpmn-modeler/issues/1590)) ([a0a3f7d](https://github.com/Miragon/bpmn-modeler/commit/a0a3f7da843396be8c897fa291cedb66b63a6d4f))
* **main:** release vscode 1.15.0 ([#1608](https://github.com/Miragon/bpmn-modeler/issues/1608)) ([8c726cb](https://github.com/Miragon/bpmn-modeler/commit/8c726cbd53f1cefd9e411cd288f4769da05b43a0))

## [1.2.2](https://github.com/Miragon/bpmn-modeler/compare/bpmn-modeler-v1.2.1...bpmn-modeler-v1.2.2) (2026-09-28)


### 🐞 Bug Fixes

* **bpmn-modeler:** hide lint toolbar during token simulation ([#1601](https://github.com/Miragon/bpmn-modeler/issues/1601)) ([c6bc75f](https://github.com/Miragon/bpmn-modeler/commit/c6bc75f58b34ef2d9f494329f3cec8a3c17bf099))
* **bpmn-modeler:** keep lint issue list above neighbouring icons ([#1602](https://github.com/Miragon/bpmn-modeler/issues/1602)) ([c269238](https://github.com/Miragon/bpmn-modeler/commit/c26923860d8b7c379ddb86b6366038250b9c9859))


### 🛠️ Misc

* **main:** release dmn-modeler 0.3.1 ([#1573](https://github.com/Miragon/bpmn-modeler/issues/1573)) ([2b8f54a](https://github.com/Miragon/bpmn-modeler/commit/2b8f54a9175ca9e1fd92b474f8ae434e413f11b8))
* **main:** release intellij 1.10.1 ([#1581](https://github.com/Miragon/bpmn-modeler/issues/1581)) ([09d46b3](https://github.com/Miragon/bpmn-modeler/commit/09d46b3ce4a98386c69cd72e331fa5e0088e857d))
* **main:** release vscode 1.14.1 ([#1574](https://github.com/Miragon/bpmn-modeler/issues/1574)) ([436ab2a](https://github.com/Miragon/bpmn-modeler/commit/436ab2abd63c9be55b6fcafb7b91327830307704))

## [1.2.1](https://github.com/Miragon/bpmn-modeler/compare/bpmn-modeler-v1.2.0...bpmn-modeler-v1.2.1) (2026-09-23)


### 🐞 Bug Fixes

* **dark-mode:** change color in property panel ([#1584](https://github.com/Miragon/bpmn-modeler/issues/1584)) ([d9bda28](https://github.com/Miragon/bpmn-modeler/commit/d9bda28190e5f09adc4eb8da8f5ebdc97866a7de))
* support git in linux standalone app ([#1576](https://github.com/Miragon/bpmn-modeler/issues/1576)) ([679668f](https://github.com/Miragon/bpmn-modeler/commit/679668fd3f681a4d7fd593cd05fa6d032f885d51))


### 🛠️ Misc

* **deps:** bump the npm-minor-patch group across 1 directory with 26 updates ([#1566](https://github.com/Miragon/bpmn-modeler/issues/1566)) ([1c798c6](https://github.com/Miragon/bpmn-modeler/commit/1c798c6cfc9e98a19d489d1aa65aa930453d5109))
* **deps:** bump the npm-minor-patch group across 1 directory with 9 updates ([#1579](https://github.com/Miragon/bpmn-modeler/issues/1579)) ([bff9451](https://github.com/Miragon/bpmn-modeler/commit/bff945149e4b616a270d0f9685e0d34b1f1f4d78))
* **main:** release dmn-modeler 0.3.0 ([#1540](https://github.com/Miragon/bpmn-modeler/issues/1540)) ([f315e1e](https://github.com/Miragon/bpmn-modeler/commit/f315e1e2f6248536e16e05a2f8cee0e2f135ea26))
* **main:** release intellij 1.10.0 ([#1548](https://github.com/Miragon/bpmn-modeler/issues/1548)) ([14f407f](https://github.com/Miragon/bpmn-modeler/commit/14f407fa3e3c40a0c5fb97e94e28cd13e6d6af26))
* **main:** release vscode 1.14.0 ([#1550](https://github.com/Miragon/bpmn-modeler/issues/1550)) ([688f8a9](https://github.com/Miragon/bpmn-modeler/commit/688f8a9d9eab0cdc742619c6791818201cb2db00))

## [1.2.0](https://github.com/Miragon/bpmn-modeler/compare/bpmn-modeler-v1.1.0...bpmn-modeler-v1.2.0) (2026-09-21)


### 🎉 New Features

* **bpmn-modeler:** fit a sub-process to the viewport on first drilldown ([#1425](https://github.com/Miragon/bpmn-modeler/issues/1425)) ([72efe5b](https://github.com/Miragon/bpmn-modeler/commit/72efe5bda519b6c1c849efb35734f8e7d1532fa7))
* **deployment:** add named deployment targets and endpoint overrides ([#1552](https://github.com/Miragon/bpmn-modeler/issues/1552)) ([77f36e5](https://github.com/Miragon/bpmn-modeler/commit/77f36e5ebfcb7c9e73f9341ff9fce50cc51eee2b))
* **dmn-modeler:** support empty (null) inputs in the dmn simulation ([#1568](https://github.com/Miragon/bpmn-modeler/issues/1568)) ([#1569](https://github.com/Miragon/bpmn-modeler/issues/1569)) ([11528f7](https://github.com/Miragon/bpmn-modeler/commit/11528f75e1ef9380481306a564b9c8963152bf55))


### 🐞 Bug Fixes

* **bpmn-modeler:** translate append menu and element template chooser ([#1547](https://github.com/Miragon/bpmn-modeler/issues/1547)) ([63b0493](https://github.com/Miragon/bpmn-modeler/commit/63b0493e5c998c51af124465472ee0004b63127f))
* **editor:** bump bpmnlint to 11.14.0 with bundled superfluous-label ([#1564](https://github.com/Miragon/bpmn-modeler/issues/1564)) ([e121ad1](https://github.com/Miragon/bpmn-modeler/commit/e121ad1805be8c84852e2c9f401334b2ca9c6d21))


### 📔 Documentation

* **adr:** consolidate decisions into living topic records ([#1554](https://github.com/Miragon/bpmn-modeler/issues/1554)) ([583663d](https://github.com/Miragon/bpmn-modeler/commit/583663da6052b10c6bba16b297829d697ea18123))


### 🛠️ Misc

* add acceptance-gate triage and AI-contribution governance ([#1551](https://github.com/Miragon/bpmn-modeler/issues/1551)) ([a2094d4](https://github.com/Miragon/bpmn-modeler/commit/a2094d406f640ad1ff4c7a47a9c1d8bf5de18224))
* **bpmn-modeler:** close the release-gate blind spots ([#1549](https://github.com/Miragon/bpmn-modeler/issues/1549)) ([90a07d5](https://github.com/Miragon/bpmn-modeler/commit/90a07d598f7fabeb04dcb1ca3fde8774dbfb9c68))
* **bpmn-modeler:** consolidate duplicated template metadata types ([#1546](https://github.com/Miragon/bpmn-modeler/issues/1546)) ([945a9c2](https://github.com/Miragon/bpmn-modeler/commit/945a9c2f2ee6c1d47c0767aa63c5b41dd5afe981))
* **deps:** bump knip and lint-staged ([#1557](https://github.com/Miragon/bpmn-modeler/issues/1557)) ([ed40592](https://github.com/Miragon/bpmn-modeler/commit/ed4059274a1d248b99fed93f92de02d22072cf0f))
* **deps:** bump properties-panel, vite and archunit ([#1560](https://github.com/Miragon/bpmn-modeler/issues/1560)) ([e43a387](https://github.com/Miragon/bpmn-modeler/commit/e43a387ed71c18fa34821ae68bfb76725a9066d5))
* **deps:** bump the npm-major group across 1 directory with 5 updates ([#1527](https://github.com/Miragon/bpmn-modeler/issues/1527)) ([165049f](https://github.com/Miragon/bpmn-modeler/commit/165049f757243bad1e4e98fab16f90132c798048))
* **main:** release intellij 1.9.0 ([#1538](https://github.com/Miragon/bpmn-modeler/issues/1538)) ([08ea2c3](https://github.com/Miragon/bpmn-modeler/commit/08ea2c32ac05fdaeaab251229e56c5c0b2ae586b))
* **main:** release vscode 1.13.0 ([#1539](https://github.com/Miragon/bpmn-modeler/issues/1539)) ([b7283e9](https://github.com/Miragon/bpmn-modeler/commit/b7283e9631e3c57b9d64ab0d080589e4d4902701))

## [1.1.0](https://github.com/Miragon/bpmn-modeler/compare/bpmn-modeler-v1.0.0...bpmn-modeler-v1.1.0) (2026-09-14)


### 🎉 New Features

* **bpmn-modeler:** stamp execution platform on engine-bound newDiagram ([#1536](https://github.com/Miragon/bpmn-modeler/issues/1536)) ([e742f59](https://github.com/Miragon/bpmn-modeler/commit/e742f59ba5135625cd5576857d77e37a2f313255))


### 🐞 Bug Fixes

* **bpmn-modeler:** keep panel-host flex layout under the diagram shell ([#1541](https://github.com/Miragon/bpmn-modeler/issues/1541)) ([69391c5](https://github.com/Miragon/bpmn-modeler/commit/69391c55d59753abe33560f51279f825a9482538))


### 🔨 Refactoring

* **bpmn-modeler:** isolate private upstream access behind typed adapters ([#1537](https://github.com/Miragon/bpmn-modeler/issues/1537)) ([60c58a8](https://github.com/Miragon/bpmn-modeler/commit/60c58a862728187d3ba7908eca82dcd486c20921))
* **bpmn-modeler:** share lifecycle primitives across surfaces ([#1535](https://github.com/Miragon/bpmn-modeler/issues/1535)) ([bba5706](https://github.com/Miragon/bpmn-modeler/commit/bba57064d09c0096882c53108181538947f92fa8))


### 🛠️ Misc

* **main:** release intellij 1.8.0 ([#1368](https://github.com/Miragon/bpmn-modeler/issues/1368)) ([b46c535](https://github.com/Miragon/bpmn-modeler/commit/b46c535ad8ec8c7a602bfc437889f9ea2f55265d))
* **main:** release vscode 1.12.0 ([#1448](https://github.com/Miragon/bpmn-modeler/issues/1448)) ([c917f93](https://github.com/Miragon/bpmn-modeler/commit/c917f934085f59eb51a2f9813942f6fa65205905))

## [1.0.0](https://github.com/Miragon/bpmn-modeler/compare/bpmn-modeler-v0.2.0...bpmn-modeler-v1.0.0) (2026-09-13)


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

* **append-menu:** honor the bpmn type chosen for a multi-type template ([#1517](https://github.com/Miragon/bpmn-modeler/issues/1517)) ([9e63dff](https://github.com/Miragon/bpmn-modeler/commit/9e63dff85c678d8fe1e14d28d754340165befcaa))
* **append-menu:** restore flat menu entries under camunda-bpmn-js 5.33 ([#1428](https://github.com/Miragon/bpmn-modeler/issues/1428)) ([d512d6c](https://github.com/Miragon/bpmn-modeler/commit/d512d6cec9d0c043ad35f5d24c46e2501621ee9b))
* **bpmn-modeler:** destroy partially initialised surfaces when a factory fails ([#1522](https://github.com/Miragon/bpmn-modeler/issues/1522)) ([9ac9031](https://github.com/Miragon/bpmn-modeler/commit/9ac90313fcafe2c1ca8657bc4ad4d258d8c6a40a))
* **bpmn-modeler:** keep restored viewport and clear empty selection ([#1518](https://github.com/Miragon/bpmn-modeler/issues/1518)) ([fa5298c](https://github.com/Miragon/bpmn-modeler/commit/fa5298c1ce1d4c45e42ca63d8ff465694b37b09d))
* **bpmn-modeler:** make mode-session recreate transaction-safe ([#1515](https://github.com/Miragon/bpmn-modeler/issues/1515)) ([7c4a85d](https://github.com/Miragon/bpmn-modeler/commit/7c4a85d4815d2d198e934a620f10bf427b7bbe89))
* **bpmn-modeler:** make text clipboard polyfill per-instance and disposable ([#1513](https://github.com/Miragon/bpmn-modeler/issues/1513)) ([88d0a93](https://github.com/Miragon/bpmn-modeler/commit/88d0a93412020220a966ab50ebd29398b00015a8))
* **bpmn-modeler:** open subprocess diagrams during diff navigation ([#1532](https://github.com/Miragon/bpmn-modeler/issues/1532)) ([1cf38a0](https://github.com/Miragon/bpmn-modeler/commit/1cf38a015238dad7095b9615874be4546bc10f5c))
* **bpmn-modeler:** report failing debounced saves once via onError ([#1497](https://github.com/Miragon/bpmn-modeler/issues/1497)) ([#1528](https://github.com/Miragon/bpmn-modeler/issues/1528)) ([3b665ba](https://github.com/Miragon/bpmn-modeler/commit/3b665ba8b4f94653e11ab08487c36eb817775cc8))
* **bpmn-modeler:** reset host lint config on payload-free handback ([#1526](https://github.com/Miragon/bpmn-modeler/issues/1526)) ([36dae2f](https://github.com/Miragon/bpmn-modeler/commit/36dae2fb659afbc792717828459d9235bfe98d18))
* **bpmn-modeler:** start backward diff navigation at the last change ([#1525](https://github.com/Miragon/bpmn-modeler/issues/1525)) ([87de742](https://github.com/Miragon/bpmn-modeler/commit/87de742f945003fe6d001a9b5072476d6e792be8))
* **bpmn-modeler:** stop debounced callbacks firing after destroy ([#1523](https://github.com/Miragon/bpmn-modeler/issues/1523)) ([9414cc9](https://github.com/Miragon/bpmn-modeler/commit/9414cc993092492560798ec99c13bed9d19cbad5))
* **bpmn-modeler:** support packed packages in nested installs ([#1508](https://github.com/Miragon/bpmn-modeler/issues/1508)) ([bbefb36](https://github.com/Miragon/bpmn-modeler/commit/bbefb36fd3ffe01fd9cc5bd6e0b736120a86eb88))
* **diff:** detect execution property changes across engines ([#1510](https://github.com/Miragon/bpmn-modeler/issues/1510)) ([23bf6d9](https://github.com/Miragon/bpmn-modeler/commit/23bf6d92a7a580bee3e4d2ef357d9c48851c64f1))
* **modeler-types:** detect engine from the definitions root attributes ([#1524](https://github.com/Miragon/bpmn-modeler/issues/1524)) ([f67a332](https://github.com/Miragon/bpmn-modeler/commit/f67a332ea0b9d3396c397071c1ee83f5008005da))
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
* **deps:** align internal lib peer ranges and constrain peers ([#1530](https://github.com/Miragon/bpmn-modeler/issues/1530)) ([bdf265e](https://github.com/Miragon/bpmn-modeler/commit/bdf265ea927c3671f9a2735a7e757f25f95ebb1b))
* **deps:** bump the npm-minor-patch group across 1 directory with 29 updates ([#1414](https://github.com/Miragon/bpmn-modeler/issues/1414)) ([2dd39d3](https://github.com/Miragon/bpmn-modeler/commit/2dd39d3e9d590a51a4ce1572d22523f82548cf0d))
* **deps:** update dependencies and resolve critical vulnerabilities ([#1531](https://github.com/Miragon/bpmn-modeler/issues/1531)) ([6f4ac58](https://github.com/Miragon/bpmn-modeler/commit/6f4ac58b6d2f5b04fe520e169d8763971fa30967))
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
