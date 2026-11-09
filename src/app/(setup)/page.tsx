// @polsia:user-owned — Fairway Friends public homepage.

import { ArrowRight, Disc3, MapPin, UserRound } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { AuthNav } from '@/components/custom/auth-nav';
import { Reveal } from '@/components/custom/motion-kit/reveal';
import { ThemeToggle } from '@/components/custom/theme-toggle';
import { Button } from '@/components/ui/button';
import { siteDescription, siteName } from '@/lib/brand';
import './fairway-landing.css';

// Clubhouse lives in this app; never link to the legacy ChatGPT site (PRD v4 §2).
const clubhouseUrl = '/dashboard/clubhouses';

export const metadata: Metadata = {
  title: { absolute: `${siteName} | Disc Golf Player Profiles` },
  description: siteDescription,
  alternates: { canonical: '/' },
};

const profileDetails = [
  {
    icon: MapPin,
    title: 'Home course',
    description: 'Add the course you call home and your hometown.',
  },
  {
    icon: Disc3,
    title: 'Favorite discs',
    description: 'Keep the molds and plastics you reach for in your profile.',
  },
  {
    icon: UserRound,
    title: 'Player details',
    description: 'Choose a display name and add a short bio or PDGA number.',
  },
];

export default function HomePage() {
  return (
    <div className="fairway-page" id="top">
      <a className="ff-skip-link" href="#main-content">
        Skip to content
      </a>

      <header className="ff-header">
        <div className="ff-header-inner">
          <Link className="ff-brand" href="#top" aria-label="Fairway Friends home">
            <span className="ff-brand-mark" aria-hidden="true">
              <Disc3 size={22} strokeWidth={1.9} />
            </span>
            <span className="ff-brand-name">
              fairway<span>friends</span>
              <i>.</i>
            </span>
          </Link>

          <nav className="ff-nav" aria-label="Main navigation">
            <a href="#player-profile">Player profile</a>
            <Link href="/players">Players</Link>
            <Link href="/statistics">Statistics</Link>
            <a href="#get-started">Get started</a>
          </nav>

          <div className="ff-header-actions">
            <div className="ff-header-account">
              <AuthNav presentation="standard" />
            </div>
            <Button asChild className="ff-header-clubhouse">
              <Link href={clubhouseUrl}>
                Clubhouse <ArrowRight size={15} aria-hidden="true" />
              </Link>
            </Button>
            <ThemeToggle className="ff-theme-toggle" />
          </div>
        </div>
        <nav className="ff-mobile-nav ff-shell" aria-label="Main navigation">
          <a href="#player-profile">Player profile</a>
          <Link href="/players">Players</Link>
          <Link href="/statistics">Statistics</Link>
          <a href="#get-started">Get started</a>
          <Button asChild className="ff-mobile-clubhouse">
            <Link href={clubhouseUrl}>
              Clubhouse <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </Button>
        </nav>
      </header>

      <main id="main-content">
        <section className="ff-hero" aria-labelledby="hero-title">
          <div className="ff-hero-inner ff-shell">
            <Reveal trigger="load" duration={0.55} distance={12} className="ff-hero-copy">
              <p className="ff-eyebrow">
                <span className="ff-eyebrow-mark" aria-hidden="true">
                  <Disc3 size={14} />
                </span>
                Fairway Friends · Disc golf
              </p>
              <h1 id="hero-title">
                Disc golf is better <span>with friends.</span>
              </h1>
              <p className="ff-hero-description">
                Make a player profile that feels like yours, then step into the Fairway Friends
                clubhouse.
              </p>
              <div className="ff-hero-actions">
                <Button asChild className="ff-button ff-button-primary">
                  <Link href={clubhouseUrl}>
                    Enter the clubhouse <ArrowRight size={16} aria-hidden="true" />
                  </Link>
                </Button>
                <Button asChild variant="outline" className="ff-button ff-button-secondary">
                  <Link href="/signup">Create a player account</Link>
                </Button>
              </div>
              <p className="ff-sign-in-prompt">
                Already have an account? <Link href="/login">Sign in</Link>
              </p>
            </Reveal>

            <Reveal
              trigger="load"
              variant="fade"
              duration={0.65}
              delay={0.08}
              as="figure"
              className="ff-hero-image"
            >
              <Image
                src="https://cdn.polsia.com/generated-media/company_973904/df90d1e2-f25c-4c92-bdaf-0ec9943d2546.png"
                alt="A disc golf basket on a wooded course, with a player preparing to throw"
                fill
                priority
                sizes="(max-width: 760px) calc(100vw - 32px), 52vw"
                className="ff-hero-photo"
              />
            </Reveal>
          </div>
        </section>

        <section className="ff-profile-section" id="player-profile" aria-labelledby="profile-title">
          <div className="ff-shell">
            <div className="ff-profile-heading">
              <Reveal as="div" className="ff-profile-title-group">
                <p className="ff-eyebrow ff-eyebrow-muted">Your Fairway Friends profile</p>
                <h2 id="profile-title">A little more you, on and off the course.</h2>
              </Reveal>
              <p className="ff-profile-intro">
                Start with the player details you want to keep together: your home course, the discs
                you like, and a few words about your game.
              </p>
            </div>

            <div className="ff-profile-grid">
              {profileDetails.map(({ icon: Icon, title, description }) => (
                <article className="ff-profile-card" key={title}>
                  <span className="ff-profile-icon" aria-hidden="true">
                    <Icon size={19} strokeWidth={1.8} />
                  </span>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="ff-start-section" id="get-started" aria-labelledby="start-title">
          <div className="ff-start-inner ff-shell">
            <div>
              <p className="ff-eyebrow">Your next round starts here</p>
              <h2 id="start-title">Come on in.</h2>
              <p>Create a player account or head straight to the clubhouse.</p>
            </div>
            <div className="ff-start-actions">
              <Button asChild className="ff-button ff-button-primary">
                <Link href="/signup">
                  Create your account <ArrowRight size={16} aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="ff-button ff-button-secondary">
                <Link href={clubhouseUrl}>Open the clubhouse</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="ff-footer">
        <div className="ff-footer-inner ff-shell">
          <Link className="ff-brand ff-brand-footer" href="#top" aria-label="Fairway Friends home">
            <span className="ff-brand-mark" aria-hidden="true">
              <Disc3 size={20} strokeWidth={1.9} />
            </span>
            <span className="ff-brand-name">
              fairway<span>friends</span>
              <i>.</i>
            </span>
          </Link>
          <p className="ff-footer-tagline">Disc golf is better with friends.</p>
          <nav className="ff-footer-links" aria-label="Account and contact">
            <Link href="/players">Player profiles</Link>
            <Link href="/statistics">Global statistics</Link>
            <Link href="/login">Sign in</Link>
            <Link href="/signup">Create account</Link>
            <a href="mailto:fairway-friends@polsia.app">Contact</a>
          </nav>
          <span className="ff-footer-copyright">© {new Date().getFullYear()} Fairway Friends</span>
        </div>
      </footer>
    </div>
  );
}
