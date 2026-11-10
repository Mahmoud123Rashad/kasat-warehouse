import { useCallback, useEffect, useMemo, useState } from 'react'
import { configured, supabase } from './supabase'
import Analytics from './Analytics'
import './App.css'

const categories = { spare: 'قطع غيار', raw: 'خامات إنتاج', finished: 'منتجات تامة' }
const blank = { name: '', code: '', category: 'spare', unit: 'قطعة', quantity: '', price: '' }
const fmt = (v) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(v)
const displayError = (e) => e?.message || 'حصل خطأ، حاول مرة تانية.'

function App() {
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [loginEmail, setLoginEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState(null)
  const [products, setProducts] = useState([])
  const [movements, setMovements] = useState([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [form, setForm] = useState(blank)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [stockAction, setStockAction] = useState(null)
  const [stockAmount, setStockAmount] = useState('')

  useEffect(() => {
    if (!supabase) { setAuthLoading(false); return }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthLoading(false) }).catch(() => setAuthLoading(false))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => subscription.unsubscribe()
  }, [])

  const refresh = useCallback(async () => {
    if (!supabase || !session) return
    const [membership, items, history] = await Promise.all([
      supabase.from('warehouse_members').select('role').eq('user_id', session.user.id).maybeSingle(),
      supabase.from('products').select('id,name,code,category,unit,quantity,price').eq('archived', false).order('created_at', { ascending: false }),
      supabase.from('movements').select('id,product_name,type,quantity,before_quantity,after_quantity,created_at').order('created_at', { ascending: false }).limit(500)
    ])
    if (membership.error || items.error || history.error) throw membership.error || items.error || history.error
    setRole(membership.data?.role || 'unapproved')
    setProducts(items.data || [])
    setMovements(history.data || [])
  }, [session])

  useEffect(() => {
    if (!session) { setRole(null); setProducts([]); setMovements([]); return }
    let active = true
    const load = async (initial = false) => {
      if (initial) setLoading(true)
      try { await refresh() } catch (e) { if (active) setNotice(displayError(e)) }
      finally { if (active && initial) setLoading(false) }
    }
    void load(true)
    const interval = window.setInterval(() => void load(false), 15000)
    return () => { active = false; window.clearInterval(interval) }
  }, [session, refresh])

  const login = async (e) => {
    e.preventDefault(); setNotice(''); setBusy(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: loginEmail.trim(), password })
      if (error) throw error
      setPassword('')
    } catch (e) { setNotice(displayError(e)) }
    finally { setBusy(false) }
  }
  const call = async (name, args, success) => {
    setBusy(true); setNotice('')
    try {
      const { error } = await supabase.rpc(name, args)
      if (error) throw error
      await refresh()
      setNotice(success)
      return true
    } catch (e) { setNotice(displayError(e)); return false }
    finally { setBusy(false) }
  }
  const addProduct = async (e) => {
    e.preventDefault()
    const quantity = Number(form.quantity), price = Number(form.price)
    if (!form.name.trim() || !form.code.trim() || form.quantity === '' || form.price === '' ||
      !Number.isSafeInteger(quantity) || quantity < 0 || !Number.isFinite(price) || price < 0) {
      setNotice('راجع الاسم والكود والكمية والسعر.'); return
    }
    if (await call('add_warehouse_product', { p_name: form.name.trim(), p_code: form.code.trim(), p_category: form.category, p_unit: form.unit, p_quantity: quantity, p_price: price }, 'تمت إضافة المنتج وحفظه أونلاين.')) setForm(blank)
  }
  const moveStock = async (e) => {
    e.preventDefault()
    const amount = Number(stockAmount)
    if (!Number.isSafeInteger(amount) || amount < 1 || stockAmount === '') { setNotice('اكتب كمية صحيحة أكبر من صفر.'); return }
    if (await call('record_warehouse_movement', { p_product_id: stockAction.product.id, p_type: stockAction.type, p_quantity: amount }, 'تم تسجيل حركة المخزن بنجاح.')) { setStockAction(null); setStockAmount('') }
  }
  const archive = async (p) => {
    if (!window.confirm(`أرشفة المنتج «${p.name}»؟ سجل الحركات هيفضل محفوظ.`)) return
    await call('archive_warehouse_product', { p_product_id: p.id }, 'تمت أرشفة المنتج.')
  }
  const filtered = useMemo(() => products.filter(p => (filter === 'all' || p.category === filter) && `${p.name} ${p.code}`.toLowerCase().includes(query.trim().toLowerCase())), [products, filter, query])
  const qty = products.reduce((sum,p) => sum + Number(p.quantity), 0)
  const value = products.reduce((sum,p) => sum + Number(p.quantity)*Number(p.price), 0)
  const low = products.filter(p => Number(p.quantity) <= 5).length
  const canEdit = role === 'admin' || role === 'editor'

  if (!configured) return <div className="auth-screen" dir="rtl"><div className="auth-card"><img src="/kasat-logo.png" alt="مصنع كاسات وعدادات" /><h1>ربط قاعدة البيانات</h1><p>لازم تضيف بيانات Supabase في ملف <code>.env</code> حسب ملف README قبل التشغيل.</p></div></div>
  if (authLoading) return <div className="auth-screen" dir="rtl"><p>جاري التحقق من تسجيل الدخول...</p></div>
  if (!session) return <div className="auth-screen" dir="rtl"><form className="auth-card" onSubmit={login}><img src="/kasat-logo.png" alt="شعار مصنع كاسات وعدادات" /><span className="section-tag">نظام مخازن أونلاين</span><h1>تسجيل الدخول</h1><p>الدخول متاح فقط للموظفين اللي اتضافوا للنظام بواسطة الإدارة.</p>{notice && <div className="notice" role="alert">{notice}</div>}<label>البريد الإلكتروني<input type="email" autoComplete="email" required value={loginEmail} onChange={e=>setLoginEmail(e.target.value)} placeholder="name@example.com" dir="ltr" /></label><label>كلمة المرور<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)} /></label><button className="button button-primary" disabled={busy}> {busy ? 'جاري الدخول...' : 'دخول للنظام ←'} </button></form></div>
  return <div className="app" dir="rtl"><main className="container">
    <header className="topbar"><div className="brand"><span className="brand-mark">✦</span><span>مصنع كاسات وعدادات<small>KASAT & ADDADAT</small></span></div><div className="user-nav"><span className="topbar-label"><span className="online-dot" /> {role === 'admin' ? 'مدير النظام' : role === 'editor' ? 'موظف مخزن' : role === 'viewer' ? 'مشاهدة فقط' : 'بانتظار الموافقة'}</span><button className="action delete" onClick={() => supabase.auth.signOut()}>تسجيل خروج</button></div></header>
    <section className="hero-section"><div className="hero-copy"><div className="eyebrow">✦ إدارة المخزن المشترك أونلاين</div><h1>مخزون المصنع <span>في مكان واحد.</span></h1><p>متابعة لحظية تقريبًا للأصناف وحركات الوارد والصادر لجميع المستخدمين المصرح لهم، مع تحديث تلقائي كل ١٥ ثانية.</p>{canEdit && <a className="primary-link" href="#add-product">+ إضافة منتج جديد ←</a>}</div><div className="hero-art"><img src="/kasat-logo.png" alt="شعار مصنع كاسات وعدادات" /></div></section>
    {notice && <div className="notice" role="status">{notice}<button aria-label="إغلاق" onClick={()=>setNotice('')}>×</button></div>}
    {loading && <div className="notice">جاري تحميل البيانات المشتركة...</div>}
    {role === 'unapproved' ? <section className="panel"><h2>الحساب محتاج تفعيل</h2><p>تم تسجيل الدخول، لكن لازم مدير النظام يضيف بريدك في جدول <code>warehouse_members</code> بصلاحية مناسبة.</p></section> : <>
    <section className="stats"><article className="stat-card"><div className="stat-top">إجمالي المنتجات <span className="stat-icon">▦</span></div><strong>{fmt(products.length)}</strong><small>صنف نشط</small></article><article className="stat-card"><div className="stat-top">إجمالي الوحدات <span className="stat-icon">◫</span></div><strong>{fmt(qty)}</strong><small>وحدة بالمخزن</small></article><article className="stat-card"><div className="stat-top">قيمة المخزون <span className="stat-icon">◇</span></div><strong>{fmt(value)} <em>ج.م</em></strong><small>تقديرية</small></article><article className="stat-card"><div className="stat-top">مخزون منخفض <span className="stat-icon warning">!</span></div><strong>{fmt(low)}</strong><small>الرصيد ٥ أو أقل</small></article></section>
    <Analytics products={products} movements={movements} />
    {canEdit && <section className="panel" id="add-product"><div className="panel-heading"><div><span className="section-tag">إدارة الأصناف</span><h2>إضافة منتج جديد</h2><p>المنتج هيتحفظ في قاعدة البيانات المشتركة.</p></div></div><form className="product-form" onSubmit={addProduct}><label>اسم المنتج<input required maxLength={200} value={form.name} onChange={e=>setForm({...form,name:e.target.value})} /></label><label>كود المنتج<input required maxLength={80} value={form.code} onChange={e=>setForm({...form,code:e.target.value})} /></label><label>نوع الصنف<select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{Object.entries(categories).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><label>وحدة القياس<select value={form.unit} onChange={e=>setForm({...form,unit:e.target.value})}>{['قطعة','كيلو','متر','لتر','علبة','كرتونة'].map(u=><option key={u}>{u}</option>)}</select></label><label>الكمية الأولية<input required type="number" min="0" step="1" value={form.quantity} onChange={e=>setForm({...form,quantity:e.target.value})} /></label><label>سعر الوحدة بالجنيه<input required type="number" min="0" step="0.01" value={form.price} onChange={e=>setForm({...form,price:e.target.value})} /></label><div className="form-actions"><button className="button button-primary" disabled={busy}>حفظ المنتج</button></div></form></section>}
    <section className="panel" id="products"><div className="panel-heading"><div><span className="section-tag">بيانات المخزن</span><h2>قائمة المنتجات <span className="count-chip">{products.length}</span></h2><p>جميع المنتجات الحالية المشتركة.</p></div></div><div className="toolbar"><div className="search-field"><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="ابحث بالاسم أو الكود..." aria-label="بحث" /></div><select value={filter} onChange={e=>setFilter(e.target.value)} aria-label="النوع"><option value="all">جميع الأنواع</option>{Object.entries(categories).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select><button className="button button-ghost" type="button" onClick={()=>refresh().catch(e=>setNotice(displayError(e)))}>تحديث ↻</button></div><div className="table-wrap"><table><thead><tr><th>المنتج</th><th>الكود</th><th>نوع الصنف</th><th>الرصيد</th><th>سعر الوحدة</th>{canEdit && <th>إجراءات</th>}</tr></thead><tbody>{filtered.map(p=><tr key={p.id}><td className="product-name">{p.name}</td><td><code>{p.code}</code></td><td><span className="category-pill">{categories[p.category]}</span></td><td><strong className={p.quantity<=5?'low-quantity':'quantity'}>{fmt(p.quantity)}</strong> <span className="unit">{p.unit}</span></td><td>{fmt(p.price)} ج.م</td>{canEdit && <td><div className="row-actions"><button disabled={busy} className="action in" onClick={()=>{setStockAction({product:p,type:'in'});setStockAmount('')}}>وارد</button><button disabled={busy} className="action out" onClick={()=>{setStockAction({product:p,type:'out'});setStockAmount('')}}>صادر</button>{role==='admin' && <button disabled={busy} className="action delete" onClick={()=>archive(p)}>أرشفة</button>}</div></td>}</tr>)}</tbody></table>{filtered.length===0 && <div className="empty-state">لا توجد منتجات تطابق البحث.</div>}</div></section>
    <section className="panel movements-panel"><div className="panel-heading"><div><span className="section-tag">التتبع</span><h2>سجل حركة المخزن</h2><p>آخر ٥٠٠ حركة — مع الحفاظ على الحركات القديمة بقاعدة البيانات.</p></div></div><div className="table-wrap"><table><thead><tr><th>التاريخ</th><th>المنتج</th><th>الحركة</th><th>الكمية</th><th>قبل</th><th>بعد</th></tr></thead><tbody>{movements.map(m=><tr key={m.id}><td className="date-cell">{new Date(m.created_at).toLocaleString('ar-EG')}</td><td>{m.product_name}</td><td><span className={`movement-badge ${m.type==='out'?'outgoing':'incoming'}`}>{m.type==='in'?'وارد':m.type==='out'?'صادر':'رصيد افتتاحي'}</span></td><td>{fmt(m.quantity)}</td><td>{fmt(m.before_quantity)}</td><td>{fmt(m.after_quantity)}</td></tr>)}</tbody></table>{movements.length===0 && <div className="empty-state">لا توجد حركات مسجلة.</div>}</div></section></>}
    <footer>مصنع كاسات وعدادات © {new Date().getFullYear()} — نظام إدارة المخزون</footer>
  </main>{stockAction && <div className="modal-backdrop"><div className="modal" role="dialog" aria-modal="true" aria-labelledby="move-title"><div className="modal-head"><h2 id="move-title">{stockAction.type==='in'?'تسجيل وارد':'تسجيل صادر'}</h2><button onClick={()=>setStockAction(null)} aria-label="إغلاق">×</button></div><p>المنتج: <strong>{stockAction.product.name}</strong></p><p>الرصيد المعروض: {stockAction.product.quantity}. هيتراجع الرصيد الفعلي عند الحفظ.</p><form onSubmit={moveStock}><label>الكمية<input autoFocus required type="number" min="1" step="1" value={stockAmount} onChange={e=>setStockAmount(e.target.value)} /></label><div className="modal-actions"><button className="button button-ghost" type="button" onClick={()=>setStockAction(null)}>إلغاء</button><button disabled={busy} className="button button-primary">تأكيد</button></div></form></div></div>}</div>
}
export default App
