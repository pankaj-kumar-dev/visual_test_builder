import { useEffect, useRef, useState } from 'react';

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

const workflowSteps = [
  {
    number: '01',
    eyebrow: 'BUILD',
    title: 'Start with the test flow.',
    body: 'Compose a scenario from Cypress-aware building blocks instead of starting with an empty spec file.',
  },
  {
    number: '02',
    eyebrow: 'CONFIGURE',
    title: 'Edit each step in context.',
    body: 'Select a node, configure its properties, and see unresolved values highlighted before they become a problem.',
  },
  {
    number: '03',
    eyebrow: 'GENERATE',
    title: 'Turn the flow into Cypress.',
    body: 'The visual flow becomes executable test code while keeping the structure readable and easy to inspect.',
  },
];

function useRevealOnScroll<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;

    if (!element) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      {
        threshold: 0.15,
        rootMargin: '0px 0px -8% 0px',
      },
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  return { ref, visible };
}

export function LandingPage({ onOpenBuilder }: LandingPageProps) {
  const [activeWorkflow, setActiveWorkflow] = useState(0);

  const heroReveal = useRevealOnScroll<HTMLElement>();
  const featureReveal = useRevealOnScroll<HTMLElement>();
  const workflowReveal = useRevealOnScroll<HTMLElement>();
  const finalReveal = useRevealOnScroll<HTMLElement>();

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }

  useEffect(() => {
    const interval = window.setInterval(() => {
      setActiveWorkflow((current) => (current + 1) % workflowSteps.length);
    }, 4200);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className="landing">
      <header className="landing__nav">
        <a
          href="#landing-top"
          className="landing__brand"
          aria-label="Visual Test Builder home"
          onClick={(event) => {
            event.preventDefault();
            scrollTo('landing-top');
          }}
        >
          <span className="landing__brand-mark" aria-hidden="true">
            VT
          </span>
          <span>Visual Test Builder</span>
        </a>

        <nav className="landing__nav-links" aria-label="Landing page navigation">
          <button type="button" onClick={() => scrollTo('landing-workflow')}>
            How it works
          </button>

          <button type="button" onClick={() => scrollTo('landing-features')}>
            Features
          </button>

          <a
            href="https://github.com/pankaj-kumar-dev/visual_test_builder"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>

          <button
            type="button"
            className="landing__nav-cta"
            onClick={onOpenBuilder}
          >
            Open Builder
          </button>
        </nav>
      </header>

      <main id="landing-top">
        <section
          ref={heroReveal.ref}
          className={`landing__hero ${heroReveal.visible ? 'is-visible' : ''}`}
        >
          <div className="landing__hero-copy">
            <p className="landing__eyebrow">VISUAL TEST ENGINEERING</p>

            <h1>
              Design Cypress tests
              <span> visually.</span>
            </h1>

            <p className="landing__hero-text">
              Build structured end-to-end test flows with drag-and-drop nodes,
              configure them in context, and generate Cypress code without
              starting from a blank file.
            </p>

            <div className="landing__hero-actions">
              <button
                type="button"
                className="landing__primary"
                onClick={onOpenBuilder}
              >
                Start building
                <span aria-hidden="true">→</span>
              </button>

              <button
                type="button"
                className="landing__secondary"
                onClick={() => scrollTo('landing-workflow')}
              >
                See how it works
              </button>
            </div>

            <div className="landing__meta">
              <span>Browser-based</span>
              <span>·</span>
              <span>No backend required</span>
              <span>·</span>
              <span>Flow JSON as source of truth</span>
            </div>
          </div>

          <div
            className="landing__visual"
            aria-label="Illustration of the visual test builder"
          >
            <div className="landing__window">
              <div className="landing__window-bar">
                <div className="landing__dots">
                  <span />
                  <span />
                  <span />
                </div>

                <span>visual-test-builder</span>

                <span className="landing__window-status">
                  READY
                </span>
              </div>

              <div className="landing__window-body">
                <aside className="landing__mini-sidebar">
                  <span className="is-active">Blocks</span>
                  <span>Commands</span>
                  <span>Flow</span>
                </aside>

                <div className="landing__mini-canvas">
                  <div className="landing__mini-topline">
                    <span>Checkout flow</span>
                    <span>4 steps</span>
                  </div>

                  <div className="landing__flow-line">
                    <div className="landing__node landing__node--root">
                      <small>SUITE</small>
                      <strong>describe · Checkout</strong>
                    </div>

                    <div className="landing__connector" />

                    <div className="landing__node">
                      <small>TEST</small>
                      <strong>it · completes purchase</strong>
                    </div>

                    <div className="landing__connector landing__connector--short" />

                    <div className="landing__node landing__node--accent">
                      <small>QUERY</small>
                      <strong>get · [data-testid=buy]</strong>
                    </div>

                    <div className="landing__connector landing__connector--short" />

                    <div className="landing__node">
                      <small>ACTION</small>
                      <strong>click · {'{}'}</strong>
                    </div>
                  </div>

                  <div className="landing__code-chip">
                    <span>$</span>
                    cy.get('[data-testid=buy]').click()
                  </div>
                </div>

                <aside className="landing__mini-properties">
                  <span>Properties</span>

                  <div className="landing__field">
                    <small>selector</small>
                    <strong>[data-testid=buy]</strong>
                  </div>

                  <div className="landing__field">
                    <small>timeout</small>
                    <strong>4000 ms</strong>
                  </div>

                  <div className="landing__field landing__field--success">
                    <small>status</small>
                    <strong>Resolved</strong>
                  </div>
                </aside>
              </div>
            </div>

            <div className="landing__visual-note--top landing__visual-note">
              Drag → configure → generate
            </div>

            <div className="landing__visual-note--bottom landing__visual-note">
              Flow JSON
              <span>→</span>
              Cypress
            </div>
          </div>
        </section>

        <section
          id="landing-workflow"
          ref={workflowReveal.ref}
          className={`landing__workflow ${
            workflowReveal.visible ? 'is-visible' : ''
          }`}
        >
          <div className="landing__workflow-intro">
            <div>
              <p className="landing__eyebrow">THE WORKFLOW</p>

              <h2>
                From idea to
                <span> executable test.</span>
              </h2>
            </div>

            <p className="landing__workflow-summary">
              The builder turns the structure of your test into something you
              can see, reason about, and export.
            </p>
          </div>

          <div className="landing__workflow-layout">
            <div className="landing__workflow-list">
              {workflowSteps.map((step, index) => (
                <button
                  type="button"
                  className={`landing__workflow-step ${
                    activeWorkflow === index ? 'is-active' : ''
                  }`}
                  key={step.number}
                  onClick={() => setActiveWorkflow(index)}
                >
                  <span className="landing__workflow-number">
                    {step.number}
                  </span>

                  <span>
                    <small>{step.eyebrow}</small>
                    <strong>{step.title}</strong>
                    <em>{step.body}</em>
                  </span>
                </button>
              ))}
            </div>

            <div className="landing__workflow-demo">
              <div className="landing__demo-header">
                <span>interactive preview</span>
                <span>visual-test-builder</span>
              </div>

              <div className="landing__demo-stage">
                <div
                  className={`landing__demo-panel ${
                    activeWorkflow === 0 ? 'is-active' : ''
                  }`}
                >
                  <div className="landing__demo-toolbar">
                    <span>FLOW</span>
                    <span>+ Add block</span>
                  </div>

                  <div className="landing__demo-canvas">
                    <div className="landing__demo-node landing__demo-node--wide">
                      <small>describe</small>
                      <strong>Checkout</strong>
                    </div>

                    <div className="landing__demo-link" />

                    <div className="landing__demo-node">
                      <small>it</small>
                      <strong>completes purchase</strong>
                    </div>

                    <div className="landing__demo-link landing__demo-link--small" />

                    <div className="landing__demo-node landing__demo-node--selected">
                      <small>get</small>
                      <strong>[data-testid=buy]</strong>
                    </div>
                  </div>
                </div>

                <div
                  className={`landing__demo-panel ${
                    activeWorkflow === 1 ? 'is-active' : ''
                  }`}
                >
                  <div className="landing__demo-toolbar">
                    <span>PROPERTIES</span>
                    <span>selected: get</span>
                  </div>

                  <div className="landing__demo-properties">
                    <div className="landing__demo-property">
                      <small>selector</small>
                      <strong>[data-testid=buy]</strong>
                    </div>

                    <div className="landing__demo-property">
                      <small>timeout</small>
                      <strong>4000</strong>
                    </div>

                    <div className="landing__demo-property landing__demo-property--resolved">
                      <small>validation</small>
                      <strong>Ready to generate</strong>
                    </div>
                  </div>
                </div>

                <div
                  className={`landing__demo-panel ${
                    activeWorkflow === 2 ? 'is-active' : ''
                  }`}
                >
                  <div className="landing__demo-toolbar">
                    <span>CYPRESS</span>
                    <span>generated output</span>
                  </div>

                  <pre className="landing__demo-code">
{`describe('Checkout', () => {
  it('completes purchase', () => {
    cy.get('[data-testid=buy]')
      .click()
  })
})`}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          id="landing-features"
          ref={featureReveal.ref}
          className={`landing__features ${
            featureReveal.visible ? 'is-visible' : ''
          }`}
        >
          <div className="landing__section-heading">
            <p className="landing__eyebrow">WHY IT WORKS</p>

            <h2>
              A visual layer over
              <span> real Cypress structure.</span>
            </h2>
          </div>

          <div className="landing__feature-grid">
            {features.map((feature) => (
              <article className="landing__feature" key={feature.number}>
                <span className="landing__feature-number">
                  {feature.number}
                </span>

                <h3>{feature.title}</h3>

                <p>{feature.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section
          ref={finalReveal.ref}
          className={`landing__bottom ${
            finalReveal.visible ? 'is-visible' : ''
          }`}
        >
          <div>
            <p className="landing__eyebrow">READY WHEN YOU ARE</p>

            <h2>
              Stop wiring tests
              <span> by hand.</span>
            </h2>

            <p>
              Open the builder and turn your next scenario into a visible flow.
            </p>
          </div>

          <button
            type="button"
            className="landing__primary"
            onClick={onOpenBuilder}
          >
            Open the builder
            <span aria-hidden="true">→</span>
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
