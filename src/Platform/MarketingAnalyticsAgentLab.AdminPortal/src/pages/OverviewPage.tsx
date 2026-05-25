import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  Bot,
  Building2,
  Cable,
  CheckCircle2,
  FileText,
  Gauge,
  Layers,
  Map,
  Server,
  ShieldCheck,
  Sparkles,
  Users,
  Wrench,
  Zap,
} from 'lucide-react';
import PageHeader from '../components/PageHeader';

/**
 * Overview page — the platform's front door. Written for a first-time reader who has
 * never touched the system before (a VP, a new product manager, a partner-team engineer).
 *
 * Editorial rules I tried to follow:
 *   - One concrete worked example threaded through every section, drawn from the
 *     Marketing demo so a curious reader can click into the pages and see the real thing.
 *   - No acronym used without expansion. No code. No tool names without context.
 *   - Every concept ends with a "Where to manage it →" deep-link so the reader can
 *     stop reading and start poking around at any moment.
 *   - Information density tuned so the page can be read top-to-bottom in ~5 minutes
 *     OR skimmed for the bits the reader cares about.
 */
export default function OverviewPage() {
  return (
    <>
      <PageHeader
        title="Overview"
        subtitle="A plain-language guide to what this platform is, how it fits together, and why it exists."
      />
      <div className="space-y-10 p-8">
        <HeroSection />
        <MentalModelSection />
        <WorkedExampleSection />
        <ConceptsSection />
        <OwnershipSection />
        <LifecycleSection />
        <SafetySection />
        <ValueSection />
      </div>
    </>
  );
}

// =====================================================================================
// Hero
// =====================================================================================

function HeroSection() {
  return (
    <section className="rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50/70 to-white p-8">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
          <Sparkles size={22} />
        </div>
        <div className="space-y-3">
          <h2 className="text-2xl font-semibold text-slate-900">
            We turn internal APIs into safe AI tools that our products can use to answer real questions.
          </h2>
          <p className="max-w-3xl text-base text-slate-700">
            Every team at ServiceTitan already has APIs that know things — campaign performance,
            customer history, fleet status, billing. This platform lets product teams take those
            existing APIs and expose them to AI assistants in a controlled way, so a customer can
            ask a question in plain English and get a grounded, real-data answer back inside the
            product they're already using.
          </p>
          <p className="max-w-3xl text-sm text-slate-600">
            Nothing on this platform replaces an API. We sit on top of the APIs you already have,
            add the safety, observability, and AI orchestration layer, and let the AI do the rest.
          </p>
        </div>
      </div>
    </section>
  );
}

// =====================================================================================
// How it fits together
// =====================================================================================

function MentalModelSection() {
  return (
    <SectionShell
      icon={Layers}
      title="How it fits together"
      lead="Five layers, one direction. A user question enters at the left and a real-data answer comes back from the right."
    >
      <div className="card overflow-hidden">
        <div className="grid gap-3 p-5 md:grid-cols-5">
          <LayerBox
            icon={Building2}
            title="User in a product"
            body="A ServiceTitan customer using Atlas (or any standalone app) asks a question in plain English."
            color="slate"
          />
          <LayerBox
            icon={Users}
            title="Assistant"
            body="A route definition for the AI gateway. One per product. The gateway looks it up to decide which agent should handle the question."
            color="violet"
          />
          <LayerBox
            icon={Bot}
            title="Agent"
            body="An AI with instructions, a model, and a set of tools it is allowed to use."
            color="brand"
          />
          <LayerBox
            icon={Wrench}
            title="Tool Set"
            body="A curated group of AI tools, each one wrapping an API operation. Governed, tested, published."
            color="emerald"
          />
          <LayerBox
            icon={Server}
            title="Internal API"
            body="The real source of truth: Marketing Analytics API, Campaign Management API, Customer Insights API…"
            color="slate"
          />
        </div>
        <div className="border-t border-slate-100 bg-slate-50 px-5 py-3 text-xs text-slate-600">
          The platform's job is everything <em>between</em> the user and the API: pick the right
          agent, give it the right tools, let the AI decide which tool to call, run that tool
          safely, and bring the answer back — with every step logged for cost, latency, and
          governance review.
        </div>
      </div>
    </SectionShell>
  );
}

interface LayerBoxProps {
  icon: typeof Server;
  title: string;
  body: string;
  color: 'slate' | 'brand' | 'emerald' | 'violet';
}

function LayerBox({ icon: Icon, title, body, color }: LayerBoxProps) {
  const tone = {
    slate:   'bg-slate-50 text-slate-700 border-slate-200',
    brand:   'bg-brand-50 text-brand-700 border-brand-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    violet:  'bg-violet-50 text-violet-700 border-violet-200',
  }[color];
  return (
    <div className={`flex flex-col gap-2 rounded-xl border p-3 ${tone}`}>
      <div className="flex items-center gap-2">
        <Icon size={16} />
        <div className="text-sm font-semibold">{title}</div>
      </div>
      <p className="text-xs leading-relaxed">{body}</p>
    </div>
  );
}

// =====================================================================================
// Worked example
// =====================================================================================

function WorkedExampleSection() {
  return (
    <SectionShell
      icon={Zap}
      title="A worked example, end to end"
      lead="Same five layers, with the names of the Marketing demo plugged in. Every step below corresponds to something you can click into elsewhere in the portal."
    >
      <div className="card">
        <div className="border-b border-slate-100 bg-slate-50 px-5 py-3 text-sm">
          <span className="font-semibold text-slate-800">Customer asks Atlas:</span>{' '}
          <em className="text-slate-700">"What was our email open rate over the last 14 days?"</em>
        </div>
        <ol className="divide-y divide-slate-100">
          <ExampleStep
            n={1}
            title="Atlas hands the question to an Assistant"
            body={
              <>
                Atlas knows which assistant is responsible for which product page. The Marketing
                page is wired to the <strong>Marketing Analytics Assistant</strong>. The assistant
                receives the raw question.
              </>
            }
            link={{ href: '/assistants', label: 'See Assistants' }}
          />
          <ExampleStep
            n={2}
            title="The Assistant routes to the right Agent"
            body={
              <>
                The assistant has two agents to choose from:
                <strong> Marketing Analytics Agent </strong>(reads numbers) and
                <strong> Campaign Optimization Agent </strong>(recommends actions). This question
                is about metrics, so it goes to the Analytics agent.
              </>
            }
            link={{ href: '/assistants', label: 'See the assistant / agent wiring' }}
          />
          <ExampleStep
            n={3}
            title="The Agent picks a tool from its Tool Set"
            body={
              <>
                The Marketing Analytics Agent has one Tool Set attached:
                <strong> Marketing Analytics Tool Set</strong>. The set has four tools. The agent's
                LLM reads the tool descriptions and picks <span className="font-mono">get_open_rate</span>.
              </>
            }
            link={{ href: '/tools', label: 'See Tool Sets' }}
          />
          <ExampleStep
            n={4}
            title="The tool calls the real internal API"
            body={
              <>
                The platform's Tool Runtime makes the actual HTTPS request to
                <span className="ml-1 font-mono">GET /analytics/open-rate?days=14</span> on the
                Marketing Analytics API. The browser never calls internal APIs directly — every
                hop is server-side, authenticated, and logged.
              </>
            }
            link={{ href: '/tools?tab=sources', label: 'See registered API Sources' }}
          />
          <ExampleStep
            n={5}
            title="The Agent writes the answer in plain English"
            body={
              <>
                The API returned <span className="font-mono">{`{ overallOpenRate: 0.287, ... }`}</span>.
                The agent's LLM turns that into:
                <em className="ml-1">"Over the last 14 days your email open rate was 28.7%, up 1.2 points
                from the prior two weeks."</em> Atlas shows it to the customer.
              </>
            }
            link={{ href: '/activity', label: 'See real executions' }}
          />
          <ExampleStep
            n={6}
            title="Every step is recorded"
            body={
              <>
                One trace per question, with the model used, tokens spent, cost, latency, which
                tool was picked, and whether any policy blocked it. Live numbers roll up on the
                Dashboard; per-call detail lives on Activity.
              </>
            }
            link={{ href: '/dashboard', label: 'Open the live Dashboard' }}
          />
        </ol>
      </div>
    </SectionShell>
  );
}

function ExampleStep({
  n,
  title,
  body,
  link,
}: {
  n: number;
  title: string;
  body: React.ReactNode;
  link?: { href: string; label: string };
}) {
  return (
    <li className="flex items-start gap-4 px-5 py-4">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
        {n}
      </div>
      <div className="flex-1">
        <div className="text-sm font-semibold text-slate-900">{title}</div>
        <p className="mt-1 text-sm text-slate-600">{body}</p>
        {link && (
          <Link to={link.href} className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-900">
            {link.label} <ArrowRight size={11} />
          </Link>
        )}
      </div>
    </li>
  );
}

// =====================================================================================
// Concepts (cards)
// =====================================================================================

function ConceptsSection() {
  return (
    <SectionShell
      icon={FileText}
      title="The five things you'll see in the menu"
      lead="One short card per object. Same shape for each, so you can scan."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <ConceptCard
          icon={Server}
          title="API Source"
          definition="A registered internal API that has agreed to expose its OpenAPI document to the platform."
          why="We index API sources so the platform always has an up-to-date list of available endpoints, without anyone hand-editing config files."
          example={
            <>
              <strong>Marketing Analytics API</strong> is a source. It exposes four endpoints for delivery,
              open rate, click-through, and per-campaign summary.
            </>
          }
          link={{ href: '/tools?tab=sources', label: 'Tools → API Sources' }}
        />
        <ConceptCard
          icon={Cable}
          title="Endpoint"
          definition="A single operation on an API source — one HTTP verb + path, like GET /analytics/open-rate."
          why="Endpoints are the raw material. The platform browses them, but it doesn't expose them to AI directly — they always become tools inside a Tool Set first."
          example={
            <>
              <span className="font-mono">GET /analytics/open-rate</span> is one endpoint from the
              Marketing Analytics API.
            </>
          }
          link={{ href: '/tools?tab=endpoints', label: 'Tools → Endpoints' }}
        />
        <ConceptCard
          icon={Wrench}
          title="Tool Set"
          definition="A curated group of AI tools, all drawn from the same API source, with a shared lifecycle and shared permissions."
          why="An LLM cannot safely browse hundreds of raw endpoints. We give it a small group with clear names and descriptions, so it picks the right one with high confidence and we can govern the group as a unit."
          example={
            <>
              <strong>Marketing Analytics Tool Set</strong> contains four tools:
              <span className="ml-1 font-mono">get_email_delivery</span>,
              <span className="ml-1 font-mono">get_open_rate</span>,
              <span className="ml-1 font-mono">get_click_through</span>,
              <span className="ml-1 font-mono">get_campaign_summary</span>.
            </>
          }
          link={{ href: '/tools', label: 'Tools → Tool Sets' }}
        />
        <ConceptCard
          icon={Bot}
          title="Agent"
          definition="An AI with a name, a model, instructions, and an attached set of Tool Sets it is allowed to use."
          why="Agents are where domain knowledge lives. Different agents have different personalities and different tools — an analytics agent reads numbers, an optimization agent recommends actions."
          example={
            <>
              <strong>Marketing Analytics Agent</strong> uses gpt-4o-mini, has instructions to be
              concise and data-driven, and is attached to the Marketing Analytics Tool Set.
            </>
          }
          link={{ href: '/agents', label: 'Agents' }}
        />
        <ConceptCard
          icon={Users}
          title="Assistant"
          definition="A route definition for the AI gateway. Each product gets one. If you have ever set up Azure API Management, Kong, or any other API gateway, this is the same idea — except the upstream is an LLM agent instead of a microservice."
          why="Atlas (and any other standalone app) only wants one address per product. The assistant is that address. The platform looks it up, picks the right agent behind it, runs the call, and returns the answer. Agents can come and go behind an assistant without Atlas having to redeploy."
          example={
            <>
              <strong>Marketing Analytics Assistant</strong> is the single address the Marketing
              page in Atlas calls (<span className="font-mono">POST /assistant/api/interaction/message</span>
              with <span className="font-mono">assistantId=marketing_analytics_assistant</span>).
              Behind it sit the Analytics and Optimization agents; the gateway picks one per request.
            </>
          }
          link={{ href: '/assistants', label: 'Assistants' }}
        />
      </div>
    </SectionShell>
  );
}

interface ConceptCardProps {
  icon: typeof Server;
  title: string;
  definition: string;
  why: string;
  example: React.ReactNode;
  link: { href: string; label: string };
}

function ConceptCard({ icon: Icon, title, definition, why, example, link }: ConceptCardProps) {
  return (
    <article className="card flex flex-col gap-3 p-5">
      <header className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-50 text-brand-700">
          <Icon size={16} />
        </div>
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      </header>
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">What it is</div>
        <p className="mt-1 text-sm text-slate-700">{definition}</p>
      </div>
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Why it exists</div>
        <p className="mt-1 text-sm text-slate-700">{why}</p>
      </div>
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Example</div>
        <p className="mt-1 text-sm text-slate-700">{example}</p>
      </div>
      <Link to={link.href} className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-900">
        {link.label} <ArrowRight size={11} />
      </Link>
    </article>
  );
}

// =====================================================================================
// Ownership
// =====================================================================================

function OwnershipSection() {
  const rows: Array<{ object: string; owner: string; what: string }> = [
    { object: 'API Source',  owner: 'Product team that owns the API',  what: 'Publishes a clean OpenAPI document, follows the API Standards.' },
    { object: 'Tool Set',    owner: 'Platform or product engineer',    what: 'Groups endpoints into a Tool Set, writes tool names and descriptions, sets auth and permissions, publishes when ready.' },
    { object: 'Agent',       owner: 'Product engineer',                what: 'Picks the model, writes instructions, attaches published Tool Sets, tests behavior in the Agent Playground.' },
    { object: 'Assistant',   owner: 'App owner (the product team that integrates with Atlas)', what: 'Decides which agents front the product, picks the default agent, controls when the assistant is enabled.' },
  ];
  return (
    <SectionShell
      icon={Users}
      title="Who owns what"
      lead="A common first question. Ownership is split so each team only does the part that they're closest to."
    >
      <div className="card overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-5 py-2 text-left">Object</th>
              <th className="px-5 py-2 text-left">Who owns it</th>
              <th className="px-5 py-2 text-left">What they do</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(r => (
              <tr key={r.object}>
                <td className="px-5 py-3 font-semibold text-slate-800">{r.object}</td>
                <td className="px-5 py-3 text-slate-700">{r.owner}</td>
                <td className="px-5 py-3 text-slate-600">{r.what}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionShell>
  );
}

// =====================================================================================
// Lifecycle
// =====================================================================================

function LifecycleSection() {
  const steps = [
    { n: 1, label: 'Register API Source',  hint: 'Paste an OpenAPI URL on Tools → API Sources.' },
    { n: 2, label: 'Pick Endpoints',       hint: 'On Tools → Endpoints, tick the ones you want as AI tools.' },
    { n: 3, label: 'Create Tool Set',      hint: 'Name + describe it. Becomes a draft.' },
    { n: 4, label: 'Configure each tool',  hint: 'Edit names and descriptions, set auth + permissions.' },
    { n: 5, label: 'Test in Playground',   hint: 'HTTP mode first, then AI mode against the real LLM.' },
    { n: 6, label: 'Publish & attach',     hint: 'Publish from Tools, then attach to an Agent on Agents.' },
  ];
  return (
    <SectionShell
      icon={Map}
      title="The lifecycle of a new tool"
      lead="From 'we have an API' to 'an agent is using it' is six steps. No service deploys, no agent restarts."
    >
      <div className="card">
        <ol className="grid gap-3 p-5 md:grid-cols-3 lg:grid-cols-6">
          {steps.map(s => (
            <li key={s.n} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                  {s.n}
                </div>
                <div className="text-sm font-semibold text-slate-800">{s.label}</div>
              </div>
              <p className="text-xs text-slate-600">{s.hint}</p>
            </li>
          ))}
        </ol>
      </div>
    </SectionShell>
  );
}

// =====================================================================================
// Safety & governance
// =====================================================================================

function SafetySection() {
  const points = [
    {
      title: 'The browser never calls internal APIs directly.',
      body: 'Every tool execution goes through a server-side Tool Runtime, which holds the auth and the routing rules. The browser only ever talks to the platform.',
    },
    {
      title: 'Write operations require approval and are disabled by default in the MVP.',
      body: 'Read-only tools (GET) can publish freely. Write tools (POST/PUT/PATCH/DELETE) are marked as requiring approval; full execution is gated behind explicit operator confirmation.',
    },
    {
      title: 'Per-Tool-Set permissions.',
      body: 'Each Tool Set lists which agents and which tenants are allowed to use it. An agent in tenant A cannot invoke a tool scoped to tenant B.',
    },
    {
      title: 'Every model call and every tool call is recorded.',
      body: 'Cost, latency, tokens, which tool was picked, whether a policy blocked it. Rolled up on Dashboard, drillable per execution on Activity.',
    },
    {
      title: 'Multi-tenant aware end to end.',
      body: 'Marketing\'s tools cannot leak into Fleet\'s agents. Tenants and products are first-class concerns in the registry, the runtime, and the audit log.',
    },
  ];
  return (
    <SectionShell
      icon={ShieldCheck}
      title="What stops this from doing something dumb"
      lead="The five guardrails that make this safe to put in front of customers."
    >
      <div className="grid gap-3 md:grid-cols-2">
        {points.map(p => (
          <div key={p.title} className="card flex items-start gap-3 p-4">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
            <div>
              <div className="text-sm font-semibold text-slate-900">{p.title}</div>
              <p className="mt-1 text-sm text-slate-600">{p.body}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
        <Activity size={12} className="text-slate-400" />
        <span>
          The Dashboard and the Activity page both render straight from the same execution event
          stream. There is one source of truth for governance and observability — and it is the same
          one the engineers debug from.
        </span>
        <Link to="/dashboard" className="text-brand-700 hover:text-brand-900">Open Dashboard →</Link>
        <Link to="/activity" className="text-brand-700 hover:text-brand-900">Open Activity →</Link>
      </div>
    </SectionShell>
  );
}

// =====================================================================================
// Why this is valuable
// =====================================================================================

function ValueSection() {
  return (
    <SectionShell
      icon={Gauge}
      title="Why this is valuable"
      lead="The three sentences to take into a slide."
    >
      <div className="grid gap-3 md:grid-cols-3">
        <ValueCard
          title="Reuse"
          body="Every existing internal API becomes an AI capability without rewriting it. We do not ask product teams to build a new surface — we build on top of the one they already have."
        />
        <ValueCard
          title="Governance"
          body="One place controls who can call what, under what conditions, audited end to end. Cost, latency, tool selection, and policy decisions are all visible from the same dashboard."
        />
        <ValueCard
          title="Speed"
          body="A new tool ships in minutes, not weeks. Register an API, pick endpoints, write good descriptions, publish. No service deploys, no agent restarts, no SDK upgrades for the calling product."
        />
      </div>
    </SectionShell>
  );
}

function ValueCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="card p-5">
      <div className="text-sm font-semibold text-brand-700">{title}</div>
      <p className="mt-2 text-sm text-slate-700">{body}</p>
    </div>
  );
}

// =====================================================================================
// Shared section shell — keeps every section visually consistent
// =====================================================================================

function SectionShell({
  icon: Icon,
  title,
  lead,
  children,
}: {
  icon: typeof Server;
  title: string;
  lead: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <header className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-700">
          <Icon size={16} />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">{lead}</p>
        </div>
      </header>
      {children}
    </section>
  );
}
