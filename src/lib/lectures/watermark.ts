import { PDFDocument, rgb, degrees } from "pdf-lib";

const WATERMARK_TEXT = "David Birger";
const FONT_SIZE = 32;
const OPACITY = 0.08;
const ROTATION_DEG = -45;
const GAP_X = 200;
const GAP_Y = 150;

export async function applyWatermark(pdfBytes: Uint8Array | Buffer) {
  const doc = await PDFDocument.load(pdfBytes);
  const font = await doc.embedFont("Helvetica");
  const rad = Math.abs(ROTATION_DEG) * Math.PI / 180;
  const textWidth = font.widthOfTextAtSize(WATERMARK_TEXT, FONT_SIZE);
  const stepX = textWidth * Math.cos(rad) + GAP_X;
  const stepY = textWidth * Math.sin(rad) + GAP_Y;

  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    const diagonal = Math.sqrt(width * width + height * height);

    for (let y = -diagonal / 2; y < diagonal; y += stepY) {
      for (let x = -diagonal / 2; x < diagonal; x += stepX) {
        page.drawText(WATERMARK_TEXT, {
          x,
          y,
          size: FONT_SIZE,
          font,
          color: rgb(0.6, 0.6, 0.6),
          opacity: OPACITY,
          rotate: degrees(ROTATION_DEG),
        });
      }
    }
  }

  return doc.save();
}
