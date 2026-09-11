import type { ClientSession, Types } from 'mongoose';
import { ReservationModel, StorageUnitModel } from '../db/models';
import { addMonthsUTC } from './dates';

type Id = Types.ObjectId | string;

/**
 * Sellable = free units − live un-allocated holds overlapping [start, start+months).
 * Allocated reservations already hold a RESERVED unit, so they are excluded from `free` instead.
 * Inside a transaction this read is only safe because the caller first bumps UnitType.inventoryVersion
 * (see reservation.service) — that write makes concurrent bookings of the same type conflict and retry.
 */
export async function availability(facilityId: Id, unitTypeId: Id, start: Date, months: number, session?: ClientSession) {
  const end = addMonthsUTC(start, months);
  const now = new Date();
  // Sequential on purpose: operations sharing one transaction session must not run concurrently.
  const total = await StorageUnitModel.countDocuments({ facilityId, unitTypeId }).session(session ?? null);
  const free = await StorageUnitModel.countDocuments({ facilityId, unitTypeId, status: 'AVAILABLE' }).session(session ?? null);
  const holds = await ReservationModel.countDocuments({
    facilityId, unitTypeId, startDate: { $lt: end }, endDate: { $gt: start },
    $or: [{ status: 'CONFIRMED' }, { status: 'PENDING', holdExpiresAt: { $gt: now } }],
  }).session(session ?? null);
  return { total, free, holds, available: Math.max(0, free - holds) };
}
