import Error from '@/views/Error';
import { resolveLinkErrorReason } from '@/lib/errors';

export default function RedirectErrorPageRoute({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  return <Error reason={resolveLinkErrorReason(searchParams.reason)} />;
}