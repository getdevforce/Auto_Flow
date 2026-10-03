import { unzipSync, strFromU8 } from 'fflate';
import { cleanFountain, docxXmlToText } from '@frameloom/shared';

/** S0: turn an imported file into plain script text. Supports .txt, .md, .fountain and .docx. */
export async function importScriptFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.docx')) {
    const files = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: (f) => f.name === 'word/document.xml' });
    const xml = files['word/document.xml'];
    if (!xml) throw new Error('That .docx has no readable document. Re-save it from Word and try again.');
    return docxXmlToText(strFromU8(xml));
  }
  const text = await file.text();
  return name.endsWith('.fountain') ? cleanFountain(text) : text;
}
