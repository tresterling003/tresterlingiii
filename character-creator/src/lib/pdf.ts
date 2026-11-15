import { BRIEF_FIELDS, NEXT_STEPS, REMINDER, type Brief } from './brief';

// jsPDF's built-in fonts cover Western European text. Tidy up "smart" punctuation,
// and report anything else (emoji, other alphabets) so the caller can use the
// browser's own Save-as-PDF instead, which handles every script.
const SWAPS: [RegExp, string][] = [
  [/[\u2018\u2019\u201A\u2032]/g, "'"],
  [/[\u201C\u201D\u201E\u2033]/g, '"'],
  [/[\u2013\u2014\u2212]/g, '-'],
  [/\u2026/g, '...'],
  [/[\u2022\u25CF\u25AA]/g, '-'],
  [/\u00A0/g, ' '],
];
export const pdfSafe = (s: string) => SWAPS.reduce((t, [re, to]) => t.replace(re, to), s);
export const canRenderInPdf = (s: string) => !/[^\n\r\t\x20-\x7E\u00A1-\u00FF]/.test(pdfSafe(s));

export function fileName(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return `${slug || 'my-character'}-character-brief.pdf`;
}

export async function downloadPdf(brief: Brief, prompt: string): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 54;
  const maxW = W - M * 2;
  const NAVY: [number, number, number] = [11, 31, 75];
  const BLUE: [number, number, number] = [31, 95, 209];
  const GOLD: [number, number, number] = [245, 184, 28];
  const INK: [number, number, number] = [28, 34, 51];
  let y = 0;

  const room = (h: number) => {
    if (y + h > H - M) {
      doc.addPage();
      y = M;
    }
  };
  // Writes wrapped text one line at a time so a long answer flows onto the next page instead of being cut off.
  const para = (text: string, o: { size?: number; style?: string; font?: string; color?: [number, number, number]; indent?: number; lead?: number } = {}) => {
    const size = o.size ?? 11;
    const lead = o.lead ?? size * 1.42;
    doc.setFont(o.font ?? 'helvetica', o.style ?? 'normal');
    doc.setFontSize(size);
    doc.setTextColor(...(o.color ?? INK));
    for (const block of pdfSafe(text).split('\n')) {
      const lines: string[] = block.trim() === '' ? [''] : doc.splitTextToSize(block, maxW - (o.indent ?? 0));
      for (const line of lines) {
        room(lead);
        doc.text(line, M + (o.indent ?? 0), y + size * 0.8);
        y += lead;
      }
    }
  };
  const heading = (text: string) => {
    room(60);
    y += 10;
    doc.setFillColor(...GOLD);
    doc.rect(M, y, 28, 4, 'F');
    y += 12;
    para(text, { size: 15, style: 'bold', color: NAVY });
    y += 4;
  };

  // Title band
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, W, 104, 'F');
  doc.setFillColor(...GOLD);
  doc.rect(0, 104, W, 5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...GOLD);
  doc.text('CARTOON CHARACTER CREATOR', M, 40);
  doc.setFontSize(24);
  doc.setTextColor(255, 255, 255);
  doc.text(doc.splitTextToSize(pdfSafe(brief.name), maxW)[0], M, 72);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Digital Arts & Animation 1  |  Early concept: everything here can still change.', M, 90);
  y = 124;

  heading('CHARACTER BRIEF');
  for (const f of BRIEF_FIELDS) {
    room(34);
    para(f.label.toUpperCase(), { size: 8.5, style: 'bold', color: BLUE });
    para(brief[f.key], { size: 11 });
    y += 7;
  }

  heading('GENERATE YOUR 5 CHARACTER SKETCHES');
  para('Paste the prompt below into ChatGPT or another AI tool that can create images. The quiz did not make any sketches; the image tool does that part.', { size: 10, style: 'italic' });
  y += 8;
  para(prompt, { size: 9.5, font: 'courier', lead: 13 });

  heading('WHAT TO DO NEXT');
  NEXT_STEPS.forEach((s, i) => para(`${i + 1}. ${s}`, { size: 11 }));
  y += 8;
  para(REMINDER, { size: 10.5, style: 'italic', color: NAVY });

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(120, 128, 150);
    doc.text(`Page ${i} of ${pages}`, W - M, H - 28, { align: 'right' });
  }
  doc.save(fileName(brief.name));
}
