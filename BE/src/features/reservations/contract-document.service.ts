import { buildContractClauses } from '@ssm/shared';
import {
  FacilityModel, PolicyModel, RentalContractModel, ReservationModel, StorageUnitModel, UnitTypeModel, UserModel,
  type ReservationHydrated, type UserHydrated,
} from '../../shared/db/models';
import { AppError, Conflict, NotFound, Unprocessable } from '../../shared/core/errors';
import { assertCanAccess } from '../../shared/http/scope';
import { sendMail } from '../../shared/mail/mailer';
import { effectivePolicy } from '../policies/pricing';
import { buildContractPdf } from '../contracts/contract-pdf';

const maskEmail = (e: string) => e.replace(/^(.)[^@]*(@.*)$/, '$1***$2');

async function loadSigned(id: string) {
  const r = await ReservationModel.findById(id);
  if (!r) throw NotFound('đặt chỗ');
  return r;
}

/** Gom dữ liệu từ DB rồi dựng PDF hợp đồng đã ký — nội dung điều khoản lấy từ cùng hàm dùng cho web/mobile. */
async function renderPdf(r: ReservationHydrated, customer: { fullName: string; email: string }) {
  if (!r.signature) throw Unprocessable('Hợp đồng chưa được ký');
  const [facility, unit, type, contract] = await Promise.all([
    FacilityModel.findById(r.facilityId).lean(),
    r.unitId ? StorageUnitModel.findById(r.unitId).lean() : null,
    UnitTypeModel.findById(r.unitTypeId).lean(),
    r.contractId ? RentalContractModel.findById(r.contractId, { contractNumber: 1 }).lean() : null,
  ]);
  const policy = (await PolicyModel.findById(r.quote.policyId)) ?? (await effectivePolicy(r.facilityId));
  const clauses = buildContractClauses({
    code: r.code, contractNumber: contract?.contractNumber,
    facilityName: facility?.name ?? '—', facilityAddress: facility ? `${facility.address.line1}, ${facility.address.district}` : null,
    customerName: customer.fullName, unitTypeName: type?.name ?? '—',
    unitNumber: unit?.unitNumber, floor: unit?.location.floor, zone: unit?.location.zone, areaM2: type?.areaM2, accessMethod: unit?.accessMethod,
    useAirConditioning: r.useAirConditioning, rentalPeriod: r.quote.rentalPeriod, periods: r.periods,
    startDate: r.startDate.toISOString(), endDate: r.endDate.toISOString(), quote: r.quote, depositPaid: !!r.depositPaymentId,
    termsVersion: r.signature?.termsVersion, // hợp đồng đã ký giữ đúng phiên bản Điều khoản lúc ký
    policy: policy.toObject(),
  });
  const pdf = await buildContractPdf({
    code: r.code, contractNumber: contract?.contractNumber, facilityName: facility?.name ?? '—', customerName: customer.fullName, clauses,
    signature: { signedAt: r.signature.signedAt, signerName: r.signature.signerName, method: r.signature.method, image: r.signature.image, onBehalf: r.signature.onBehalf },
    generatedAt: new Date(),
  });
  return { pdf, filename: `hop-dong-${r.code}.pdf` };
}

/** Tải PDF hợp đồng đã ký (khách là chủ đặt chỗ, hoặc nhân viên/quản lý đúng chi nhánh). */
export async function contractPdfFor(user: UserHydrated, id: string) {
  const r = await loadSigned(id);
  await assertCanAccess(user, r, 'reservation.contract_pdf');
  const customer = await UserModel.findById(r.customerId, { fullName: 1, email: 1 }).lean();
  return renderPdf(r, { fullName: customer?.fullName ?? '—', email: customer?.email ?? '' });
}

export type EmailOutcome = { sent: true; to: string } | { sent: false; reason: 'NOT_CONFIGURED' | 'FAILED' | 'NO_EMAIL' };

/**
 * Gửi PDF hợp đồng đã ký tới email của khách. `user = null` là lần gửi tự động ngay sau khi ký;
 * có `user` là gửi lại theo yêu cầu (chặn gửi dồn dập). Không bao giờ ném lỗi vì SMTP — chỉ trả kết quả.
 */
export async function emailContract(user: UserHydrated | null, id: string, opts: { resend?: boolean } = {}): Promise<EmailOutcome> {
  const r = await loadSigned(id);
  if (user) await assertCanAccess(user, r, 'reservation.contract_email');
  if (!r.signature) throw Unprocessable('Hợp đồng chưa được ký');
  const last = r.signature.emailedAt;
  if (opts.resend && last && Date.now() - last.getTime() < 60_000) throw Conflict('Vừa gửi xong, hãy thử lại sau ít phút', 'TOO_SOON');

  const customer = await UserModel.findById(r.customerId, { fullName: 1, email: 1 }).lean();
  if (!customer?.email) return { sent: false, reason: 'NO_EMAIL' };
  const { pdf, filename } = await renderPdf(r, { fullName: customer.fullName, email: customer.email });

  const result = await sendMail({
    to: customer.email,
    subject: `KhoAn — Hợp đồng thuê kho ${r.code} đã ký`,
    text: `Xin chào ${customer.fullName},\n\nCảm ơn bạn đã ký hợp đồng thuê kho (mã đặt chỗ ${r.code}). Bản PDF hợp đồng đã ký được đính kèm email này — vui lòng lưu lại.\n\nKhoAn`,
    html: `<p>Xin chào <b>${customer.fullName.replace(/[<>&]/g, '')}</b>,</p><p>Cảm ơn bạn đã ký hợp đồng thuê kho (mã đặt chỗ <b>${r.code}</b>). Bản PDF hợp đồng đã ký được đính kèm email này — vui lòng lưu lại.</p><p>KhoAn</p>`,
    attachments: [{ filename, content: pdf, contentType: 'application/pdf' }],
  });
  if (!result.sent) return { sent: false, reason: result.reason };

  r.signature.emailedAt = new Date();
  r.signature.emailedTo = maskEmail(customer.email);
  await r.save();
  return { sent: true, to: maskEmail(customer.email) };
}

/** Dùng cho route gửi lại: chưa cấu hình/gửi lỗi thì báo rõ cho người bấm thay vì im lặng. */
export async function resendContractEmail(user: UserHydrated, id: string) {
  const out = await emailContract(user, id, { resend: true });
  if (out.sent) return out;
  if (out.reason === 'NOT_CONFIGURED') throw new AppError(503, 'MAIL_NOT_CONFIGURED', 'Hệ thống chưa cấu hình gửi email — hãy tải PDF thay thế');
  if (out.reason === 'NO_EMAIL') throw Unprocessable('Khách chưa có địa chỉ email');
  throw new AppError(502, 'MAIL_FAILED', 'Gửi email không thành công, vui lòng thử lại sau');
}
