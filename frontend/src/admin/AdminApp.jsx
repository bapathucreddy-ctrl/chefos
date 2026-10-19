import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import Brand from "../components/common/Brand";
import Icon from "../components/common/Icon";
import {
  ops,
  supabase,
  supabaseConfigured,
  supabaseUrl,
} from "../lib/supabase";
import "./admin.css";

const sections = [
  ["overview", "Overview", "home"],
  ["customers", "Customers", "user"],
  ["chefs", "Chef partners", "chef"],
  ["subscriptions", "Subscriptions", "calendar"],
  ["payments", "Payments", "bag"],
  ["pricing", "Pricing definition", "spark"],
  ["activity", "Activity log", "clock"],
];
const money = (value, paise = false) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0) / (paise ? 100 : 1));
const date = (value) =>
  value
    ? new Date(value).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";
const short = (value) => (value ? String(value).slice(0, 8) : "—");

function useResource(section, search, page, revision) {
  const key = JSON.stringify([section, search, page, revision]);
  const [state, setState] = useState({
    key: "",
    data: null,
    loading: true,
    error: "",
  });
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(
      () => {
        setState((s) => ({ ...s, loading: true, error: "" }));
        ops(section, { search, page })
          .then((data) => {
            if (!cancelled) setState({ key, data, loading: false, error: "" });
          })
          .catch((error) => {
            if (!cancelled)
              setState({
                key,
                data: null,
                loading: false,
                error: error.message,
              });
          });
      },
      search ? 200 : 0,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [section, search, page, revision, key]);
  return state.key === key ? state : { data: null, loading: true, error: "" };
}

export default function AdminApp() {
  const navigate = useNavigate();
  const location = useLocation();
  const [account, setAccount] = useState(null);
  const [booting, setBooting] = useState(true);
  const [authError, setAuthError] = useState("");
  const version = useRef(0);
  const loadAccount = useCallback(async (session) => {
    const current = ++version.current;
    if (!session) {
      setAccount(null);
      setBooting(false);
      return;
    }
    const { data, error } = await supabase
      .from("chefos_profiles")
      .select("id,username,email,role,is_active")
      .eq("id", session.user.id)
      .single();
    if (current !== version.current) return;
    if (error || data?.role !== "admin" || !data?.is_active) {
      setAccount(null);
      setAuthError(
        error?.message || "This account does not have administrator access.",
      );
      setBooting(false);
      await supabase.auth.signOut({ scope: "local" });
      return;
    }
    setAccount(data);
    setAuthError("");
    setBooting(false);
  }, []);
  useEffect(() => {
    if (!supabase) {
      const timer = setTimeout(() => setBooting(false), 0);
      return () => clearTimeout(timer);
    }
    let active = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) loadAccount(data.session);
      })
      .catch(() => {
        if (active) loadAccount(null);
      });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => {
        if (active) loadAccount(session);
      }, 0);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [loadAccount]);
  if (booting)
    return (
      <div className="ops-boot">
        <Brand />
        <span className="ops-spinner" />
        <p>Opening your workspace…</p>
      </div>
    );
  if (!account)
    return (
      <AdminLogin
        error={authError}
        onLogin={async (data) => {
          await loadAccount(data.session);
          navigate("/");
        }}
      />
    );
  const slug = location.pathname.split("/")[1] || "overview";
  const section = sections.some(([key]) => key === slug) ? slug : "overview";
  return (
    <AdminWorkspace
      key={account.id}
      section={section}
      account={account}
      onLogout={async () => {
        version.current++;
        setAccount(null);
        await supabase.auth.signOut({ scope: "local" });
        navigate("/login");
      }}
    />
  );
}

function AdminLogin({ onLogin, error }) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState("");
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setFailure("");
    try {
      if (!supabase)
        throw new Error("The workspace connection is pending setup.");
      const { data, error: signInError } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
      if (signInError) throw signInError;
      await onLogin(data);
    } catch (err) {
      setFailure(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="ops-login">
      <section className="ops-login-story">
        <Brand />
        <span className="ops-role-tag">OPERATIONS WORKSPACE</span>
        <div>
          <span className="ops-eyebrow">BEHIND EVERY GREAT MEAL</span>
          <h1>
            A little more care.
            <br />
            <em>Across every kitchen.</em>
          </h1>
          <p>
            Your people, your chefs, and every service.
            <br />
            One thoughtful place to keep it all running.
          </p>
          <div className="ops-story-rings">
            <span />
            <span />
            <span />
            <Icon name="chef" size={70} />
          </div>
        </div>
        <small>Chefos · Made with care. Managed with clarity.</small>
      </section>
      <section className="ops-login-form">
        <div className="ops-mobile-logo">
          <Brand />
        </div>
        <div className="ops-login-card">
          <span className="ops-secure">
            <Icon name="check" size={14} /> STAFF ACCESS ONLY
          </span>
          <h2>Welcome to the kitchen.</h2>
          <p>Sign in to your admin workspace.</p>
          {!supabaseConfigured && (
            <div className="ops-connection-note" role="status">
              <strong>Workspace connection pending</strong>
              <span>
                The Supabase project needs to be connected before staff can sign
                in. Customer and chef access is available through the mobile
                apps.
              </span>
            </div>
          )}
          {(failure || error) && (
            <div className="ops-error" role="alert">
              {failure || error}
            </div>
          )}
          <form onSubmit={submit}>
            <label>
              Work email
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@chefos.com"
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
              />
            </label>
            <button
              className="ops-primary"
              disabled={busy || !supabaseConfigured}
            >
              {busy ? "Signing in…" : "Open workspace"}
              <Icon name="arrow" size={18} />
            </button>
          </form>
          <div className="ops-login-footer">
            <Icon name="user" size={16} /> Access is granted by your workspace
            administrator.
          </div>
        </div>
        <span className="ops-login-copyright">
          Chefos Admin · Secure operations, simply managed.
        </span>
      </section>
    </main>
  );
}

function AdminWorkspace({ section, account, onLogout }) {
  const [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [revision, setRevision] = useState(0),
    [drawer, setDrawer] = useState(false);
  const [toast, setToast] = useState(""),
    [pending, setPending] = useState(null),
    [busy, setBusy] = useState(false),
    [actionError, setActionError] = useState("");
  const previousFocus = useRef(null);
  useEffect(() => {
    if (!pending) return;
    function keydown(event) {
      if (event.key === "Escape" && !busy) {
        setPending(null);
        return;
      }
      if (event.key !== "Tab") return;
      const controls = [
        ...document.querySelectorAll(
          ".ops-modal button:not(:disabled),.ops-modal input:not(:disabled)",
        ),
      ];
      if (!controls.length) return;
      if (event.shiftKey && document.activeElement === controls[0]) {
        event.preventDefault();
        controls.at(-1).focus();
      } else if (
        !event.shiftKey &&
        document.activeElement === controls.at(-1)
      ) {
        event.preventDefault();
        controls[0].focus();
      }
    }
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      previousFocus.current?.focus();
    };
  }, [pending, busy]);
  const { data, loading, error } = useResource(section, search, page, revision);
  const title = sections.find(([key]) => key === section)?.[1];
  function go() {
    setSearch("");
    setPage(1);
    setDrawer(false);
  }
  async function confirm() {
    setBusy(true);
    setActionError("");
    try {
      const { error: rpcError } = await supabase.rpc("chefos_ops_update", {
        p_section: pending.section,
        p_id: pending.id,
        p_changes: pending.changes,
      });
      if (rpcError) throw rpcError;
      setPending(null);
      setRevision((n) => n + 1);
      setToast("Change saved to the activity log.");
      setTimeout(() => setToast(""), 3500);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy(false);
    }
  }
  function propose(section, row, changes, label) {
    previousFocus.current = document.activeElement;
    setActionError("");
    setPending({
      section,
      id: row.id,
      changes,
      label,
      name: row.name || row.username || short(row.id),
    });
  }
  return (
    <div className="ops-app">
      {drawer && (
        <button
          className="ops-nav-overlay"
          aria-label="Close navigation"
          onClick={() => setDrawer(false)}
        />
      )}
      <aside className={`ops-sidebar ${drawer ? "open" : ""}`}>
        <Link to="/" className="ops-sidebar-brand" onClick={go}>
          <Brand />
        </Link>
        <span className="ops-workspace-tag">
          <span /> ADMIN WORKSPACE
        </span>
        <div className="ops-sidebar-line" />
        <span className="ops-nav-caption">MANAGE YOUR KITCHEN</span>
        <nav aria-label="Admin navigation">
          {sections.map(([key, label, icon]) => (
            <Link
              to={key === "overview" ? "/" : `/${key}`}
              key={key}
              onClick={go}
              className={section === key ? "active" : ""}
            >
              <Icon name={icon} size={19} />
              <span>{label}</span>
              {key === "chefs" && data?.pending_chefs > 0 && (
                <b>{data.pending_chefs}</b>
              )}
            </Link>
          ))}
        </nav>
        <div className="ops-sidebar-bottom">
          <div className="ops-workspace-health">
            <span className="ops-health-dot" />
            <div>
              <strong>Supabase workspace</strong>
              <small>Protected by staff permissions</small>
            </div>
          </div>
          <button className="ops-admin-person" onClick={onLogout}>
            <span className="ops-avatar">
              {account.username?.[0]?.toUpperCase()}
            </span>
            <span>
              <strong>{account.username}</strong>
              <small>Administrator</small>
            </span>
            <Icon name="logout" size={18} />
          </button>
        </div>
      </aside>
      <div className="ops-content">
        <header className="ops-topbar">
          <button
            className="ops-mobile-menu"
            aria-label="Open navigation"
            onClick={() => setDrawer(true)}
          >
            <Icon name="menu" />
          </button>
          <div>
            <span className="ops-topbar-breadcrumb">
              Workspace <span>/</span> {title}
            </span>
          </div>
          <div className="ops-topbar-right">
            <span className="ops-staff-badge">
              <Icon name="check" size={12} /> Administrator
            </span>
            <span className="ops-avatar">
              {account.username?.[0]?.toUpperCase()}
            </span>
          </div>
        </header>
        <main className="ops-main">
          <div className="ops-page-heading">
            <div>
              <span className="ops-eyebrow">
                {section === "overview"
                  ? "A GOOD DAY STARTS WITH A CLEAR PICTURE"
                  : "THE DETAILS THAT KEEP THINGS RUNNING"}
              </span>
              <h1>
                {section === "overview" ? "Your kitchen, at a glance." : title}
              </h1>
              <p>
                {section === "overview"
                  ? "A little visibility into every meal, chef, and customer."
                  : section === "pricing"
                    ? "The canonical pricing definition, with clear payouts and protected floors."
                    : "Live workspace records. Every change leaves a clear trail."}
              </p>
            </div>
            <button
              className="ops-secondary"
              onClick={() => setRevision((n) => n + 1)}
              disabled={loading}
            >
              <Icon name="clock" size={16} />
              {loading ? "Refreshing…" : "Refresh data"}
            </button>
          </div>
          {error ? (
            <div className="ops-error" role="alert">
              <strong>Unable to load workspace data.</strong>
              <span>{error}</span>
              <button onClick={() => setRevision((n) => n + 1)}>
                Try again
              </button>
            </div>
          ) : loading ? (
            <div className="ops-loading">
              <span className="ops-spinner" />
              <p>Bringing your workspace up to date…</p>
            </div>
          ) : section === "overview" ? (
            <Overview data={data} />
          ) : section === "pricing" ? (
            <Pricing data={data} />
          ) : (
            <>
              <div className="ops-list-toolbar">
                <div>
                  <h2>
                    {title}
                    <span>{data?.count || 0} records</span>
                  </h2>
                  <p>
                    {section === "payments"
                      ? "Payments are verified by the provider. Status cannot be changed here."
                      : "Search and review your latest records."}
                  </p>
                </div>
                <label className="ops-search">
                  <Icon name="search" size={17} />
                  <input
                    aria-label={`Search ${title}`}
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                    placeholder={`Search ${title.toLowerCase()}…`}
                  />
                </label>
              </div>
              <DataTable
                section={section}
                rows={data?.rows || []}
                onAction={propose}
              />
              <div className="ops-pagination">
                <span>
                  Page {page} · {data?.count || 0} total records
                </span>
                <div>
                  <button
                    disabled={page === 1}
                    onClick={() => setPage((n) => n - 1)}
                  >
                    Previous
                  </button>
                  <button
                    disabled={page * 20 >= (data?.count || 0)}
                    onClick={() => setPage((n) => n + 1)}
                  >
                    Next <Icon name="arrow" size={14} />
                  </button>
                </div>
              </div>
            </>
          )}
          <footer className="ops-footer">
            <span>Thoughtfully cooked. Carefully managed.</span>
            <span>
              Chefos Admin <span>·</span>{" "}
              {new URL(supabaseUrl).hostname.split(".")[0]}
            </span>
          </footer>
        </main>
      </div>
      {toast && (
        <div role="status" className="ops-toast">
          <Icon name="check" size={17} />
          {toast}
        </div>
      )}
      {pending && (
        <div
          className="ops-modal-backdrop"
          onClick={() => !busy && setPending(null)}
        >
          <section
            className="ops-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ops-confirm-title"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="ops-modal-icon">
              <Icon name="user" size={24} />
            </span>
            <h2 id="ops-confirm-title">{pending.label}?</h2>
            <p>
              This updates <strong>{pending.name}</strong>. The change will be
              recorded with your administrator account.
            </p>
            {pending.section === "chef_rates" && (
              <RateForm
                initial={pending.changes}
                onChange={(changes) => setPending((p) => ({ ...p, changes }))}
              />
            )}{" "}
            {actionError && (
              <div className="ops-error" role="alert">
                {actionError}
              </div>
            )}
            <div className="ops-modal-actions">
              <button
                className="ops-secondary"
                disabled={busy}
                onClick={() => setPending(null)}
              >
                Cancel
              </button>
              <button
                autoFocus
                className="ops-primary"
                disabled={busy}
                onClick={confirm}
              >
                {busy ? "Saving…" : "Confirm change"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function Badge({ value }) {
  return (
    <span
      className={`ops-badge ${["active", "paid", "verified", "available", "true"].includes(String(value)) ? "good" : ["failed", "inactive", "expired", "false"].includes(String(value)) ? "muted" : "warm"}`}
    >
      {String(value).replaceAll("_", " ")}
    </span>
  );
}
function Overview({ data }) {
  const stats = [
    ["Customers", data?.customers, "user", "People who call us their kitchen."],
    [
      "Chef partners",
      data?.chefs,
      "chef",
      `${data?.available_chefs || 0} verified chefs available`,
    ],
    [
      "Active subscriptions",
      data?.active_plans,
      "calendar",
      `${data?.renewals_due || 0} renewals in the next 7 days`,
    ],
    [
      "Collected payments",
      money(data?.paid_revenue_paise, true),
      "bag",
      "Provider-verified payments only",
    ],
  ];
  const max = Math.max(
    1,
    ...(data?.chart || []).map((d) => Number(d.amount_paise)),
  );
  return (
    <>
      <div className="ops-stats-grid">
        {stats.map(([label, value, icon, note]) => (
          <article className="ops-stat" key={label}>
            <div>
              <span>{label}</span>
              <span className="ops-stat-icon">
                <Icon name={icon} size={19} />
              </span>
            </div>
            <strong>{value ?? 0}</strong>
            <small>{note}</small>
          </article>
        ))}
      </div>
      <div className="ops-overview-grid">
        <section className="ops-panel ops-revenue">
          <div className="ops-panel-heading">
            <div>
              <h2>A week in your kitchen</h2>
              <p>Collected payments over the last seven days</p>
            </div>
            <span className="ops-period">LAST 7 DAYS</span>
          </div>
          <div
            className="ops-chart"
            role="img"
            aria-label="Daily collected payments"
          >
            {(data?.chart || []).map((d) => (
              <div className="ops-chart-column" key={d.day}>
                <span>{money(d.amount_paise, true)}</span>
                <div>
                  <i
                    style={{
                      height: `${Math.max(2, (Number(d.amount_paise) / max) * 100)}%`,
                    }}
                  />
                </div>
                <small>
                  {new Date(d.day).toLocaleDateString("en-IN", {
                    weekday: "short",
                  })}
                </small>
              </div>
            ))}
          </div>
        </section>
        <section className="ops-panel ops-attention">
          <span className="ops-gold-icon">
            <Icon name="bell" size={23} />
          </span>
          <span className="ops-eyebrow">A LITTLE ATTENTION</span>
          <h2>
            The next things
            <br />
            to take care of.
          </h2>
          <Link to="/chefs">
            <span>
              <strong>{data?.pending_chefs || 0}</strong> chef profiles awaiting
              review
            </span>
            <Icon name="arrow" size={16} />
          </Link>
          <Link to="/subscriptions">
            <span>
              <strong>{data?.renewals_due || 0}</strong> plans approaching
              renewal
            </span>
            <Icon name="arrow" size={16} />
          </Link>
          <p>
            {data?.open_requests || 0} instant requests currently searching.
          </p>
        </section>
      </div>
      <div className="ops-overview-grid">
        <section className="ops-panel">
          <div className="ops-panel-heading">
            <div>
              <h2>Latest subscriptions</h2>
              <p>The newest seats at our table</p>
            </div>
            <Link to="/subscriptions" className="ops-text-link">
              View all <Icon name="arrow" size={15} />
            </Link>
          </div>
          {data?.recent_plans?.length ? (
            <div className="ops-mini-list">
              {data.recent_plans.map((row) => (
                <div key={row.id}>
                  <span className="ops-row-avatar">
                    {row.username?.[0]?.toUpperCase()}
                  </span>
                  <div>
                    <strong>{row.username}</strong>
                    <small>
                      {row.chef} · {row.plan_cycle}
                    </small>
                  </div>
                  <strong>{money(row.price)}</strong>
                  <Badge value={row.is_active ? "active" : "paused"} />
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title="Your first subscription is ahead"
              message="New paid plans will appear here as customers join."
            />
          )}
        </section>
        <section className="ops-panel">
          <div className="ops-panel-heading">
            <div>
              <h2>Workspace activity</h2>
              <p>A clear trail of care</p>
            </div>
            <Link to="/activity" className="ops-text-link">
              View log <Icon name="arrow" size={15} />
            </Link>
          </div>
          {data?.activity?.length ? (
            <div className="ops-activity-list">
              {data.activity.map((row) => (
                <div key={row.id}>
                  <span />
                  <div>
                    <strong>
                      {row.action.replaceAll(".", " ").replaceAll("_", " ")}
                    </strong>
                    <p>
                      {row.username || "System"} · {date(row.created_at)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title="All quiet in the kitchen"
              message="Admin updates will be recorded here automatically."
            />
          )}
        </section>
      </div>
    </>
  );
}
function Empty({
  title = "No records found",
  message = "Try another search or check back after activity begins.",
}) {
  return (
    <div className="ops-empty">
      <Icon name="chef" size={32} />
      <h3>{title}</h3>
      <p>{message}</p>
    </div>
  );
}
function DataTable({ section, rows, onAction }) {
  const headers = {
    customers: ["Customer", "Contact", "Plans", "Joined", "Status", "Action"],
    chefs: ["Chef", "Speciality", "Rating", "Joined", "Status", "Actions"],
    subscriptions: [
      "Customer",
      "Chef",
      "Plan",
      "Paid price",
      "Billing period",
      "Status",
      "Action",
    ],
    payments: ["Customer", "Order", "Payment", "Amount", "Created", "Status"],
    activity: ["Administrator", "Action", "Record", "Date", "Changes"],
  };
  if (!rows.length)
    return (
      <div className="ops-panel">
        <Empty />
      </div>
    );
  return (
    <div className="ops-table-wrap">
      <table className="ops-table">
        <thead>
          <tr>
            {(headers[section] || []).map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {section === "customers" ? (
                <>
                  <td>
                    <strong>{row.username}</strong>
                    <small>#{short(row.id)}</small>
                  </td>
                  <td>
                    {row.email}
                    <small>{row.phone || "No phone added"}</small>
                  </td>
                  <td>{row.plans}</td>
                  <td>{date(row.created_at)}</td>
                  <td>
                    <Badge value={row.is_active ? "active" : "inactive"} />
                  </td>
                  <td>
                    <button
                      className="ops-row-action"
                      onClick={() =>
                        onAction(
                          "customers",
                          row,
                          { is_active: !row.is_active },
                          row.is_active ? "Suspend account" : "Restore account",
                        )
                      }
                    >
                      {row.is_active ? "Suspend" : "Restore"}
                    </button>
                  </td>
                </>
              ) : section === "chefs" ? (
                <>
                  <td>
                    <strong>{row.name}</strong>
                    <small>{row.email || "Legacy chef profile"}</small>
                  </td>
                  <td>{row.speciality || "Not provided"}</td>
                  <td>★ {Number(row.rating).toFixed(1)}</td>
                  <td>{date(row.created_at)}</td>
                  <td>
                    <Badge
                      value={
                        !row.is_verified
                          ? "pending review"
                          : !row.is_active
                            ? "inactive"
                            : row.is_available
                              ? "available"
                              : "verified"
                      }
                    />
                  </td>
                  <td className="ops-action-cell">
                    <button
                      className="ops-row-action"
                      onClick={() =>
                        onAction(
                          "chefs",
                          row,
                          { is_verified: !row.is_verified },
                          row.is_verified
                            ? "Revoke verification"
                            : "Verify chef",
                        )
                      }
                    >
                      {row.is_verified ? "Unverify" : "Verify"}
                    </button>
                    <button
                      className="ops-row-action"
                      onClick={() =>
                        onAction(
                          "chef_rates",
                          row,
                          {
                            subscriber_ratings:
                              row.rate_inputs.subscriber_ratings || 0,
                            tenure_months: row.rate_inputs.tenure_months || 0,
                            meals_served: row.rate_inputs.meals_served || 0,
                            certified_specialty: Boolean(
                              row.rate_inputs.certified_specialty,
                            ),
                          },
                          "Update verified rate inputs",
                        )
                      }
                    >
                      Rate inputs
                    </button>
                    <button
                      className="ops-row-action"
                      onClick={() =>
                        onAction(
                          "chefs",
                          row,
                          { is_active: !row.is_active },
                          row.is_active ? "Suspend chef" : "Restore chef",
                        )
                      }
                    >
                      {row.is_active ? "Suspend" : "Restore"}
                    </button>
                  </td>
                </>
              ) : section === "subscriptions" ? (
                <>
                  <td>
                    <strong>{row.username}</strong>
                    <small>#{short(row.id)}</small>
                  </td>
                  <td>{row.chef}</td>
                  <td>
                    {row.plan_cycle}
                    <small>
                      {row.people_count} people · {row.meal_type?.length}{" "}
                      meals/day
                    </small>
                  </td>
                  <td>
                    <strong>{money(row.price)}</strong>
                    <small>Before GST · locked</small>
                  </td>
                  <td>
                    {date(row.start_date)}
                    <small>to {date(row.end_date)}</small>
                  </td>
                  <td>
                    <Badge value={row.status} />
                  </td>
                  <td>
                    {row.status !== "expired" && (
                      <button
                        className="ops-row-action"
                        onClick={() =>
                          onAction(
                            "subscriptions",
                            row,
                            { is_active: !row.is_active },
                            row.is_active
                              ? "Pause service"
                              : "Resume paid service",
                          )
                        }
                      >
                        {row.is_active ? "Pause" : "Resume"}
                      </button>
                    )}
                  </td>
                </>
              ) : section === "payments" ? (
                <>
                  <td>
                    <strong>{row.username}</strong>
                  </td>
                  <td className="ops-mono">{row.order_id}</td>
                  <td className="ops-mono">{row.payment_id || "Pending"}</td>
                  <td>
                    <strong>{money(row.amount, true)}</strong>
                  </td>
                  <td>{date(row.created_at)}</td>
                  <td>
                    <Badge value={row.status} />
                  </td>
                </>
              ) : (
                <>
                  <td>{row.username || "System"}</td>
                  <td>
                    {row.action.replaceAll(".", " ").replaceAll("_", " ")}
                  </td>
                  <td className="ops-mono">{short(row.object_id)}</td>
                  <td>{date(row.created_at)}</td>
                  <td>
                    <code>{JSON.stringify(row.changes)}</code>
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function RateForm({ initial, onChange }) {
  return (
    <div className="ops-rate-form">
      {[
        ["subscriber_ratings", "Verified subscriber ratings"],
        ["tenure_months", "Months on Chefos"],
        ["meals_served", "Completed meals"],
      ].map(([key, label]) => (
        <label key={key}>
          {label}
          <input
            type="number"
            min="0"
            step="1"
            value={initial[key]}
            onChange={(e) =>
              onChange({ ...initial, [key]: Number(e.target.value) })
            }
          />
        </label>
      ))}
      <label className="ops-checkbox">
        <input
          type="checkbox"
          checked={initial.certified_specialty}
          onChange={(e) =>
            onChange({ ...initial, certified_specialty: e.target.checked })
          }
        />{" "}
        Certified cuisine specialty
      </label>
      <p>
        Use verified operational figures. These inputs affect future quotes;
        paid plans keep their saved rate.
      </p>
    </div>
  );
}
function Pricing({ data }) {
  const definition = data?.definition,
    households = data?.catalog?.households || [];
  if (!definition) return <Empty title="Pricing definition not loaded" />;
  return (
    <>
      <div className="ops-pricing-summary">
        <span className="ops-gold-icon">
          <Icon name="spark" size={24} />
        </span>
        <div>
          <span className="ops-eyebrow">
            CANONICAL DEFINITION · {definition.meta.version}
          </span>
          <h2>Fair to the chef. Clear to the customer.</h2>
          <p>{definition.meta.principle}</p>
        </div>
        <Badge value="pilot definition" />
      </div>
      <div className="ops-stats-grid">
        <article className="ops-stat">
          <span>Base chef payout / meal</span>
          <strong>
            {money(definition.chef_rate_card.base_payout_per_meal)}
          </strong>
          <small>3–4 person household</small>
        </article>
        <article className="ops-stat">
          <span>Payout cap / meal</span>
          <strong>
            {money(definition.chef_rate_card.payout_cap_per_meal)}
          </strong>
          <small>Verified bonuses only</small>
        </article>
        <article className="ops-stat">
          <span>Minimum price floor</span>
          <strong>Payout + ₹20</strong>
          <small>All discounts preserve this floor</small>
        </article>
        <article className="ops-stat">
          <span>Pricing status</span>
          <strong>Before GST</strong>
          <small>Tax treatment requires operational review</small>
        </article>
      </div>
      <section className="ops-panel">
        <div className="ops-panel-heading">
          <div>
            <h2>Customer service rates</h2>
            <p>Base chef · per home per meal · bundle discounts included</p>
          </div>
        </div>
        <div className="ops-table-wrap">
          <table className="ops-table">
            <thead>
              <tr>
                <th>Household</th>
                <th>Plan</th>
                <th>1 meal / day</th>
                <th>2 meals / day</th>
                <th>3 meals / day</th>
                <th>Billing days</th>
              </tr>
            </thead>
            <tbody>
              {households.flatMap((band) =>
                ["weekly", "monthly", "quarterly"].map((cycle) => (
                  <tr key={`${band.id}-${cycle}`}>
                    <td>
                      <strong>{band.label}</strong>
                    </td>
                    <td>{cycle}</td>
                    {["1", "2", "3"].map((n) => (
                      <td key={n}>
                        <strong>
                          {money(band.plans[cycle][n].per_meal_inr)}
                        </strong>
                        <small>
                          {money(band.plans[cycle][n].price_inr)} per plan
                        </small>
                      </td>
                    ))}
                    <td>{band.plans[cycle]["1"].days}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      </section>
      <div className="ops-pricing-note">
        <Icon name="check" size={18} />
        <p>
          This screen reads the server's pricing definition. Update the
          canonical JSON and deploy its generated migration to revise rates.
          Promotions without required expiry dates remain inactive; credits
          require a verified ledger.
        </p>
      </div>
    </>
  );
}
