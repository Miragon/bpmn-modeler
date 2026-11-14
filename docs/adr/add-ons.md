# Add-ons

- Status: accepted
- Last reviewed: 2026-11-14

## Context

A workspace brings [BPMN plugins](bpmn-plugins.md), [rule packages](bpmn-linting.md), element
templates and template marketplaces. The Add-ons view lists them in VS Code, the standalone app and
IntelliJ, and is where a user allows or revokes code and turns templates off
([#2263](https://github.com/Miragon/bpmn-modeler/issues/2263) read model,
[#2250](https://github.com/Miragon/bpmn-modeler/issues/2250) views,
[#2321](https://github.com/Miragon/bpmn-modeler/issues/2321) redesign). Whether code may run is
decided by its [allowance](code-allowance.md); this topic records the catalog and its view.

## Contents

- [Catalog](#catalog)
- [Allow and revoke](#allow-and-revoke)
- [Page protocol and reveals](#page-protocol-and-reveals)
- [README, license and stars](#readme-license-and-stars)
- [The page](#the-page)
- [Brand look](#brand-look)
- [VS Code](#vs-code)
- [IntelliJ](#intellij)
- [Alternatives](#alternatives)

## Decision

### Catalog

The `addOns` context of the core is the host-neutral read model of the view. It owns no rule of
what it lists. Each owner meets a structural port of `addOns/port/` with an inventory that imports
nothing of `addOns/` (`PluginInventory`, `RulePackageInventory`, `TemplateInventory`,
`MarketplaceInventory`), and the host compositions hand one to the other
([package boundaries](architecture-and-hosts.md#package-boundaries)). The context is named after
the view; the `Artifact` prefix in the core belongs to `ArtifactService`.

- *The core builds everything a row says*: its text, its state and the actions it offers
  (`catalogModelOf`). The state is the same reading the notices use
  ([asking](code-allowance.md#asking)).
- *Scope.* The catalog lists the open workspace only: each workspace folder's root config folder,
  the nested config folders an editor or a listing already looked in, each folder's `node_modules`
  and the packages the lint gate reported. Allowance rows are not listed. An allowance names an
  add-on, not a folder, so an add-on that only one branch has is missing from the other worktrees,
  and a Revoke there would take it from the worktree that has it.
- *Builds* run only while a view is visible, one at a time. Each reads the host's stored lists, not
  the mirrors, so an unseeded IntelliJ mirror never makes every row look new. A build writes
  nothing. `node_modules` is not watched, so a refresh or a view shown again reads it.
- A listing that throws is logged and still reaches the views: the model shown before stays, with a
  problem, under its own revision so an allow against it holds.
- *Marketplace actions* (add, update, remove) run the host's `MarketplaceCommands`, the same
  instance its commands run, so a flow started from either queues behind the other and asks its own
  questions. A removal names the entry the latest build showed, never a payload.
- *Template switches* are offered here; their rules are in
  [element templates](element-templates.md#template-switches).

Residual: rule package ids come only from the workspace folders' `node_modules` and from what the
gate reported in this process. After a restart an allowed config's own package is missing from the
view, and cannot be revoked there, until a lint reports it.

### Allow and revoke

A code row offers Allow when it was found and is not allowed, and Revoke while its allowance holds;
an unreadable row that is not allowed offers nothing, and its problem says why. In an untrusted
workspace no row offers Allow ([host trust](code-allowance.md#host-trust)). Every row that offers
Allow carries the review: what the code can do, and how far the allowance reaches.

- *Allow by the shown allowance.* Each build has a revision, counted from the clock so a view kept
  across a respawn never names one the new process used. An allow names its revision and is refused
  unless that revision offered it. The allowance comes from what that revision showed, never from a
  payload. The owner reads the place again, and the allow is refused when the place is gone, cannot
  be read or now resolves to another allowance key.
- *Revoke* is refused unless the latest revision offered it. It first waits for the start-up
  migration, which could otherwise write back the allowance it takes, and records the allowance as
  left to the view before the change, so no notice in this process asks about it at once. Other
  windows and projects reload or relint and ask again: the user withdrew trust.
- A view's request is untrusted. The core keeps only a known kind with the fields it names
  (`addOnRequestOf`) and refuses anything else as not offered. Ids are only looked up in what the
  core recorded, never parsed.
- The view's actions run on a queue of their own, so a notice left open never holds back the view.

### Page protocol and reveals

The view (`apps/add-ons-webview`, surface `addOnsView`) has the shape of every other surface
([webview protocol](webview-protocol-and-sync.md#protocol)). Its messages sit in a feature file of
`libs/shared` (`addOnsView.ts`), and `AddOnViewMessages` in the core maps the protocol for one page,
so no host translates it; a host passes only a `post` and the page's commands.
`AddOnViewMessages.spec.ts` pins the payloads to the core's model.

- The model holds workspace text (file, template and folder names), so the page builds its DOM with
  the DOM API and never with `innerHTML`.
- A page asks for the last model when it loads, since a push can land before it listens.
- A reveal names its target: the rows a **Review…** left to the view, or every add-on that needs
  review (**Review Add-ons**). The latest reveal wins and is delivered at most once to each attached
  view while it is visible, so a view shown or attached later still lands on it. Reveal ids start
  from the clock, as revisions do.
- **Review…** is core-first (`AddOnViewRevealPort`), because the core decides whether a view can
  show the rows; where the host cannot show its view the adapter answers `false` and the checklist
  asks instead. **Review Add-ons** is host-first: the host shows its view and then asks the core,
  because the IntelliJ tab must open at once while a cold bridge still starts.
  `describeAddOnViewRevealContract` runs against both hosts' adapters.

### README, license and stars

A detail shows, below the core's facts, the README and license of a plugin, a rule package or a
marketplace, and a marketplace's stars
([#2467](https://github.com/Miragon/bpmn-modeler/pull/2467), proposed).

- *The page asks per detail; the catalog does not carry it.* Every build goes to every view, and a
  README can be large. The page asks about the target it shows, again for a newer revision, and the
  core answers `NO_ABOUT` for anything it holds nothing for. A README is cut at 200 000 characters.
- *The core reads only places it recorded.* A build keeps, by the id the view knows, the folder of
  each plugin and rule package and what each marketplace's cache holds (`aboutPlacesOf`). A view
  names an id and never a path, as for every request.
- *A folder add-on's license is the one it declares*, the `license` of its own `package.json`, read
  when its detail asks, so a listing reads no extra file per plugin.
- *A marketplace's README, stars and license are fetched with its manifest*, in the same
  authenticated run, and cached: its 404 means none and never prompts for a token, and another
  failure keeps the cached copy. They come from the host's repository request (GitHub
  `stargazers_count` and `license`, GitLab `star_count` and `license`), which GitHub's default-branch
  lookup already makes. Asking on every detail would spend GitHub's anonymous 60 requests an hour,
  so stars read "as of the last marketplace update". A local folder has none. Each sits in a folder
  of its own beside the source slots, which no slot index can name, as the workspace port deletes
  folders, not files.
- *A host's "no license file" shows as such.* Content without a license grants no reuse, which
  matters before a team builds on a marketplace.
- *A plugin from a marketplace ([#2243](https://github.com/Miragon/bpmn-modeler/issues/2243)) shows
  its own declared license, else the license of the repository its source is fetched from, marked as
  that repository's.* Never the marketplace root's license: a source may point to another
  repository, which the marketplace's license does not cover. Its cached folder carries its own
  README, read like a workspace plugin's.
- *A marketplace has a detail of its own*, opened from its header, because its README describes the
  marketplace, not any one template.
- *Markdown becomes DOM from `marked`'s tokens, never HTML.* A README is workspace text, and a
  plugin's README is read before the user allows its code. Raw HTML is dropped, an image shows its
  alt text, and only an absolute `http(s):` or `mailto:` link stays a link. The cost: badges,
  screenshots and HTML layout in a README do not show, and a relative link is text.
  `markdownView.spec.ts` checks it.

### The page

- *Page kinds.* The host writes which page it serves into the shell (`data-add-ons-page`): `list`
  shows the detail beside the list or in its place, for a host without tabs (IntelliJ);
  `listWithTab` opens the detail in an editor tab (VS Code, and the standalone app through it);
  `detail` is that tab's one add-on. A host capability is no catalog data, so it rides in the shell;
  a model flag was rejected for that.
- *One list, three sections*: Needs attention (every add-on that offers Allow or carries a problem),
  Installed and Marketplaces. An add-on shows in one place only, so its id names one row and one
  focus target. The core knows no sections.
- The review is always open, with Allow at its end after the warning, so Allow is never on screen
  without the review above it. A sticky Allow was rejected for that reason.
- A row's "Waiting" and "Not loaded" are read from what the core offers and from its problem, never
  from a rule of the page's own.
- The view's own words (section, menu and empty-state labels, screen-reader summaries) live in one
  module, `chromeTexts.ts`. They name the view's controls, which the core's model does not have.
  Every other text comes from the core.
- Every control is reached with Tab; the list has no roving tree. Container queries decide the
  layout, so it follows a resized sidebar or tool window without a reload.
- The selection and the open headers go into the host's saved state, so a reload, which IntelliJ
  does after a bridge restart, lands where the user was.

### Brand look

The view wears the Miragon brand look, not the host's: it is Miragon's own product surface, and one
look serves both hosts. Its tokens switch on `<html data-cd-theme>` and `data-cd-kontrast`, never on
IDE colours. The host only signals the mode and is its only writer. One rule, `brandModeOf` in
`libs/shared`, maps the IDE theme and the `colorTheme` setting to the mode, and high contrast always
passes through. Each host writes the attributes into the shell it serves, so the first frame paints
in the mode. IntelliJ's Kotlin copy runs `brandMode.cases.json`.

- The stylesheet reads no `--vscode-*` variable; its spec checks that and the vendored tokens'
  checksum. The type sizes are the brand's, so the IDE's font size does not reach the page.
- Fonts (Geist, OFL-1.1) and icons (Lucide, ISC) ship in the bundle, so both plugins carry their
  licenses. The add-ons build emits them beside the bundle, and the IntelliJ release check
  (`verifyReleaseBundles`) fails without them.
- The shells' CSP allows styles and fonts from the bundle alone
  ([bundle and CSP](webview-protocol-and-sync.md#bundle-and-csp)).

### VS Code

- The activity bar has two containers with one view each, **Add-ons** and **Deploy**. Each view then
  has the side bar's full height, and VS Code draws no second pane header over the page's own
  sections. Add-ons comes first, because Deploy's container comes and goes with the editors and would
  otherwise move the Add-ons icon. Deploy kept its container's id and the views kept theirs, so a
  user's layout and keybindings survive.
- A container wears a Lucide sign, not the Miragon comet: the brand gives the comet to Miragon
  itself, and it stays on IntelliJ's tool window stripe.
- An add-on's details open in one editor tab, reused for the next add-on, because a side bar under
  640px cannot show a detail beside the list. No serializer restores the tab, so a window reload
  closes it.
- Both views and the tab set `retainContextWhenHidden`: the core posts nothing to a hidden view, so
  keeping its page costs memory only, and a page shown again keeps its banners and the results of
  requests in flight.
- **Refresh Add-ons** is host chrome over the core's refresh, since no watcher covers
  `node_modules`. Code names and ids say `addOns`.
- The provider focuses the view a second time on the page's first message, since a page that is
  still loading loses the first focus (the smoke test found a fresh view left unfocused).
- The composition connects the reveal and the detail port once the catalog exists: the reviews are
  built before the editor that takes them, and activation is synchronous, so no notice can ask
  earlier.

The standalone app's handling of restored view containers is in
[Standalone app](standalone-app.md#restored-view-containers).

### IntelliJ

- The view is the **Add-ons** tab of the BPMN Modeler tool window, next to **Deploy**. A tool window
  tab already has the window's full height, so IntelliJ keeps one tool window where VS Code gives
  each view its own container. The tool window keeps the id of the former deployment tool window,
  so a saved layout still applies.
- Each tab is one JCEF page that relays its messages verbatim and counts as open only while the tool
  window is visible and the tab selected, so Deploy refreshes its form defaults only while it shows.
  The Add-ons browser is built the first time its tab shows, since each browser costs a renderer.
- The shell maps no IDE colour or font; it carries only the brand mode.
- The bridge attaches one hidden panel at start. Every process after the first reloads the page:
  only a result frees a busy row, and a request the dead process took would leave its row busy. For
  the same reason the view's relays are reliable frames ([bridge](intellij-bridge.md#process-lifecycle)).
- The tab's refresh button exists because nothing reports an installed package or another window's
  approval.

### Alternatives

- **Following the IDE's look** through VS Code's `--vscode-*` variables, with IntelliJ mapping its
  palette onto the same names. That needed a pinned list of every variable the stylesheet read, a
  Kotlin mapping held to it and `'unsafe-inline'` in IntelliJ's shell, and still looked different in
  each host. The brand look costs the view its match with the IDE's colours and font size.
- **Two tabs, Workspace and Marketplaces, with four filter chips.** In a side bar they took most of
  the height before the first row, and a waiting add-on hid among settled ones. One list costs the
  marketplaces a place at the end of a long workspace list.
- **A filter menu behind an icon.** It hid that the view lists three kinds, and choosing one took
  two clicks.
- **The view's own words in the catalog model.** They name controls of one page, not the catalog,
  so each would be a protocol field no other view reads. Keeping them in `chromeTexts.ts` costs a
  second home for words, so a review checks that a new word there names the view and does not
  restate a model text.
- **The README and license in the catalog model**, read on every build. It costs reads per plugin
  on each rebuild and resends every README to every view. **Stars asked live** on each detail would
  be current, but spend the anonymous rate limit the template fetch needs. **`innerHTML` behind a sanitizer** would show
  more of a README, but puts one library between workspace text and the page's DOM.
- **A roving tree** kept the list one tab stop. The list-and-detail layout of #2321 puts each row's
  actions in the detail pane, and the product decision put that layout before the tree model.
  Dropping it costs keyboard users one Tab per shown row and header.
