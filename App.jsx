import { useState, useEffect, useMemo } from 'react';
import { Plus, Minus, Trash2, TrendingUp, TrendingDown, PenLine, PieChart as PieIcon, List, Target, AlertTriangle, SlidersHorizontal, Check, Receipt, CalendarClock } from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';

const CATEGORIES = [
  { id: 'food', label: 'Food', color: '#4ADE80' },
  { id: 'transport', label: 'Transport', color: '#7FE3A8' },
  { id: 'bills', label: 'Rent/Bills', color: '#22A85F' },
  { id: 'fun', label: 'Fun', color: '#9FF0BE' },
  { id: 'savings', label: 'Savings/Trading', color: '#166F44' },
  { id: 'other', label: 'Other', color: '#5E6E62' },
];

const INCOME_SOURCES = [
  { id: 'job', label: 'Job (W-2)', color: '#4ADE80' },
  { id: '1099', label: '1099 / Self-employed', color: '#F2C94C' },
  { id: 'cash', label: 'Cash / Gift', color: '#6EE7A8' },
];

const QUARTERLY_DEADLINES = [
  { label: 'Q1', date: '2026-04-15' },
  { label: 'Q2', date: '2026-06-15' },
  { label: 'Q3', date: '2026-09-15' },
  { label: 'Q4', date: '2027-01-15' },
];

const WARN = '#E8604B';
const ENTRIES_KEY = 'ledger-entries-v1';
const BUDGETS_KEY = 'ledger-budget-settings-v1';
const PLAN_KEY = 'ledger-plan-v1';

// Standalone storage shim — same interface as the Claude artifact's window.storage,
// backed by the browser's localStorage so it works fully offline, same device only.
const storage = {
  get: async (key) => {
    const v = localStorage.getItem(key);
    return v === null ? null : { key, value: v };
  },
  set: async (key, value) => {
    localStorage.setItem(key, value);
    return { key, value };
  },
};

export default function BudgetLedger() {
  const [entries, setEntries] = useState([]);
  const [budgets, setBudgets] = useState(() => Object.fromEntries(CATEGORIES.map((c) => [c.id, { mode: 'percent', value: 0 }])));
  const [expectedIncome, setExpectedIncome] = useState(0);
  const [planPercents, setPlanPercents] = useState(() => Object.fromEntries(CATEGORIES.map((c) => [c.id, 0])));
  const [applied, setApplied] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState('entry'); // 'entry' | 'breakdown' | 'budget' | 'plan' | 'history'
  const [mode, setMode] = useState('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('food');
  const [incomeSource, setIncomeSource] = useState('job');
  const [note, setNote] = useState('');
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState('');
  const [range, setRange] = useState('week');
  const [withholdRate, setWithholdRate] = useState(30);

  useEffect(() => {
    (async () => {
      try {
        const r1 = await storage.get(ENTRIES_KEY);
        if (r1 && r1.value) setEntries(JSON.parse(r1.value));
      } catch (e) {}
      try {
        const r2 = await storage.get(BUDGETS_KEY);
        if (r2 && r2.value) setBudgets((prev) => ({ ...prev, ...JSON.parse(r2.value) }));
      } catch (e) {}
      try {
        const r3 = await storage.get(PLAN_KEY);
        if (r3 && r3.value) {
          const parsed = JSON.parse(r3.value);
          if (typeof parsed.expectedIncome === 'number') setExpectedIncome(parsed.expectedIncome);
          if (parsed.percents) setPlanPercents((prev) => ({ ...prev, ...parsed.percents }));
          if (typeof parsed.withholdRate === 'number') setWithholdRate(parsed.withholdRate);
        }
      } catch (e) {}
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    (async () => {
      try {
        await storage.set(ENTRIES_KEY, JSON.stringify(entries));
      } catch (e) {
        setError('Could not save — your last entry may not persist.');
      }
    })();
  }, [entries, loaded]);

  useEffect(() => {
    if (!loaded) return;
    (async () => {
      try {
        await storage.set(BUDGETS_KEY, JSON.stringify(budgets));
      } catch (e) {}
    })();
  }, [budgets, loaded]);

  useEffect(() => {
    if (!loaded) return;
    (async () => {
      try {
        await storage.set(PLAN_KEY, JSON.stringify({ expectedIncome, percents: planPercents, withholdRate }));
      } catch (e) {}
    })();
  }, [expectedIncome, planPercents, withholdRate, loaded]);

  const balance = useMemo(
    () => entries.reduce((sum, e) => sum + (e.type === 'income' ? e.amount : -e.amount), 0),
    [entries]
  );

  const todaySpent = useMemo(() => {
    const today = new Date().toDateString();
    return entries.filter((e) => e.type === 'expense' && new Date(e.ts).toDateString() === today).reduce((s, e) => s + e.amount, 0);
  }, [entries]);

  const monthStart = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);

  const monthEntries = useMemo(() => entries.filter((e) => e.ts >= monthStart), [entries, monthStart]);

  const monthIncome = useMemo(
    () => monthEntries.filter((e) => e.type === 'income').reduce((s, e) => s + e.amount, 0),
    [monthEntries]
  );

  const monthCategorySpent = useMemo(() => {
    const totals = {};
    for (const c of CATEGORIES) totals[c.id] = 0;
    monthEntries.forEach((e) => {
      if (e.type === 'expense') totals[e.category] = (totals[e.category] || 0) + e.amount;
    });
    return totals;
  }, [monthEntries]);

  function budgetAmountFor(catId) {
    const b = budgets[catId] || { mode: 'percent', value: 0 };
    if (b.mode === 'percent') return (Number(b.value) / 100) * monthIncome;
    return Number(b.value) || 0;
  }

  const overBudgetCategories = useMemo(
    () =>
      CATEGORIES.filter((c) => {
        const cap = budgetAmountFor(c.id);
        return cap > 0 && monthCategorySpent[c.id] > cap;
      }),
    [budgets, monthCategorySpent, monthIncome]
  );

  const rangeStart = useMemo(() => {
    const now = Date.now();
    if (range === 'week') return now - 7 * 24 * 60 * 60 * 1000;
    if (range === 'month') return now - 30 * 24 * 60 * 60 * 1000;
    return 0;
  }, [range]);

  const rangedEntries = useMemo(() => entries.filter((e) => e.ts >= rangeStart), [entries, rangeStart]);

  const categoryTotals = useMemo(() => {
    const totals = {};
    for (const c of CATEGORIES) totals[c.id] = 0;
    entries.forEach((e) => {
      if (e.type === 'expense') totals[e.category] = (totals[e.category] || 0) + e.amount;
    });
    return totals;
  }, [entries]);

  const rangedCategoryTotals = useMemo(() => {
    const totals = {};
    for (const c of CATEGORIES) totals[c.id] = 0;
    rangedEntries.forEach((e) => {
      if (e.type === 'expense') totals[e.category] = (totals[e.category] || 0) + e.amount;
    });
    return totals;
  }, [rangedEntries]);

  const pieData = useMemo(
    () => CATEGORIES.filter((c) => rangedCategoryTotals[c.id] > 0).map((c) => ({ name: c.label, value: rangedCategoryTotals[c.id], color: c.color })),
    [rangedCategoryTotals]
  );

  const rangedIncome = useMemo(() => rangedEntries.filter((e) => e.type === 'income').reduce((s, e) => s + e.amount, 0), [rangedEntries]);
  const rangedExpense = useMemo(() => rangedEntries.filter((e) => e.type === 'expense').reduce((s, e) => s + e.amount, 0), [rangedEntries]);

  const dailyBars = useMemo(() => {
    const days = range === 'week' ? 7 : range === 'month' ? 30 : 14;
    const buckets = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      buckets.push({ dayKey: d.toDateString(), label: d.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' }), spent: 0 });
    }
    const map = Object.fromEntries(buckets.map((b) => [b.dayKey, b]));
    entries.forEach((e) => {
      if (e.type !== 'expense') return;
      const key = new Date(e.ts).toDateString();
      if (map[key]) map[key].spent += e.amount;
    });
    return buckets;
  }, [entries, range]);

  const grouped = useMemo(() => {
    const filtered = filter === 'all' ? entries : entries.filter((e) => e.category === filter);
    const byDay = {};
    [...filtered]
      .sort((a, b) => b.ts - a.ts)
      .forEach((e) => {
        const day = new Date(e.ts).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
        if (!byDay[day]) byDay[day] = [];
        byDay[day].push(e);
      });
    return byDay;
  }, [entries, filter]);

  function submit() {
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0) {
      setError('Enter an amount above zero.');
      return;
    }
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type: mode,
      amount: val,
      category: mode === 'expense' ? category : incomeSource,
      note: note.trim(),
      ts: Date.now(),
    };
    setEntries((prev) => [...prev, entry]);
    setAmount('');
    setNote('');
    setError('');
  }

  function remove(id) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  function quickAdd(n) {
    setAmount((prev) => {
      const cur = parseFloat(prev) || 0;
      return String(cur + n);
    });
  }

  const yearStart = useMemo(() => {
    const d = new Date();
    d.setMonth(0, 1);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);

  const ytdEntries = useMemo(() => entries.filter((e) => e.ts >= yearStart), [entries, yearStart]);

  const ytdBySource = useMemo(() => {
    const totals = { job: 0, '1099': 0, cash: 0 };
    ytdEntries.forEach((e) => {
      if (e.type === 'income' && totals[e.category] !== undefined) totals[e.category] += e.amount;
    });
    return totals;
  }, [ytdEntries]);

  const estimatedSetAside = (ytdBySource['1099'] * withholdRate) / 100;

  const nextDeadline = useMemo(() => {
    const now = Date.now();
    const upcoming = QUARTERLY_DEADLINES.map((q) => ({ ...q, ts: new Date(q.date + 'T00:00:00').getTime() })).filter(
      (q) => q.ts >= now
    );
    return upcoming.length > 0 ? upcoming[0] : null;
  }, []);

  const daysUntilNext = nextDeadline ? Math.ceil((nextDeadline.ts - Date.now()) / (1000 * 60 * 60 * 24)) : null;

  function updateBudget(catId, patch) {
    setBudgets((prev) => ({ ...prev, [catId]: { ...prev[catId], ...patch } }));
  }

  const planTotalPercent = useMemo(
    () => CATEGORIES.reduce((s, c) => s + (Number(planPercents[c.id]) || 0), 0),
    [planPercents]
  );
  const planLeftoverPercent = 100 - planTotalPercent;
  const planLeftoverDollars = (expectedIncome * planLeftoverPercent) / 100;

  function updatePlanPercent(catId, val) {
    setPlanPercents((prev) => ({ ...prev, [catId]: val }));
    setApplied(false);
  }

  function applyPlanToBudget() {
    setBudgets((prev) => {
      const next = { ...prev };
      CATEGORIES.forEach((c) => {
        next[c.id] = { mode: 'percent', value: Number(planPercents[c.id]) || 0 };
      });
      return next;
    });
    setApplied(true);
    setTimeout(() => setApplied(false), 2000);
  }

  return (
    <div style={styles.page}>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        .entry-row { animation: fadeIn 0.2s ease-out; }
        input:focus, button:focus, select:focus { outline: 2px solid #4ADE80; outline-offset: 1px; }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-thumb { background: #1e2a1e; border-radius: 3px; }
      `}</style>

      <div style={styles.container}>
        <div style={styles.header}>
          <div style={styles.eyebrow}>THE LEDGER</div>
          <div style={styles.balanceRow}>
            <span style={styles.balanceLabel}>Balance</span>
            <span style={{ ...styles.balanceValue, color: balance >= 0 ? '#EAFBF0' : WARN }}>
              {balance < 0 ? '-' : ''}${Math.abs(balance).toFixed(2)}
            </span>
          </div>
          <div style={styles.subRow}>Spent today: ${todaySpent.toFixed(2)}</div>
        </div>

        {overBudgetCategories.length > 0 && (
          <div style={styles.warnBanner}>
            <AlertTriangle size={15} style={{ flexShrink: 0 }} />
            <span>
              Over budget this month: {overBudgetCategories.map((c) => c.label).join(', ')}
            </span>
          </div>
        )}

        <div style={styles.tabBar}>
          <button onClick={() => setTab('entry')} style={{ ...styles.tabBtn, ...(tab === 'entry' ? styles.tabActive : {}) }}>
            <PenLine size={14} /> Entry
          </button>
          <button onClick={() => setTab('breakdown')} style={{ ...styles.tabBtn, ...(tab === 'breakdown' ? styles.tabActive : {}) }}>
            <PieIcon size={14} /> Breakdown
          </button>
          <button onClick={() => setTab('budget')} style={{ ...styles.tabBtn, ...(tab === 'budget' ? styles.tabActive : {}) }}>
            <Target size={14} /> Budget
          </button>
          <button onClick={() => setTab('plan')} style={{ ...styles.tabBtn, ...(tab === 'plan' ? styles.tabActive : {}) }}>
            <SlidersHorizontal size={14} /> Plan
          </button>
          <button onClick={() => setTab('tax')} style={{ ...styles.tabBtn, ...(tab === 'tax' ? styles.tabActive : {}) }}>
            <Receipt size={14} /> Tax
          </button>
          <button onClick={() => setTab('history')} style={{ ...styles.tabBtn, ...(tab === 'history' ? styles.tabActive : {}) }}>
            <List size={14} /> History
          </button>
        </div>

        {/* ENTRY TAB */}
        {tab === 'entry' && (
          <div style={styles.card}>
            <div style={styles.toggleRow}>
              <button onClick={() => setMode('expense')} style={{ ...styles.toggleBtn, ...(mode === 'expense' ? styles.toggleActiveExpense : {}) }}>
                <Minus size={14} strokeWidth={2.5} /> Spent
              </button>
              <button onClick={() => setMode('income')} style={{ ...styles.toggleBtn, ...(mode === 'income' ? styles.toggleActiveIncome : {}) }}>
                <Plus size={14} strokeWidth={2.5} /> Earned
              </button>
            </div>

            <div style={styles.amountRow}>
              <span style={styles.dollarSign}>$</span>
              <input
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setError('');
                }}
                style={styles.amountInput}
              />
            </div>

            <div style={styles.quickRow}>
              {[5, 10, 20, 50].map((n) => (
                <button key={n} onClick={() => quickAdd(n)} style={styles.quickBtn}>
                  +{n}
                </button>
              ))}
            </div>

            {mode === 'expense' && (
              <div style={styles.categoryGrid}>
                {CATEGORIES.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setCategory(c.id)}
                    style={{
                      ...styles.catChip,
                      borderColor: category === c.id ? c.color : '#25302A',
                      background: category === c.id ? `${c.color}22` : 'transparent',
                      color: category === c.id ? c.color : '#7E9184',
                    }}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            )}

            {mode === 'income' && (
              <div style={styles.categoryGrid}>
                {INCOME_SOURCES.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setIncomeSource(s.id)}
                    style={{
                      ...styles.catChip,
                      borderColor: incomeSource === s.id ? s.color : '#25302A',
                      background: incomeSource === s.id ? `${s.color}22` : 'transparent',
                      color: incomeSource === s.id ? s.color : '#7E9184',
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}

            <input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} style={styles.noteInput} />

            {error && <div style={styles.errorText}>{error}</div>}

            <button onClick={submit} style={styles.submitBtn}>
              Log it
            </button>
          </div>
        )}

        {/* BREAKDOWN TAB */}
        {tab === 'breakdown' && (
          <div>
            <div style={styles.rangeRow}>
              {['week', 'month', 'all'].map((r) => (
                <button key={r} onClick={() => setRange(r)} style={{ ...styles.rangeBtn, ...(range === r ? styles.rangeActive : {}) }}>
                  {r === 'week' ? '7 days' : r === 'month' ? '30 days' : 'All time'}
                </button>
              ))}
            </div>

            <div style={styles.statRow}>
              <div style={styles.statBox}>
                <div style={styles.statLabel}>Earned</div>
                <div style={{ ...styles.statValue, color: '#6EE7A8' }}>${rangedIncome.toFixed(0)}</div>
              </div>
              <div style={styles.statBox}>
                <div style={styles.statLabel}>Spent</div>
                <div style={{ ...styles.statValue, color: WARN }}>${rangedExpense.toFixed(0)}</div>
              </div>
              <div style={styles.statBox}>
                <div style={styles.statLabel}>Net</div>
                <div style={{ ...styles.statValue, color: '#EAFBF0' }}>
                  {rangedIncome - rangedExpense < 0 ? '-' : ''}${Math.abs(rangedIncome - rangedExpense).toFixed(0)}
                </div>
              </div>
            </div>

            <div style={styles.card}>
              <div style={styles.cardTitle}>Spending by category</div>
              {pieData.length === 0 ? (
                <div style={styles.empty}>No expenses in this range yet.</div>
              ) : (
                <>
                  <div style={{ width: '100%', height: 200 }}>
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={3}>
                          {pieData.map((entry, i) => (
                            <Cell key={i} fill={entry.color} stroke="#0E120E" strokeWidth={2} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ background: '#141914', border: '1px solid #25302A', borderRadius: 8, fontSize: 12 }}
                          formatter={(v) => [`$${v.toFixed(2)}`, '']}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={styles.legendGrid}>
                    {pieData.map((d) => (
                      <div key={d.name} style={styles.legendItem}>
                        <span style={{ ...styles.dot, background: d.color }} />
                        <span style={styles.legendLabel}>{d.name}</span>
                        <span style={styles.legendValue}>${d.value.toFixed(0)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div style={styles.card}>
              <div style={styles.cardTitle}>Daily spend</div>
              <div style={{ width: '100%', height: 160 }}>
                <ResponsiveContainer>
                  <BarChart data={dailyBars} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <XAxis dataKey="label" tick={{ fill: '#5E7064', fontSize: 10 }} axisLine={{ stroke: '#1E271F' }} tickLine={false} />
                    <YAxis tick={{ fill: '#5E7064', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ background: '#141914', border: '1px solid #25302A', borderRadius: 8, fontSize: 12 }}
                      formatter={(v) => [`$${v.toFixed(2)}`, 'Spent']}
                      labelStyle={{ color: '#9aa89e' }}
                    />
                    <Bar dataKey="spent" fill="#4ADE80" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* BUDGET / SETTINGS TAB */}
        {tab === 'budget' && (
          <div>
            <div style={styles.card}>
              <div style={styles.cardTitle}>This month's income</div>
              <div style={{ ...styles.balanceValue, fontSize: 26, color: '#6EE7A8' }}>${monthIncome.toFixed(2)}</div>
              <div style={{ fontSize: 11, color: '#5E7064', marginTop: 4 }}>
                Used to calculate percent-based budgets below.
              </div>
            </div>

            <div style={{ fontSize: 11, color: '#5E7064', margin: '4px 2px 10px', letterSpacing: '0.04em' }}>
              Set a cap per category. Choose percent of monthly income, or a flat dollar amount.
            </div>

            {CATEGORIES.map((c) => {
              const b = budgets[c.id] || { mode: 'percent', value: 0 };
              const cap = budgetAmountFor(c.id);
              const spent = monthCategorySpent[c.id] || 0;
              const isOver = cap > 0 && spent > cap;
              const pct = cap > 0 ? Math.min(100, (spent / cap) * 100) : 0;

              return (
                <div key={c.id} style={styles.budgetCard}>
                  <div style={styles.budgetHeaderRow}>
                    <span style={{ ...styles.dot, background: c.color }} />
                    <span style={styles.budgetCatLabel}>{c.label}</span>
                    {isOver && <AlertTriangle size={13} color={WARN} style={{ marginLeft: 'auto' }} />}
                  </div>

                  <div style={styles.budgetInputRow}>
                    <div style={styles.modeToggle}>
                      <button
                        onClick={() => updateBudget(c.id, { mode: 'percent' })}
                        style={{ ...styles.modeBtn, ...(b.mode === 'percent' ? styles.modeBtnActive : {}) }}
                      >
                        %
                      </button>
                      <button
                        onClick={() => updateBudget(c.id, { mode: 'fixed' })}
                        style={{ ...styles.modeBtn, ...(b.mode === 'fixed' ? styles.modeBtnActive : {}) }}
                      >
                        $
                      </button>
                    </div>
                    <input
                      inputMode="decimal"
                      value={b.value === 0 ? '' : b.value}
                      onChange={(e) => updateBudget(c.id, { value: e.target.value === '' ? 0 : parseFloat(e.target.value) || 0 })}
                      placeholder="0"
                      style={styles.budgetInput}
                    />
                  </div>

                  {cap > 0 && (
                    <>
                      <div style={styles.progressTrack}>
                        <div
                          style={{
                            ...styles.progressFill,
                            width: `${pct}%`,
                            background: isOver ? WARN : c.color,
                          }}
                        />
                      </div>
                      <div style={styles.progressLabel}>
                        <span style={{ color: isOver ? WARN : '#9aa89e' }}>
                          ${spent.toFixed(0)} / ${cap.toFixed(0)}
                        </span>
                        {isOver && <span style={{ color: WARN }}> · over by ${(spent - cap).toFixed(0)}</span>}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* PLAN TAB */}
        {tab === 'plan' && (
          <div>
            <div style={styles.card}>
              <div style={styles.cardTitle}>Expected income</div>
              <div style={styles.amountRow}>
                <span style={styles.dollarSign}>$</span>
                <input
                  inputMode="decimal"
                  placeholder="0.00"
                  value={expectedIncome === 0 ? '' : expectedIncome}
                  onChange={(e) => setExpectedIncome(e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                  style={styles.amountInput}
                />
              </div>
              <div style={{ fontSize: 11, color: '#5E7064' }}>
                What you expect to bring in this month — drag sliders below to see where it'd go.
              </div>
            </div>

            <div style={styles.card}>
              <div style={styles.budgetHeaderRow}>
                <span style={styles.cardTitle}>Allocated</span>
                <span style={{ marginLeft: 'auto', fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700, color: planTotalPercent > 100 ? WARN : '#6EE7A8' }}>
                  {planTotalPercent.toFixed(0)}%
                </span>
              </div>
              <div style={styles.progressTrack}>
                <div
                  style={{
                    ...styles.progressFill,
                    width: `${Math.min(100, planTotalPercent)}%`,
                    background: planTotalPercent > 100 ? WARN : '#4ADE80',
                  }}
                />
              </div>
              <div style={{ fontSize: 11, marginTop: 6, fontFamily: "'JetBrains Mono', monospace", color: planLeftoverPercent < 0 ? WARN : '#7E9184' }}>
                {planLeftoverPercent >= 0
                  ? `${planLeftoverPercent.toFixed(0)}% unallocated · $${planLeftoverDollars.toFixed(2)} left over`
                  : `${Math.abs(planLeftoverPercent).toFixed(0)}% over 100% · $${Math.abs(planLeftoverDollars).toFixed(2)} short`}
              </div>
            </div>

            {CATEGORIES.map((c) => {
              const pct = Number(planPercents[c.id]) || 0;
              const dollars = (expectedIncome * pct) / 100;
              return (
                <div key={c.id} style={styles.budgetCard}>
                  <div style={styles.budgetHeaderRow}>
                    <span style={{ ...styles.dot, background: c.color }} />
                    <span style={styles.budgetCatLabel}>{c.label}</span>
                    <span style={{ marginLeft: 'auto', fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: '#c8d6cb' }}>
                      {pct}% · ${dollars.toFixed(0)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={pct}
                    onChange={(e) => updatePlanPercent(c.id, Number(e.target.value))}
                    style={{ ...styles.slider, accentColor: c.color }}
                  />
                </div>
              );
            })}

            <button onClick={applyPlanToBudget} style={{ ...styles.submitBtn, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              {applied ? (
                <>
                  <Check size={16} /> Applied to Budget tab
                </>
              ) : (
                'Apply this plan to my budget caps'
              )}
            </button>
          </div>
        )}

        {/* TAX TAB */}
        {tab === 'tax' && (
          <div>
            <div style={styles.card}>
              <div style={styles.cardTitle}>Income this year, by type</div>
              <div style={styles.taxSourceRow}>
                <span style={{ ...styles.dot, background: '#4ADE80' }} />
                <span style={styles.taxSourceLabel}>Job (W-2)</span>
                <span style={styles.taxSourceValue}>${ytdBySource.job.toFixed(2)}</span>
              </div>
              <div style={styles.taxSourceRow}>
                <span style={{ ...styles.dot, background: '#F2C94C' }} />
                <span style={styles.taxSourceLabel}>1099 / Self-employed</span>
                <span style={styles.taxSourceValue}>${ytdBySource['1099'].toFixed(2)}</span>
              </div>
              <div style={styles.taxSourceRow}>
                <span style={{ ...styles.dot, background: '#6EE7A8' }} />
                <span style={styles.taxSourceLabel}>Cash / Gift</span>
                <span style={styles.taxSourceValue}>${ytdBySource.cash.toFixed(2)}</span>
              </div>
              <div style={{ fontSize: 11, color: '#5E7064', marginTop: 8 }}>
                Job income already has employer withholding. Cash/gifts generally aren't taxable income to you. The estimate below only applies to 1099 income.
              </div>
            </div>

            <div style={styles.card}>
              <div style={styles.budgetHeaderRow}>
                <span style={styles.cardTitle}>Withholding rate</span>
                <span style={{ marginLeft: 'auto', fontFamily: "'JetBrains Mono', monospace", fontSize: 15, fontWeight: 700, color: '#F2C94C' }}>
                  {withholdRate}%
                </span>
              </div>
              <input
                type="range"
                min="15"
                max="40"
                step="1"
                value={withholdRate}
                onChange={(e) => setWithholdRate(Number(e.target.value))}
                style={{ ...styles.slider, accentColor: '#F2C94C' }}
              />
              <div style={{ fontSize: 11, color: '#5E7064', marginTop: 6 }}>
                A common rough rule of thumb is 25–30% of 1099 income (covers ~15.3% self-employment tax plus federal income tax), but your real rate depends on your total income and deductions. This isn't tax advice — Form 1040-ES or a tax preparer can get you an exact number.
              </div>
            </div>

            <div style={{ ...styles.card, borderColor: '#2A2410', background: '#1A1710' }}>
              <div style={styles.cardTitle}>Set aside for taxes</div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 30, fontWeight: 700, color: '#F2C94C' }}>
                ${estimatedSetAside.toFixed(2)}
              </div>
              <div style={{ fontSize: 11, color: '#8A7D4A', marginTop: 4 }}>
                {withholdRate}% of ${ytdBySource['1099'].toFixed(2)} in 1099 income logged this year
              </div>
            </div>

            <div style={styles.card}>
              <div style={styles.cardTitle}>Quarterly estimated tax deadlines</div>
              {QUARTERLY_DEADLINES.map((q) => {
                const dTs = new Date(q.date + 'T00:00:00').getTime();
                const isPast = dTs < Date.now();
                const isNext = nextDeadline && nextDeadline.label === q.label;
                return (
                  <div
                    key={q.label}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '9px 4px',
                      borderBottom: '1px solid #171D18',
                      opacity: isPast ? 0.4 : 1,
                    }}
                  >
                    <CalendarClock size={15} color={isNext ? '#F2C94C' : '#5E7064'} />
                    <span style={{ fontSize: 13, color: isNext ? '#EAFBF0' : '#9aa89e', fontWeight: isNext ? 700 : 500 }}>
                      {q.label} — {new Date(q.date + 'T00:00:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
                    </span>
                    {isNext && (
                      <span style={{ marginLeft: 'auto', fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#F2C94C' }}>
                        {daysUntilNext}d
                      </span>
                    )}
                    {isPast && <span style={{ marginLeft: 'auto', fontSize: 11, color: '#4A5A4E' }}>Passed</span>}
                  </div>
                );
              })}
              <div style={{ fontSize: 11, color: '#5E7064', marginTop: 10 }}>
                These are the standard IRS dates for 2026 (and Jan 15, 2027 for Q4). If a date shifts due to a weekend or holiday, check IRS.gov to confirm.
              </div>
            </div>
          </div>
        )}

        {/* HISTORY TAB */}
        {tab === 'history' && (
          <div>
            <div style={styles.categorySummary}>
              {CATEGORIES.filter((c) => categoryTotals[c.id] > 0).map((c) => (
                <div key={c.id} style={styles.summaryPill} onClick={() => setFilter(filter === c.id ? 'all' : c.id)}>
                  <span style={{ ...styles.dot, background: c.color }} />
                  <span style={styles.summaryLabel}>{c.label}</span>
                  <span style={styles.summaryValue}>${categoryTotals[c.id].toFixed(0)}</span>
                </div>
              ))}
              {filter !== 'all' && (
                <button onClick={() => setFilter('all')} style={styles.clearFilter}>
                  Clear filter ×
                </button>
              )}
            </div>

            <div style={styles.history}>
              {Object.keys(grouped).length === 0 && <div style={styles.empty}>No entries yet.</div>}
              {Object.entries(grouped).map(([day, items]) => (
                <div key={day}>
                  <div style={styles.dayLabel}>{day}</div>
                  {items.map((e) => {
                    const cat = CATEGORIES.find((c) => c.id === e.category);
                    const src = INCOME_SOURCES.find((s) => s.id === e.category);
                    return (
                      <div key={e.id} className="entry-row" style={styles.entryRow}>
                        <div style={{ ...styles.entryIcon, color: e.type === 'income' ? src?.color || '#6EE7A8' : cat?.color || '#5E6E62' }}>
                          {e.type === 'income' ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                        </div>
                        <div style={styles.entryMid}>
                          <div style={styles.entryNote}>{e.note || (e.type === 'income' ? src?.label || 'Income' : cat?.label || 'Other')}</div>
                          <div style={styles.entryTime}>{new Date(e.ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</div>
                        </div>
                        <div style={{ ...styles.entryAmount, color: e.type === 'income' ? '#6EE7A8' : '#EAFBF0' }}>
                          {e.type === 'income' ? '+' : '-'}${e.amount.toFixed(2)}
                        </div>
                        <button onClick={() => remove(e.id)} style={styles.deleteBtn} aria-label="Delete entry">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: '100vh', background: '#0A0D0A', fontFamily: "'DM Sans', system-ui, sans-serif", display: 'flex', justifyContent: 'center', padding: '0 0 40px' },
  container: { width: '100%', maxWidth: 440, padding: '20px 16px' },
  header: { marginBottom: 14 },
  eyebrow: { fontSize: 11, letterSpacing: '0.18em', color: '#5E7064', fontWeight: 600, marginBottom: 10 },
  balanceRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' },
  balanceLabel: { fontSize: 14, color: '#7E9184' },
  balanceValue: { fontFamily: "'JetBrains Mono', monospace", fontSize: 34, fontWeight: 700, letterSpacing: '-0.02em' },
  subRow: { marginTop: 4, fontSize: 12, color: '#5E7064', fontFamily: "'JetBrains Mono', monospace" },
  warnBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: '#2A1512',
    border: '1px solid #4A2420',
    color: '#F0A296',
    borderRadius: 10,
    padding: '9px 12px',
    fontSize: 12,
    marginBottom: 14,
  },
  tabBar: { display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 16, background: '#141914', padding: 4, borderRadius: 12, border: '1px solid #1E271F' },
  tabBtn: { flex: '1 1 30%', minWidth: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '9px 0', borderRadius: 9, border: 'none', background: 'transparent', color: '#5E7064', fontSize: 11, fontWeight: 600, cursor: 'pointer' },
  tabActive: { background: '#4ADE80', color: '#0A0D0A' },
  card: { background: '#141914', border: '1px solid #1E271F', borderRadius: 14, padding: 16, marginBottom: 14 },
  cardTitle: { fontSize: 12, letterSpacing: '0.06em', color: '#7E9184', fontWeight: 700, marginBottom: 10, textTransform: 'uppercase' },
  toggleRow: { display: 'flex', gap: 8, marginBottom: 14 },
  toggleBtn: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 0', borderRadius: 10, border: '1px solid #25302A', background: 'transparent', color: '#7E9184', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  toggleActiveExpense: { borderColor: WARN, background: `${WARN}22`, color: '#F0A296' },
  toggleActiveIncome: { borderColor: '#4ADE80', background: '#4ADE8022', color: '#6EE7A8' },
  amountRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  dollarSign: { fontFamily: "'JetBrains Mono', monospace", fontSize: 28, color: '#3A4A3E', marginRight: 4 },
  amountInput: { fontFamily: "'JetBrains Mono', monospace", fontSize: 40, fontWeight: 700, background: 'transparent', border: 'none', color: '#EAFBF0', width: '100%', maxWidth: 220, textAlign: 'left' },
  quickRow: { display: 'flex', gap: 8, marginBottom: 14, justifyContent: 'center' },
  quickBtn: { flex: 1, padding: '6px 0', borderRadius: 8, border: '1px solid #25302A', background: '#181F19', color: '#7E9184', fontSize: 12, fontFamily: "'JetBrains Mono', monospace", cursor: 'pointer' },
  categoryGrid: { display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  catChip: { padding: '6px 10px', borderRadius: 20, border: '1px solid', background: 'transparent', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  noteInput: { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #25302A', background: '#0A0D0A', color: '#c8d6cb', fontSize: 13, marginBottom: 12 },
  errorText: { color: '#F0A296', fontSize: 12, marginBottom: 8 },
  submitBtn: { width: '100%', padding: '12px 0', borderRadius: 10, border: 'none', background: '#4ADE80', color: '#0A0D0A', fontSize: 14, fontWeight: 700, cursor: 'pointer' },
  rangeRow: { display: 'flex', gap: 8, marginBottom: 14 },
  rangeBtn: { flex: 1, padding: '8px 0', borderRadius: 9, border: '1px solid #25302A', background: '#141914', color: '#7E9184', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  rangeActive: { borderColor: '#4ADE80', background: '#4ADE8022', color: '#6EE7A8' },
  statRow: { display: 'flex', gap: 8, marginBottom: 14 },
  statBox: { flex: 1, background: '#141914', border: '1px solid #1E271F', borderRadius: 12, padding: '10px 8px', textAlign: 'center' },
  statLabel: { fontSize: 10, color: '#5E7064', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 },
  statValue: { fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 700 },
  legendGrid: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  legendItem: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 },
  legendLabel: { color: '#7E9184' },
  legendValue: { fontFamily: "'JetBrains Mono', monospace", color: '#c8d6cb', fontWeight: 600 },
  categorySummary: { display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  summaryPill: { display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 20, background: '#141914', border: '1px solid #1E271F', fontSize: 11, cursor: 'pointer' },
  dot: { width: 6, height: 6, borderRadius: '50%', display: 'inline-block', flexShrink: 0 },
  summaryLabel: { color: '#7E9184' },
  summaryValue: { fontFamily: "'JetBrains Mono', monospace", color: '#c8d6cb', fontWeight: 600 },
  clearFilter: { padding: '5px 10px', borderRadius: 20, background: 'transparent', border: '1px solid #25302A', color: '#5E7064', fontSize: 11, cursor: 'pointer' },
  history: { marginTop: 4 },
  empty: { textAlign: 'center', color: '#3A4A3E', fontSize: 13, padding: '30px 0' },
  dayLabel: { fontSize: 11, letterSpacing: '0.1em', color: '#4A5A4E', fontWeight: 600, margin: '14px 0 6px 2px', textTransform: 'uppercase' },
  entryRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px', borderBottom: '1px solid #171D18' },
  entryIcon: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 8, background: '#141914', flexShrink: 0 },
  entryMid: { flex: 1, minWidth: 0 },
  entryNote: { fontSize: 13, color: '#c8d6cb', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  entryTime: { fontSize: 11, color: '#4A5A4E', fontFamily: "'JetBrains Mono', monospace" },
  entryAmount: { fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 600, flexShrink: 0 },
  deleteBtn: { background: 'transparent', border: 'none', color: '#3A4A3E', cursor: 'pointer', padding: 4, flexShrink: 0 },
  budgetCard: { background: '#141914', border: '1px solid #1E271F', borderRadius: 12, padding: 14, marginBottom: 10 },
  budgetHeaderRow: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 },
  budgetCatLabel: { fontSize: 13, fontWeight: 600, color: '#c8d6cb' },
  budgetInputRow: { display: 'flex', gap: 8 },
  modeToggle: { display: 'flex', border: '1px solid #25302A', borderRadius: 8, overflow: 'hidden' },
  modeBtn: { padding: '8px 12px', background: '#0A0D0A', color: '#5E7064', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  modeBtnActive: { background: '#4ADE80', color: '#0A0D0A' },
  budgetInput: { flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #25302A', background: '#0A0D0A', color: '#EAFBF0', fontSize: 15, fontFamily: "'JetBrains Mono', monospace" },
  progressTrack: { marginTop: 10, height: 6, borderRadius: 3, background: '#0A0D0A', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3, transition: 'width 0.2s ease' },
  progressLabel: { marginTop: 6, fontSize: 11, fontFamily: "'JetBrains Mono', monospace" },
  slider: { width: '100%', height: 4, marginTop: 4, cursor: 'pointer' },
  taxSourceRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' },
  taxSourceLabel: { fontSize: 13, color: '#c8d6cb' },
  taxSourceValue: { marginLeft: 'auto', fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 600, color: '#EAFBF0' },
};
