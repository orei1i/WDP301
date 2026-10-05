'use client';

import { useState } from 'react';
import { Check, KeyRound, X } from 'lucide-react';
import type { AccessRequest } from '@ssm/shared';
import { useStore } from '@/shared/store/store';
import { ACCESS_METHOD, ACCESS_REQUEST_STATUS, ACCESS_REQUEST_TYPE } from '@/shared/lib/labels';
import { byId, unitLabel, userName } from '@/shared/lib/domain';
import { fmtDate, vnd } from '@/shared/lib/format';
import { Button, Card, EmptyState, Field, Modal, PageHeader, StatusBadge, Table, Tabs, inputCls } from '@/shared/ui';
import { FacilityPicker, useFacilityScope } from '@/features/facilities/facility-picker';

type Tab = 'open' | 'all';
type Dialog = { kind: 'reject' | 'handover' | 'cancel'; req: AccessRequest } | null;

/**
 * Yêu cầu cấp lại mật khẩu / thẻ khoá / chìa khoá của khách. Quản lý chi nhánh duyệt hoặc từ chối; mật khẩu được cấp
 * ngay khi duyệt (khách xem trong app, người duyệt không thấy mã); thẻ/chìa thì nhân viên bàn giao xong mới hoàn tất.
 */
export default function StaffAccessRequests() {
  const { db, user, run, toast } = useStore();
  const scope = useFacilityScope();
  const isFM = user?.role === 'FACILITY_MANAGER';
  const [tab, setTab] = useState<Tab>('open');
  const [dlg, setDlg] = useState<Dialog>(null);
  const [text, setText] = useState('');
  const [showErr, setShowErr] = useState(false);

  const all = db.accessRequests.filter((r) => scope.facilityIds.includes(r.facilityId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const open = all.filter((r) => r.status === 'REQUESTED' || r.status === 'APPROVED');
  const rows = tab === 'open' ? [...open].reverse() : all;
  const openDialog = (kind: NonNullable<Dialog>['kind'], req: AccessRequest) => { setText(''); setShowErr(false); setDlg({ kind, req }); };

  const submit = () => {
    if (!dlg) return;
    const t = text.trim();
    if (dlg.kind !== 'cancel' && !t) { setShowErr(true); toast(dlg.kind === 'reject' ? 'Cần ghi lý do từ chối' : 'Nhập số thẻ / mã chìa mới', 'error'); return; }
    const close = () => setDlg(null);
    if (dlg.kind === 'reject') void run('decideAccessRequest', { requestId: dlg.req._id, approve: false, note: t }, 'Đã từ chối và hoàn phí cho khách', close);
    else if (dlg.kind === 'handover') void run('completeAccessRequest', { requestId: dlg.req._id, keyTag: t }, 'Đã bàn giao — hoàn tất yêu cầu', close);
    else void run('cancelAccessRequest', { requestId: dlg.req._id, reason: t }, 'Đã huỷ yêu cầu và hoàn phí', close);
  };

  return (
    <>
      <PageHeader title="Cấp lại mã / thẻ / chìa" description="Khách xin đặt lại mật khẩu, làm lại thẻ hoặc cấp lại chìa khoá. Quản lý chi nhánh duyệt; thẻ và chìa do nhân viên bàn giao rồi ghi số thẻ / mã chìa mới. Từ chối hoặc huỷ thì hoàn đủ phí." actions={<FacilityPicker scope={scope} />} />
      <Tabs tabs={[{ key: 'open', label: 'Đang xử lý', count: open.length }, { key: 'all', label: 'Tất cả', count: all.length }]} value={tab} onChange={setTab} />
      <Card className="mt-4">
        <Table rows={rows} rowKey={(r) => r._id} empty={<EmptyState icon={<KeyRound className="size-5" />} title="Không có yêu cầu cấp lại" />} columns={[
          { key: 'n', header: 'Mã', cell: (r) => <div><span className="font-mono text-xs">{r.requestNumber}</span><p className="text-xs text-stone-500">{fmtDate(r.createdAt)}</p></div> },
          { key: 'c', header: 'Khách / kho', cell: (r) => { const c = byId(db.contracts, r.contractId); return <div><p className="font-medium">{userName(db, r.customerId)}</p><p className="text-xs text-stone-500">Kho {c ? unitLabel(db, c.unitId) : '—'} · khoá {ACCESS_METHOD[r.accessMethod].toLowerCase()}</p></div>; } },
          { key: 't', header: 'Yêu cầu', cell: (r) => <div><p>{ACCESS_REQUEST_TYPE[r.type].title}</p>{r.reason && <p className="text-xs text-stone-500">{r.reason}</p>}{r.decisionNote && <p className="text-xs text-red-700">Lý do từ chối: {r.decisionNote}</p>}{r.newKeyTag && <p className="text-xs text-emerald-700">Số mới: {r.newKeyTag}</p>}</div> },
          { key: 'f', header: 'Phí', className: 'tabular-nums', cell: (r) => (r.fee > 0 ? vnd(r.fee) : <span className="text-stone-400">Miễn phí</span>) },
          { key: 's', header: 'Trạng thái', cell: (r) => <StatusBadge map={ACCESS_REQUEST_STATUS} value={r.status} /> },
          { key: 'a', header: '', className: 'text-right', cell: (r) => {
            if (r.status === 'REQUESTED') {
              return isFM ? (
                <div className="flex justify-end gap-1.5">
                  <Button size="sm" onClick={() => void run('decideAccessRequest', { requestId: r._id, approve: true }, r.type === 'PIN_RESET' ? 'Đã duyệt — mật khẩu mới đã gửi vào tài khoản khách' : 'Đã duyệt — chờ bàn giao')}><Check className="size-3.5" />Duyệt</Button>
                  <Button size="sm" variant="ghost" onClick={() => openDialog('reject', r)}><X className="size-3.5" />Từ chối</Button>
                </div>
              ) : <span className="text-xs text-stone-500">Chờ quản lý duyệt</span>;
            }
            if (r.status === 'APPROVED') {
              return (
                <div className="flex justify-end gap-1.5">
                  <Button size="sm" onClick={() => openDialog('handover', r)}><KeyRound className="size-3.5" />Bàn giao</Button>
                  {isFM && <Button size="sm" variant="ghost" onClick={() => openDialog('cancel', r)}>Huỷ</Button>}
                </div>
              );
            }
            return null;
          } },
        ]} />
      </Card>

      <Modal open={!!dlg} onClose={() => setDlg(null)}
        title={dlg?.kind === 'reject' ? 'Từ chối yêu cầu' : dlg?.kind === 'handover' ? 'Bàn giao thẻ / chìa mới' : 'Huỷ yêu cầu đã duyệt'}
        description={dlg ? `${dlg.req.requestNumber} · ${ACCESS_REQUEST_TYPE[dlg.req.type].title}` : ''}
        footer={dlg && <><Button variant="secondary" onClick={() => setDlg(null)}>Đóng</Button><Button variant={dlg.kind === 'handover' ? 'primary' : 'danger'} onClick={submit}>{dlg.kind === 'reject' ? 'Từ chối & hoàn phí' : dlg.kind === 'handover' ? 'Xác nhận đã bàn giao' : 'Huỷ & hoàn phí'}</Button></>}>
        {dlg?.kind === 'handover' ? (
          <Field label={dlg.req.type === 'CARD_REISSUE' ? 'Số thẻ mới' : 'Mã chìa mới'} hint="Ghi đúng số in trên thẻ / nhãn chìa vừa bàn giao cho khách" error={showErr && !text.trim() ? 'Nhập số thẻ / mã chìa mới' : undefined}>
            <input className={inputCls} value={text} maxLength={40} onChange={(e) => setText(e.target.value)} placeholder={dlg.req.type === 'CARD_REISSUE' ? 'CARD-0042' : 'KEY-0042'} />
          </Field>
        ) : (
          <Field label={dlg?.kind === 'reject' ? 'Lý do từ chối (khách sẽ thấy)' : 'Lý do huỷ (không bắt buộc)'} error={dlg?.kind === 'reject' && showErr && !text.trim() ? 'Cần ghi lý do từ chối' : undefined}>
            <textarea className={inputCls} rows={3} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
        )}
        {dlg && dlg.req.fee > 0 && dlg.kind !== 'handover' && <p className="mt-3 text-sm text-stone-600">Khách được hoàn <b>đủ {vnd(dlg.req.fee)}</b> phí đã trả.</p>}
      </Modal>
    </>
  );
}
