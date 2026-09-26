'use client';

import { useState } from 'react';
import type { UnitSwapRequest } from '@ssm/shared';
import { useStore } from '@/shared/store/store';
import { SWAP_METHOD, SWAP_REQUEST_STATUS } from '@/shared/lib/labels';
import { facilityName, typeName, unitLabel, userName } from '@/shared/lib/domain';
import { fmtDate, fmtDateTime, vnd } from '@/shared/lib/format';
import { Badge, Button, Card, EmptyState, Field, KV, Modal, PageHeader, StatusBadge, Table, Tabs, inputCls } from '@/shared/ui';
import { FacilityPicker, useFacilityScope } from '@/features/facilities/facility-picker';

type Tab = 'pending' | 'approved' | 'done';
type Dialog = { kind: 'decide' | 'complete'; s: UnitSwapRequest } | null;

export default function StaffSwaps() {
  const { db, user, run } = useStore();
  const scope = useFacilityScope();
  const isFM = user?.role === 'FACILITY_MANAGER';
  const [tab, setTab] = useState<Tab>('pending');
  const [dlg, setDlg] = useState<Dialog>(null);
  const [approve, setApprove] = useState(true);
  const [facilityFault, setFacilityFault] = useState(false);
  const [fee, setFee] = useState('0');
  const [scheduledFor, setScheduledFor] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  if (!user) return null;
  const close = () => setDlg(null);

  const all = db.swapRequests.filter((s) => scope.facilityIds.includes(s.facilityId));
  const groups: Record<Tab, UnitSwapRequest[]> = {
    pending: all.filter((s) => s.status === 'SUBMITTED'),
    approved: all.filter((s) => s.status === 'APPROVED'),
    done: all.filter((s) => !['SUBMITTED', 'APPROVED'].includes(s.status)),
  };

  const openDecide = (s: UnitSwapRequest) => {
    setApprove(true); setFacilityFault(false); setFee('0'); setScheduledFor(''); setRejectReason('');
    setDlg({ kind: 'decide', s });
  };

  const columns = [
    { key: 'n', header: 'Yêu cầu', cell: (s: UnitSwapRequest) => <div><p className="font-mono text-xs">{s.requestNumber}</p><p className="text-xs text-stone-500">{facilityName(db, s.facilityId)}</p></div> },
    { key: 'k', header: 'Khách hàng', cell: (s: UnitSwapRequest) => userName(db, s.customerId) },
    { key: 'u', header: 'Đổi ô', cell: (s: UnitSwapRequest) => <span>{unitLabel(db, s.fromUnitId)} → <b>{unitLabel(db, s.toUnitId)}</b> <span className="text-stone-400">({typeName(db, s.unitTypeId)})</span></span> },
    { key: 'm', header: 'Hình thức', cell: (s: UnitSwapRequest) => SWAP_METHOD[s.method] },
    { key: 'st', header: 'Trạng thái', cell: (s: UnitSwapRequest) => <StatusBadge map={SWAP_REQUEST_STATUS} value={s.status} /> },
    { key: 'a', header: '', className: 'text-right', cell: (s: UnitSwapRequest) => (
      <div className="flex justify-end gap-2">
        {s.status === 'SUBMITTED' && isFM && <Button size="sm" onClick={() => openDecide(s)}>Xét duyệt</Button>}
        {s.status === 'APPROVED' && <Button size="sm" variant="secondary" onClick={() => setDlg({ kind: 'complete', s })}>Xác nhận đã chuyển</Button>}
      </div>
    ) },
  ];

  return (
    <>
      <PageHeader title="Yêu cầu đổi ô kho" description="Khách gửi yêu cầu đổi sang ô cùng loại — xét duyệt rồi xác nhận khi đã chuyển xong." actions={<FacilityPicker scope={scope} />} />
      <Tabs tabs={[
        { key: 'pending', label: 'Chờ duyệt', count: groups.pending.length },
        { key: 'approved', label: 'Đã duyệt · chờ chuyển', count: groups.approved.length },
        { key: 'done', label: 'Đã xử lý', count: groups.done.length },
      ]} value={tab} onChange={setTab} />
      <Card className="mt-4">
        <Table rows={groups[tab]} rowKey={(s) => s._id} empty={<EmptyState title="Không có yêu cầu nào" />} columns={columns} />
      </Card>

      <Modal open={dlg?.kind === 'decide'} onClose={close} size="lg" title={`Xét duyệt ${dlg?.s.requestNumber ?? ''}`}
        description={dlg ? `${userName(db, dlg.s.customerId)} · ${unitLabel(db, dlg.s.fromUnitId)} → ${unitLabel(db, dlg.s.toUnitId)}` : ''}
        footer={<>
          <Button variant="secondary" onClick={() => setApprove(false)}>Từ chối</Button>
          <Button onClick={() => dlg && void run('decideSwapRequest', {
            swapRequestId: dlg.s._id, approve, facilityFault: approve ? facilityFault : undefined,
            fee: approve ? Math.round(Number(fee.replace(/\D/g, '')) || 0) : undefined,
            scheduledFor: approve && dlg.s.method === 'DELIVERY' ? `${scheduledFor}T00:00:00.000Z` : undefined,
            rejectReason: !approve ? rejectReason : undefined,
          }, approve ? 'Đã duyệt yêu cầu đổi ô' : 'Đã từ chối yêu cầu', () => close())}>
            {approve ? 'Duyệt' : 'Xác nhận từ chối'}
          </Button>
        </>}>
        {dlg && (
          <div className="space-y-4">
            <KV items={[
              ['Lý do khách nêu', dlg.s.reason],
              ['Hình thức', SWAP_METHOD[dlg.s.method]],
              ['Gửi lúc', fmtDateTime(dlg.s.createdAt)],
            ]} />
            {approve ? (
              <>
                <label className="flex cursor-pointer items-center gap-2.5 text-sm">
                  <input type="checkbox" className="size-4" checked={facilityFault} onChange={(e) => { setFacilityFault(e.target.checked); setFee(e.target.checked ? '0' : fee); }} />
                  Lỗi từ chi nhánh (hư hỏng, mất an ninh…) — miễn phí đổi ô
                </label>
                <Field label="Phí đổi ô" hint="Để trống hoặc 0 nếu miễn phí. Mặc định: miễn phí lần đổi đầu tiên, có phí từ lần thứ hai.">
                  <input className={inputCls} value={fee} onChange={(e) => setFee(e.target.value)} disabled={facilityFault} placeholder="0" />
                </Field>
                {dlg.s.method === 'DELIVERY' && (
                  <Field label="Ngày cử người chuyển">
                    <input type="date" className={inputCls} min={fmtDate(new Date().toISOString())} value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} />
                  </Field>
                )}
                {dlg.s.method === 'SELF' && <p className="text-xs text-stone-500">Duyệt xong khách có 7 ngày để tự chuyển đồ sang ô mới, quá hạn yêu cầu sẽ tự hủy.</p>}
              </>
            ) : (
              <Field label="Lý do từ chối"><textarea className={inputCls} rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} /></Field>
            )}
          </div>
        )}
      </Modal>

      <Modal open={dlg?.kind === 'complete'} onClose={close} title="Xác nhận đã chuyển xong"
        description={dlg ? `${unitLabel(db, dlg.s.fromUnitId)} → ${unitLabel(db, dlg.s.toUnitId)}${dlg.s.fee ? ` · phí ${vnd(dlg.s.fee)}` : ' · miễn phí'}` : ''}
        footer={<Button onClick={() => dlg && void run('completeSwapRequest', { swapRequestId: dlg.s._id }, 'Đã đổi ô — hợp đồng cập nhật ô mới', () => close())}>Xác nhận</Button>}>
        <p className="text-sm text-stone-600">Kiểm tra khách đã dọn hết đồ sang ô mới và trả lại ô cũ trước khi xác nhận. Ô cũ sẽ chuyển sang chờ kiểm tra.</p>
        {dlg?.s.fee ? <p className="mt-2 text-sm">Phí <b>{vnd(dlg.s.fee)}</b> sẽ được cộng vào công nợ của khách.</p> : null}
      </Modal>
    </>
  );
}
