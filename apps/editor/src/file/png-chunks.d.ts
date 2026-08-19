/**
 * The png-chunk* packages ship no types. These declarations cover exactly the
 * surface we use to read and write a PNG's text chunks.
 */
declare module 'png-chunks-extract' {
  interface PngChunk {
    name: string;
    data: Uint8Array;
  }
  export default function extractChunks(data: Uint8Array): PngChunk[];
}

declare module 'png-chunks-encode' {
  interface PngChunk {
    name: string;
    data: Uint8Array;
  }
  export default function encodeChunks(chunks: PngChunk[]): Uint8Array;
}

declare module 'png-chunk-text' {
  interface TextChunk {
    keyword: string;
    text: string;
  }
  export function encode(keyword: string, text: string): { name: string; data: Uint8Array };
  export function decode(data: Uint8Array): TextChunk;
  const _default: {
    encode: typeof encode;
    decode: typeof decode;
  };
  export default _default;
}
