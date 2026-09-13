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

  const today = new Date().toDateString()

  const todayOrders = orders.filter(
    (order) =>
      new Date(order.created_at).toDateString() ===
      today
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
    fetchOrders()

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

    // Fallback: keep the admin panel fresh if Realtime disconnects or is not enabled.
    const fallbackInterval = setInterval(() => {
      if (!isEditingDeliveryRef.current) fetchOrders()
    }, 3000)

    return () => {
      if (realtimeRefreshTimerRef.current) clearTimeout(realtimeRefreshTimerRef.current)
      clearInterval(fallbackInterval)
      supabase.removeChannel(channel)
    }
  }, [soundEnabled])

  return (
    <div
      style={{
        padding: '20px',
        fontFamily: 'Arial, sans-serif',
        background: '#f7f7f7',
        minHeight: '100vh',
        boxSizing: 'border-box',
      }}
    >
      <h1 style={{ marginBottom: '5px' }}>
        NexSecond Admin
      </h1>

      <p>Manage customer orders</p>

      {/* NEW ORDER ALERT */}
      {newOrderAlert && (
        <div
          style={{
            padding: '15px 18px',
            margin: '15px 0',
            borderRadius: '12px',
            background: '#dcfce7',
            border: '1px solid #86efac',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            flexWrap: 'wrap',
          }}
        >
          <span>🔔 New order received!</span>

          <button
            onClick={() => setNewOrderAlert(false)}
            style={{
              padding: '7px 12px',
              borderRadius: '7px',
              border: '1px solid #ccc',
              cursor: 'pointer',
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* SOUND CONTROL */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          margin: '15px 0',
          flexWrap: 'wrap',
        }}
      >
        <button
          onClick={enableSound}
          style={{
            padding: '10px 14px',
            borderRadius: '9px',
            border: '1px solid #ccc',
            cursor: 'pointer',
            fontWeight: '600',
          }}
        >
          {soundEnabled
            ? '🔊 Sound Enabled'
            : '🔔 Enable Sound'}
        </button>

        <span style={{ fontSize: '14px' }}>
          New-order sound
        </span>
      </div>

      {/* SUMMARY CARDS */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '15px',
          margin: '25px 0',
        }}
      >
        <div
          style={{
            background: '#fff',
            padding: '20px',
            borderRadius: '14px',
            boxShadow:
              '0 4px 12px rgba(0,0,0,0.06)',
          }}
        >
          <strong>Total Orders</strong>
          <h2>{totalOrders}</h2>
        </div>

        <div
          style={{
            background: '#fff',
            padding: '20px',
            borderRadius: '14px',
            boxShadow:
              '0 4px 12px rgba(0,0,0,0.06)',
          }}
        >
          <strong>Pending</strong>
          <h2>{pendingOrders}</h2>
        </div>

        <div
          style={{
            background: '#fff',
            padding: '20px',
            borderRadius: '14px',
            boxShadow:
              '0 4px 12px rgba(0,0,0,0.06)',
          }}
        >
          <strong>Out for Delivery</strong>
          <h2>{outForDeliveryOrders}</h2>
        </div>

        <div
          style={{
            background: '#fff',
            padding: '20px',
            borderRadius: '14px',
            boxShadow:
              '0 4px 12px rgba(0,0,0,0.06)',
          }}
        >
          <strong>Today's Sales</strong>
          <h2>₹{todaySales}</h2>
        </div>
      </div>

      {user && (
        <p>
          Logged in as:{' '}
          <strong>{user.email}</strong>
        </p>
      )}

      <button
        onClick={fetchOrders}
        style={{
          padding: '10px 14px',
          borderRadius: '9px',
          border: '1px solid #ccc',
          cursor: 'pointer',
        }}
      >
        Refresh Orders
      </button>

      {loading ? (
        <p>Loading orders...</p>
      ) : errorMessage ? (
        <p style={{ color: 'red' }}>
          Admin error: {errorMessage}
        </p>
      ) : orders.length === 0 ? (
        <p>No orders found.</p>
      ) : (
        <div>
          {/* STATUS FILTERS */}
          <div
            style={{
              display: 'flex',
              gap: '10px',
              flexWrap: 'wrap',
              margin: '25px 0',
            }}
          >
            {[
              ['all', 'All'],
              ['pending', 'Pending'],
              ['confirmed', 'Confirmed'],
              ['preparing', 'Preparing'],
              [
                'out_for_delivery',
                'Out for Delivery',
              ],
              ['delivered', 'Delivered'],
            ].map(([status, label]) => {
              const count =
                status === 'all'
                  ? orders.length
                  : orders.filter(
                      (order) =>
                        order.status === status
                    ).length

              return (
                <button
                  key={status}
                  onClick={() =>
                    setSelectedStatus(status)
                  }
                  style={{
                    padding: '10px 16px',
                    borderRadius: '10px',
                    border: '1px solid #ddd',
                    cursor: 'pointer',
                    fontWeight:
                      selectedStatus === status
                        ? '700'
                        : '500',
                    background:
                      selectedStatus === status
                        ? '#111'
                        : '#fff',
                    color:
                      selectedStatus === status
                        ? '#fff'
                        : '#111',
                  }}
                >
                  {label} ({count})
                </button>
              )
            })}
          </div>

          {/* ORDERS */}
          <div style={{ marginTop: '30px' }}>
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
                  <div
                    key={order.id}
                    style={{
                      border: '1px solid #ddd',
                      borderRadius: '14px',
                      padding: '20px',
                      marginBottom: '15px',
                      boxShadow:
                        '0 4px 12px rgba(0,0,0,0.06)',
                      background: '#fff',
                    }}
                  >
                    <h3>
                      {order.order_id}
                    </h3>

                    <p>
                      <strong>Customer:</strong>{' '}
                      {order.customer_name}
                    </p>

                    <p>
                      <strong>Phone:</strong>{' '}
                      {order.customer_phone}
                    </p>

                    <p>
                      <strong>Address:</strong>{' '}
                      {order.delivery_address}
                    </p>
                    <div style={{ marginTop: '8px' }}>
  <button
    onClick={() => {
      const address = order.delivery_address || ''

      if (!address.trim()) {
        alert('Delivery address is not available.')
        return
      }

      const latitude = Number(order.latitude)
      const longitude = Number(order.longitude)
      const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude)
      const mapsQuery = hasCoordinates ? `${latitude},${longitude}` : address

      const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        mapsQuery
      )}`

      const mapsLink = document.createElement('a')
      mapsLink.href = mapsUrl
      mapsLink.target = '_blank'
      mapsLink.rel = 'noopener noreferrer'
      document.body.appendChild(mapsLink)
      mapsLink.click()
      document.body.removeChild(mapsLink)
    }}
    style={{
      padding: '8px 12px',
      borderRadius: '8px',
      border: '1px solid #ccc',
      cursor: 'pointer',
      fontWeight: '600',
    }}
  >
    📍 Open in Google Maps
  </button>
</div>

                    {/* ITEMS */}
                    <div
                      style={{
                        marginTop: '15px',
                      }}
                    >
                      <strong>Items:</strong>

                      {order.items?.map(
                        (item, index) => (
                          <div
                            key={index}
                            style={{
                              marginTop: '4px',
                            }}
                          >
                            {item.name} ×{' '}
                            {item.quantity} — ₹
                            {item.total_price}
                          </div>
                        )
                      )}
                    </div>

                    {/* STATUS */}
                    <div
                      style={{
                        marginTop: '15px',
                      }}
                    >
                      <strong>Status:</strong>{' '}

                      <span
                        style={{
                          display: 'inline-block',
                          padding: '6px 12px',
                          borderRadius: '20px',
                          fontWeight: '600',
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
                        style={{
                          marginLeft: '10px',
                          padding: '6px 10px',
                          borderRadius: '8px',
                          border: '1px solid #ddd',
                          maxWidth: '100%',
                        }}
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

                    {/* DELIVERY PARTNER */}
                    <div
                      style={{
                        marginTop: '18px',
                      }}
                    >
                      <strong>
                        Delivery Partner
                      </strong>

                      <div
                        style={{
                          display: 'flex',
                          gap: '8px',
                          flexWrap: 'wrap',
                          marginTop: '8px',
                        }}
                      >
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
                          style={{
                            flex: '1 1 180px',
                            minWidth: '0',
                            padding: '9px',
                            boxSizing:
                              'border-box',
                          }}
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
                          style={{
                            flex: '1 1 180px',
                            minWidth: '0',
                            padding: '9px',
                            boxSizing:
                              'border-box',
                          }}
                        />

                        <button
                          onClick={() =>
                            assignDeliveryPartner(
                              order
                            )
                          }
                          style={{
                            padding: '9px 14px',
                            borderRadius: '8px',
                            border:
                              '1px solid #ccc',
                            cursor: 'pointer',
                          }}
                        >
                          Save
                        </button>
                      </div>
                    </div>

                    <p>
                      <strong>Total:</strong> ₹
                      {order.total_amount}
                    </p>

                    <p>
                      <strong>Payment:</strong>{' '}
                      {order.payment_method === 'cash_on_delivery'
                        ? '💵 Cash on Delivery (COD)'
                        : order.payment_method}
                    </p>

                    <p>
                      <strong>Created:</strong>{' '}
                      {new Date(
                        order.created_at
                      ).toLocaleString()}
                    </p>
                  </div>
                )
              })}
          </div>
        </div>
      )}
    </div>
  )
}

export default Admin