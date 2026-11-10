import { useMemo, useState } from 'react'

const categoryNames = { spare: 'قطع غيار', raw: 'خامات إنتاج', finished: 'منتجات تامة' }
const palette = ['#CDA64A', '#F6F1E7', '#938063']
const format = (n) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 1 }).format(n)
const dayKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

function TrendChart({ movements, days }) {
  const points = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const entries = Array.from({ length: days }, (_, i) => {
      const date = new Date(today)
      date.setDate(today.getDate() - (days - 1 - i))
      return { key: dayKey(date), label: new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'short' }).format(date), incoming: 0, outgoing: 0 }
    })
    const byDate = new Map(entries.map((entry) => [entry.key, entry]))
    for (const movement of movements) {
      if (movement.type !== 'in' && movement.type !== 'out') continue
      const date = new Date(movement.created_at)
      if (Number.isNaN(date.getTime())) continue
      const entry = byDate.get(dayKey(date))
      if (!entry) continue
      const qty = Number(movement.quantity)
      if (Number.isFinite(qty) && qty > 0) entry[movement.type === 'in' ? 'incoming' : 'outgoing'] += qty
    }
    return entries
  }, [movements, days])

  const maxValue = Math.max(1, ...points.map((p) => Math.max(p.incoming, p.outgoing)))
  const width = 840, height = 290, left = 48, right = 10, top = 22, bottom = 53
  const plotWidth = width - left - right, plotHeight = height - top - bottom
  const band = plotWidth / days, barWidth = Math.min(16, band * 0.3)
  const tickEvery = days === 30 ? 5 : days === 14 ? 2 : 1
  const totals = points.reduce((a, p) => ({ incoming: a.incoming + p.incoming, outgoing: a.outgoing + p.outgoing }), { incoming: 0, outgoing: 0 })

  return <div className="trend-chart">
    <div className="chart-legend"><span><i className="legend-dot gold" /> وارد: {format(totals.incoming)}</span><span><i className="legend-dot ivory" /> صادر: {format(totals.outgoing)}</span></div>
    <div className="chart-scroll"><svg className="trend-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`مخطط الوارد والصادر خلال آخر ${days} يوم؛ إجمالي الوارد ${format(totals.incoming)} وإجمالي الصادر ${format(totals.outgoing)}`}>
      {Array.from({ length: 5 }, (_, i) => { const y = top + i * plotHeight / 4; return <g key={i}><line x1={left} x2={width - right} y1={y} y2={y} stroke="#4d4434" strokeDasharray="3 6" /><text x={left - 9} y={y + 4} textAnchor="end" fill="#b9b2a5" fontSize="12">{format(maxValue * (4-i)/4)}</text></g> })}
      {points.map((p, i) => {
        const cx = left + band * (i + .5)
        const inHeight = p.incoming / maxValue * plotHeight, outHeight = p.outgoing / maxValue * plotHeight
        return <g key={p.key}>
          <rect x={cx - barWidth - 2} y={top + plotHeight - inHeight} width={barWidth} height={inHeight} rx="3" fill="#CDA64A"><title>{`${p.label} — وارد ${format(p.incoming)} وحدة`}</title></rect>
          <rect x={cx + 2} y={top + plotHeight - outHeight} width={barWidth} height={outHeight} rx="3" fill="#F6F1E7"><title>{`${p.label} — صادر ${format(p.outgoing)} وحدة`}</title></rect>
          {i % tickEvery === 0 && <text x={cx} y={height - 24} fontSize="11" textAnchor="middle" fill="#b9b2a5">{p.label}</text>}
        </g>
      })}
    </svg></div>
    {totals.incoming === 0 && totals.outgoing === 0 && <p className="chart-footnote">مفيش حركات وارد أو صادر في الفترة دي لسه.</p>}
    <p className="chart-footnote">الرسم مبني على آخر ٥٠٠ حركة متاحة من سجل المخزن؛ الأيام الأقدم ممكن تكون غير مكتملة لو فيه حركات أكتر.</p>
  </div>
}

function CategoryChart({ products }) {
  const data = Object.keys(categoryNames).map((key, i) => {
    const group = products.filter(p => p.category === key)
    return { key, label: categoryNames[key], count: group.length, total: group.reduce((sum, p) => sum + Number(p.quantity || 0) * Number(p.price || 0), 0), color: palette[i] }
  })
  const total = data.reduce((sum, d) => sum + d.total, 0)
  const radius = 77, circumference = 2 * Math.PI * radius
  let offset = 0
  return <div className="category-body">
    <svg className="donut" viewBox="0 0 220 220" role="img" aria-label="توزيع القيمة المالية للمخزون على قطع الغيار والخامات والمنتجات التامة">
      <circle cx="110" cy="110" r={radius} fill="none" stroke="#3d3526" strokeWidth="22" />
      {data.map(d => { const length = total > 0 ? (d.total / total) * circumference : 0; const segment = <circle key={d.key} cx="110" cy="110" r={radius} fill="none" stroke={d.color} strokeWidth="22" strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-offset} transform="rotate(-90 110 110)"><title>{`${d.label}: ${format(d.total)} جنيه`}</title></circle>; offset += length; return segment })}
      <text x="110" y="103" textAnchor="middle" fill="#b9b2a5" fontSize="13">قيمة المخزون</text>
      <text x="110" y="130" textAnchor="middle" fill="#F6F1E7" fontSize="20" fontWeight="700">{format(total)}</text>
    </svg>
    <div className="category-legend">{data.map(d => <div className="category-legend-row" key={d.key}><span><i className="legend-dot" style={{ background: d.color }} />{d.label}<small>{format(d.count)} صنف</small></span><strong>{total > 0 ? format(d.total / total * 100) : '0'}%</strong></div>)}</div>
  </div>
}

function TopProductsChart({ products }) {
  const top = [...products].map(p => ({ ...p, value: Number(p.quantity || 0) * Number(p.price || 0) })).sort((a, b) => b.value - a.value).slice(0, 5)
  const max = Math.max(1, ...top.map(p => p.value))
  return <div className="top-product-chart">{top.length ? top.map(p => <div className="top-product-row" key={p.id}><div className="top-product-label"><span title={p.name}>{p.name}</span><strong>{format(p.value)} ج.م</strong></div><div className="top-product-track"><div style={{ width: `${p.value / max * 100}%` }} /></div></div>) : <p className="chart-footnote">أضف منتجات علشان يظهر الرسم.</p>}</div>
}

export default function Analytics({ products, movements }) {
  const [days, setDays] = useState(7)
  return <section className="analytics-section" id="analytics" aria-labelledby="analytics-title">
    <div className="analytics-heading"><div><span className="section-tag">تحليلات المخزون</span><h2 id="analytics-title">الرسوم البيانية</h2><p>بتتحدث تلقائيًا مع كل تحديث لبيانات المنتجات والحركات.</p></div></div>
    <div className="analytics-grid">
      <article className="panel analytics-panel trend-panel"><div className="analytics-panel-header"><div><h3>حركة الوارد والصادر</h3><p>الكميات اليومية من سجل الحركات</p></div><label className="chart-period">الفترة <select value={days} onChange={e => setDays(Number(e.target.value))}><option value={7}>٧ أيام</option><option value={14}>١٤ يوم</option><option value={30}>٣٠ يوم</option></select></label></div><TrendChart movements={movements} days={days} /></article>
      <article className="panel analytics-panel"><div className="analytics-panel-header"><div><h3>توزيع قيمة المخزون</h3><p>حسب نوع الصنف</p></div></div><CategoryChart products={products} /></article>
      <article className="panel analytics-panel"><div className="analytics-panel-header"><div><h3>أعلى ٥ منتجات بالقيمة</h3><p>الكمية الحالية × سعر الوحدة</p></div></div><TopProductsChart products={products} /></article>
    </div>
  </section>
}
