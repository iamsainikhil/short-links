'use client';

import { PrivateAppGate } from '@/components/PrivateAppGate';
import { LinksDashboard } from '@/views/LinksDashboard';

export default function DashboardPage() {
  return (
    <PrivateAppGate>
      <LinksDashboard />
    </PrivateAppGate>
  );
}