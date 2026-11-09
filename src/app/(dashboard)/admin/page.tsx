// @polsia:user-owned — private owner entry into the existing Account experience.
import type { Metadata } from 'next';
import { OwnerAccessScreen } from '@/components/custom/owner-access-screen';
import { safeSameOriginPath } from '@/lib/business/auth-return-path';

export const metadata: Metadata = {
  title: 'Owner account',
  description: 'Sign in or verify company ownership to open the Fairway Friends Account.',
};

function queryValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function OwnerAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackURL?: string | string[]; error?: string | string[] }>;
}) {
  const params = await searchParams;
  const error = queryValue(params.error)?.toUpperCase();

  return (
    <OwnerAccessScreen
      callbackURL={safeSameOriginPath(queryValue(params.callbackURL), '/admin')}
      verificationIssue={error === 'TOKEN_EXPIRED' || error === 'INVALID_TOKEN'}
    />
  );
}
