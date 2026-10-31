:robot: I have created a release *beep* *boop*
---


<details><summary>bpmn-modeler: 1.4.0</summary>

## [1.4.0](https://github.com/Miragon/bpmn-modeler/compare/bpmn-modeler-v1.3.0...bpmn-modeler-v1.4.0) (2026-10-31)


### <‰ New Features

* **append-menu:** show element descriptions and match search keywords ([#1761](https://github.com/Miragon/bpmn-modeler/issues/1761)) ([7c7a424](https://github.com/Miragon/bpmn-modeler/commit/7c7a424c39e4eebadd217734589b8deaff5a2725))
* **bpmn-modeler:** publish command-stack and format subscriptions ([#2042](https://github.com/Miragon/bpmn-modeler/issues/2042)) ([d86ef79](https://github.com/Miragon/bpmn-modeler/commit/d86ef793f230394821a38633e691502791007aba))
* **bpmn-modeler:** replace camunda-bpmn-js popup-menu features with our own ([#1777](https://github.com/Miragon/bpmn-modeler/issues/1777)) ([2adc83c](https://github.com/Miragon/bpmn-modeler/commit/2adc83c2e699cf8d28381235887ebebe355efd1d))
* **bpmn-modeler:** translate popup-menu search keywords ([#1781](https://github.com/Miragon/bpmn-modeler/issues/1781)) ([cae0009](https://github.com/Miragon/bpmn-modeler/commit/cae000979c1e85521890089f0d2e286f789d5bcb))
* **bpmn-modeler:** update favourite elements on a live surface ([#1743](https://github.com/Miragon/bpmn-modeler/issues/1743)) ([f1103b1](https://github.com/Miragon/bpmn-modeler/commit/f1103b1d765d172ebd7ba54093518dfdfd4bfd39))


### = Bug Fixes

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


### =( Refactoring

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


### =Ô Documentation

* **bpmn-modeler:** document post-destroy throws and lint no-throw scope ([#1736](https://github.com/Miragon/bpmn-modeler/issues/1736)) ([622cfd2](https://github.com/Miragon/bpmn-modeler/commit/622cfd2a070e206d2045553868677e588b1ddf94))
* **bpmn-modeler:** document yarn berry resolutions for upstream carets ([#1782](https://github.com/Miragon/bpmn-modeler/issues/1782)) ([0246c4d](https://github.com/Miragon/bpmn-modeler/commit/0246c4d2595866a8cb86197ab3ad5e405295267e))
* **bpmn-modeler:** say that subscribing after destroy throws ([#2048](https://github.com/Miragon/bpmn-modeler/issues/2048)) ([8c5109b](https://github.com/Miragon/bpmn-modeler/commit/8c5109ba0100732c71166301962545f66667d837))
* **modeler-core:** fix references after the kernel and editorSession split ([#1933](https://github.com/Miragon/bpmn-modeler/issues/1933)) ([8c809e9](https://github.com/Miragon/bpmn-modeler/commit/8c809e93bdf98b85b3c3f22007c9e0e1d92ab0c6))
* **readme:** replace the preview image with a demo gif ([#1756](https://github.com/Miragon/bpmn-modeler/issues/1756)) ([c9a0ba9](https://github.com/Miragon/bpmn-modeler/commit/c9a0ba9fad38144af0b6e7484deec3205eec8fcd))
* rework the docs site into a compact, picture-led manual ([#1715](https://github.com/Miragon/bpmn-modeler/issues/1715)) ([22f4d0d](https://github.com/Miragon/bpmn-modeler/commit/22f4d0da7864e182f54de0013cfd8b2c524ca059))


### =à Misc

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
</details>

<details><summary>vscode: 1.17.0</summary>

## [1.17.0](https://github.com/Miragon/bpmn-modeler/compare/vscode-v1.16.0...vscode-v1.17.0) (2026-10-31)


### <‰ New Features

* **append-menu:** show element descriptions and match search keywords ([#1761](https://github.com/Miragon/bpmn-modeler/issues/1761)) [sync 7c7a424] ([d8357d8](https://github.com/Miragon/bpmn-modeler/commit/d8357d81aa31dd2ee520368d0e61fb903b9fe359))
* **bpmn-modeler:** publish command-stack and format subscriptions ([#2042](https://github.com/Miragon/bpmn-modeler/issues/2042)) [sync d86ef79] ([a23e288](https://github.com/Miragon/bpmn-modeler/commit/a23e288f14007d1dea6a277a8bec3b2cdd1364aa))
* **bpmn-modeler:** replace camunda-bpmn-js popup-menu features with our own ([#1777](https://github.com/Miragon/bpmn-modeler/issues/1777)) [sync 2adc83c] ([e064d78](https://github.com/Miragon/bpmn-modeler/commit/e064d787acd52ad60571fbf0e8128b0d4f55ba45))
* **bpmn-modeler:** translate popup-menu search keywords ([#1781](https://github.com/Miragon/bpmn-modeler/issues/1781)) [sync cae0009] ([432bbd7](https://github.com/Miragon/bpmn-modeler/commit/432bbd773e762ffa383631020639f90004f1b8e5))
* **bpmn-modeler:** update favourite elements on a live surface ([#1743](https://github.com/Miragon/bpmn-modeler/issues/1743)) [sync f1103b1] ([c759d76](https://github.com/Miragon/bpmn-modeler/commit/c759d76c7f1d01e8d5f137480bbe1a39febb259a))
* **deployment:** support ${env:VAR} references in target fields ([#1575](https://github.com/Miragon/bpmn-modeler/issues/1575)) ([d3f657b](https://github.com/Miragon/bpmn-modeler/commit/d3f657bc5a49a45f7b098495766af850b7e39bb5))
* **standalone:** add builtin-extension-pack to standalone app ([#1961](https://github.com/Miragon/bpmn-modeler/issues/1961)) [sync 0ecd09c] ([5d81450](https://github.com/Miragon/bpmn-modeler/commit/5d8145098b5b84427aa6e6902704f5c927a38061))


### = Bug Fixes

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


### =( Refactoring

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


### =Ô Documentation

* **readme:** replace the preview image with a demo gif ([#1756](https://github.com/Miragon/bpmn-modeler/issues/1756)) ([c9a0ba9](https://github.com/Miragon/bpmn-modeler/commit/c9a0ba9fad38144af0b6e7484deec3205eec8fcd))


### =à Misc

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
</details>

<details><summary>intellij: 1.12.0</summary>

## [1.12.0](https://github.com/Miragon/bpmn-modeler/compare/intellij-v1.11.0...intellij-v1.12.0) (2026-10-31)


### <‰ New Features

* **append-menu:** show element descriptions and match search keywords ([#1761](https://github.com/Miragon/bpmn-modeler/issues/1761)) [sync 7c7a424] ([d8357d8](https://github.com/Miragon/bpmn-modeler/commit/d8357d81aa31dd2ee520368d0e61fb903b9fe359))
* **bpmn-modeler:** publish command-stack and format subscriptions ([#2042](https://github.com/Miragon/bpmn-modeler/issues/2042)) [sync d86ef79] ([a23e288](https://github.com/Miragon/bpmn-modeler/commit/a23e288f14007d1dea6a277a8bec3b2cdd1364aa))
* **bpmn-modeler:** replace camunda-bpmn-js popup-menu features with our own ([#1777](https://github.com/Miragon/bpmn-modeler/issues/1777)) [sync 2adc83c] ([e064d78](https://github.com/Miragon/bpmn-modeler/commit/e064d787acd52ad60571fbf0e8128b0d4f55ba45))
* **bpmn-modeler:** translate popup-menu search keywords ([#1781](https://github.com/Miragon/bpmn-modeler/issues/1781)) [sync cae0009] ([432bbd7](https://github.com/Miragon/bpmn-modeler/commit/432bbd773e762ffa383631020639f90004f1b8e5))
* **bpmn-modeler:** update favourite elements on a live surface ([#1743](https://github.com/Miragon/bpmn-modeler/issues/1743)) [sync f1103b1] ([c759d76](https://github.com/Miragon/bpmn-modeler/commit/c759d76c7f1d01e8d5f137480bbe1a39febb259a))
* **deployment:** support ${env:VAR} references in target fields ([#1575](https://github.com/Miragon/bpmn-modeler/issues/1575)) ([d3f657b](https://github.com/Miragon/bpmn-modeler/commit/d3f657bc5a49a45f7b098495766af850b7e39bb5))


### = Bug Fixes

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
* **modeler-core:** keep the focused editor's engine and lint status when another BPMN editor blurs or closes ([#1855](https://github.com/Miragon/bpmn-modeler/issues/1855)) [sync 4140060] ([2bbbd18](https://github.com/Miragon/bpmn-modeler/commit/2bbbd188531950706b49fdf093a245b4184d1b66))
* **modeler-core:** match a camunda:class file on a path-segment boundary in navigation as the code-link map does ([#1840](https://github.com/Miragon/bpmn-modeler/issues/1840)) [sync 73519ba] ([862426a](https://github.com/Miragon/bpmn-modeler/commit/862426a338c1dd894dfe85c9fc0e8136ef7e84ab))
* **modeler-core:** migrate open diagrams from their editor content instead of disk ([#1856](https://github.com/Miragon/bpmn-modeler/issues/1856)) [sync ffd110a] ([b5e3487](https://github.com/Miragon/bpmn-modeler/commit/b5e3487a32584fc27e5f921cf5d20f832842456e))
* **modeler-core:** never drop a picked engine version silently ([#1901](https://github.com/Miragon/bpmn-modeler/issues/1901)) [sync d2bce4c] ([3226dfc](https://github.com/Miragon/bpmn-modeler/commit/3226dfcc35f0619ef55c6552fede04fee00204aa))
* **modeler-core:** normalise settings once for every host ([#1941](https://github.com/Miragon/bpmn-modeler/issues/1941)) ([c3811a0](https://github.com/Miragon/bpmn-modeler/commit/c3811a0b0901f712baecc2fd73e8abd24c147096))
* **modeler-core:** re-resolve the definition-search and form-status scope when workspace folders change ([#1843](https://github.com/Miragon/bpmn-modeler/issues/1843)) [sync f5236fd] ([38ab290](https://github.com/Miragon/bpmn-modeler/commit/38ab290c7982045a5a45ab2940dd427e693eaa2f))
* **modeler-core:** read the executable process id under any bpmn prefix ([#1949](https://github.com/Miragon/bpmn-modeler/issues/1949)) [sync db53e2e] ([52b0e3f](https://github.com/Miragon/bpmn-modeler/commit/52b0e3ff93e954fa59447237cc37a82d7b41cf6f))
* **modeler-core:** report an engine-accepted deploy as deployed when saving its credentials or ledger row fails ([#1854](https://github.com/Miragon/bpmn-modeler/issues/1854)) ([d9cb259](https://github.com/Miragon/bpmn-modeler/commit/d9cb259e2b0d73bff82785041e9e379282d4fde7))
* **modeler-core:** share one script file store between both hosts ([#2010](https://github.com/Miragon/bpmn-modeler/issues/2010)) [sync d1efc1b] ([e60c653](https://github.com/Miragon/bpmn-modeler/commit/e60c653132078ff3ca33966131c8c1368b0b4a23))
* **modeler-core:** show status items only for the focused editor ([#1895](https://github.com/Miragon/bpmn-modeler/issues/1895)) [sync 2da9ab8] ([9d7e0af](https://github.com/Miragon/bpmn-modeler/commit/9d7e0af88df9dc1f824fd84fc0e9845e7588331e))
* **modeler-core:** skip a diagram migrate all cannot read or rewrite ([#2004](https://github.com/Miragon/bpmn-modeler/issues/2004)) [sync 81284d1] ([66fcde5](https://github.com/Miragon/bpmn-modeler/commit/66fcde502f624ac790116aabefd525d12501e9d6))
* **modeler-core:** skip host script write-back to morphed script tasks ([#1726](https://github.com/Miragon/bpmn-modeler/issues/1726)) [sync 3c36f22] ([0d16462](https://github.com/Miragon/bpmn-modeler/commit/0d1646261baf94256095ee47f72379060016fcd8))
* **modeler-core:** stop a deploy when the save before it fails ([#1935](https://github.com/Miragon/bpmn-modeler/issues/1935)) ([de51658](https://github.com/Miragon/bpmn-modeler/commit/de516583ab0758b38d1a2f4176474fbfccfde08c))
* **modeler-core:** stop migration from stamping duplicate execution-platform attributes ([#1862](https://github.com/Miragon/bpmn-modeler/issues/1862)) [sync 18c157a] ([6aab597](https://github.com/Miragon/bpmn-modeler/commit/6aab5979a4576ee7190b6239f273a68c480931c6))
* **modeler-core:** warn when an added marketplace fetched nothing ([#1948](https://github.com/Miragon/bpmn-modeler/issues/1948)) ([a652ae5](https://github.com/Miragon/bpmn-modeler/commit/a652ae5058a0e5aa6b814d987f3328d264b51766))
* **modeler-core:** watch element templates when the config folder setting is empty ([#1865](https://github.com/Miragon/bpmn-modeler/issues/1865)) [sync 9593933] ([e2fb0e5](https://github.com/Miragon/bpmn-modeler/commit/e2fb0e5237987f2edab77bb034abbe6ac1fcfb45))
* **modeler-types:** scan xml comments and cdata in document order ([#1970](https://github.com/Miragon/bpmn-modeler/issues/1970)) [sync 249398c] ([7d61046](https://github.com/Miragon/bpmn-modeler/commit/7d610469dd8abdf246f37f26ca9643a180dd385e))
* **shared:** hold a quickly narrowed properties panel at its minimum width ([#1698](https://github.com/Miragon/bpmn-modeler/issues/1698)) [sync f92e122] ([74417fa](https://github.com/Miragon/bpmn-modeler/commit/74417fac1d705768bac5a2fce16e30ca200f8e23))
* **shared:** keep properties-panel groups collapsed after a rebuild ([#1728](https://github.com/Miragon/bpmn-modeler/issues/1728)) [sync 08610dc] ([59ff23e](https://github.com/Miragon/bpmn-modeler/commit/59ff23eff098235154ff150d97944488f2698fde))
* **vscode-plugin:** keep credential pairs whole and UNC servers in paths ([#2066](https://github.com/Miragon/bpmn-modeler/issues/2066)) [sync f531682] ([1ae272d](https://github.com/Miragon/bpmn-modeler/commit/1ae272d83faee3d37f5871228f8ce47a0fc3b9c1))
* **webviews:** add a content security policy to the bpmn and dmn webviews ([#1798](https://github.com/Miragon/bpmn-modeler/issues/1798)) ([4d58fab](https://github.com/Miragon/bpmn-modeler/commit/4d58fabdb0e671c9759c78b93fed200de28a4d47))
* **webviews:** keep a properties-panel toggle made while the editor opens ([#1851](https://github.com/Miragon/bpmn-modeler/issues/1851)) [sync 766f0de] ([19f0e1d](https://github.com/Miragon/bpmn-modeler/commit/19f0e1da0734707cb442f33cf67840fde8074c06))
* **webviews:** pin the boot restore invariants and paint early diff highlights ([#1792](https://github.com/Miragon/bpmn-modeler/issues/1792)) [sync 2f3bd53] ([da11f71](https://github.com/Miragon/bpmn-modeler/commit/da11f719187043a73501319d3ca48663731c63d2))


### =( Refactoring

* **modeler-bridge:** send status slots to IntelliJ ([#1995](https://github.com/Miragon/bpmn-modeler/issues/1995)) ([4169151](https://github.com/Miragon/bpmn-modeler/commit/41691519383cf650774e86f63002b91a37523589))
* **modeler-core:** build the token prompt in the core ([#2046](https://github.com/Miragon/bpmn-modeler/issues/2046)) ([6b0a2e8](https://github.com/Miragon/bpmn-modeler/commit/6b0a2e8c1b7822ba8b8d16f3d1593a7784589e97))
* **modeler-core:** delete unused disposeEngineVersionStatus ([#1893](https://github.com/Miragon/bpmn-modeler/issues/1893)) ([07c965c](https://github.com/Miragon/bpmn-modeler/commit/07c965c54100eb110c5a898b31c74bb7e281eb39))
* **modeler-core:** drop the feature-shaped picker methods ([#2041](https://github.com/Miragon/bpmn-modeler/issues/2041)) ([6de5c36](https://github.com/Miragon/bpmn-modeler/commit/6de5c36ad45def4b6f25f019d9674d97304aa0b7))
* **modeler-core:** drop the widget-shaped status methods ([#2039](https://github.com/Miragon/bpmn-modeler/issues/2039)) ([5aa51d0](https://github.com/Miragon/bpmn-modeler/commit/5aa51d0898d1acdaf7a02ef967d32afb1649cf54))
* **modeler-core:** load and save deployment state as one snapshot ([#2029](https://github.com/Miragon/bpmn-modeler/issues/2029)) ([fc2b3fa](https://github.com/Miragon/bpmn-modeler/commit/fc2b3fa662373bfaa53ce95db779f3d9f26f8207))
* **modeler-core:** remove the script-variable manifest and its declare-variable quick fix ([#1858](https://github.com/Miragon/bpmn-modeler/issues/1858)) ([989637b](https://github.com/Miragon/bpmn-modeler/commit/989637b4a763204699efd1c6dcb5cb22858c1d1c))
* **modeler-core:** show the bpmnlint status through its status slot ([#2001](https://github.com/Miragon/bpmn-modeler/issues/2001)) ([a891b94](https://github.com/Miragon/bpmn-modeler/commit/a891b943b572e5e55a7ec54a87ba0f9a9322e29d))
* **shared:** check host channels strictly and fix stale docs ([#1994](https://github.com/Miragon/bpmn-modeler/issues/1994)) ([040af7b](https://github.com/Miragon/bpmn-modeler/commit/040af7b0fa5ff09f0c3c2e8c611ffaf495f985be))


### =Ô Documentation

* **modeler-core:** fix references after the kernel and editorSession split ([#1933](https://github.com/Miragon/bpmn-modeler/issues/1933)) ([8c809e9](https://github.com/Miragon/bpmn-modeler/commit/8c809e93bdf98b85b3c3f22007c9e0e1d92ab0c6))


### =à Misc

* **deps:** bump gradle-wrapper from 9.8.1 to 9.8.2 in /apps/intellij-plugin in the gradle-minor-patch group ([#1925](https://github.com/Miragon/bpmn-modeler/issues/1925)) ([93fbab7](https://github.com/Miragon/bpmn-modeler/commit/93fbab7df32e22c3a471043daac62b9ce3b1fc71))
* **intellij-plugin:** compile the shipped plugin at kotlin api 2.1 ([#1873](https://github.com/Miragon/bpmn-modeler/issues/1873)) ([d1d4236](https://github.com/Miragon/bpmn-modeler/commit/d1d42363ea2ecca472e86ca238e4d2035105bd38))
* **intellij-plugin:** enforce a jacoco coverage floor ([#1797](https://github.com/Miragon/bpmn-modeler/issues/1797)) ([c4be3d4](https://github.com/Miragon/bpmn-modeler/commit/c4be3d4f5f6b68e99044657ead10947abe6647fa))
* **intellij-plugin:** pin one kotlin handler per core-to-host method ([#1898](https://github.com/Miragon/bpmn-modeler/issues/1898)) ([e2917de](https://github.com/Miragon/bpmn-modeler/commit/e2917de694be445d984003370bd08955fe3f761f))
* **intellij-plugin:** stop the random 'parent project disposed' failures in the unit tests ([#1863](https://github.com/Miragon/bpmn-modeler/issues/1863)) ([539e8ff](https://github.com/Miragon/bpmn-modeler/commit/539e8ff152660ada63481a4ee484d938da64fc32))
</details>

<details><summary>dmn-modeler: 0.5.0</summary>

## [0.5.0](https://github.com/Miragon/bpmn-modeler/compare/dmn-modeler-v0.4.0...dmn-modeler-v0.5.0) (2026-10-31)


### <‰ New Features

* **bpmn-modeler:** translate popup-menu search keywords ([#1781](https://github.com/Miragon/bpmn-modeler/issues/1781)) [sync cae0009] ([432bbd7](https://github.com/Miragon/bpmn-modeler/commit/432bbd773e762ffa383631020639f90004f1b8e5))


### = Bug Fixes

* **bpmn-modeler:** flush panel input on save and read the bound engine ([#2064](https://github.com/Miragon/bpmn-modeler/issues/2064)) [sync 33c466b] ([66e60bb](https://github.com/Miragon/bpmn-modeler/commit/66e60bb7c28f0bd7e6b0dfe5b4ff367edf83d4ec))
* **bpmn-modeler:** keep theme in step across destroy and mode switches ([#1734](https://github.com/Miragon/bpmn-modeler/issues/1734)) ([6fb3ba9](https://github.com/Miragon/bpmn-modeler/commit/6fb3ba91f490f0c7e065cdf63d585a2d7d7971bd))
* **element-template-chooser:** show "1 property" for a single template property ([#1794](https://github.com/Miragon/bpmn-modeler/issues/1794)) [sync abfa4ee] ([965a8e8](https://github.com/Miragon/bpmn-modeler/commit/965a8e8ad927a1c07ca32b94fa2cff4899b799d4))
* **i18n:** offer every shipped language in the language settings ([#2006](https://github.com/Miragon/bpmn-modeler/issues/2006)) [sync bf9de92] ([fa0344d](https://github.com/Miragon/bpmn-modeler/commit/fa0344df48c474092b5f094b4d2461bdd90ee297))
* **modeler-core:** read the executable process id under any bpmn prefix ([#1949](https://github.com/Miragon/bpmn-modeler/issues/1949)) [sync db53e2e] ([52b0e3f](https://github.com/Miragon/bpmn-modeler/commit/52b0e3ff93e954fa59447237cc37a82d7b41cf6f))
* **modeler-core:** stop migration from stamping duplicate execution-platform attributes ([#1862](https://github.com/Miragon/bpmn-modeler/issues/1862)) [sync 18c157a] ([6aab597](https://github.com/Miragon/bpmn-modeler/commit/6aab5979a4576ee7190b6239f273a68c480931c6))
* **modeler-types:** scan xml comments and cdata in document order ([#1970](https://github.com/Miragon/bpmn-modeler/issues/1970)) [sync 249398c] ([7d61046](https://github.com/Miragon/bpmn-modeler/commit/7d610469dd8abdf246f37f26ca9643a180dd385e))
* **shared:** hold a quickly narrowed properties panel at its minimum width ([#1698](https://github.com/Miragon/bpmn-modeler/issues/1698)) [sync f92e122] ([74417fa](https://github.com/Miragon/bpmn-modeler/commit/74417fac1d705768bac5a2fce16e30ca200f8e23))


### =( Refactoring

* **modeler-core:** share document sync and surface lifecycles ([#1776](https://github.com/Miragon/bpmn-modeler/issues/1776)) ([f4c099f](https://github.com/Miragon/bpmn-modeler/commit/f4c099fbeef9c8ab0bc09338ad959569bf55614f))


### =Ô Documentation

* **bpmn-modeler:** document yarn berry resolutions for upstream carets ([#1782](https://github.com/Miragon/bpmn-modeler/issues/1782)) ([0246c4d](https://github.com/Miragon/bpmn-modeler/commit/0246c4d2595866a8cb86197ab3ad5e405295267e))


### =à Misc

* **architecture-testing:** run the modeler package specs on the engine ([#2085](https://github.com/Miragon/bpmn-modeler/issues/2085)) ([286c9e0](https://github.com/Miragon/bpmn-modeler/commit/286c9e0302f5068bb1bb0e1eed7b02f8236aca02))
* **ci:** gate coverage reports on code changes and enforce thresholds ([#1682](https://github.com/Miragon/bpmn-modeler/issues/1682)) ([e2bf365](https://github.com/Miragon/bpmn-modeler/commit/e2bf3650949daf8d445466ace1eb769a89a87b4f))
* **ci:** raise drifted coverage floors and type-check spec files ([#1796](https://github.com/Miragon/bpmn-modeler/issues/1796)) ([88359d4](https://github.com/Miragon/bpmn-modeler/commit/88359d4ef080929e369a6736134e1cd282f0e17b))
* **ci:** run every vitest workspace from one target registry ([#1687](https://github.com/Miragon/bpmn-modeler/issues/1687)) ([b0c1940](https://github.com/Miragon/bpmn-modeler/commit/b0c19402c84b2a1f496fa20728e97f9a254b8885))
* **deps:** bump @bpmn-io/properties-panel from 3.56.1 to 3.57.0 in the bpmn-io group ([#1665](https://github.com/Miragon/bpmn-modeler/issues/1665)) ([00808c7](https://github.com/Miragon/bpmn-modeler/commit/00808c70f667d6eb6848e943ead9d7a2577105ca))
* **deps:** bump the npm-minor-patch group across 1 directory with 10 updates ([#1667](https://github.com/Miragon/bpmn-modeler/issues/1667)) ([4fb5db5](https://github.com/Miragon/bpmn-modeler/commit/4fb5db55c3e1f5891598189d720ed292691634ca))
* **deps:** bump the npm-minor-patch group across 1 directory with 8 updates ([#1758](https://github.com/Miragon/bpmn-modeler/issues/1758)) ([c1a1cd3](https://github.com/Miragon/bpmn-modeler/commit/c1a1cd3279cbf9137b337422ed71f05d416c9347))
</details>

---
This PR was generated with [Release Please](https://github.com/googleapis/release-please). See [documentation](https://github.com/googleapis/release-please#release-please).