import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import PDFDocument from 'pdfkit';
import type { ContractClause, SignatureMethod } from '@ssm/shared';

/** Font DejaVu (có đủ dấu tiếng Việt) lấy từ package dejavu-fonts-ttf — font chuẩn của PDF không có chữ có dấu. */
const fontDir = () => join(dirname(createRequire(join(process.cwd(), 'package.json')).resolve('dejavu-fonts-ttf/package.json')), 'ttf');

export interface ContractPdfInput {
  code: string;
  contractNumber?: string | null;
  facilityName: string;
  customerName: string;
  clauses: ContractClause[];
  signature: { signedAt: Date; signerName: string; method: SignatureMethod; image?: string | null; onBehalf: boolean };
  generatedAt: Date;
}

const fmt = (d: Date) => d.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

/** Dựng PDF hợp đồng đã ký (A4). Chữ ký vẽ tay chèn dạng ảnh PNG; ký bằng họ tên thì in họ tên kiểu chữ ký. */
export function buildContractPdf(input: ContractPdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const dir = fontDir();
    const doc = new PDFDocument({ size: 'A4', margin: 56, info: { Title: `Hợp đồng thuê kho ${input.code}`, Author: 'KhoAn', Subject: 'Hợp đồng thuê kho' } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.registerFont('regular', join(dir, 'DejaVuSans.ttf'));
    doc.registerFont('bold', join(dir, 'DejaVuSans-Bold.ttf'));
    doc.registerFont('italic', join(dir, 'DejaVuSans-Oblique.ttf'));

    doc.font('bold').fontSize(16).fillColor('#1c1917').text('HỢP ĐỒNG THUÊ KHO', { align: 'center' });
    doc.moveDown(0.3).font('regular').fontSize(9).fillColor('#78716c')
      .text(`Mã đặt chỗ ${input.code}${input.contractNumber ? ` · Số hợp đồng ${input.contractNumber}` : ''}`, { align: 'center' });
    doc.moveDown(1.2);

    for (const c of input.clauses) {
      doc.font('bold').fontSize(11).fillColor('#1c1917').text(c.title);
      doc.moveDown(0.25).font('regular').fontSize(10).fillColor('#292524');
      for (const p of c.paragraphs) doc.text(p, { align: 'justify', lineGap: 2 }).moveDown(0.3);
      if (c.bullets.length) doc.list(c.bullets, { bulletRadius: 1.5, bulletIndent: 8, textIndent: 16, lineGap: 2, paragraphGap: 3 });
      doc.moveDown(0.7);
    }

    // Khối chữ ký không bị cắt đôi giữa hai trang.
    if (doc.y > doc.page.height - doc.page.margins.bottom - 150) doc.addPage();
    doc.moveDown(0.5);
    const top = doc.y;
    const colW = (doc.page.width - doc.page.margins.left - doc.page.margins.right) / 2;
    const left = doc.page.margins.left;

    doc.font('bold').fontSize(10).fillColor('#1c1917').text('ĐẠI DIỆN BÊN CHO THUÊ', left, top, { width: colW, align: 'center' });
    doc.font('regular').fontSize(9).fillColor('#78716c').text(`KhoAn — ${input.facilityName}`, left, top + 16, { width: colW, align: 'center' });
    doc.fontSize(9).fillColor('#047857').text('Xác nhận điện tử qua hệ thống KhoAn', left, top + 60, { width: colW, align: 'center' });

    const rx = left + colW;
    doc.font('bold').fontSize(10).fillColor('#1c1917').text('BÊN THUÊ', rx, top, { width: colW, align: 'center' });
    doc.font('regular').fontSize(9).fillColor('#78716c').text(input.customerName, rx, top + 16, { width: colW, align: 'center' });
    let sigBottom = top + 100;
    if (input.signature.method === 'DRAWN' && input.signature.image) {
      const png = Buffer.from(input.signature.image.replace(/^data:image\/png;base64,/, ''), 'base64');
      doc.image(png, rx + (colW - 170) / 2, top + 34, { fit: [170, 56] });
    } else {
      doc.font('italic').fontSize(18).fillColor('#1c1917').text(input.signature.signerName, rx, top + 44, { width: colW, align: 'center' });
    }
    doc.font('regular').fontSize(9).fillColor('#292524').text(input.signature.signerName, rx, top + 90, { width: colW, align: 'center' });
    const how = `${input.signature.method === 'DRAWN' ? 'Ký tay' : 'Ký bằng họ tên'} · ${fmt(input.signature.signedAt)}${input.signature.onBehalf ? ' · nhân viên thao tác tại quầy' : ''}`;
    doc.fontSize(8).fillColor('#78716c').text(how, rx, top + 103, { width: colW, align: 'center' });
    sigBottom = top + 118;

    doc.y = sigBottom;
    doc.moveDown(1).font('italic').fontSize(8).fillColor('#a8a29e')
      .text(`Văn bản điện tử được lập tự động từ hệ thống KhoAn lúc ${fmt(input.generatedAt)}.`, left, doc.y, { width: colW * 2, align: 'center' });
    doc.end();
  });
}
