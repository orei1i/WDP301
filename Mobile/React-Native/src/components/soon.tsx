import { useRouter } from 'expo-router';
import { Button, Card, H1, Muted, Screen } from './ui';
import { S } from '../theme';

/**
 * Màn hình chưa dựng xong. Cố ý nói thẳng là chưa có thay vì để trắng hoặc crash —
 * người chạy thử biết ngay đây là phần chưa làm, không phải lỗi.
 */
export function ComingSoon({ title, note, back }: { title: string; note: string; back?: boolean }) {
  const router = useRouter();
  return (
    <Screen>
      <H1>{title}</H1>
      <Card style={{ marginTop: S.lg }}>
        <Muted>{note}</Muted>
      </Card>
      {back && <Button title="Quay lại" variant="secondary" style={{ marginTop: S.lg }} onPress={() => router.back()} />}
    </Screen>
  );
}
