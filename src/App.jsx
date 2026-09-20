import { useEffect, useRef, useState } from 'react'
import './App.css'
import { supabase } from './supabase'

const slugify = (value) =>
  String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const getProductSlug = (product) =>
  product?.slug || slugify(product?.name) || String(product?.id || '')

const getProductDescription = (product) => {
  if (product?.description) return product.description
  const bits = [product?.name, product?.unit].filter(Boolean)
  return bits.length
    ? `${bits.join(' ')} available from NexSecond for convenient local delivery.`
    : 'Everyday essential available from NexSecond.'
}

const setMetaTag = (attribute, value, content) => {
  if (!content) return
  let tag = document.head.querySelector(`meta[${attribute}="${value}"]`)
  if (!tag) {
    tag = document.createElement('meta')
    tag.setAttribute(attribute, value)
    document.head.appendChild(tag)
  }
  tag.setAttribute('content', content)
}

const setCanonical = (url) => {
  let link = document.head.querySelector('link[rel="canonical"]')
  if (!link) {
    link = document.createElement('link')
    link.setAttribute('rel', 'canonical')
    document.head.appendChild(link)
  }
  link.setAttribute('href', url)
}

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
  const [deliveryServiceability, setDeliveryServiceability] = useState(null)
  const [deliveryServiceabilityLoading, setDeliveryServiceabilityLoading] = useState(false)

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

  const checkDeliveryServiceability = async (latitude, longitude, showResult = false) => {
    if (latitude == null || longitude == null) {
      setDeliveryServiceability(null)
      return null
    }

    setDeliveryServiceabilityLoading(true)

    const { data, error } = await supabase.rpc('check_nexsecond_delivery_area', {
      p_latitude: latitude,
      p_longitude: longitude,
    })

    setDeliveryServiceabilityLoading(false)

    if (error) {
      console.error('Delivery area check error:', error)
      setDeliveryServiceability(null)
      if (showResult) {
        showNotification('We could not verify your delivery area. Please try again.')
      }
      return null
    }

    setDeliveryServiceability(data || null)

    if (showResult) {
      if (data?.is_serviceable) {
        showNotification('Great — NexSecond delivers to your location ✓')
      } else {
        showNotification('NexSecond is not delivering to this location yet.')
      }
    }

    return data || null
  }

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
      checkDeliveryServiceability(latitude, longitude, false)

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
    if (userLatitude == null || userLongitude == null) return
    checkDeliveryServiceability(userLatitude, userLongitude, false)
  }, [userLatitude, userLongitude])

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
  const [otpSent, setOtpSent] = useState(false)
  const [otpCooldown, setOtpCooldown] = useState(0)
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState('')
  const [isPlacingOrder, setIsPlacingOrder] = useState(false)
  const [checkoutQuote, setCheckoutQuote] = useState(null)
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [launchPromotion, setLaunchPromotion] = useState(null)
  const [launchPromotionLoading, setLaunchPromotionLoading] = useState(true)

  useEffect(() => {
    if (otpCooldown <= 0) return

    const timer = setInterval(() => {
      setOtpCooldown((current) => {
        if (current <= 1) {
          clearInterval(timer)
          return 0
        }
        return current - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [otpCooldown])

  const signInWithGoogle = async () => {
    setAuthError('')
    setAuthLoading(true)

    const redirectTo = `${window.location.origin}/`

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
      },
    })

    if (error) {
      console.error('Google login error:', error)
      setAuthError(error.message)
      setAuthLoading(false)
    }
  }

  const sendOtp = async () => {
    const email = loginEmail.trim().toLowerCase()

    if (!email) {
      setAuthError('Please enter your email.')
      return
    }

    if (otpCooldown > 0 || authLoading) return

    setAuthError('')
    setAuthLoading(true)

    const { error } = await supabase.auth.signInWithOtp({
      email,
    })

    if (error) {
      console.error('OTP error:', error)
      setAuthError(error.message)
      setAuthLoading(false)
      return
    }

    setOtpSent(true)
    setLoginOtp('')
    setOtpCooldown(60)
    setAuthLoading(false)
    showNotification('OTP sent. Check your email ✉️')
  }

  const verifyOtp = async () => {
    const email = loginEmail.trim().toLowerCase()
    const token = loginOtp.trim()

    if (!email) {
      setAuthError('Please enter your email.')
      return
    }

    if (!/^\d{6}$/.test(token)) {
      setAuthError('Please enter the 6-digit OTP.')
      return
    }

    setAuthError('')
    setAuthLoading(true)

    const { error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email',
    })

    if (error) {
      console.error('OTP verification error:', error)
      setAuthError(error.message)
      setAuthLoading(false)
      return
    }

    // onAuthStateChange will close the modal and update user state.
    setAuthLoading(false)
  }

  const resetLoginForm = () => {
    setLoginEmail('')
    setLoginOtp('')
    setOtpSent(false)
    setAuthError('')
    setAuthLoading(false)
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

  const fetchLaunchPromotion = async () => {
    setLaunchPromotionLoading(true)

    const { data, error } = await supabase.rpc('get_launch_promotion')

    if (error) {
      console.error('Launch promotion error:', error)
      setLaunchPromotion(null)
    } else {
      setLaunchPromotion(data || null)
    }

    setLaunchPromotionLoading(false)
  }

  useEffect(() => {
    fetchLaunchPromotion()

    const interval = setInterval(() => {
      fetchLaunchPromotion()
    }, 30000)

    return () => clearInterval(interval)
  }, [])

  const openProduct = (product) => {
    setSelectedProduct(product)
    const slug = getProductSlug(product)
    const nextUrl = `${window.location.pathname}?product=${encodeURIComponent(slug)}`
    window.history.pushState({ product: slug }, '', nextUrl)
  }

  const closeProduct = () => {
    setSelectedProduct(null)
    window.history.pushState({}, '', window.location.pathname)
  }

  useEffect(() => {
    const syncProductFromUrl = () => {
      const slug = new URLSearchParams(window.location.search).get('product')
      if (!slug || products.length === 0) {
        setSelectedProduct(null)
        return
      }

      const product = products.find((item) => getProductSlug(item) === slug)
      setSelectedProduct(product || null)
    }

    syncProductFromUrl()
    window.addEventListener('popstate', syncProductFromUrl)
    return () => window.removeEventListener('popstate', syncProductFromUrl)
  }, [products])

  useEffect(() => {
    const siteName = 'NexSecond'
    const baseTitle = 'NexSecond | Quick Delivery of Groceries & Daily Essentials'
    const baseDescription =
      'Shop groceries, snacks, drinks and everyday essentials with NexSecond. Simple local ordering and convenient delivery.'
    const productTitle = selectedProduct
      ? `${selectedProduct.name} | NexSecond`
      : baseTitle
    const description = selectedProduct
      ? getProductDescription(selectedProduct)
      : baseDescription
    const url = selectedProduct
      ? `${window.location.origin}${window.location.pathname}?product=${encodeURIComponent(getProductSlug(selectedProduct))}`
      : `${window.location.origin}${window.location.pathname}`

    document.title = productTitle
    setMetaTag('name', 'description', description)
    setMetaTag('name', 'robots', 'index,follow,max-image-preview:large')
    setMetaTag('property', 'og:site_name', siteName)
    setMetaTag('property', 'og:title', productTitle)
    setMetaTag('property', 'og:description', description)
    setMetaTag('property', 'og:url', url)
    setMetaTag('property', 'og:type', selectedProduct ? 'product' : 'website')
    setMetaTag('property', 'og:locale', 'en_IN')
    setMetaTag('name', 'twitter:card', 'summary_large_image')
    setMetaTag('name', 'twitter:title', productTitle)
    setMetaTag('name', 'twitter:description', description)

    let ogImage = document.head.querySelector('meta[data-nexsecond-og-image]')
    if (selectedProduct?.image_url) {
      if (!ogImage) {
        ogImage = document.createElement('meta')
        ogImage.setAttribute('property', 'og:image')
        ogImage.dataset.nexsecondOgImage = 'true'
        document.head.appendChild(ogImage)
      }
      ogImage.setAttribute('content', selectedProduct.image_url)

      let twitterImage = document.head.querySelector('meta[data-nexsecond-twitter-image]')
      if (!twitterImage) {
        twitterImage = document.createElement('meta')
        twitterImage.setAttribute('name', 'twitter:image')
        twitterImage.dataset.nexsecondTwitterImage = 'true'
        document.head.appendChild(twitterImage)
      }
      twitterImage.setAttribute('content', selectedProduct.image_url)
    } else {
      if (ogImage) ogImage.remove()
      const twitterImage = document.head.querySelector('meta[data-nexsecond-twitter-image]')
      if (twitterImage) twitterImage.remove()
    }

    setCanonical(url)

    const existingSchema = document.head.querySelector('script[data-nexsecond-schema]')
    if (existingSchema) existingSchema.remove()

    const schema = selectedProduct
      ? {
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'Product',
              name: selectedProduct.name,
              description,
              url,
              image: selectedProduct.image_url ? [selectedProduct.image_url] : undefined,
              category: selectedProduct.category || undefined,
              offers: {
                '@type': 'Offer',
                url,
                priceCurrency: 'INR',
                price: Number(selectedProduct.price || 0),
                availability:
                  Number(selectedProduct.stock_quantity || 0) > 0
                    ? 'https://schema.org/InStock'
                    : 'https://schema.org/OutOfStock',
                itemCondition: 'https://schema.org/NewCondition',
              },
            },
            {
              '@type': 'BreadcrumbList',
              itemListElement: [
                {
                  '@type': 'ListItem',
                  position: 1,
                  name: 'NexSecond',
                  item: `${window.location.origin}${window.location.pathname}`,
                },
                ...(selectedProduct.category
                  ? [{
                      '@type': 'ListItem',
                      position: 2,
                      name: selectedProduct.category,
                    }]
                  : []),
                {
                  '@type': 'ListItem',
                  position: selectedProduct.category ? 3 : 2,
                  name: selectedProduct.name,
                  item: url,
                },
              ],
            },
          ],
        }
      : {
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: siteName,
          url: `${window.location.origin}${window.location.pathname}`,
          description: baseDescription,
        }

    const cleanSchema = JSON.parse(JSON.stringify(schema))
    const script = document.createElement('script')
    script.type = 'application/ld+json'
    script.dataset.nexsecondSchema = 'true'
    script.textContent = JSON.stringify(cleanSchema)
    document.head.appendChild(script)

    return () => {
      const currentSchema = document.head.querySelector('script[data-nexsecond-schema]')
      if (currentSchema) currentSchema.remove()
    }
  }, [selectedProduct])


  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return
      setUser(session?.user ?? null)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return

      setUser(session?.user ?? null)

      if (event === 'SIGNED_IN') {
        setIsLoginOpen(false)
        setIsAccountOpen(false)
        resetLoginForm()
        showNotification('Welcome to NexSecond 👋')
      }

      if (event === 'SIGNED_OUT') {
        setOrderHistory([])
        setIsAccountOpen(false)
        setIsOrderHistoryOpen(false)
        resetLoginForm()
        showNotification('You have been logged out.')
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
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
    const searchText = search.trim().toLowerCase()
    const searchableText = [
      product.name,
      product.category,
      product.unit,
      product.brand,
      product.description,
      product.search_keywords,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    const matchesSearch = !searchText || searchableText.includes(searchText)

    const matchesCategory =
      selectedCategory === 'All' ||
      product.category === selectedCategory

    return matchesSearch && matchesCategory
  })

  const addToCart = (product) => {
    const stock = Number(product.stock_quantity ?? 0)
const price = Number(product.price ?? 0)

if (price <= 0) {
  showNotification(`${product.name} is currently unavailable.`)
  return
}

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

  const launchDiscountRate = Number(launchPromotion?.discount_rate ?? 0)
  const launchDiscountPercent = Math.round(launchDiscountRate * 100)
  const launchDiscountMin = Number(launchPromotion?.discount_min_subtotal ?? 0)
  const launchNextMilestone =
    launchPromotion?.milestones?.find(
      (milestone) => Number(milestone.order_number) === Number(launchPromotion?.next_milestone)
    ) || launchPromotion?.milestones?.[0] || null
  const launchNextMilestoneRate = Number(launchNextMilestone?.rate ?? 0)
  const launchNextMilestonePercent = Math.round(launchNextMilestoneRate * 100)
  const launchNextMilestoneCap = Number(launchNextMilestone?.max_discount ?? 0)
  const launchProgress = Math.min(100, Math.max(0, Number(launchPromotion?.progress_percent ?? 0)))
  const launchOrdersToNext = Math.max(0, Number(launchPromotion?.orders_to_next ?? 0))
  const launchCurrentOrders = Math.max(0, Number(launchPromotion?.current_orders ?? 0))
  const launchHasOffer =
    Boolean(launchPromotion?.is_active) &&
    launchDiscountPercent > 0 &&
    launchDiscountMin > 0

  const HANDLING_FEE = 3.20
  const FREE_DELIVERY_THRESHOLD = 169

  const discountAmount = Number(checkoutQuote?.discount_amount ?? 0)
  const quotedDeliveryFee = Number(checkoutQuote?.delivery_fee ?? (cartCount > 0 ? (cartTotal >= FREE_DELIVERY_THRESHOLD ? 0 : 20) : 0))
  const quotedHandlingFee = Number(checkoutQuote?.handling_fee ?? HANDLING_FEE)
  const quotedSubtotal = Number(checkoutQuote?.subtotal ?? cartTotal)
  const finalTotal = Number(
    checkoutQuote?.total_amount ??
      Math.max(quotedSubtotal - discountAmount + quotedHandlingFee + quotedDeliveryFee, 0)
  )

  useEffect(() => {
    let cancelled = false

    async function refreshCheckoutQuote() {
      if (cart.length === 0) {
        setCheckoutQuote(null)
        return
      }

      const items = cart.map((item) => ({
        product_id: item.id,
        quantity: item.quantity,
      }))

      const { data, error } = await supabase.rpc('get_checkout_quote', {
        p_items: items,
        p_latitude: userLatitude,
        p_longitude: userLongitude,
      })

      if (cancelled) return

      if (error) {
        console.error('Checkout quote error:', error)
        setCheckoutQuote(null)
        return
      }

      setCheckoutQuote(data || null)
    }

    refreshCheckoutQuote()

    return () => {
      cancelled = true
    }
  }, [cart, userLatitude, userLongitude])
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
                const { error } = await supabase.auth.signOut({ scope: 'global' })
                if (error) {
                  console.error('Logout error:', error)
                  showNotification(error.message)
                }
              }}
            >
              🚪 Logout
            </button>
          </div>
        )}

        <button
  className="login"
  onClick={async () => {
    if (!user) {
      setIsLoginOpen(true)
      return
    }
    setIsOrderHistoryOpen(true)
    fetchOrderHistory()
  }}
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
          onClick={async () => {
            if (!user) {
              setIsLoginOpen(true)
              return
            }
            setIsOrderHistoryOpen(true)
            fetchOrderHistory()
          }}
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

      {/* LAUNCH OFFER — quiet, useful, always visible without blocking the shop */}
      {!launchPromotionLoading && launchHasOffer && (
        <section className="launch-panel" aria-label="NexSecond launch offer">
          <div className="launch-offer">
            <div className="launch-offer-main">
              <span className="launch-eyebrow">NEXSECOND LAUNCH OFFER</span>

              <div className="launch-offer-copy">
                <strong>{launchDiscountPercent}% off</strong>
                <span>on orders above ₹{launchDiscountMin.toFixed(0)}</span>
              </div>

              <p>Applied automatically at checkout. No code needed.</p>
            </div>

            <button
              type="button"
              className="launch-shop-link"
              onClick={() =>
                document.querySelector('.products-section')
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
            >
              Shop the offer →
            </button>
          </div>

          {launchNextMilestone && launchPromotion?.next_milestone && (
            <div className="launch-milestone">
              <div className="launch-milestone-top">
                <div>
                  <span className="launch-milestone-label">NEXT COMMUNITY MILESTONE</span>
                  <strong>#{launchPromotion.next_milestone}</strong>
                </div>

                <div className="launch-milestone-reward">
                  <strong>{launchNextMilestonePercent}% off</strong>
                  <span>up to ₹{launchNextMilestoneCap.toFixed(0)}</span>
                </div>
              </div>

              <div
                className="launch-progress-track"
                role="progressbar"
                aria-label={`Progress toward milestone #${launchPromotion.next_milestone}`}
                aria-valuemin="0"
                aria-valuemax="100"
                aria-valuenow={launchProgress}
              >
                <span style={{ width: `${launchProgress}%` }} />
              </div>

              <div className="launch-milestone-bottom">
                <span>
                  {launchCurrentOrders} {launchCurrentOrders === 1 ? 'order' : 'orders'} reached
                </span>
                <strong>
                  {launchOrdersToNext > 0
                    ? `${launchOrdersToNext} to go`
                    : 'Milestone reached'}
                </strong>
              </div>
            </div>
          )}
        </section>
      )}

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
              <div
                className="product-card"
                key={product.id}
                role="button"
                tabIndex={0}
                onClick={() => openProduct(product)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    openProduct(product)
                  }
                }}
                aria-label={`View ${product.name}`}
              >
                <div className="product-image">
                  {product.image_url ? (
                    <img
                      src={product.image_url}
                      alt={`${product.name} - NexSecond`}
                      loading="lazy"
                    />
                  ) : (
                    product.emoji
                  )}
                </div>

                <p className="product-unit">{product.unit}</p>

                <h3>{product.name}</h3>

                <div className="product-bottom">
                  <strong>₹{product.price}</strong>

                  {quantity === 0 ? (
                    <button
                      onClick={(event) => {
                        event.stopPropagation()
                        addToCart(product)
                      }}
                    >
                      ADD
                    </button>
                  ) : (
                    <div className="quantity-control" onClick={(event) => event.stopPropagation()}>
                      <button onClick={() => decreaseQuantity(product.id)}>
                        −
                      </button>

                      <span>{quantity}</span>

                      <button onClick={() => addToCart(product)}>
                        +
                      </button>
                    </div>
                  )}
                </div>

                <span className="product-view-hint">View details →</span>
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

      {/* PRODUCT DETAIL */}
      {selectedProduct && (
        <div className="product-detail-overlay" onClick={closeProduct}>
          <div
            className="product-detail-panel"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="product-detail-close"
              onClick={closeProduct}
              aria-label="Close product details"
            >
              ✕
            </button>

            <div className="product-detail-media">
              {selectedProduct.image_url ? (
                <img
                  src={selectedProduct.image_url}
                  alt={`${selectedProduct.name} - NexSecond`}
                />
              ) : (
                <span>{selectedProduct.emoji || '🛍️'}</span>
              )}
            </div>

            <div className="product-detail-content">
              <p className="product-detail-category">
                {selectedProduct.category || 'Everyday Essential'}
              </p>
              <h2>{selectedProduct.name}</h2>
              <p className="product-detail-unit">{selectedProduct.unit}</p>
              <p className="product-detail-description">
                {getProductDescription(selectedProduct)}
              </p>

              <div className="product-detail-price-row">
                <div>
                  <strong>₹{selectedProduct.price}</strong>
                  <span>{Number(selectedProduct.stock_quantity || 0) > 0 ? 'In stock' : 'Out of stock'}</span>
                </div>
              </div>

              {Number(selectedProduct.stock_quantity || 0) > 0 ? (
                <div className="product-detail-actions">
                  <button
                    className="product-detail-add"
                    onClick={() => {
                      addToCart(selectedProduct)
                      showNotification(`${selectedProduct.name} added to cart 🛒`)
                    }}
                  >
                    Add to Cart · ₹{selectedProduct.price}
                  </button>
                  <button
                    className="product-detail-buy"
                    onClick={() => {
                      addToCart(selectedProduct)
                      closeProduct()
                      setIsCartOpen(true)
                    }}
                  >
                    Buy now →
                  </button>
                </div>
              ) : (
                <div className="product-detail-soldout">Currently unavailable. Please check back soon.</div>
              )}

              <div className="product-detail-trust">
                <span>⚡ Quick local delivery</span>
                <span>🔒 Secure account ordering</span>
                <span>📍 Delivery-area aware</span>
              </div>
            </div>
          </div>
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
                      {item.image_url ? (
                        <img src={item.image_url} alt="" loading="lazy" />
                      ) : (
                        item.emoji
                      )}
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
                  <strong>₹{quotedSubtotal.toFixed(2)}</strong>
                </div>

                <div className="price-row">
                  <span>Discount</span>
                  <strong>{discountAmount > 0 ? `−₹${discountAmount.toFixed(2)}` : '₹0.00'}</strong>
                </div>

                <div className="price-row">
                  <span>Handling charge</span>
                  <strong>₹{quotedHandlingFee.toFixed(2)}</strong>
                </div>

                <div className="price-row">
                  <span>Delivery fee</span>
                  <strong>{quotedDeliveryFee === 0 ? 'FREE' : `₹${quotedDeliveryFee.toFixed(2)}`}</strong>
                </div>

                <div className="price-row total-row">
                  <strong>Total</strong>
                  <strong>₹{finalTotal}</strong>
                </div>

                <button
                  className="checkout-btn"
                  onClick={async () => {
                    if (userLatitude == null || userLongitude == null) {
                      setIsCartOpen(false)
                      setIsLocationOpen(true)
                      showNotification('Set your exact location to check delivery availability.')
                      return
                    }

                    let serviceability = deliveryServiceability
                    if (!serviceability) {
                      serviceability = await checkDeliveryServiceability(
                        userLatitude,
                        userLongitude,
                        true
                      )
                    }

                    if (!serviceability?.is_serviceable) {
                      setIsCartOpen(false)
                      setIsLocationOpen(true)
                      return
                    }

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
                  setDeliveryServiceability(null)
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
                  setDeliveryServiceability(null)
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
                  setDeliveryServiceability(null)
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
                  marginTop: '10px',
                  fontSize: '13px',
                  fontWeight: '700',
                  color: deliveryServiceability?.is_serviceable ? '#0c831f' : '#9a3412',
                }}
              >
                {deliveryServiceabilityLoading
                  ? 'Checking delivery availability…'
                  : deliveryServiceability?.is_serviceable
                  ? '✓ Delivery available at this location'
                  : 'Set or verify your exact location to continue'}
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
                  <strong>₹{cartTotal.toFixed(2)}</strong>
                </div>

                <div>
                  <span>Discount</span>
                  <strong>{discountAmount > 0 ? `−₹${discountAmount.toFixed(2)}` : '₹0.00'}</strong>
                </div>

                <div>
                  <span>Handling charge</span>
                  <strong>₹{quotedHandlingFee.toFixed(2)}</strong>
                </div>

                <div>
                  <span>Delivery fee</span>
                  <strong>{quotedDeliveryFee === 0 ? 'FREE' : `₹${quotedDeliveryFee.toFixed(2)}`}</strong>
                </div>

                {quotedSubtotal < FREE_DELIVERY_THRESHOLD && cartCount > 0 && (
                  <div className="free-delivery-hint">
                    ₹{(FREE_DELIVERY_THRESHOLD - quotedSubtotal).toFixed(2)} more for FREE delivery
                  </div>
                )}

                {discountAmount > 0 && (
                  <div className="discount-hint">
                    🎉 Discount applied — you save ₹{discountAmount.toFixed(2)}
                  </div>
                )}

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

                  if (userLatitude == null || userLongitude == null) {
                    setCheckoutError('Please set your exact delivery location first.')
                    setIsLocationOpen(true)
                    return
                  }

                  if (!deliveryServiceability?.is_serviceable) {
                    const serviceability = await checkDeliveryServiceability(
                      userLatitude,
                      userLongitude,
                      false
                    )

                    if (!serviceability?.is_serviceable) {
                      setCheckoutError('NexSecond is not delivering to this location yet.')
                      return
                    }
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

                  fetchLaunchPromotion()

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
              onClick={() => {
                setIsLoginOpen(false)
                resetLoginForm()
              }}
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
              onChange={(e) => {
                setLoginEmail(e.target.value)
                setAuthError('')
              }}
              disabled={authLoading}
            />

            {otpSent && (
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="Enter 6-digit OTP"
                maxLength="6"
                value={loginOtp}
                onChange={(e) =>
                  setLoginOtp(e.target.value.replace(/\D/g, '').slice(0, 6))
                }
                disabled={authLoading}
              />
            )}

            {authError && <p className="login-error">{authError}</p>}

            <button
              className="login-submit"
              onClick={otpSent ? verifyOtp : sendOtp}
              disabled={authLoading || (!otpSent && otpCooldown > 0)}
            >
              {authLoading
                ? otpSent
                  ? 'Verifying…'
                  : 'Sending…'
                : otpSent
                  ? 'Verify OTP'
                  : otpCooldown > 0
                    ? `Code sent · ${otpCooldown}s`
                    : 'Send OTP'}
            </button>

            {otpSent && (
              <p style={{ marginTop: '10px', fontSize: '13px', color: '#666' }}>
                Check your email for the 6-digit code. Please allow a few seconds for delivery.
              </p>
            )}

            {otpSent && (
              <button
                style={{
                  width: '100%',
                  marginTop: '10px',
                  padding: '10px',
                  border: 'none',
                  background: 'transparent',
                  color: otpCooldown > 0 ? '#999' : '#111',
                  cursor: otpCooldown > 0 ? 'not-allowed' : 'pointer',
                  fontWeight: 600,
                }}
                className="otp-resend-button"
                onClick={sendOtp}
                disabled={authLoading || otpCooldown > 0}
                type="button"
              >
                {otpCooldown > 0 ? `Resend code in ${otpCooldown}s` : 'Resend code'}
              </button>
            )}

            <button
              className="google-login-button"
              onClick={signInWithGoogle}
              disabled={authLoading}
            >
              {authLoading ? 'Connecting…' : 'Continue with Google'}
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