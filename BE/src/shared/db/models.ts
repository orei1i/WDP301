export * from '../../features/users/user.model';
export * from '../../features/facilities/facility.model';
export * from '../../features/facilities/unit-type.model';
export * from '../../features/facilities/storage-unit.model';
export * from '../../features/reservations/reservation.model';
export * from '../../features/contracts/rental-contract.model';
export * from '../../features/payments/payment-transaction.model';
export * from '../../features/contracts/inspection-log.model';
export * from '../../features/tickets/support-ticket.model';
export * from '../../features/claims/damage-claim.model';
export * from '../../features/policies/business-policy.model';
export * from '../../features/audit/audit-log.model';

import { UserModel } from '../../features/users/user.model';
import { FacilityModel } from '../../features/facilities/facility.model';
import { UnitTypeModel } from '../../features/facilities/unit-type.model';
import { StorageUnitModel } from '../../features/facilities/storage-unit.model';
import { ReservationModel } from '../../features/reservations/reservation.model';
import { RentalContractModel } from '../../features/contracts/rental-contract.model';
import { PaymentModel } from '../../features/payments/payment-transaction.model';
import { InspectionModel } from '../../features/contracts/inspection-log.model';
import { TicketModel } from '../../features/tickets/support-ticket.model';
import { DamageClaimModel } from '../../features/claims/damage-claim.model';
import { PolicyModel } from '../../features/policies/business-policy.model';
import { AuditLogModel } from '../../features/audit/audit-log.model';

export const ALL_MODELS = [
  UserModel, FacilityModel, UnitTypeModel, StorageUnitModel, ReservationModel, RentalContractModel,
  PaymentModel, InspectionModel, TicketModel, DamageClaimModel, PolicyModel, AuditLogModel,
] as const;
