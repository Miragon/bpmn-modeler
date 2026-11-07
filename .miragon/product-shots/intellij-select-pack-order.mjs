export default async function selectPackOrder(editor, window) {
  await editor.click('[data-element-id="Task_Pack"]')
  await window.pause(1200)
}
