interface LandingPageProps {
  onOpenBuilder: () => void;
}

const features = [
  {
    number: '01',
    title: 'Build visually',
    body: 'Drag Cypress building blocks onto a flow canvas and shape test scenarios without hand-writing the structure.',
  },
  {
    number: '02',
    title: 'Configure with context',
    body: 'Edit node properties in place with validation-aware controls and clear unresolved-field feedback.',
  },
  {
    number: '03',
    title: 'Generate Cypress code',
    body: 'Turn the visual Flow JSON into readable Cypress test code instantly, ready to copy or export.',
  },
];

export function LandingPage({ onOpenBuilder }: LandingPageProps) {
  function scrollToFeatures() {
    document.getElementById('landing-features')?.scrollIntoView({ behavior: 'smooth' });
  }

  return (
    <div className="landing">
      <header className="landing__nav">
        <a href="#" className="landing__brand" aria-label="Visual Test Builder home">
          <span className="landing__brand-mark" aria-hidden="true">VT</span>
          <span>Visual Test Builder</span>
        </a>
        <nav className="landing__nav-links" aria-label="Landing page navigation">
          <button type="button" onClick={scrollToFeatures}>Features</button>
          <a href="https://github.com/pankaj-kumar-dev/visual_test_builder" target="_blank" rel="noreferrer">GitHub</a>
          <button type="button" className="landing__nav-cta" onClick={onOpenBuilder}>Open Builder</button>
        </nav>
      </header>

      <main>
        <section className="landing__hero">
          <div className="landing__hero-copy">
            <p className="landing__eyebrow">VISUAL TEST ENGINEERING</p>
            <h1>Design Cypress tests<span> visually.</span></h1>
            <p className="landing__hero-text">
              Build structured end-to-end test flows with drag-and-drop nodes, configure
              them in context, and generate Cypress code without starting from a blank file.
            </p>
            <div className="landing__hero-actions">
              <button type="button" className="landing__primary" onClick={onOpenBuilder}>
                Start building <span aria-hidden="true">→</span>
              </button>
              <button type="button" className="landing__secondary" onClick={scrollToFeatures}>
                Explore how it works
              </button>
            </div>
            <div className="landing__meta">
              <span>Browser-based</span><span>·</span><span>No backend required</span>
              <span>·</span><span>Flow JSON as source of truth</span>
            </div>
          </div>

          <div className="landing__visual" aria-label="Illustration of the visual test builder">
            <div className="landing__window">
              <div className="landing__window-bar">
                <div className="landing__dots"><span /><span /><span /></div>
                <span>visual-test-builder</span>
              </div>
              <div className="landing__window-body">
                <aside className="landing__mini-sidebar">
                  <span className="is-active">Blocks</span><span>Commands</span><span>Flow</span>
                </aside>
                <div className="landing__mini-canvas">
                  <div className="landing__mini-title">Checkout flow</div>
                  <div className="landing__node landing__node--root">describe · Checkout</div>
                  <div className="landing__connector" />
                  <div className="landing__node">it · completes purchase</div>
                  <div className="landing__connector landing__connector--short" />
                  <div className="landing__node landing__node--accent">get · [data-testid=buy]</div>
                  <div className="landing__connector landing__connector--short" />
                  <div className="landing__node">click · {'{}'}</div>
                  <div className="landing__code-chip">cy.get('[data-testid=buy]').click()</div>
                </div>
                <aside className="landing__mini-properties">
                  <span>Properties</span>
                  <div className="landing__field"><small>selector</small><strong>[data-testid=buy]</strong></div>
                  <div className="landing__field"><small>timeout</small><strong>4000 ms</strong></div>
                </aside>
              </div>
            </div>
          </div>
        </section>

        <section id="landing-features" className="landing__features">
          <div className="landing__section-heading">
            <p className="landing__eyebrow">THE WORKFLOW</p>
            <h2>From idea to executable test.</h2>
          </div>
          <div className="landing__feature-grid">
            {features.map((feature) => (
              <article className="landing__feature" key={feature.number}>
                <span className="landing__feature-number">{feature.number}</span>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landing__bottom">
          <div>
            <p className="landing__eyebrow">READY WHEN YOU ARE</p>
            <h2>Stop wiring tests by hand.</h2>
            <p>Open the builder and turn your next scenario into a visible flow.</p>
          </div>
          <button type="button" className="landing__primary" onClick={onOpenBuilder}>
            Open the builder <span aria-hidden="true">→</span>
          </button>
        </section>
      </main>

      <footer className="landing__footer">
        <span>Visual Test Builder</span>
        <span>Open-source Cypress flow authoring</span>
      </footer>
    </div>
  );
}
