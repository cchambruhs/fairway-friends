// @polsia:user-owned — signed-in player account and appearance settings.
import type { Metadata } from 'next';
import { AccountExperience } from '@/components/custom/account-experience';

export const metadata: Metadata = {
  title: 'Account',
  description: 'Manage your Fairway Friends account and appearance preference.',
};

export default function AccountPage() {
  return <AccountExperience />;
}
