import { RentalContractModel, ReservationModel, StorageUnitModel } from '../db/models';
import { runAsSystem } from '../core/request-context';
import { addDays, addMonthsUTC, daysBetween, todayUTC } from '../domain/dates';
import { effectivePolicy } from '../domain/pricing';
import { cancelReservation } from '../services/reservation.service';
import { audit } from '../services/audit.service';
import { createPayment } from '../services/payments';
import { withTxn } from '../services/txn';

/**
 * In-process schedulers — fine for one API instance. With several instances, move these to a single worker
 * (or Atlas Triggers / a queue) so two processes don't race; the unique indexes still prevent double billing.
 */
export function startJobs() {
  const every = (ms: number, name: string, fn: () => Promise<void>) => {
    let running = false;
    const tick = async () => {
      if (running) return;
      running = true;
      try { await runAsSystem(fn); } catch (e) { console.error(`[job:${name}]`, e); } finally { running = false; }
    };
    setTimeout(tick, 5_000);
    return setInterval(tick, ms);
  };
  const timers = [every(60_000, 'hold-expiry', expireHolds), every(60 * 60_000, 'billing', runBilling)];
  return () => timers.forEach(clearInterval);
}

/** PENDING bookings whose deposit window lapsed → CANCELLED(HOLD_EXPIRED), releasing capacity. */
export async function expireHolds() {
  const stale = await ReservationModel.find({ status: 'PENDING', holdExpiresAt: { $lte: new Date() } }, { _id: 1 }).limit(100).lean();
  for (const r of stale) {
    try { await cancelReservation(null, String(r._id), 'HOLD_EXPIRED'); } catch (e) { console.error('expire hold', r._id, e); }
  }
  if (stale.length) console.log(`[job:hold-expiry] cancelled ${stale.length}`);
}

/** Issues rent for due periods, then escalates overdue contracts ACTIVE → DELINQUENT → LOCKED_OUT per policy. */
export async function runBilling() {
  const today = todayUTC();

  const due = await RentalContractModel.find({ status: { $in: ['ACTIVE', 'DELINQUENT', 'LOCKED_OUT'] }, 'billing.nextBillingDate': { $lte: today } }, { _id: 1 }).limit(500).lean();
  for (const { _id } of due) {
    await withTxn(async (session) => {
      const c = await RentalContractModel.findById(_id).session(session);
      if (!c || c.billing.nextBillingDate > today) return;
      const start = c.billing.nextBillingDate;
      const end = addDays(addMonthsUTC(start, 1), -1);
      if (start >= c.endDate && !c.autoRenew) return; // lease ends; move-out handled by staff
      await createPayment({ facilityId: c.facilityId, customerId: c.customerId, contractId: c._id, type: 'RENT', amount: c.billing.monthlyRate, status: 'PENDING', method: 'BANK_TRANSFER', period: { start, end }, idempotencyKey: `rent-${c._id}-${start.toISOString().slice(0, 10)}` }, session);
      c.balance.outstanding += c.billing.monthlyRate;
      c.billing.nextBillingDate = addMonthsUTC(start, 1);
      if (start >= c.endDate && c.autoRenew) {
        const newEnd = addMonthsUTC(c.endDate, 1);
        c.renewals.push({ previousEndDate: c.endDate, newEndDate: newEnd, months: 1, paymentId: null, at: new Date() });
        c.endDate = newEnd;
      }
      await c.save({ session });
    }).catch((e) => console.error('billing', _id, e));
  }

  const overdue = await RentalContractModel.find({ status: { $in: ['ACTIVE', 'DELINQUENT'] }, 'balance.outstanding': { $gt: 0 }, 'billing.paidThrough': { $lt: today } }, { _id: 1 }).limit(500).lean();
  for (const { _id } of overdue) {
    await withTxn(async (session) => {
      const c = await RentalContractModel.findById(_id).session(session);
      if (!c) return;
      const days = Math.max(0, daysBetween(c.billing.paidThrough, today) - 1);
      const policy = await effectivePolicy(c.facilityId, session);
      if (c.status === 'ACTIVE' && days > c.terms.gracePeriodDays) {
        const pctRule = policy.lateFees.find((f) => f.kind === 'PERCENT_OF_RENT');
        const fee = pctRule ? Math.round((c.billing.monthlyRate * pctRule.value) / 100) : 0;
        if (fee) await createPayment({ facilityId: c.facilityId, customerId: c.customerId, contractId: c._id, type: 'LATE_FEE', amount: fee, status: 'PENDING', method: 'BANK_TRANSFER', idempotencyKey: `late-${c._id}-${c.billing.paidThrough.toISOString().slice(0, 10)}` }, session);
        c.balance.outstanding += fee;
        c.delinquency = { since: addDays(c.billing.paidThrough, 1), daysOverdue: days, lateFeesAccrued: fee, lockedOutAt: null };
        c.transitionTo('DELINQUENT', { actor: 'SYSTEM', reason: `Quá hạn ${days} ngày` });
        await audit({ action: 'contract.delinquent', entityType: 'RentalContract', entityId: c._id, facilityId: c.facilityId, changes: { after: { days, fee } } }, session);
      } else if (c.delinquency) {
        c.delinquency.daysOverdue = days;
      }
      if (c.status === 'DELINQUENT' && days >= c.terms.lockoutAfterDays) {
        const fixed = policy.lateFees.find((f) => f.kind === 'FIXED');
        if (fixed?.value) {
          await createPayment({ facilityId: c.facilityId, customerId: c.customerId, contractId: c._id, type: 'LATE_FEE', amount: fixed.value, status: 'PENDING', method: 'BANK_TRANSFER', idempotencyKey: `lock-${c._id}-${c.billing.paidThrough.toISOString().slice(0, 10)}` }, session);
          c.balance.outstanding += fixed.value;
          c.delinquency!.lateFeesAccrued += fixed.value;
        }
        c.transitionTo('LOCKED_OUT', { actor: 'SYSTEM', reason: `Quá hạn ${days} ngày` });
        c.delinquency!.lockedOutAt = new Date();
        c.access.suspendedAt = new Date();
        await StorageUnitModel.updateOne({ _id: c.unitId, status: 'OCCUPIED' }, { $set: { overlockActive: true } }, { session });
        await audit({ action: 'contract.lockout', entityType: 'RentalContract', entityId: c._id, facilityId: c.facilityId, reason: 'Tự động theo chính sách' }, session);
      }
      await c.save({ session });
    }).catch((e) => console.error('delinquency', _id, e));
  }
  if (due.length || overdue.length) console.log(`[job:billing] billed ${due.length}, checked overdue ${overdue.length}`);
}
