export const FORM_TEMPLATE = `
<div class="form-shell">
    <header class="form-toolbar" role="toolbar" aria-label="Form view">
        <button id="edit-view" class="view-switch active" type="button" aria-pressed="true">Edit</button>
        <button id="preview-view" class="view-switch" type="button" aria-pressed="false">Preview</button>
    </header>
    <div id="form-error" class="form-error" role="alert" hidden></div>
    <main class="form-content">
        <div id="form-editor" class="form-surface"></div>
        <div id="form-preview" class="form-surface" hidden></div>
    </main>
</div>`;
