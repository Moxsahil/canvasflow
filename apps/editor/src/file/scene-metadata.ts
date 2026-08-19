import extractChunks from 'png-chunks-extract';
import encodeChunks from 'png-chunks-encode';
import tEXt from 'png-chunk-text';

export const SCENE_METADATA_KEY = 'application/vnd.canvasflow+json';

/** Marks the payload inside an SVG, which has no chunk structure to use. */
const SVG_PAYLOAD_START = '<!-- canvasflow-scene:';
const SVG_PAYLOAD_END = '-->';

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  // Chunked: spreading a large array into fromCharCode overflows the stack.
  const STEP = 0x8000;
  for (let i = 0; i < bytes.length; i += STEP) {
    binary += String.fromCharCode(...bytes.subarray(i, i + STEP));
  }
  return btoa(binary);
}

function fromBase64(encoded: string): string {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export async function embedSceneInPng(blob: Blob, sceneJson: string): Promise<Blob> {
  const chunks = extractChunks(new Uint8Array(await blob.arrayBuffer()));
  const payload = tEXt.encode(SCENE_METADATA_KEY, toBase64(sceneJson));
  chunks.splice(chunks.length - 1, 0, payload);
  const encoded = encodeChunks(chunks);
  // Copied into a fresh buffer: the encoder may hand back a view over a larger
  // pooled ArrayBuffer, and Blob would then include the slack.
  return new Blob([new Uint8Array(encoded)], { type: 'image/png' });
}

/** The board JSON inside a PNG, or null if it carries none. */
export function extractSceneFromPng(data: Uint8Array): string | null {
  let chunks;
  try {
    chunks = extractChunks(data);
  } catch {
    // Not a PNG, or a damaged one.
    return null;
  }

  for (const chunk of chunks) {
    if (chunk.name !== 'tEXt') continue;
    try {
      const decoded = tEXt.decode(chunk.data);
      if (decoded.keyword === SCENE_METADATA_KEY) return fromBase64(decoded.text);
    } catch {
      // A text chunk we can't read isn't ours; keep looking.
    }
  }
  return null;
}

/** The same payload for SVG, which carries it in a comment. */
export function embedSceneInSvg(svg: string, sceneJson: string): string {
  const comment = `${SVG_PAYLOAD_START}${toBase64(sceneJson)}${SVG_PAYLOAD_END}\n`;
  // After the XML declaration so the document still parses.
  const insertAt = svg.indexOf('<svg');
  return insertAt === -1 ? comment + svg : svg.slice(0, insertAt) + comment + svg.slice(insertAt);
}

export function extractSceneFromSvg(svg: string): string | null {
  const start = svg.indexOf(SVG_PAYLOAD_START);
  if (start === -1) return null;
  const from = start + SVG_PAYLOAD_START.length;
  const end = svg.indexOf(SVG_PAYLOAD_END, from);
  if (end === -1) return null;
  try {
    return fromBase64(svg.slice(from, end).trim());
  } catch {
    return null;
  }
}
