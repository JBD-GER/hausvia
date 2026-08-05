import { readFileSync } from "node:fs";
import { join } from "node:path";

const logoWidth = 1200;
const logoHeight = 271;
const logoBytes = readFileSync(join(process.cwd(), "public", "hausvia-logo-pdf.jpg"));

export const hausviaPdfLogoResourceName = "HausviaLogo";

export function createHausviaPdfLogoObject() {
  return [
    `<< /Type /XObject /Subtype /Image /Width ${logoWidth} /Height ${logoHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logoBytes.length} >>`,
    "stream",
    logoBytes.toString("latin1"),
    "endstream",
  ].join("\n");
}

export function drawHausviaPdfLogo(x: number, y: number, width: number) {
  const height = (width * logoHeight) / logoWidth;
  return `q ${width.toFixed(2)} 0 0 ${height.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /${hausviaPdfLogoResourceName} Do Q`;
}
