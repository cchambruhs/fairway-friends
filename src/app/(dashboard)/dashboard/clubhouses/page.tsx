// @polsia:user-owned — player Clubhouse management page.
import type { Metadata } from 'next';
import { ClubhouseWorkspace } from '@/components/custom/dashboard/clubhouse-workspace';

export const metadata: Metadata = {
  title: 'Clubhouses',
  description:
    'Create and join Fairway Friends Clubhouses, manage memberships, and choose an import destination.',
};

export default function ClubhousesPage() {
  return <ClubhouseWorkspace />;
}
