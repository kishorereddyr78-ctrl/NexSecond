import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

function Admin() {
  const [orders, setOrders] = useState([])
  const [selectedStatus, setSelectedStatus] = useState('all')
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState(null)
  const [errorMessage, setErrorMessage] = useState('')

  // Delivery fields stay separate from refreshed order data
  const [deliveryDrafts, setDeliveryDrafts] = useState({})

  // New-order notification
  const previousNewestOrderId = useRef(null)
  const realtimeRefreshTimerRef = useRef(null)
  const [newOrderAlert, setNewOrderAlert] = useState(false)

  // Delivery typing protection
  const isEditingDeliveryRef = useRef(false)

  // Sound
  const audioContextRef = useRef(null)
  const [soundEnabled, setSoundEnabled] = useState(false)

  // Inventory
  const [products, setProducts] = useState([])
  const [productLoading, setProductLoading] = useState(true)
  const [productError, setProductError] = useState('')
  const [productDrafts, setProductDrafts] = useState({})

  const playNotificationSound = async () => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current =
          new (window.AudioContext ||
            window.webkitAudioContext)()
      }

      const audioContext = audioContextRef.current

      if (audioContext.state === 'suspended') {
        await audioContext.resume()
      }

      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()

      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(
        880,
        audioContext.currentTime
      )

      gainNode.gain.setValueAtTime(
        0.001,
        audioContext.currentTime
      )

      gainNode.gain.exponentialRampToValueAtTime(
        0.7,
        audioContext.currentTime + 0.02
      )

      gainNode.gain.exponentialRampToValueAtTime(
        0.001,
        audioContext.currentTime + 0.5
      )

      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)

      oscillator.start()
      oscillator.stop(audioContext.currentTime + 0.5)
    } catch (error) {
      console.error('Notification sound error:', error)
    }
  }

  const enableSound = async () => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current =
          new (window.AudioContext ||
            window.webkitAudioContext)()
      }

      await audioContextRef.current.resume()
      setSoundEnabled(true)

      // Small confirmation beep
      await playNotificationSound()
    } catch (error) {
      console.error('Could not enable sound:', error)
      alert('Your browser could not enable notification sound.')
    }
  }

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/admin` },
    })
    if (error) {
      console.error('Admin Google login error:', error)
      setErrorMessage(error.message)
    }
  }

  const fetchOrders = async () => {
    setLoading(true)
    setErrorMessage('')

    const {
      data: { session },
    } = await supabase.auth.getSession()
    console.log('ADMIN SESSION:', session)

    const currentUser = session?.user

    if (!currentUser) {
      setErrorMessage(
        'Admin session not found. Please login again.'
      )
      setLoading(false)
      return
    }

    setUser(currentUser)

    const { data, error } = await supabase.rpc(
      'get_admin_orders'
    )

    if (error) {
      console.error('Admin order error:', error)
      setErrorMessage(error.message)
      setOrders([])
    } else {
      const newOrders = data || []

      const newestOrderId =
        newOrders[0]?.order_id ?? null

      // Do not show an alert on the first page load
      if (
        previousNewestOrderId.current !== null &&
        newestOrderId !== previousNewestOrderId.current
      ) {
        setNewOrderAlert(true)

        if (soundEnabled) {
          playNotificationSound()
        }
      }

      previousNewestOrderId.current = newestOrderId
      setOrders(newOrders)
    }

    setLoading(false)
  }

  const fetchProducts = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) {
      setProductLoading(false)
      return
    }

    setProductLoading(true)
    setProductError('')

    const { data, error } = await supabase.rpc('get_admin_products')

    if (error) {
      console.error('Admin product error:', error)
      setProductError(error.message)
      setProducts([])
    } else {
      setProducts(data || [])
    }

    setProductLoading(false)
  }

  const updateProductDraft = (productId, field, value) => {
    setProductDrafts((current) => ({
      ...current,
      [productId]: {
        ...(current[productId] || {}),
        [field]: value,
      },
    }))
  }

  const updateProductInventory = async (product) => {
    const draft = productDrafts[product.id] || {}
    const stockValue = Number(draft.stock_quantity ?? product.stock_quantity ?? 0)
    const availableValue = draft.is_available ?? product.is_available ?? false

    if (!Number.isInteger(stockValue) || stockValue < 0) {
      alert('Stock quantity must be a whole number 0 or greater.')
      return
    }

    const { data, error } = await supabase.rpc(
      'update_admin_product_inventory',
      {
        p_product_id: product.id,
        p_stock_quantity: stockValue,
        p_is_available: availableValue,
      }
    )

    if (error) {
      alert(`Inventory update failed: ${error.message}`)
      return
    }

    setProducts((currentProducts) =>
      currentProducts.map((currentProduct) =>
        currentProduct.id === product.id
          ? {
              ...currentProduct,
              stock_quantity: data?.stock_quantity ?? stockValue,
              is_available: data?.is_available ?? availableValue,
            }
          : currentProduct
      )
    )

    setProductDrafts((current) => {
      const updated = { ...current }
      delete updated[product.id]
      return updated
    })
  }

  const updateOrderStatus = async (
    orderDatabaseId,
    newStatus
  ) => {
    const { error } = await supabase.rpc(
      'update_admin_order_status',
      {
        p_order_database_id: orderDatabaseId,
        p_status: newStatus,
      }
    )

    if (error) {
      alert(`Status update failed: ${error.message}`)
      return
    }

    setOrders((currentOrders) =>
      currentOrders.map((order) =>
        order.id === orderDatabaseId
          ? { ...order, status: newStatus }
          : order
      )
    )
  }

  const updatePaymentStatus = async (
    orderDatabaseId,
    newPaymentStatus
  ) => {
    const { data, error } = await supabase.rpc(
      'update_admin_payment_status',
      {
        p_order_database_id: orderDatabaseId,
        p_payment_status: newPaymentStatus,
      }
    )

    if (error) {
      alert(`Payment status update failed: ${error.message}`)
      return
    }

    setOrders((currentOrders) =>
      currentOrders.map((order) =>
        order.id === orderDatabaseId
          ? {
              ...order,
              payment_status:
                data?.payment_status ?? newPaymentStatus,
            }
          : order
      )
    )
  }

  const updateDeliveryDraft = (
    orderId,
    field,
    value
  ) => {
    setDeliveryDrafts((current) => ({
      ...current,
      [orderId]: {
        ...(current[orderId] || {}),
        [field]: value,
      },
    }))
  }

  const assignDeliveryPartner = async (order) => {
    const draft = deliveryDrafts[order.id] || {}

    const partnerName =
      draft.name ?? order.delivery_partner_name ?? ''

    const partnerPhone =
      draft.phone ??
      order.delivery_partner_phone ??
      ''

    if (
      !partnerName.trim() ||
      !partnerPhone.trim()
    ) {
      alert(
        'Please enter both partner name and phone.'
      )
      return
    }

    const { error } = await supabase.rpc(
      'assign_delivery_partner',
      {
        p_order_database_id: order.id,
        p_partner_name: partnerName,
        p_partner_phone: partnerPhone,
      }
    )

    if (error) {
      alert(`Assignment failed: ${error.message}`)
      return
    }

    alert(
      'Delivery partner assigned successfully!'
    )

    setDeliveryDrafts((current) => {
      const updated = { ...current }
      delete updated[order.id]
      return updated
    })

    isEditingDeliveryRef.current = false

    await fetchOrders()
  }

  const NEXSECOND_TIME_ZONE = 'Asia/Kolkata'

const getNexSecondDateKey = (value) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: NEXSECOND_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value))

const today = getNexSecondDateKey(new Date())

const todayOrders = orders.filter(
  (order) =>
    getNexSecondDateKey(order.created_at) === today
)

  const totalOrders = orders.length

  const pendingOrders = orders.filter(
    (order) => order.status === 'pending'
  ).length

  const outForDeliveryOrders = orders.filter(
    (order) => order.status === 'out_for_delivery'
  ).length

  const todaySales = todayOrders
    .filter((order) =>
      [
        'confirmed',
        'preparing',
        'out_for_delivery',
        'delivered',
      ].includes(order.status)
    )
    .reduce(
      (total, order) =>
        total + Number(order.total_amount || 0),
      0
    )

  useEffect(() => {
    const loadForSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) {
        setLoading(false)
        setProductLoading(false)
        return
      }
      await Promise.all([fetchOrders(), fetchProducts()])
    }

    loadForSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        await Promise.all([fetchOrders(), fetchProducts()])
      }
    })

    const scheduleRefresh = () => {
      if (realtimeRefreshTimerRef.current) {
        clearTimeout(realtimeRefreshTimerRef.current)
      }

      realtimeRefreshTimerRef.current = setTimeout(() => {
        if (!isEditingDeliveryRef.current) {
          fetchOrders()
        }
      }, 150)
    }

    const channel = supabase
      .channel('nexsecond-admin-orders-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        (payload) => {
          console.log('Realtime new order:', payload.new)
          setNewOrderAlert(true)
          if (soundEnabled) playNotificationSound()
          scheduleRefresh()
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders' },
        (payload) => {
          console.log('Realtime order update:', payload.new)
          scheduleRefresh()
        }
      )
      .subscribe((status) => {
        console.log('Admin realtime status:', status)
      })

    // Realtime handles live order updates.
    // Manual "Refresh Orders" is available as a fallback.
    const fallbackInterval = null

    return () => {
      subscription.unsubscribe()
      if (realtimeRefreshTimerRef.current) {
        clearTimeout(realtimeRefreshTimerRef.current)
      }
      if (fallbackInterval) clearInterval(fallbackInterval)
      supabase.removeChannel(channel)
    }
  }, [soundEnabled])

  return (
    <div className="admin-shell">
      <style>{`
        .admin-shell {
          --admin-ink: #121716;
          --admin-muted: #6b7471;
          --admin-border: #e5e8e6;
          --admin-surface: #ffffff;
          --admin-surface-soft: #f7f9f8;
          --admin-green: #0b7a2a;
          --admin-green-soft: #edf7f0;
          min-height: 100vh;
          box-sizing: border-box;
          padding: clamp(14px, 2.6vw, 30px);
          background: #f5f7f6;
          color: var(--admin-ink);
          font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
        }

        .admin-shell *,
        .admin-shell *::before,
        .admin-shell *::after {
          box-sizing: border-box;
        }

        .admin-shell button,
        .admin-shell input,
        .admin-shell select {
          font: inherit;
        }

        .admin-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          margin-bottom: 18px;
          padding: 18px 20px;
          background: rgba(255,255,255,.94);
          border: 1px solid var(--admin-border);
          border-radius: 20px;
          box-shadow: 0 10px 28px rgba(16, 31, 23, .06);
        }

        .admin-brand {
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .admin-logo {
          display: block;
          width: 210px;
          height: 54px;
          object-fit: contain;
          object-position: left center;
          border-radius: 10px;
          background: #fff;
        }

        .admin-brand-text {
          display: grid;
          gap: 4px;
          min-width: 0;
        }

        .admin-brand-text strong {
          font-size: 17px;
          line-height: 1;
          letter-spacing: -.02em;
        }

        .admin-brand-text span {
          color: var(--admin-muted);
          font-size: 13px;
        }

        .admin-header-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
          flex-wrap: wrap;
        }

        .admin-account {
          display: grid;
          gap: 2px;
          min-width: 160px;
          margin-right: 4px;
        }

        .admin-account span {
          color: var(--admin-muted);
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: .06em;
        }

        .admin-account strong {
          max-width: 230px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 13px;
        }

        .admin-btn {
          min-height: 42px;
          padding: 10px 14px;
          border: 1px solid #dfe4e1;
          border-radius: 11px;
          background: #fff;
          color: #151a18;
          cursor: pointer;
          font-weight: 700;
          transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease, background .18s ease;
        }

        .admin-btn:hover {
          transform: translateY(-1px);
          border-color: #cfd8d3;
          box-shadow: 0 7px 18px rgba(12, 30, 20, .07);
        }

        .admin-btn:active {
          transform: translateY(0);
        }

        .admin-btn--dark {
          background: #111;
          border-color: #111;
          color: #fff;
        }

        .admin-card {
          background: var(--admin-surface);
          border: 1px solid var(--admin-border);
          border-radius: 18px;
          box-shadow: 0 8px 22px rgba(16, 31, 23, .045);
        }

        .admin-login-card {
          max-width: 560px;
          margin: 34px auto;
          padding: clamp(22px, 4vw, 34px);
          text-align: center;
        }

        .admin-login-card h2 {
          margin: 0 0 10px;
        }

        .admin-login-card p {
          margin: 0;
          color: var(--admin-muted);
          line-height: 1.6;
        }

        .admin-login-card .admin-btn {
          margin-top: 20px;
        }

        .admin-alert {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin: 16px 0;
          padding: 13px 16px;
          background: #edf9f0;
          border: 1px solid #b7e4c0;
          border-radius: 14px;
          color: #185d29;
          font-weight: 700;
        }

        .admin-control-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          margin: 16px 0 20px;
        }

        .admin-control-note {
          color: var(--admin-muted);
          font-size: 13px;
        }

        .admin-summary-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 14px;
          margin: 20px 0 24px;
        }

        .admin-summary-card {
          padding: 19px 20px;
        }

        .admin-summary-card strong {
          display: block;
          color: var(--admin-muted);
          font-size: 13px;
          font-weight: 700;
        }

        .admin-summary-card h2 {
          margin: 10px 0 0;
          font-size: clamp(24px, 2.8vw, 32px);
          letter-spacing: -.03em;
        }

        .admin-section {
          margin: 22px 0;
          padding: clamp(18px, 2.5vw, 24px);
        }

        .admin-section-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          flex-wrap: wrap;
        }

        .admin-section-head h2 {
          margin: 0;
          font-size: clamp(21px, 2vw, 27px);
          letter-spacing: -.02em;
        }

        .admin-section-head p {
          margin: 5px 0 0;
          color: var(--admin-muted);
          line-height: 1.45;
        }

        .admin-inventory-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 12px;
          margin-top: 18px;
        }

        .admin-product-card {
          padding: 15px;
          background: var(--admin-surface-soft);
          border: 1px solid var(--admin-border);
          border-radius: 14px;
        }

        .admin-product-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
        }

        .admin-product-meta {
          margin-top: 4px;
          color: var(--admin-muted);
          font-size: 13px;
          line-height: 1.45;
        }

        .admin-pill {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 26px;
          padding: 5px 9px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 800;
          white-space: nowrap;
        }

        .admin-pill--available {
          background: #dcfce7;
          color: #166534;
        }

        .admin-pill--hidden {
          background: #fee2e2;
          color: #991b1b;
        }

        .admin-product-controls {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-top: 14px;
        }

        .admin-product-controls input,
        .admin-product-controls select {
          flex: 1 1 120px;
          min-width: 0;
          min-height: 42px;
          padding: 9px 10px;
          border: 1px solid #cfd6d2;
          border-radius: 9px;
          background: #fff;
          color: #111;
        }

        .admin-product-controls .admin-btn {
          flex: 1 1 100%;
        }

        .admin-filter-row {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin: 4px 0 20px;
        }

        .admin-filter {
          min-height: 42px;
          padding: 9px 14px;
          border: 1px solid #dfe4e1;
          border-radius: 10px;
          background: #fff;
          color: #111;
          cursor: pointer;
          font-weight: 700;
        }

        .admin-filter--active {
          background: #111;
          border-color: #111;
          color: #fff;
        }

        .admin-order-list {
          display: grid;
          gap: 15px;
        }

        .admin-order-card {
          padding: clamp(16px, 2.5vw, 22px);
          border: 1px solid var(--admin-border);
          border-radius: 16px;
          background: #fff;
          box-shadow: 0 6px 18px rgba(16, 31, 23, .045);
        }

        .admin-order-title {
          margin: 0 0 12px;
          font-size: 18px;
          letter-spacing: -.02em;
        }

        .admin-order-info {
          display: grid;
          gap: 7px;
          margin: 8px 0;
          color: #303735;
          line-height: 1.5;
          overflow-wrap: anywhere;
        }

        .admin-order-info strong {
          color: #111;
        }

        .admin-items {
          margin-top: 15px;
          padding-top: 14px;
          border-top: 1px solid #edf0ee;
        }

        .admin-status-row {
          display: flex;
          align-items: center;
          gap: 9px;
          flex-wrap: wrap;
          margin-top: 15px;
        }

        .admin-status-row select,
        .admin-payment-box select {
          min-height: 40px;
          max-width: 100%;
          padding: 7px 10px;
          border: 1px solid #d5dbd7;
          border-radius: 9px;
          background: #fff;
          color: #111;
        }

        .admin-delivery-box {
          margin-top: 18px;
        }

        .admin-delivery-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
          gap: 8px;
          margin-top: 8px;
        }

        .admin-delivery-row input {
          width: 100%;
          min-height: 42px;
          padding: 9px 10px;
          border: 1px solid #cfd6d2;
          border-radius: 9px;
        }

        .admin-payment-box {
          margin-top: 12px;
          padding: 13px;
          border-radius: 11px;
          background: #f8f9f8;
          border: 1px solid var(--admin-border);
        }

        .admin-payment-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }

        .admin-created {
          margin: 14px 0 0;
          color: var(--admin-muted);
          font-size: 12px;
          line-height: 1.4;
        }

        .admin-error {
          color: #b91c1c;
        }

        @media (max-width: 980px) {
          .admin-summary-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .admin-header {
            align-items: flex-start;
            flex-direction: column;
          }

          .admin-header-actions {
            width: 100%;
            justify-content: flex-start;
          }
        }

        @media (max-width: 680px) {
          .admin-shell {
            padding: 10px;
          }

          .admin-header {
            padding: 14px;
            border-radius: 16px;
          }

          .admin-brand {
            width: 100%;
            align-items: flex-start;
          }

          .admin-logo {
            width: min(220px, 72vw);
            height: 52px;
          }

          .admin-brand-text {
            display: none;
          }

          .admin-header-actions {
            display: grid;
            grid-template-columns: minmax(0, 1fr);
            width: 100%;
          }

          .admin-account {
            min-width: 0;
            margin: 0;
          }

          .admin-account strong {
            max-width: 100%;
          }

          .admin-header-actions .admin-btn {
            width: 100%;
          }

          .admin-summary-grid {
            grid-template-columns: 1fr 1fr;
            gap: 10px;
          }

          .admin-summary-card {
            padding: 15px;
          }

          .admin-section {
            padding: 15px;
            border-radius: 15px;
          }

          .admin-section-head {
            align-items: flex-start;
          }

          .admin-section-head > .admin-btn {
            width: 100%;
          }

          .admin-filter-row {
            overflow-x: auto;
            flex-wrap: nowrap;
            padding-bottom: 3px;
            scrollbar-width: none;
          }

          .admin-filter-row::-webkit-scrollbar {
            display: none;
          }

          .admin-filter {
            flex: 0 0 auto;
          }

          .admin-delivery-row {
            grid-template-columns: 1fr;
          }

          .admin-delivery-row .admin-btn {
            width: 100%;
          }

          .admin-status-row {
            align-items: stretch;
            flex-direction: column;
          }

          .admin-status-row select {
            width: 100%;
          }

          .admin-payment-row {
            align-items: stretch;
            flex-direction: column;
          }

          .admin-payment-box select {
            width: 100%;
          }

          .admin-alert {
            align-items: flex-start;
            flex-direction: column;
          }

          .admin-alert .admin-btn {
            width: 100%;
          }
        }

        @media (max-width: 430px) {
          .admin-summary-grid {
            grid-template-columns: 1fr;
          }

          .admin-logo {
            width: 200px;
          }

          .admin-order-card {
            padding: 14px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .admin-btn {
            transition: none;
          }
        }
      `}</style>

      <header className="admin-header">
        <div className="admin-brand">
          <img
            className="admin-logo"
            src="/nexsecond-logo.jpg"
            alt="NexSecond"
          />

          <div className="admin-brand-text">
            <strong>Admin</strong>
            <span>Operations dashboard</span>
          </div>
        </div>

        <div className="admin-header-actions">
          {user && (
            <div className="admin-account">
              <span>Signed in as</span>
              <strong>{user.email}</strong>
            </div>
          )}

          <button
            className="admin-btn"
            onClick={enableSound}
          >
            {soundEnabled ? '🔊 Sound Enabled' : '🔔 Enable Sound'}
          </button>

          <button
            className="admin-btn"
            onClick={fetchOrders}
          >
            Refresh Orders
          </button>
        </div>
      </header>

      {!user && (
        <div className="admin-card admin-login-card">
          <h2>Admin sign-in required</h2>
          <p>
            Sign in with the Google account that has Admin access to NexSecond.
          </p>

          <button
            className="admin-btn admin-btn--dark"
            onClick={signInWithGoogle}
          >
            Continue with Google
          </button>

          {errorMessage && (
            <p className="admin-error" style={{ marginTop: '16px' }}>
              {errorMessage}
            </p>
          )}
        </div>
      )}

      {newOrderAlert && (
        <div className="admin-alert">
          <span>🔔 New order received!</span>

          <button
            className="admin-btn"
            onClick={() => setNewOrderAlert(false)}
          >
            Dismiss
          </button>
        </div>
      )}

      {user && (
        <p className="admin-control-note" style={{ margin: '0 2px 16px' }}>
          Live order updates are enabled.
        </p>
      )}

      <div className="admin-summary-grid">
        <div className="admin-card admin-summary-card">
          <strong>Total Orders</strong>
          <h2>{totalOrders}</h2>
        </div>

        <div className="admin-card admin-summary-card">
          <strong>Pending</strong>
          <h2>{pendingOrders}</h2>
        </div>

        <div className="admin-card admin-summary-card">
          <strong>Out for Delivery</strong>
          <h2>{outForDeliveryOrders}</h2>
        </div>

        <div className="admin-card admin-summary-card">
          <strong>Today's Sales</strong>
          <h2>₹{todaySales}</h2>
        </div>
      </div>

      <section className="admin-card admin-section">
        <div className="admin-section-head">
          <div>
            <h2>Inventory</h2>
            <p>
              Restock products and control what customers can order.
            </p>
          </div>

          <button
            className="admin-btn"
            onClick={fetchProducts}
          >
            Refresh Inventory
          </button>
        </div>

        {productLoading ? (
          <p>Loading inventory...</p>
        ) : productError ? (
          <p className="admin-error">
            Inventory error: {productError}
          </p>
        ) : products.length === 0 ? (
          <p>No products found.</p>
        ) : (
          <div className="admin-inventory-grid">
            {products.map((product) => {
              const draft = productDrafts[product.id] || {}
              const stockValue =
                draft.stock_quantity ??
                product.stock_quantity ??
                0
              const availableValue =
                draft.is_available ??
                product.is_available ??
                false

              return (
                <div
                  key={product.id}
                  className="admin-product-card"
                >
                  <div className="admin-product-top">
                    <div>
                      <strong>
                        {product.emoji || '🛒'} {product.name}
                      </strong>

                      <div className="admin-product-meta">
                        {product.category || 'Uncategorized'} · ₹
                        {product.price}
                        {product.unit ? ` · ${product.unit}` : ''}
                      </div>
                    </div>

                    <span
                      className={`admin-pill ${
                        availableValue
                          ? 'admin-pill--available'
                          : 'admin-pill--hidden'
                      }`}
                    >
                      {availableValue ? 'Available' : 'Hidden'}
                    </span>
                  </div>

                  <div className="admin-product-controls">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      inputMode="numeric"
                      value={stockValue}
                      onChange={(e) =>
                        updateProductDraft(
                          product.id,
                          'stock_quantity',
                          e.target.value
                        )
                      }
                    />

                    <select
                      value={
                        availableValue
                          ? 'available'
                          : 'hidden'
                      }
                      onChange={(e) =>
                        updateProductDraft(
                          product.id,
                          'is_available',
                          e.target.value === 'available'
                        )
                      }
                    >
                      <option value="available">
                        Available
                      </option>
                      <option value="hidden">
                        Hidden
                      </option>
                    </select>

                    <button
                      className="admin-btn admin-btn--dark"
                      onClick={() =>
                        updateProductInventory(product)
                      }
                    >
                      Save Inventory
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {loading ? (
        <p>Loading orders...</p>
      ) : errorMessage ? (
        <p className="admin-error">
          Admin error: {errorMessage}
        </p>
      ) : orders.length === 0 ? (
        <div className="admin-card admin-section">
          <p style={{ margin: 0 }}>No orders found.</p>
        </div>
      ) : (
        <section className="admin-card admin-section">
          <div className="admin-section-head">
            <div>
              <h2>Orders</h2>
              <p>Manage status, delivery and payment.</p>
            </div>

            <button
              className="admin-btn"
              onClick={fetchOrders}
            >
              Refresh Orders
            </button>
          </div>

          <div className="admin-filter-row">
            {[
              ['all', 'All'],
              ['pending', 'Pending'],
              ['confirmed', 'Confirmed'],
              ['preparing', 'Preparing'],
              ['out_for_delivery', 'Out for Delivery'],
              ['delivered', 'Delivered'],
            ].map(([status, label]) => {
              const count =
                status === 'all'
                  ? orders.length
                  : orders.filter(
                      (order) => order.status === status
                    ).length

              return (
                <button
                  key={status}
                  className={`admin-filter ${
                    selectedStatus === status
                      ? 'admin-filter--active'
                      : ''
                  }`}
                  onClick={() =>
                    setSelectedStatus(status)
                  }
                >
                  {label} ({count})
                </button>
              )
            })}
          </div>

          <div className="admin-order-list">
            {orders
              .filter(
                (order) =>
                  selectedStatus === 'all' ||
                  order.status === selectedStatus
              )
              .map((order) => {
                const draft =
                  deliveryDrafts[order.id] || {}

                const partnerName =
                  draft.name ??
                  order.delivery_partner_name ??
                  ''

                const partnerPhone =
                  draft.phone ??
                  order.delivery_partner_phone ??
                  ''

                return (
                  <article
                    key={order.id}
                    className="admin-order-card"
                  >
                    <h3 className="admin-order-title">
                      {order.order_id}
                    </h3>

                    <div className="admin-order-info">
                      <div>
                        <strong>Customer:</strong>{' '}
                        {order.customer_name}
                      </div>

                      <div>
                        <strong>Phone:</strong>{' '}
                        {order.customer_phone}
                      </div>

                      <div>
                        <strong>Address:</strong>{' '}
                        {order.delivery_address}
                      </div>
                    </div>

                    <button
                      className="admin-btn"
                      onClick={() => {
                        const address =
                          order.delivery_address || ''

                        if (!address.trim()) {
                          alert(
                            'Delivery address is not available.'
                          )
                          return
                        }

                        const latitude = Number(
                          order.latitude
                        )
                        const longitude = Number(
                          order.longitude
                        )

                        const hasCoordinates =
                          Number.isFinite(latitude) &&
                          Number.isFinite(longitude)

                        const mapsQuery =
                          hasCoordinates
                            ? `${latitude},${longitude}`
                            : address

                        const mapsUrl =
                          `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                            mapsQuery
                          )}`

                        window.open(
                          mapsUrl,
                          '_blank'
                        )
                      }}
                      style={{ marginTop: '8px' }}
                    >
                      📍 Open in Google Maps
                    </button>

                    <div className="admin-items">
                      <strong>Items</strong>

                      {order.items?.map(
                        (item, index) => (
                          <div
                            key={index}
                            style={{
                              marginTop: '5px',
                              display: 'flex',
                              justifyContent:
                                'space-between',
                              gap: '12px',
                              flexWrap: 'wrap',
                            }}
                          >
                            <span>
                              {item.name} ×{' '}
                              {item.quantity}
                            </span>

                            <strong>
                              ₹{item.total_price}
                            </strong>
                          </div>
                        )
                      )}
                    </div>

                    <div className="admin-status-row">
                      <strong>Status:</strong>

                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          minHeight: '30px',
                          padding: '6px 12px',
                          borderRadius: '20px',
                          fontWeight: '700',
                          background:
                            order.status === 'pending'
                              ? '#fff3cd'
                              : order.status ===
                                'confirmed'
                              ? '#dbeafe'
                              : order.status ===
                                'preparing'
                              ? '#ede9fe'
                              : order.status ===
                                'out_for_delivery'
                              ? '#ffedd5'
                              : '#dcfce7',
                          color:
                            order.status === 'pending'
                              ? '#856404'
                              : order.status ===
                                'confirmed'
                              ? '#1d4ed8'
                              : order.status ===
                                'preparing'
                              ? '#6d28d9'
                              : order.status ===
                                'out_for_delivery'
                              ? '#c2410c'
                              : '#166534',
                        }}
                      >
                        {order.status ===
                        'out_for_delivery'
                          ? 'Out for Delivery'
                          : order.status
                              .charAt(0)
                              .toUpperCase() +
                            order.status.slice(1)}
                      </span>

                      <select
                        value={order.status}
                        onChange={(e) =>
                          updateOrderStatus(
                            order.id,
                            e.target.value
                          )
                        }
                      >
                        <option value="pending">
                          Pending
                        </option>
                        <option value="confirmed">
                          Confirmed
                        </option>
                        <option value="preparing">
                          Preparing
                        </option>
                        <option value="out_for_delivery">
                          Out for Delivery
                        </option>
                        <option value="delivered">
                          Delivered
                        </option>
                      </select>
                    </div>

                    <div className="admin-delivery-box">
                      <strong>
                        Delivery Partner
                      </strong>

                      <div className="admin-delivery-row">
                        <input
                          type="text"
                          placeholder="Partner name"
                          value={partnerName}
                          onFocus={() => {
                            isEditingDeliveryRef.current =
                              true
                          }}
                          onBlur={() => {
                            isEditingDeliveryRef.current =
                              false
                          }}
                          onChange={(e) =>
                            updateDeliveryDraft(
                              order.id,
                              'name',
                              e.target.value
                            )
                          }
                        />

                        <input
                          type="tel"
                          inputMode="numeric"
                          placeholder="Partner phone"
                          value={partnerPhone}
                          onFocus={() => {
                            isEditingDeliveryRef.current =
                              true
                          }}
                          onBlur={() => {
                            isEditingDeliveryRef.current =
                              false
                          }}
                          onChange={(e) =>
                            updateDeliveryDraft(
                              order.id,
                              'phone',
                              e.target.value
                            )
                          }
                        />

                        <button
                          className="admin-btn"
                          onClick={() =>
                            assignDeliveryPartner(order)
                          }
                        >
                          Save
                        </button>
                      </div>
                    </div>

                    <p style={{ margin: '14px 0 0' }}>
                      <strong>Total:</strong> ₹
                      {order.total_amount}
                    </p>

                    <div className="admin-payment-box">
                      <div className="admin-payment-row">
                        <div>
                          <strong>Payment</strong>
                          <div
                            style={{
                              marginTop: '4px',
                            }}
                          >
                            {order.payment_method ===
                            'cash_on_delivery'
                              ? '💵 Cash on Delivery (COD)'
                              : order.payment_method ||
                                'Not specified'}
                          </div>
                        </div>

                        <select
                          value={
                            order.payment_status ||
                            'pending'
                          }
                          onChange={(e) =>
                            updatePaymentStatus(
                              order.id,
                              e.target.value
                            )
                          }
                        >
                          <option value="pending">
                            Pending
                          </option>
                          <option value="paid">
                            Paid
                          </option>
                          <option value="failed">
                            Failed
                          </option>
                          <option value="refunded">
                            Refunded
                          </option>
                        </select>
                      </div>
                    </div>

                    <p className="admin-created">
                      <strong>Created:</strong>{' '}
                      {new Date(
                        order.created_at
                      ).toLocaleString('en-IN', {
                        timeZone:
                          'Asia/Kolkata',
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true,
                      })}
                    </p>
                  </article>
                )
              })}
          </div>
        </section>
      )}
    </div>
  )
}

export default Admin
