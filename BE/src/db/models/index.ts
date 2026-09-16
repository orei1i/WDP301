export * from './user.model';
export * from './facility.model';
export * from './unit-type.model';
export * from './storage-unit.model';
export * from './reservation.model';
export * from './rental-contract.model';
export * from './payment-transaction.model';
export * from './inspection-log.model';
export * from './support-ticket.model';
export * from './damage-claim.model';
export * from './business-policy.model';
export * from './audit-log.model';

import { UserModel } from './user.model';
import { FacilityModel } from './facility.model';
import { UnitTypeModel } from './unit-type.model';
import { StorageUnitModel } from './storage-unit.model';
import { ReservationModel } from './reservation.model';
import { RentalContractModel } from './rental-contract.model';
import { PaymentModel } from './payment-transaction.model';
import { InspectionModel } from './inspection-log.model';
import { TicketModel } from './support-ticket.model';
import { DamageClaimModel } from './damage-claim.model';
import { PolicyModel } from './business-policy.model';
import { AuditLogModel } from './audit-log.model';

export const ALL_MODELS = [
  UserModel, FacilityModel, UnitTypeModel, StorageUnitModel, ReservationModel, RentalContractModel,
  PaymentModel, InspectionModel, TicketModel, DamageClaimModel, PolicyModel, AuditLogModel,
] as const;
