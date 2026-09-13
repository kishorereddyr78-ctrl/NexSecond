import { useEffect, useRef, useState } from 'react'
import './App.css'
import { supabase } from './supabase'

function App() {
  const [products, setProducts] = useState([])
  const [cart, setCart] = useState([])
  const [search, setSearch] = useState('')
  const [location, setLocation] = useState(
    localStorage.getItem('nexsecond_location') || 'Select your location'
  )
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [isLocationOpen, setIsLocationOpen] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false)
  const [isOrderConfirmed, setIsOrderConfirmed] = useState(false)
  const [lastOrderTotal, setLastOrderTotal] = useState(0)
  const [lastOrderId, setLastOrderId] = useState('')
  const [lastOrderStatus, setLastOrderStatus] = useState('pending')
  const [customerName, setCustomerName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [checkoutError, setCheckoutError] = useState('')
  const [notification, setNotification] = useState('')
  const notificationTimerRef = useRef(null)
  const [showLocationPermissionPrompt, setShowLocationPermissionPrompt] = useState(false)
  const [locationAccuracy, setLocationAccuracy] = useState(
    localStorage.getItem('nexsecond_location_accuracy')
      ? Number(localStorage.getItem('nexsecond_location_accuracy'))
      : null
  )
  const [isDetectingLocation, setIsDetectingLocation] = useState(false)

  const showNotification = (message) => {
    setNotification(message)

    if (notificationTimerRef.current) {
      clearTimeout(notificationTimerRef.current)
    }

    notificationTimerRef.current = setTimeout(() => {
      setNotification('')
      notificationTimerRef.current = null
    }, 3000)
  }

  useEffect(() => {
    return () => {
      if (notificationTimerRef.current) {
        clearTimeout(notificationTimerRef.current)
      }
    }
  }, [])

  const [user, setUser] = useState(null)

  const [userLatitude, setUserLatitude] = useState(
    localStorage.getItem('nexsecond_latitude')
      ? Number(localStorage.getItem('nexsecond_latitude'))
      : null
  )

  const [userLongitude, setUserLongitude] = useState(
    localStorage.getItem('nexsecond_longitude')
      ? Number(localStorage.getItem('nexsecond_longitude'))
      : null
  )

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      showNotification('Location is not supported by your browser.')
      return
    }

    setIsDetectingLocation(true)
    showNotification('Detecting your precise location… 📍')

    const handlePosition = (position) => {
      const { latitude, longitude, accuracy } = position.coords

      setUserLatitude(latitude)
      setUserLongitude(longitude)
      setLocationAccuracy(accuracy)

      localStorage.setItem('nexsecond_latitude', String(latitude))
      localStorage.setItem('nexsecond_longitude', String(longitude))
      localStorage.setItem('nexsecond_location_accuracy', String(accuracy))

      fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
        { headers: { Accept: 'application/json' } }
      )
        .then((res) => {
          if (!res.ok) throw new Error('Reverse geocoding failed')
          return res.json()
        })
        .then((data) => {
          const address = data.address || {}
          const area =
            address.suburb ||
            address.neighbourhood ||
            address.village ||
            address.town ||
            address.city_district ||
            address.city ||
            'Location detected 📍'

          setLocation(area)
          localStorage.setItem('nexsecond_location', area)
          localStorage.setItem('nexsecond_location_prompt_asked', 'true')
          setIsLocationOpen(false)
          setShowLocationPermissionPrompt(false)

          const accuracyText = Math.round(accuracy)
          showNotification(
            accuracy <= 100
              ? `Precise location detected (±${accuracyText} m) 📍`
              : `Location detected (±${accuracyText} m). You can retry for better accuracy.`
          )
        })
        .catch((error) => {
          console.error('Reverse geocoding error:', error)
          setLocation('Current location 📍')
          setIsLocationOpen(false)
          setShowLocationPermissionPrompt(false)
          showNotification(
            `Location captured (±${Math.round(accuracy)} m) 📍`
          )
        })
        .finally(() => setIsDetectingLocation(false))
    }

    const handleError = (error) => {
      console.error('Location error:', error)
      setIsDetectingLocation(false)

      const message =
        error.code === 1
          ? 'Location permission was denied. You can choose an area manually.'
          : error.code === 2
          ? 'Your location could not be determined. Please try again.'
          : 'Location detection timed out. Please try again.'

      showNotification(message)
    }

    navigator.geolocation.getCurrentPosition(
      handlePosition,
      handleError,
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    )
  }

  useEffect(() => {
    // Versioned permission state makes sure customers who tested an older
    // NexSecond build still see the new first-visit location experience.
    const permissionDecision = localStorage.getItem(
      'nexsecond_location_permission_v2'
    )

    if (!permissionDecision) {
      const timer = setTimeout(() => {
        setShowLocationPermissionPrompt(true)
      }, 700)

      return () => clearTimeout(timer)
    }
  }, [])

  const allowLocation = () => {
    localStorage.setItem(
      'nexsecond_location_permission_v2',
      'allowed'
    )
    setShowLocationPermissionPrompt(false)
    getCurrentLocation()
  }

  const denyLocation = () => {
    localStorage.setItem(
      'nexsecond_location_permission_v2',
      'denied'
    )
    setShowLocationPermissionPrompt(false)
    showNotification('You can choose your location anytime 📍')
  }

  const [isLoginOpen, setIsLoginOpen] = useState(false)
  const [isAccountOpen, setIsAccountOpen] = useState(false)
  const [orderHistory, setOrderHistory] = useState([])
  const [isOrderHistoryOpen, setIsOrderHistoryOpen] = useState(false)
  const [orderHistoryLoading, setOrderHistoryLoading] = useState(false)
  const [loginEmail, setLoginEmail] = useState('')
  const [loginOtp, setLoginOtp] = useState('')
  const [isPlacingOrder, setIsPlacingOrder] = useState(false)

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
    })

    if (error) {
      console.error('Google login error:', error)
      alert(error.message)
    }
  }

  const sendOtp = async () => {
    if (!loginEmail.trim()) {
      alert('Please enter your email.')
      return
    }

    const { error } = await supabase.auth.signInWithOtp({
      email: loginEmail.trim(),
    })

    if (error) {
      console.error('OTP error:', error)
      alert(error.message)
      return
    }

    alert('OTP sent! Enter the 6-digit code.')
  }

  const verifyOtp = async () => {
    if (!loginEmail.trim()) {
      alert('Please enter your email.')
      return
    }

    if (!loginOtp.trim()) {
      alert('Please enter the OTP.')
      return
    }

    const { error } = await supabase.auth.verifyOtp({
      email: loginEmail.trim(),
      token: loginOtp.trim(),
      type: 'email',
    })

    if (error) {
      console.error('OTP verification error:', error)
      alert(error.message)
      return
    }

    alert('Login successful! 🎉')
    setIsLoginOpen(false)
    setLoginOtp('')
  }

  async function fetchOrderHistory() {
    if (!user) {
      setOrderHistory([])
      return
    }

    setOrderHistoryLoading(true)

    const { data, error } = await supabase.rpc('get_my_orders')

    if (error) {
      console.error('Error fetching order history:', error)
      setOrderHistory([])
    } else {
      setOrderHistory(data || [])
    }

    setOrderHistoryLoading(false)
  }

  const categories = [
    { name: 'All', emoji: '✨' },
    { name: 'Vegetables', emoji: '🥬' },
    { name: 'Fruits', emoji: '🍎' },
    { name: 'Dairy', emoji: '🥛' },
    { name: 'Snacks', emoji: '🍪' },
    { name: 'Drinks', emoji: '🥤' },
    { name: 'Groceries', emoji: '🍚' },
  ]

  useEffect(() => {
    async function fetchProducts() {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('is_available', true)

      if (error) {
        console.error('Error fetching products:', error)
        return
      }

      setProducts(data)
      console.log('Products from Supabase:', data)
    }

    fetchProducts()
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (user) {
      fetchOrderHistory()
    } else {
      setOrderHistory([])
    }
  }, [user])

  useEffect(() => {
    if (!user || !isOrderHistoryOpen) {
      return
    }

    const interval = setInterval(() => {
      fetchOrderHistory()
    }, 10000)

    return () => clearInterval(interval)
  }, [user, isOrderHistoryOpen])

  const filteredProducts = products.filter((product) => {
    const matchesSearch = product.name
      .toLowerCase()
      .includes(search.toLowerCase())

    const matchesCategory =
      selectedCategory === 'All' ||
      product.category === selectedCategory

    return matchesSearch && matchesCategory
  })

  const addToCart = (product) => {
    const stock = Number(product.stock_quantity ?? 0)

    if (stock <= 0) {
      showNotification(`${product.name} is currently out of stock.`)
      return
    }

    setCart((currentCart) => {
      const existingProduct = currentCart.find(
        (item) => item.id === product.id
      )

      if (existingProduct) {
        if (existingProduct.quantity >= stock) {
          showNotification(`Only ${stock} available for ${product.name}.`)
          return currentCart
        }

        return currentCart.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      }

      return [...currentCart, { ...product, quantity: 1 }]
    })

    showNotification(`${product.name} added to cart 🛒`)
  }

  const decreaseQuantity = (productId) => {
    setCart((currentCart) =>
      currentCart
        .map((item) =>
          item.id === productId
            ? { ...item, quantity: item.quantity - 1 }
            : item
        )
        .filter((item) => item.quantity > 0)
    )
  }

  const getQuantity = (productId) => {
    const item = cart.find((item) => item.id === productId)
    return item ? item.quantity : 0
  }

  const cartCount = cart.reduce(
    (total, item) => total + item.quantity,
    0
  )

  const cartTotal = cart.reduce(
    (total, item) => total + item.price * item.quantity,
    0
  )

  const deliveryFee = cartCount > 0 ? 20 : 0
  const finalTotal = cartTotal + deliveryFee

  return (
    <div className="app">

      {/* NOTIFICATION */}
      {notification && (
        <div
          style={{
            position: 'fixed',
            top: '24px',
            right: '24px',
            zIndex: 9999,
            background: '#111',
            color: '#fff',
            padding: '14px 20px',
            borderRadius: '12px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.18)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '15px',
            fontWeight: '600',
          }}
        >
          <span
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              background: '#fff',
              color: '#111',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '14px',
              fontWeight: '800',
            }}
          >
            ✓
          </span>

          {notification}
        </div>
      )}

      {/* HEADER */}
      <header className="header">
        <div className="logo">NexSecond<span>.</span></div>

        <button
          className="location"
          onClick={() => setIsLocationOpen(true)}
        >
          📍
          <div>
            <small>Delivering to</small>
            <strong>{location}</strong>
          </div>
        </button>

        <div className="search-container">
          <span>🔍</span>

          <input
            className="search"
            type="text"
            placeholder="Search for groceries, snacks and more..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <button
          className="login"
          onClick={() => {
            if (user) {
              setIsAccountOpen(!isAccountOpen)
            } else {
              setIsLoginOpen(true)
            }
          }}
        >
          {user ? '👤 Account' : 'Login'}
        </button>

        {isAccountOpen && user && (
          <div className="account-menu">
            <p><strong>{user.email}</strong></p>

            <button
              onClick={() => {
                setIsAccountOpen(false)
                setIsOrderHistoryOpen(true)
              }}
            >
              📦 My Orders
            </button>

            <button
              onClick={async () => {
                await supabase.auth.signOut({ scope: 'local' })
                setIsAccountOpen(false)
              }}
            >
              🚪 Logout
            </button>
          </div>
        )}

        <button
          className="login"
          onClick={() => setIsOrderHistoryOpen(true)}
        >
          Orders
        </button>

        <button
          className="cart"
          onClick={() => setIsCartOpen(true)}
        >
          🛒 <span>Cart</span>
          <b>{cartCount}</b>
        </button>
      </header>

      <div className="mobile-actions">
        <button
          className="mobile-action"
          onClick={() => {
            if (user) {
              setIsAccountOpen((open) => !open)
            } else {
              setIsLoginOpen(true)
            }
          }}
        >
          <span>👤</span>
          <small>{user ? 'Account' : 'Login'}</small>
        </button>

        <button
          className="mobile-action"
          onClick={() => setIsOrderHistoryOpen(true)}
        >
          <span>📦</span>
          <small>Orders</small>
        </button>

        <button
          className="mobile-action"
          onClick={() => setIsLocationOpen(true)}
        >
          <span>📍</span>
          <small>Location</small>
        </button>

        <button
          className="mobile-action"
          onClick={() => setIsCartOpen(true)}
        >
          <span>🛒</span>
          <small>Cart ({cartCount})</small>
        </button>
      </div>

      {/* HERO */}
      <section className="hero-section">
        <div className="hero-content">
          <p className="tag">⚡ QUICK DELIVERY • EVERYDAY ESSENTIALS</p>

          <h1>
            Need it now?
            <br />
            Get it <span>NexSecond.</span>
          </h1>

          <p className="subtitle">
            Groceries, snacks and daily essentials delivered quickly
            and conveniently to your doorstep.
          </p>

          <button
            className="shop-btn"
            onClick={() =>
              document.querySelector('.products-section')
                ?.scrollIntoView({ behavior: 'smooth' })
            }
          >
            Shop now →
          </button>
        </div>

        <div className="hero-visual">
          <div className="delivery-badge">
            ⚡ <strong>Fast Delivery</strong>
            <span>Right to your door</span>
          </div>

          <div className="hero-emoji">🛍️</div>
        </div>
      </section>

      {/* BENEFITS */}
      <section className="benefits">
        <div>
          ⚡
          <span>
            <strong>Quick delivery</strong>
            <small>Get essentials faster</small>
          </span>
        </div>

        <div>
          🛍️
          <span>
            <strong>Everything nearby</strong>
            <small>All your daily needs</small>
          </span>
        </div>

        <div>
          💰
          <span>
            <strong>Fair pricing</strong>
            <small>No unnecessary surprises</small>
          </span>
        </div>

        <div>
          ❤️
          <span>
            <strong>Made for you</strong>
            <small>Simple and convenient</small>
          </span>
        </div>
      </section>

      {/* CATEGORIES */}
      <section className="section">
        <div className="section-heading">
          <div>
            <h2>Shop by category</h2>
            <p>Everything you need in one place</p>
          </div>

          <button
            className="view-all"
            onClick={() => setSelectedCategory('All')}
          >
            View all →
          </button>
        </div>

        <div className="categories">
          {categories.map((category) => (
            <button
              key={category.name}
              className={`category ${
                selectedCategory === category.name
                  ? 'active-category'
                  : ''
              }`}
              onClick={() => {
                setSelectedCategory(category.name)

                document.querySelector('.products-section')
                  ?.scrollIntoView({ behavior: 'smooth' })
              }}
            >
              <span className="category-emoji">
                {category.emoji}
              </span>

              <span>{category.name}</span>
            </button>
          ))}
        </div>
      </section>

      {/* PRODUCTS */}
      <section className="section products-section">
        <div className="section-heading">
          <div>
            <h2>
              {selectedCategory === 'All'
                ? 'Popular near you'
                : selectedCategory}
            </h2>

            <p>
              {selectedCategory === 'All'
                ? 'Customer favourites'
                : `Best ${selectedCategory.toLowerCase()} for you`}
            </p>
          </div>
        </div>

        <div className="products">
          {filteredProducts.map((product) => {
            const quantity = getQuantity(product.id)

            return (
              <div className="product-card" key={product.id}>
                <div className="product-image">
                  {product.emoji}
                </div>

                <p className="product-unit">{product.unit}</p>

                <h3>{product.name}</h3>

                <div className="product-bottom">
                  <strong>₹{product.price}</strong>

                  {quantity === 0 ? (
                    <button onClick={() => addToCart(product)}>
                      ADD
                    </button>
                  ) : (
                    <div className="quantity-control">
                      <button
                        onClick={() =>
                          decreaseQuantity(product.id)
                        }
                      >
                        −
                      </button>

                      <span>{quantity}</span>

                      <button
                        onClick={() => addToCart(product)}
                      >
                        +
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {filteredProducts.length === 0 && (
          <p className="no-results">
            No products found for "{search}"
          </p>
        )}
      </section>

      {/* BOTTOM CART SUMMARY */}
      {cartCount > 0 && (
        <div className="cart-summary">
          <div>
            <strong>
              {cartCount} item{cartCount > 1 ? 's' : ''}
            </strong>

            <span>₹{cartTotal}</span>
          </div>

          <button onClick={() => setIsCartOpen(true)}>
            View Cart →
          </button>
        </div>
      )}

      {/* CART PANEL */}
      {isCartOpen && (
        <div className="cart-overlay">
          <div className="cart-panel">

            <div className="cart-header">
              <div>
                <h2>Your Cart</h2>

                <p>
                  {cartCount} item{cartCount !== 1 ? 's' : ''}
                </p>
              </div>

              <button
                className="close-cart"
                onClick={() => setIsCartOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="cart-items">
              {cart.length === 0 ? (
                <div className="empty-cart">
                  <div>🛒</div>

                  <h3>Your cart is empty</h3>

                  <p>Add some products to get started.</p>
                </div>
              ) : (
                cart.map((item) => (
                  <div className="cart-item" key={item.id}>

                    <div className="cart-item-image">
                      {item.emoji}
                    </div>

                    <div className="cart-item-info">
                      <h3>{item.name}</h3>

                      <p>{item.unit}</p>

                      <strong>₹{item.price}</strong>
                    </div>

                    <div className="cart-item-actions">
                      <div className="quantity-control">

                        <button
                          onClick={() =>
                            decreaseQuantity(item.id)
                          }
                        >
                          −
                        </button>

                        <span>{item.quantity}</span>

                        <button
                          onClick={() => addToCart(item)}
                        >
                          +
                        </button>

                      </div>

                      <strong>
                        ₹{item.price * item.quantity}
                      </strong>
                    </div>

                  </div>
                ))
              )}
            </div>

            {cartCount > 0 && (
              <div className="cart-footer">

                <div className="price-row">
                  <span>Subtotal</span>
                  <strong>₹{cartTotal}</strong>
                </div>

                <div className="price-row">
                  <span>Delivery fee</span>
                  <strong>₹{deliveryFee}</strong>
                </div>

                <div className="price-row total-row">
                  <strong>Total</strong>
                  <strong>₹{finalTotal}</strong>
                </div>

                <button
                  className="checkout-btn"
                  onClick={() => {
                    setIsCartOpen(false)
                    setIsCheckoutOpen(true)
                  }}
                >
                  Proceed to Checkout →
                </button>

              </div>
            )}

          </div>
        </div>
      )}

      {showLocationPermissionPrompt && (
        <div className="location-permission-overlay">
          <div className="location-permission-card">
            <div className="location-permission-icon">📍</div>
            <span className="location-permission-tag">QUICKER DELIVERY</span>
            <h2>Allow NexSecond to use your location?</h2>
            <p>We use your location to help show the right delivery area and make checkout faster.</p>

            <div className="location-permission-benefits">
              <div>✓ Faster delivery area detection</div>
              <div>✓ Easier checkout</div>
              <div>✓ You stay in control of your location</div>
            </div>

            <button className="allow-location-btn" onClick={allowLocation} disabled={isDetectingLocation}>
              Allow location
            </button>

            <button className="deny-location-btn" onClick={denyLocation}>
              Not now
            </button>

            <small className="location-permission-note">You can change your location anytime.</small>
          </div>
        </div>
      )}

      {/* LOCATION POPUP */}
      {isLocationOpen && (
        <div className="location-overlay">
          <div className="location-panel">

            <div className="location-header">
              <div>
                <h2>Select your location</h2>
                <p>
                  Choose where you want your order delivered.
                </p>
              </div>

              <button
                className="close-location"
                onClick={() => setIsLocationOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="location-options">

              <button onClick={getCurrentLocation}>
                {isDetectingLocation ? '📍 Detecting precise location…' : '📍 Use my current location'}
              </button>

              <p className="location-label">
                AVAILABLE AREAS
              </p>

              <button
                onClick={() => {
                  setLocation('Harohalli')
                  localStorage.setItem('nexsecond_location', 'Harohalli')
                  localStorage.setItem('nexsecond_location_prompt_asked', 'true')
                  setIsLocationOpen(false)
                  showNotification('Delivering to Harohalli 📍')
                }}
              >
                Harohalli
              </button>

              <button
                onClick={() => {
                  setLocation('Kanakapura Road')
                  localStorage.setItem('nexsecond_location', 'Kanakapura Road')
                  localStorage.setItem('nexsecond_location_prompt_asked', 'true')
                  setIsLocationOpen(false)
                  showNotification('Delivering to Kanakapura Road 📍')
                }}
              >
                Kanakapura Road
              </button>

              <button
                onClick={() => {
                  setLocation('Bangalore')
                  localStorage.setItem('nexsecond_location', 'Bangalore')
                  localStorage.setItem('nexsecond_location_prompt_asked', 'true')
                  setIsLocationOpen(false)
                  showNotification('Delivering to Bangalore 📍')
                }}
              >
                Bangalore
              </button>

            </div>

          </div>
        </div>
      )}

      {/* CHECKOUT POPUP */}
      {isCheckoutOpen && (
        <div className="checkout-overlay">
          <div className="checkout-panel">

            <div className="checkout-header">
              <div>
                <h2>Checkout</h2>
                <p>Complete your delivery details</p>
              </div>

              <button
                className="close-checkout"
                onClick={() => setIsCheckoutOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="checkout-content">

              <h3>Delivery Details</h3>

              <input
                type="text"
                placeholder="Full name"
                value={customerName}
                onChange={(e) =>
                  setCustomerName(e.target.value)
                }
              />

              <input
                type="tel"
                placeholder="Phone number"
                value={phoneNumber}
                onChange={(e) =>
                  setPhoneNumber(e.target.value)
                }
              />

              <textarea
                placeholder="Enter your delivery address"
                rows="4"
                value={deliveryAddress}
                onChange={(e) =>
                  setDeliveryAddress(e.target.value)
                }
              ></textarea>

              <div className="checkout-location">
                📍 Delivering to:{' '}
                <strong>{location}</strong>
                {locationAccuracy && (
                  <small style={{ display: 'block', marginTop: '5px', opacity: 0.7 }}>
                    Location accuracy: ±{Math.round(locationAccuracy)} m
                  </small>
                )}
              </div>

              <div
                style={{
                  margin: '16px 0',
                  padding: '15px',
                  borderRadius: '14px',
                  border: '1px solid #e5e5e5',
                  background: '#fafafa',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                  }}
                >
                  <div>
                    <strong>Payment Method</strong>
                    <p style={{ margin: '5px 0 0', fontSize: '13px', color: '#666' }}>
                      Pay when your order is delivered.
                    </p>
                  </div>
                  <span style={{ fontSize: '22px' }}>💵</span>
                </div>
                <div
                  style={{
                    marginTop: '12px',
                    padding: '11px 12px',
                    borderRadius: '10px',
                    background: '#fff',
                    border: '1px solid #111',
                    fontWeight: '700',
                  }}
                >
                  ✓ Cash on Delivery (COD)
                </div>
              </div>

              <h3 className="order-summary-title">
                Order Summary
              </h3>

              <div className="checkout-summary">

                <div>
                  <span>Items ({cartCount})</span>
                  <strong>₹{cartTotal}</strong>
                </div>

                <div>
                  <span>Delivery fee</span>
                  <strong>₹{deliveryFee}</strong>
                </div>

                <div className="checkout-total">
                  <strong>Total</strong>
                  <strong>₹{finalTotal}</strong>
                </div>

              </div>

              {checkoutError && (
                <p className="checkout-error">
                  {checkoutError}
                </p>
              )}

              <button
                className="place-order-btn"
                disabled={isPlacingOrder}
                onClick={async () => {

                  if (isPlacingOrder) return

                  // A customer must be logged in before an order can be placed.
                  // Keep checkout open so their entered delivery details are not lost.
                  if (!user) {
                    setCheckoutError(
                      'Please login to your NexSecond account before placing an order.'
                    )
                    setIsLoginOpen(true)
                    return
                  }

                  if (
                    !customerName.trim() ||
                    !phoneNumber.trim() ||
                    !deliveryAddress.trim()
                  ) {
                    setCheckoutError(
                      "Please fill in all delivery details."
                    )
                    return
                  }

                  if (cart.length === 0) {
                    setCheckoutError(
                      "Your cart is empty."
                    )
                    return
                  }

                  setCheckoutError("")
                  setIsPlacingOrder(true)

                  const items = cart.map((item) => ({
                    product_id: item.id,
                    quantity: item.quantity
                  }))

                  const { data, error } =
                    await supabase.rpc(
                      'place_order_with_location',
                      {
                        p_customer_name: customerName,
                        p_phone: phoneNumber,
                        p_address: deliveryAddress,
                        p_items: items,
                        p_payment_method:
                          'cash_on_delivery',
                        p_latitude: userLatitude,
                        p_longitude: userLongitude
                      }
                    )

                  if (error) {
                    console.error(
                      'Order error:',
                      error
                    )

                    console.error(
                      'Order error code:',
                      error.code
                    )

                    console.error(
                      'Order error details:',
                      error.details
                    )

                    console.error(
                      'Order error hint:',
                      error.hint
                    )

                    console.error(
                      'Order error message:',
                      error.message
                    )

                    setCheckoutError(
                      error.message ||
                      'Something went wrong. Please try again.'
                    )

                    setIsPlacingOrder(false)
                    return
                  }

                  console.log(
                    'Order created:',
                    data
                  )

                  setIsPlacingOrder(false)

                  setLastOrderId(
                    data.order_id
                  )

                  setLastOrderStatus(
                    data.status || 'pending'
                  )

                  setLastOrderTotal(
                    data.total_amount
                  )

                  showNotification(
                    "Order placed successfully!"
                  )

                  setIsCheckoutOpen(false)
                  setIsCartOpen(false)
                  setCart([])
                  setIsOrderConfirmed(true)
                }}
              >
                {isPlacingOrder
                  ? 'Placing Order...'
                  : 'Place Order →'}
              </button>

            </div>

          </div>
        </div>
      )}

      {/* ORDER CONFIRMATION */}
      {isOrderConfirmed && (
        <div className="confirmation-overlay">

          <div className="confirmation-panel">

            <div className="success-icon">
              ✓
            </div>

            <h2>
              Order Confirmed, {customerName}! 🎉
            </h2>

            <p className="confirmation-message">
              Your order has been placed successfully.
              We'll start preparing it for delivery.
            </p>

            <div className="confirmation-details">

              <div>
                <span>Order ID</span>
                <strong>{lastOrderId}</strong>
              </div>

              <div>
                <span>Order status</span>
                <strong>{lastOrderStatus}</strong>
              </div>

              <div className="order-status-tracker">

                <div
                  className={
                    lastOrderStatus === 'pending'
                      ? 'status-step active'
                      : 'status-step'
                  }
                >
                  <span className="status-icon">
                    1
                  </span>
                  <p>Pending</p>
                </div>

                <div
                  className={
                    lastOrderStatus === 'confirmed'
                      ? 'status-step active'
                      : 'status-step'
                  }
                >
                  <span className="status-icon">
                    2
                  </span>
                  <p>Confirmed</p>
                </div>

                <div
                  className={
                    lastOrderStatus === 'preparing'
                      ? 'status-step active'
                      : 'status-step'
                  }
                >
                  <span className="status-icon">
                    3
                  </span>
                  <p>Preparing</p>
                </div>

                <div
                  className={
                    lastOrderStatus ===
                    'out_for_delivery'
                      ? 'status-step active'
                      : 'status-step'
                  }
                >
                  <span className="status-icon">
                    4
                  </span>
                  <p>Out for Delivery</p>
                </div>

                <div
                  className={
                    lastOrderStatus === 'delivered'
                      ? 'status-step active'
                      : 'status-step'
                  }
                >
                  <span className="status-icon">
                    5
                  </span>
                  <p>Delivered</p>
                </div>

              </div>

              <div>
                <span>Delivery address</span>
                <strong>{deliveryAddress}</strong>
              </div>

              <div>
                <span>Location detected</span>
                <strong>{location}</strong>
              </div>

              <div>
                <span>Payment method</span>
                <strong>💵 Cash on Delivery</strong>
              </div>

              <div>
                <span>Order total</span>
                <strong>
                  ₹{lastOrderTotal}
                </strong>
              </div>

            </div>

            <button
              className="continue-shopping-btn"
              onClick={() =>
                setIsOrderConfirmed(false)
              }
            >
              Continue Shopping
            </button>

          </div>

        </div>
      )}

      {/* ORDER HISTORY */}
      {isOrderHistoryOpen && (
        <div className="login-overlay">

          <div className="login-popup">

            <button
              className="login-close"
              onClick={() =>
                setIsOrderHistoryOpen(false)
              }
            >
              ✕
            </button>

            <h2>Your Orders 📦</h2>

            <p>
              Your recent NexSecond orders
            </p>

            {!user ? (
              <div>

                <p
                  style={{
                    marginTop: '25px'
                  }}
                >
                  Please login to view your order history.
                </p>

                <button
                  className="login-submit"
                  onClick={() => {
                    setIsOrderHistoryOpen(false)
                    setIsLoginOpen(true)
                  }}
                >
                  Login to Continue
                </button>

              </div>
            ) : orderHistoryLoading ? (
              <p
                style={{
                  marginTop: '25px'
                }}
              >
                Loading your orders...
              </p>
            ) : orderHistory.length === 0 ? (
              <p
                style={{
                  marginTop: '25px'
                }}
              >
                You haven't placed any orders yet.
              </p>
            ) : (
              <div className="order-history-list">

                {orderHistory.map((order) => (
                  <div
                    className="order-card"
                    key={order.order_id}
                  >

                    <div className="order-card-header">

                      <div>
                        <span className="order-label">
                          ORDER
                        </span>

                        <strong>
                          {order.order_id}
                        </strong>
                      </div>

                      <div className="customer-status">

                        <strong>
                          {order.status === 'pending'
                            ? '🕐 Pending'
                            : order.status === 'confirmed'
                            ? '✅ Confirmed'
                            : order.status === 'preparing'
                            ? '👨‍🍳 Preparing'
                            : order.status ===
                              'out_for_delivery'
                            ? '🚴 Out for Delivery'
                            : order.status ===
                              'delivered'
                            ? '🎉 Delivered'
                            : order.status}
                        </strong>

                      </div>

                    </div>

                    <div
                      style={{
                        marginTop: '18px',
                        marginBottom: '20px',
                        padding: '15px 10px',
                        borderRadius: '12px',
                        background: '#fff',
                        border: '1px solid #eee',
                      }}
                    >

                      <strong>
                        Order Status
                      </strong>

                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'center',
                          gap: '10px',
                          marginTop: '15px',
                          overflowX: 'hidden',
                          flexWrap: 'wrap',
                        }}
                      >

                        {[
                          ['pending', '1', 'Pending'],
                          ['confirmed', '2', 'Confirmed'],
                          ['preparing', '3', 'Preparing'],
                          [
                            'out_for_delivery',
                            '4',
                            'Out for Delivery'
                          ],
                          ['delivered', '5', 'Delivered'],
                        ].map(
                          ([
                            status,
                            number,
                            label
                          ]) => {

                            const statusOrder = {
                              pending: 1,
                              confirmed: 2,
                              preparing: 3,
                              out_for_delivery: 4,
                              delivered: 5,
                            }

                            const currentStep =
                              statusOrder[
                                order.status
                              ] || 1

                            const step =
                              statusOrder[
                                status
                              ]

                            const completed =
                              step <= currentStep

                            return (
                              <div
                                key={status}
                                style={{
                                  minWidth: '75px',
                                  textAlign: 'center',
                                  opacity:
                                    completed
                                      ? 1
                                      : 0.4,
                                }}
                              >

                                <div
                                  style={{
                                    width: '30px',
                                    height: '30px',
                                    borderRadius: '50%',
                                    margin:
                                      '0 auto 6px',
                                    display:
                                      'flex',
                                    alignItems:
                                      'center',
                                    justifyContent:
                                      'center',
                                    background:
                                      completed
                                        ? '#111'
                                        : '#ddd',
                                    color:
                                      completed
                                        ? '#fff'
                                        : '#666',
                                    fontWeight:
                                      '700',
                                  }}
                                >
                                  {number}
                                </div>

                                <small
                                  style={{
                                    fontWeight:
                                      status ===
                                      order.status
                                        ? '700'
                                        : '500',
                                  }}
                                >
                                  {label}
                                </small>

                              </div>
                            )
                          }
                        )}

                      </div>

                    </div>

                    <div className="order-items">

                      <h4>Items</h4>

                      {order.items?.map(
                        (item, index) => (
                          <div
                            className="order-item"
                            key={index}
                          >

                            <div>
                              <strong>
                                {item.name}
                              </strong>

                              <span>
                                Qty: {item.quantity}
                              </span>
                            </div>

                            <strong>
                              ₹{item.total_price}
                            </strong>

                          </div>
                        )
                      )}

                    </div>

                    {order.delivery_partner_name && (
                      <div
                        style={{
                          marginTop: '15px',
                          padding: '12px',
                          borderRadius: '10px',
                          background: '#f3f8f5',
                        }}
                      >

                        <strong>
                          🚴 Delivery Partner
                        </strong>

                        <p
                          style={{
                            margin:
                              '6px 0 0',
                          }}
                        >
                          {
                            order.delivery_partner_name
                          }
                        </p>

                        {order.delivery_partner_phone && (
                          <p
                            style={{
                              margin:
                                '4px 0 0',
                            }}
                          >
                            📞{' '}
                            {
                              order.delivery_partner_phone
                            }
                          </p>
                        )}

                      </div>
                    )}

                    <div className="order-total">
                      <span>Total</span>
                      <strong>
                        ₹{order.total_amount}
                      </strong>
                    </div>

                    <div className="order-date">
                      {new Date(
                        order.created_at
                      ).toLocaleString()}
                    </div>

                  </div>
                ))}

              </div>
            )}

          </div>

        </div>
      )}

      {/* LOGIN */}
      {isLoginOpen && (
        <div className="login-overlay">

          <div className="login-popup">

            <button
              className="login-close"
              onClick={() =>
                setIsLoginOpen(false)
              }
            >
              ✕
            </button>

            <h2>
              Welcome to NexSecond 👋
            </h2>

            <p>
              Login to continue
            </p>

            <input
              type="email"
              placeholder="Enter your email"
              value={loginEmail}
              onChange={(e) =>
                setLoginEmail(e.target.value)
              }
            />

            <input
              type="text"
              placeholder="Enter OTP"
              maxLength="6"
              value={loginOtp}
              onChange={(e) =>
                setLoginOtp(e.target.value)
              }
            />

            {loginOtp.trim() ? (
              <button
                className="login-submit"
                onClick={verifyOtp}
              >
                Verify OTP
              </button>
            ) : (
              <button
                className="login-submit"
                onClick={sendOtp}
              >
                Send OTP
              </button>
            )}

            <button
              className="google-login-button"
              onClick={signInWithGoogle}
            >
              Continue with Google
            </button>

            <p className="login-note">
              New to NexSecond? Create your account soon.
            </p>

          </div>

        </div>
      )}

    </div>
  )
}

export default App