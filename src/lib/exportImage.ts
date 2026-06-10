import { toPng } from 'html-to-image'

/**
 * Serialize a DOM node to a PNG and trigger a download.
 * Used to export the finished roundtable as a shareable image.
 */
export async function exportNodeAsPng(node: HTMLElement, filename = 'archetype-roundtable.png') {
  const dataUrl = await toPng(node, {
    pixelRatio: 2,
    cacheBust: true,
    // Match the app backdrop so the export isn't transparent.
    backgroundColor: '#0c0a12',
  })
  const link = document.createElement('a')
  link.download = filename
  link.href = dataUrl
  link.click()
}
