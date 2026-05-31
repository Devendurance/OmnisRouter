import Link from "next/link";

export default function Home() {
  return (
    <main className="landing-page">
      <nav className="landing-nav" aria-label="Public navigation">
        <Link className="landing-logo" href="/">
          Omnis<em>Router</em>
        </Link>
        <div className="landing-nav-links">
          <a className="landing-nav-link" href="#how-it-works">How it works</a>
          <a className="landing-nav-link" href="#features">Features</a>
          <a className="landing-nav-link" href="#demo">Demo</a>
          <Link className="landing-nav-link" href="/app/rules">Rules</Link>
        </div>
        <Link className="btn-nav" href="/app">Open App</Link>
      </nav>

      <section className="landing-hero">
        <div className="hero-grid-bg" />
        <div className="hero-radial" />
        <div className="hero-content">
          <p className="landing-eyebrow"><span className="eyebrow-dot" />Injective x Solana · CCTP Standard Transfer</p>
          <h1 className="hero-h1">Cross-chain payments<br />that feel like<br /><em>payments.</em></h1>
          <p className="hero-body">
            OmnisRouter turns plain-English payment commands into safe, rule-checked cross-chain transfers. The agent checks the route, validates your spending rules, handles gas logic, and asks for approval before a single token moves.
          </p>
          <div className="cta-group">
            <Link className="btn-primary" href="/app">Start a Payment</Link>
            <a className="btn-ghost" href="#how-it-works">See how it works</a>
          </div>
        </div>

        <div className="proof-card" aria-label="Mock completed transfer">
          <div className="proof-header"><span className="proof-title">Live Transfer</span><span className="proof-status"><span className="proof-dot" />Complete</span></div>
          <div className="proof-amount">40.00</div>
          <div className="proof-asset">USDC · Cross-chain</div>
          <div className="proof-row"><span className="proof-label">Recipient</span><span className="proof-value">inj1router...9xk</span></div>
          <div className="proof-row"><span className="proof-label">Gas fee</span><span className="proof-value green">Sponsored</span></div>
          <div className="proof-row"><span className="proof-label">Rule check</span><span className="proof-value blue">Passed · approval ready</span></div>
          <div className="proof-row"><span className="proof-label">CCTP attestation</span><span className="proof-value green">Confirmed</span></div>
          <div className="proof-route"><span className="proof-chain">Solana</span><span className="proof-arrow">→</span><span className="proof-chain">Injective</span><span className="proof-cctp">via CCTP</span></div>
        </div>
      </section>

      <section className="stats-strip" aria-label="Product stats">
        <div className="stat-item"><div className="stat-number"><em>6</em> steps</div><div className="stat-label">From intent to receipt</div></div>
        <div className="stat-item"><div className="stat-number"><em>10</em> credits</div><div className="stat-label">Sponsored gas per day</div></div>
        <div className="stat-item"><div className="stat-number">Zero<em>.</em></div><div className="stat-label">Blind autonomous spending</div></div>
      </section>

      <section className="landing-section" id="how-it-works">
        <div className="section-inner">
          <p className="section-eyebrow">How it works</p>
          <h2 className="section-h2">Intent in. <em>Safe transfer</em> out.</h2>
          <p className="section-copy">Every payment flows through a structured pipeline: intent parsing, route validation, rule enforcement, human approval, execution, and receipt.</p>
          <div className="steps-grid">
            {[
              ["01", "Intent parsing", "The agent extracts amount, asset, source chain, destination chain, and recipient from plain language.", "AI layer"],
              ["02", "Route & rule check", "A deterministic checker confirms supported Solana to Injective USDC routing and validates spending controls.", "Rule engine"],
              ["03", "Gas credit logic", "Sponsored credits are checked before the payment so fee handling is explicit.", "Gas layer"],
              ["04", "Human approval", "You see the full route, amount, rule result, and fee mode before execution.", "Trust gate"],
              ["05", "CCTP execution", "The simulator models burn, attestation, relay, and mint steps without touching a chain.", "CCTP rail"],
              ["06", "Receipt & audit log", "Every mock step produces a readable receipt for review.", "Trust layer"],
            ].map(([num, title, desc, tag]) => (
              <article className="step-card" key={num}><div className="step-num">{num}<div className="step-num-line" /></div><h3 className="step-title">{title}</h3><p className="step-desc">{desc}</p><span className="step-tag">{tag}</span></article>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section alt" id="features">
        <div className="section-inner">
          <p className="section-eyebrow">Product features</p>
          <h2 className="section-h2">Everything a payment <em>needs.</em></h2>
          <p className="section-copy">OmnisRouter is built around five modules: intent parsing, route checking, spending rule enforcement, gas credit logic, and payment execution with a full audit log.</p>
          <div className="features-grid">
            {[
              ["Deterministic spending rules", "Set max transfers, daily caps, approval thresholds, destination chains, and emergency pause. Rules run in code, not AI guesswork."],
              ["Sponsored gas credits", "10 daily sponsored gas credits show how payments can proceed without users managing destination-chain gas."],
              ["CCTP route transparency", "Plain-English explanations show the route before approval so users understand the transfer path."],
              ["Full payment audit log", "Execution steps and receipt fields make the testnet transfer easy to inspect."],
            ].map(([title, desc]) => <article className="feature-card" key={title}><div className="feature-icon">◆</div><h3 className="feature-title">{title}</h3><p className="feature-desc">{desc}</p></article>)}
          </div>
          <div className="gas-demo"><div className="gas-header"><span className="gas-title">Sponsored gas credits</span><span className="gas-count">10 / 10 available today</span></div><div className="gas-track"><div className="gas-fill" /></div><div className="gas-label">Testnet mode · Current transfer: sponsored</div></div>
        </div>
      </section>

      <section className="landing-section" id="demo">
        <div className="section-inner">
          <p className="section-eyebrow">See it in action</p>
          <h2 className="section-h2">The agent explains. <em>You approve.</em></h2>
          <p className="section-copy">Type a payment intent. OmnisRouter checks everything, explains the route and rules in plain English, then waits for explicit approval.</p>
          <div className="demo-grid">
            <div className="agent-mock"><div className="agent-header"><div className="agent-dots"><span className="agent-dot r" /><span className="agent-dot y" /><span className="agent-dot g" /></div><span className="agent-label">OmnisRouter · Agent Command</span></div><div className="agent-body"><div className="msg-user">Send 40 USDC from Solana to this Injective address inj1router...9xk</div><div className="msg-agent">I found a supported mock route for this payment.<div className="msg-route">Source: Solana USDC<br />Destination: Injective USDC<br />Rail: CCTP standard transfer<br />Rule check: Approval required &gt; 25 USDC<br />Gas: Sponsored credit available</div><Link className="msg-approve" href="/app/approval">Approve payment →</Link></div></div></div>
            <div className="rules-demo"><div className="rules-demo-title">Spending rules</div>{[["Max transfer", "100 USDC"], ["Daily cap", "250 USDC"], ["Approval above", "25 USDC"], ["Destination", "Injective"], ["Gas credits", "10 / day"]].map(([name, value]) => <div className="rule-row" key={name}><span className="rule-name">{name}</span><span className="rule-val">{value}</span></div>)}<p className="rules-note">Rules run in code · not AI inference</p></div>
          </div>
        </div>
      </section>

      <section className="cta-section">
        <div className="cta-inner">
          <p className="section-eyebrow">Start building</p>
          <h2 className="cta-h2">Stop doing infrastructure <em>homework.</em></h2>
          <p className="cta-copy">Open the mock dashboard, inspect the rules, approve the payment, and follow the simulated route from intent to receipt.</p>
          <Link className="btn-primary large" href="/app">Open OmnisRouter App</Link>
          <p className="cta-note">Mock data only · No backend · No blockchain transactions</p>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="footer-inner"><div><div className="footer-logo">Omnis<em>Router</em></div><p className="footer-desc">AI-powered stablecoin payment agent for cross-chain USDC transfers. Built as a hackathon MVP.</p></div><div className="footer-links"><div className="footer-link-label">Product</div><Link className="footer-link" href="/app">Dashboard</Link><Link className="footer-link" href="/app/rules">Spending Rules</Link><Link className="footer-link" href="/app/payment">Payment Timeline</Link><Link className="footer-link" href="/app/receipt">Receipts</Link></div><div className="footer-links"><div className="footer-link-label">Chain</div><span className="footer-link">Solana</span><span className="footer-link">Injective</span><span className="footer-link">Circle CCTP</span></div></div>
        <div className="footer-bottom"><span className="footer-copy">© 2026 OmnisRouter · Hackathon MVP</span><div className="footer-chain"><span className="footer-chain-dot" />Solana → Injective · CCTP mock</div></div>
      </footer>
    </main>
  );
}
