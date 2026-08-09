import Error from '@/views/Error';
import { resolveLinkErrorReason } from '@/lib/errors';

export default function LinkErrorPageRoute({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  return <Error reason={resolveLinkErrorReason(searchParams.reason)} />;
}