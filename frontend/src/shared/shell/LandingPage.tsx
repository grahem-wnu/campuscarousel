import { Icon, type IconName } from "../ui";

// The public storefront. Signed-out visitors to "/" land here instead of a bare login form — the
// product story, then two ways in (create an account, sign in). Everything described is shipped;
// no pricing, no testimonials, nothing aspirational. This is the page a future checkout attaches to.

/** An editorial feature row — rule-and-text like the dashboard's stats, not an icon-circle card. */
function Feature({ icon, title, children }: { icon: IconName; title: string; children: string }) {
  return (
    <div className="min-w-0 border-l-2 border-ink-300 py-1 pl-4 transition-colors hover:border-secondary-500">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-500">
        <Icon name={icon} size={13} className="shrink-0 text-secondary-600" /> {title}
      </p>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-700">{children}</p>
    </div>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: string }) {
  return (
    <div className="flex gap-4">
      <span aria-hidden className="font-display text-4xl font-bold leading-none text-secondary-500">{n}</span>
      <div className="min-w-0">
        <p className="font-display text-lg font-semibold text-ink-900">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-600">{children}</p>
      </div>
    </div>
  );
}

const CTA_PRIMARY =
  "inline-flex items-center justify-center whitespace-nowrap rounded-full bg-primary-700 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-primary-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300";
const CTA_QUIET =
  "inline-flex items-center justify-center whitespace-nowrap rounded-full border border-ink-300 px-5 py-2.5 text-sm font-medium text-ink-700 transition hover:border-primary-400 hover:text-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300";

export function LandingPage() {
  return (
    <div className="min-h-full bg-surface-base text-ink-900">
      {/* Top bar */}
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5 sm:px-6">
        <p className="font-display text-xl font-bold tracking-tight">
          Campus <span className="text-primary-700">Carousel</span>
        </p>
        <nav className="flex items-center gap-3">
          <a href="/login" className="whitespace-nowrap text-sm font-medium text-ink-600 transition hover:text-primary-700">
            Sign in
          </a>
          <a href="/signup" className={CTA_PRIMARY}>
            Create account
          </a>
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto max-w-5xl px-4 pb-16 pt-12 sm:px-6 sm:pt-20">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-secondary-600">
            College planning for families
          </p>
          <h1 className="mt-4 max-w-3xl font-display text-4xl font-bold leading-[1.1] tracking-tight sm:text-6xl">
            The story of the journey, <span className="text-primary-700">kept well.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-ink-600 sm:text-lg">
            One home for the whole path to college — the schools, the essays, the activity hours, the
            deadlines. Tell it where your student is headed and it researches the rest: real colleges,
            real costs, real dates, kept current in the background.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a href="/signup" className={CTA_PRIMARY}>
              Create your account
            </a>
            <a href="/login" className={CTA_QUIET}>
              Sign in
            </a>
          </div>
          <p className="mt-3 text-xs text-ink-400">Free while we grow. Set up takes about two minutes.</p>
        </section>

        {/* How it works */}
        <section className="border-y border-surface-border bg-surface-raised">
          <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
            <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
              Set up by conversation, not by forms
            </h2>
            <div className="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-3">
              <Step n="1" title="Talk it through">
                A short chat asks about your student — grade, goal, GPA, the schools already on the
                radar. A couple of minutes, in your own words.
              </Step>
              <Step n="2" title="Watch it build">
                The workspace fills itself in: a starter list of fitting colleges (yours included),
                researched one by one — tuition, program details, deadlines.
              </Step>
              <Step n="3" title="Track to the finish">
                Applications, essays, recommenders, scholarships, and every dated thing on one
                timeline, through acceptance day.
              </Step>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
          <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
            Everything the journey collects, in one place
          </h2>
          <div className="mt-8 grid grid-cols-1 gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
            <Feature icon="school" title="College research on autopilot">
              Every school on the list gets researched for you — costs, admissions, program strength,
              key dates — and refreshed as things change.
            </Feature>
            <Feature icon="star" title="A focus page for the goal">
              Name a career goal and the app tailors itself: entrance exams, certifications worth
              earning, interview questions, what to ask on campus visits.
            </Feature>
            <Feature icon="application" title="Applications and essays">
              One row per school — deadlines, essays, recommenders, decisions. An AI coach helps the
              essay say what your student means, and never writes it for them.
            </Feature>
            <Feature icon="heart" title="The journal">
              Activities, volunteering, work and experience hours logged as they happen — so the
              application story writes itself from real material.
            </Feature>
            <Feature icon="goal" title="Benchmarks and readiness">
              See how the profile stacks up against typical admits for the goal, and what would move
              it most — while there's still time to act on it.
            </Feature>
            <Feature icon="user" title="Built for families">
              Parents plan, students own their story. A student can keep journal entries private —
              visible to no one — while the family still sees the journey move.
            </Feature>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="border-t border-surface-border">
          <div className="mx-auto max-w-5xl px-4 py-14 text-center sm:px-6">
            <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
              Start the record they'll be glad you kept
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-ink-600">
              The journey to college is years long and full of moments worth keeping. Give it a home.
            </p>
            <div className="mt-6 flex justify-center">
              <a href="/signup" className={CTA_PRIMARY}>
                Create your account
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-surface-border">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-6 sm:px-6">
          <p className="font-display text-sm font-semibold text-ink-700">
            Campus <span className="text-primary-700">Carousel</span>
          </p>
          <nav className="flex items-center gap-4 text-xs text-ink-500">
            <a href="/login" className="transition hover:text-primary-700">Sign in</a>
            <a href="/signup" className="transition hover:text-primary-700">Create account</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
