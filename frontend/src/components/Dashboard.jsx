import {
    Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer,
    Scatter, ScatterChart, Tooltip, XAxis, YAxis, LineChart,
    Line, Legend,
  } from "recharts";
  import { useEffect, useState } from "react";
  
  const COLORS = ["#6366f1","#22d3ee","#f59e0b","#10b981","#f43f5e","#a78bfa","#fb923c","#34d399"];
  
  export default function Dashboard({ profile, rows }) {
    const [charts, setCharts] = useState([]);
  
    useEffect(() => {
      if (!profile || !rows || rows.length === 0) return;
      setCharts(buildCharts(profile, rows));
    }, [profile, rows]);
  
    if (!profile || !rows || rows.length === 0) {
      return (
        <div className="flex items-center justify-center h-48 text-gray-400">
          Upload a CSV to see your dashboard
        </div>
      );
    }
  
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {charts.map((chart, i) => (
          <div key={i} className="bg-white rounded-2xl shadow p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">{chart.title}</h3>
            {chart.component}
          </div>
        ))}
      </div>
    );
  }
  
  function buildCharts(profile, rows) {
    const charts = [];
    const cols = profile.columns;
  
    const categoricals = cols.filter((c) => c.detected_type === "categorical");
    const numerics = cols.filter((c) => c.detected_type === "numeric");
    const datetimes = cols.filter((c) => c.detected_type === "datetime");
  
    const spendingCols = ["MntWines","MntFruits","MntMeatProducts","MntFishProducts","MntSweetProducts","MntGoldProds"]
      .filter((name) => cols.find((c) => c.column_name === name));
  
    const campaignCols = ["AcceptedCmp1","AcceptedCmp2","AcceptedCmp3","AcceptedCmp4","AcceptedCmp5","Response"]
      .filter((name) => cols.find((c) => c.column_name === name));
  
    // Chart 1 — Average Spending by Education
    if (spendingCols.length > 0 && cols.find((c) => c.column_name === "Education")) {
      const grouped = {};
      rows.forEach((row) => {
        const edu = row["Education"];
        if (!edu) return;
        if (!grouped[edu]) grouped[edu] = { count: 0 };
        spendingCols.forEach((col) => {
          grouped[edu][col] = (grouped[edu][col] || 0) + (Number(row[col]) || 0);
          grouped[edu].count += 1;
        });
      });
  
      const data = Object.entries(grouped).map(([edu, vals]) => {
        const entry = { Education: edu };
        spendingCols.forEach((col) => {
          entry[col.replace("Mnt", "").replace("Products", "").replace("Prods", "").toLowerCase()] =
            Math.round((vals[col] || 0) / (vals.count / spendingCols.length));
        });
        return entry;
      });
  
      const keys = spendingCols.map((c) =>
        c.replace("Mnt", "").replace("Products", "").replace("Prods", "").toLowerCase()
      );
  
      charts.push({
        title: "1. Average Spending by Education",
        component: (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="Education" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              {keys.map((k, i) => (
                <Bar key={k} dataKey={k} fill={COLORS[i % COLORS.length]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        ),
      });
    }
  
    // Chart 2 — Customer Count by Marital Status
    if (cols.find((c) => c.column_name === "Marital_Status")) {
      const grouped = {};
      rows.forEach((row) => {
        const val = row["Marital_Status"];
        if (!val) return;
        grouped[val] = (grouped[val] || 0) + 1;
      });
      const data = Object.entries(grouped)
        .map(([k, v]) => ({ Marital_Status: k, Count: v }))
        .sort((a, b) => b.Count - a.Count);
  
      charts.push({
        title: "2. Customer Count by Marital Status",
        component: (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="Marital_Status" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="Count">
                {data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ),
      });
    }
  
    // Chart 3 — Income Distribution
    if (cols.find((c) => c.column_name === "Income")) {
      const incomeValues = rows
        .map((r) => Number(r["Income"]))
        .filter((v) => !isNaN(v) && v > 0);
  
      if (incomeValues.length > 0) {
        const mn = Math.min(...incomeValues);
        const mx = Math.max(...incomeValues);
        const binSize = (mx - mn) / 10;
        const bins = Array.from({ length: 10 }, (_, i) => ({
          range: `${Math.round(mn + i * binSize / 1000)}k`,
          count: 0,
        }));
        incomeValues.forEach((val) => {
          const idx = Math.min(Math.floor((val - mn) / binSize), 9);
          bins[idx].count += 1;
        });
  
        charts.push({
          title: "3. Income Distribution (10 bins)",
          component: (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={bins}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="range" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#6366f1" />
              </BarChart>
            </ResponsiveContainer>
          ),
        });
      }
    }
  
    // Chart 4 — Enrollment by Month
    if (cols.find((c) => c.column_name === "Dt_Customer")) {
      const monthly = {};
      rows.forEach((row) => {
        const raw = row["Dt_Customer"];
        if (!raw) return;
        const d = new Date(raw);
        if (isNaN(d.getTime())) return;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        monthly[key] = (monthly[key] || 0) + 1;
      });
      const data = Object.entries(monthly)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => ({ month: k, count: v }));
  
      charts.push({
        title: "4. Enrollment Count by Month",
        component: (
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fontSize: 9 }} interval={2} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="count" stroke="#6366f1" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        ),
      });
    }
  
    // Chart 5 — Campaign Acceptance Rates
    if (campaignCols.length > 0) {
      const data = campaignCols.map((col) => ({
        campaign: col.replace("AcceptedCmp", "Cmp ").replace("Response", "Response"),
        accepted: rows.filter((r) => Number(r[col]) === 1).length,
      }));
  
      charts.push({
        title: "5. Campaign Acceptance Rates",
        component: (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="campaign" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="accepted">
                {data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ),
      });
    }
  
    // Chart 6 — Income vs Total Spending (Scatter)
    if (cols.find((c) => c.column_name === "Income") && spendingCols.length > 0) {
      const data = rows
        .filter((_, i) => i % 5 === 0) // sample every 5th row for performance
        .map((row) => ({
          income: Number(row["Income"]) || 0,
          spending: spendingCols.reduce((sum, col) => sum + (Number(row[col]) || 0), 0),
        }))
        .filter((d) => d.income > 0);
  
      charts.push({
        title: "6. Income vs Total Spending",
        component: (
          <ResponsiveContainer width="100%" height={250}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="income" name="Income" tick={{ fontSize: 10 }}
                tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <YAxis dataKey="spending" name="Spending" tick={{ fontSize: 10 }} />
              <Tooltip cursor={{ strokeDasharray: "3 3" }} />
              <Scatter data={data} fill="#6366f1" opacity={0.6} />
            </ScatterChart>
          </ResponsiveContainer>
        ),
      });
    }
  
    return charts;
  }