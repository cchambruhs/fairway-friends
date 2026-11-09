// @polsia:user-owned — compact Fairway Friends frame for account access pages.

import { Disc3 } from 'lucide-react';
import Link from 'next/link';
import { AuthNav } from '@/components/custom/auth-nav';
import { ThemeToggle } from '@/components/custom/theme-toggle';

interface AuthPageShellProps {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
  showAuthNav?: boolean;
  callbackURL?: string;
}

export function AuthPageShell({
  eyebrow,
  title,
  description,
  children,
  showAuthNav = true,
  callbackURL,
}: AuthPageShellProps) {
  return (
    <div className="ff-auth-screen">
      <header className="ff-auth-header">
        <Link className="ff-auth-brand" href="/" aria-label="Fairway Friends home">
          <span className="ff-auth-brand-mark" aria-hidden="true">
            <Disc3 size={24} strokeWidth={1.8} />
          </span>
          <span>
            fairway<span>friends</span>
            <i>.</i>
          </span>
        </Link>
        <div className="ff-auth-header-actions">
          {showAuthNav ? <AuthNav presentation="auth" callbackURL={callbackURL} /> : null}
          <ThemeToggle className="ff-auth-theme-toggle" />
        </div>
      </header>

      <main className="ff-auth-main">
        <aside className="ff-auth-intro" aria-label="Fairway Friends player accounts">
          <p className="ff-auth-overline">{eyebrow}</p>
          <div className="ff-auth-disc" aria-hidden="true">
            <Disc3 size={38} strokeWidth={1.4} />
          </div>
          <h1>Good rounds stay with your crew.</h1>
          <p className="ff-auth-intro-copy">
            Your rounds, leagues, and friendly competition have a place to come together.
          </p>
          <span className="ff-auth-gold-rule" aria-hidden="true" />
          <p className="ff-auth-tagline">Disc golf is better with friends.</p>
        </aside>

        <section className="ff-auth-content" aria-labelledby="ff-auth-title">
          <div className="ff-auth-panel">
            <p className="ff-auth-kicker">{eyebrow}</p>
            <h2 id="ff-auth-title">{title}</h2>
            <p className="ff-auth-description">{description}</p>
            {children}
          </div>
        </section>
      </main>
    </div>
  );
}
