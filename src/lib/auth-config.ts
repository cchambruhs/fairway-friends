// @polsia:user-owned — configure better-auth here (spread into betterAuth() by @/lib/auth).
// Add emailAndPassword options, plugins, session, socialProviders, databaseHooks, etc.
// Framework owns db/secret/baseURL/admin(), verified-owner bootstrap, and disables
// session cookie caching so verification/role changes appear on the next session read.
// Verification delivery through the email module and sendOnSignUp are provided
// by auth.ts. Override emailVerification here only for intentional customization.
// The supplied profile and admin screens expose a resend button. Email/password
// owners receive admin access only after following their verification link.
// A verified social-provider email can also bootstrap the owner.
//
// Welcome email / signup side-effect (runs alongside the owner-admin grant — install `email`):
//   import { sendEmail } from '@/lib/email/send';
//   databaseHooks: { user: { create: { after: async (user) => {
//     await sendEmail({ to: user.email, subject: 'Welcome', html: '<p>Welcome!</p>' }).catch(() => {});
//   } } } },
// Add a plugin: `plugins: [organization()]` (admin() is added for you).
//
// Per-user fields (a `username`, profile, prefs): don't add a column to `User` (auth.prisma
// is locked) or use `user.additionalFields` (needs that locked column). Make a user-owned
// `prisma/schema/profile.prisma` (model UserProfile { userId String @unique /* fields */ },
// scalar userId) and create the row at signup:
//   import { prisma } from '@/lib/db';
//   databaseHooks: { user: { create: { after: async (user) => {
//     await prisma.userProfile.create({ data: { userId: user.id } }).catch(() => {});
//   } } } },

import type { BetterAuthOptions } from 'better-auth';
import { normalizeUDiscUsername } from '@/lib/business/normalize-udisc-username';
import { isOwnerBootstrapRequest } from '@/lib/business/owner-bootstrap';
import {
  completePlayerRegistration,
  findUDiscRecords,
} from '@/lib/business/player-identity.server';
import { prisma } from '@/lib/db';
import { sendEmail } from '@/lib/email/send';
import { passwordResetEmail } from '@/lib/email/templates';

const ownerEmail = process.env.POLSIA_OWNER_EMAIL?.trim().toLowerCase();

export const authConfig: BetterAuthOptions = {
  emailAndPassword: {
    enabled: true,
    resetPasswordTokenExpiresIn: 60 * 60,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail({ to: user.email, ...passwordResetEmail({ url }) });
    },
  },
  emailVerification: {
    sendOnSignUp: false,
    sendOnSignIn: false,
    expiresIn: 60 * 60,
    autoSignInAfterVerification: true,
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user, context) => {
          const isOwnerIdentity = ownerEmail === user.email.trim().toLowerCase();
          const isVerifiedIdentity = user.emailVerified === true;
          const secret = context?.context.secret;
          const trustedOwnerBootstrap = Boolean(
            isOwnerIdentity &&
              secret &&
              isOwnerBootstrapRequest(context?.request?.headers, ownerEmail, secret),
          );

          // A public signup cannot reserve the company owner email with a password
          // chosen by someone else. The owner-access route supplies the proof.
          if (isOwnerIdentity && !isVerifiedIdentity && !trustedOwnerBootstrap) return false;

          // Every ordinary signup must have a short-lived, server-validated profile choice.
          // The reservation is written by /api/player-identity/registration-choice immediately
          // before the Better Auth signup request; it contains no credential or identity grant.
          if (trustedOwnerBootstrap) return;
          const email = user.email.trim().toLocaleLowerCase('en-US');
          const choice = await prisma.playerRegistrationChoice.findUnique({ where: { email } });
          if (!choice || choice.expiresAt.getTime() <= Date.now()) return false;

          const normalizedUsername = normalizeUDiscUsername(choice.username);
          const [records, identity] = await Promise.all([
            findUDiscRecords(prisma, normalizedUsername),
            prisma.uDiscIdentity.findUnique({ where: { normalizedUsername } }),
          ]);
          if (choice.mode === 'claim') {
            if (!records.exists || identity?.ownerUserId || identity?.pendingClaimUserId)
              return false;
          } else if (records.exists || identity) {
            return false;
          }
        },
        after: async (user) => {
          await completePlayerRegistration({ id: user.id, name: user.name, email: user.email });
        },
      },
    },
  },
};
