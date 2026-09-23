import { useEffect, useRef, useState } from 'react'
import './App.css'
import { supabase } from './supabase'
import NexIcon from './NexIcons'

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
  const [showCheckoutLocationPrompt, setShowCheckoutLocationPrompt] = useState(false)
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

  const [deliveryServiceability, setDeliveryServiceability] = useState(null)
  const [deliveryServiceabilityLoading, setDeliveryServiceabilityLoading] = useState(false)

  const clearExactLocation = () => {
    setUserLatitude(null)
    setUserLongitude(null)
    setLocationAccuracy(null)
    setDeliveryServiceability(null)

    localStorage.removeItem('nexsecond_latitude')
    localStorage.removeItem('nexsecond_longitude')
    localStorage.removeItem('nexsecond_location_accuracy')
  }

  const checkDeliveryServiceability = async (latitude, longitude, showResult = false) => {
    if (latitude == null || longitude == null) {
      setDeliveryServiceability(null)
      if (showResult) {
        showNotification('Please set your exact location to check delivery availability.')
      }
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
      showNotification(
        data?.is_serviceable
          ? `Great — NexSecond delivers to ${data?.area_name || 'your location'} ✓`
          : 'NexSecond is not delivering to this location yet.'
      )
    }

    return data || null
  }

  const captureBestLivePosition = () =>
    new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve({ position: null, error: null })
        return
      }

      let bestPosition = null
      let watchId = null
      let finished = false

      const finish = (error = null) => {
        if (finished) return
        finished = true
        if (watchId != null) navigator.geolocation.clearWatch(watchId)
        resolve({ position: bestPosition, error })
      }

      const considerPosition = (position) => {
        if (
          !bestPosition ||
          position.coords.accuracy < bestPosition.coords.accuracy
        ) {
          bestPosition = position
        }

        // ~60 m is an excellent browser/device fix. Stop early when we reach it.
        if (position.coords.accuracy <= 60) finish()
      }

      const handleError = (error) => {
        // Keep any useful fix already received; otherwise return the error.
        finish(bestPosition ? null : error)
      }

      watchId = navigator.geolocation.watchPosition(
        considerPosition,
        handleError,
        {
          enableHighAccuracy: true,
          timeout: 12000,
          maximumAge: 0,
        }
      )

      // Give mobile GPS/Wi-Fi positioning a little time to improve beyond
      // the browser's first coarse fix, then keep the best reading we saw.
      window.setTimeout(() => finish(), 12000)
    })

  const refreshLiveLocationAndCheck = async (showResult = false) => {
    if (!navigator.geolocation) {
      setDeliveryServiceability(null)
      if (showResult) {
        showNotification('Location is not supported by your browser.')
      }
      return null
    }

    setDeliveryServiceabilityLoading(true)

    const { position, error } = await captureBestLivePosition()

    if (!position) {
      console.error('Live location check error:', error)
      setDeliveryServiceabilityLoading(false)
      setDeliveryServiceability(null)

      if (showResult) {
        const message =
          error?.code === 1
            ? 'Location permission was denied. Allow location to verify delivery.'
            : error?.code === 2
            ? 'Your current location could not be determined. Please try again.'
            : 'Live location could not be verified. Please try again.'
        showNotification(message)
      }

      return null
    }

    const { latitude, longitude, accuracy } = position.coords

    setUserLatitude(latitude)
    setUserLongitude(longitude)
    setLocationAccuracy(accuracy)

    localStorage.setItem('nexsecond_latitude', String(latitude))
    localStorage.setItem('nexsecond_longitude', String(longitude))
    localStorage.setItem('nexsecond_location_accuracy', String(accuracy))

    const serviceability = await checkDeliveryServiceability(
      latitude,
      longitude,
      false
    )

    setDeliveryServiceabilityLoading(false)

    if (showResult) {
      if (!serviceability?.is_serviceable) {
        showNotification('This exact location is outside the NexSecond delivery boundary.')
      } else if (accuracy <= 100) {
        showNotification(`Precise location verified (±${Math.round(accuracy)} m) 📍`)
      } else {
        showNotification(
          `Location found (±${Math.round(accuracy)} m). Tap again for better GPS accuracy.`
        )
      }
    }

    return {
      latitude,
      longitude,
      accuracy,
      serviceability,
    }
  }

  const getCurrentLocation = async () => {
    if (!navigator.geolocation) {
      showNotification('Location is not supported by your browser.')
      return null
    }

    setIsDetectingLocation(true)
    showNotification('Finding your most accurate current location… 📍')

    const liveLocation = await refreshLiveLocationAndCheck(false)

    if (!liveLocation) {
      setIsDetectingLocation(false)
      return null
    }

    const { latitude, longitude, accuracy, serviceability } = liveLocation

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
        { headers: { Accept: 'application/json' } }
      )

      if (!response.ok) throw new Error('Reverse geocoding failed')

      const data = await response.json()
      const address = data.address || {}
      const area =
        address.suburb ||
        address.neighbourhood ||
        address.village ||
        address.town ||
        address.city_district ||
        address.city ||
        'Current location 📍'

      setLocation(area)
      localStorage.setItem('nexsecond_location', area)
      localStorage.setItem('nexsecond_location_prompt_asked', 'true')
    } catch (error) {
      console.error('Reverse geocoding error:', error)
      setLocation('Current location 📍')
    }

    setShowLocationPermissionPrompt(false)
    setIsDetectingLocation(false)

    if (serviceability?.is_serviceable && accuracy <= 100) {
      setIsLocationOpen(false)
      showNotification(`Precise location verified (±${Math.round(accuracy)} m) 📍`)
    } else if (serviceability?.is_serviceable) {
      setIsLocationOpen(true)
      showNotification(
        `Location found (±${Math.round(accuracy)} m). For reliable boundary verification, tap current location again.`
      )
    } else {
      setIsLocationOpen(true)
      showNotification(
        'Location detected, but NexSecond does not deliver to this exact location yet.'
      )
    }

    return liveLocation
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
  const [otpSent, setOtpSent] = useState(false)
  const [otpCooldown, setOtpCooldown] = useState(0)
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState('')
  const [isPlacingOrder, setIsPlacingOrder] = useState(false)
  const [checkoutQuote, setCheckoutQuote] = useState(null)
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [launchPromotion, setLaunchPromotion] = useState(null)
  const [launchPromotionLoading, setLaunchPromotionLoading] = useState(true)
  const launchPromotionRef = useRef(null)

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

  const fetchLaunchPromotion = async (showLoading = false) => {
    if (showLoading) {
      setLaunchPromotionLoading(true)
    }

    try {
      const { data, error } = await supabase.rpc('get_launch_promotion')

      if (error) {
        console.error('Launch promotion error:', error)

        // Never blank the existing customer UI during a background refresh.
        if (!launchPromotionRef.current) {
          launchPromotionRef.current = null
          setLaunchPromotion(null)
        }

        return
      }

      const nextPromotion = data || null
      const currentPromotion = launchPromotionRef.current

      // Only update React state when the actual promotion data changed.
      // This keeps the 30-second sync completely silent to customers.
      if (
        JSON.stringify(nextPromotion) !==
        JSON.stringify(currentPromotion)
      ) {
        launchPromotionRef.current = nextPromotion
        setLaunchPromotion(nextPromotion)
      }
    } catch (error) {
      console.error('Launch promotion refresh failed:', error)

      // Preserve the last known customer-facing promotion.
      if (!launchPromotionRef.current) {
        launchPromotionRef.current = null
        setLaunchPromotion(null)
      }
    } finally {
      if (showLoading) {
        setLaunchPromotionLoading(false)
      }
    }
  }

  useEffect(() => {
    fetchLaunchPromotion(true)

    const interval = setInterval(() => {
      fetchLaunchPromotion(false)
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

  const quotedDeliveryFee =
    checkoutQuote != null
      ? Number(checkoutQuote.delivery_fee ?? 0)
      : null

  const quotedDeliveryFeeBeforeDiscount =
    checkoutQuote != null
      ? Number(
          checkoutQuote.delivery_fee_before_discount ??
            quotedDeliveryFee ??
            0
        )
      : null

  const deliveryDiscountAmount = Math.max(
    0,
    Number(quotedDeliveryFeeBeforeDiscount ?? 0) -
      Number(quotedDeliveryFee ?? 0)
  )

  const totalSavings =
    Math.max(0, discountAmount) + deliveryDiscountAmount

  const quotedHandlingFee =
    checkoutQuote != null
      ? Number(checkoutQuote.handling_fee ?? HANDLING_FEE)
      : HANDLING_FEE

  const quotedSubtotal =
    checkoutQuote != null
      ? Number(checkoutQuote.subtotal ?? cartTotal)
      : cartTotal

  const hasCheckoutBenefit =
    discountAmount > 0 ||
    deliveryDiscountAmount > 0 ||
    quotedSubtotal >= FREE_DELIVERY_THRESHOLD

  const checkoutBenefitTitle =
    discountAmount > 0 && deliveryDiscountAmount > 0
      ? `${checkoutQuote?.promotion || 'Offer applied'} + FREE DELIVERY`
      : discountAmount > 0
      ? checkoutQuote?.promotion || 'Offer applied'
      : 'FREE DELIVERY unlocked'

  const checkoutBenefitText =
    totalSavings > 0
      ? `You save ₹${totalSavings.toFixed(2)} in total`
      : 'Your order qualifies for free delivery'

  const finalTotal =
    checkoutQuote != null
      ? Number(
          checkoutQuote.total_amount ??
            Math.max(
              quotedSubtotal -
                discountAmount +
                quotedHandlingFee +
                Number(quotedDeliveryFee ?? 0),
              0
            )
        )
      : null

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
  }, [cart, userLatitude, userLongitude, isCheckoutOpen])

  // NEXSECOND MOTION SYSTEM
  // Uses viewport-aware reveals so movement happens when the customer reaches
  // a section, not as one long page-load animation. Dynamic product cards are
  // picked up through MutationObserver after Supabase finishes loading.
  useEffect(() => {
    const appRoot = document.querySelector('.app')
    if (!appRoot) return undefined

    const revealSelector = [
      '.launch-panel',
      '.section-heading',
      '.categories .category',
      '.products .product-card',
      '.benefits > div',
      '.site-footer-main > .footer-column',
      '.site-footer-bottom',
    ].join(',')

    const observed = new WeakSet()

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          entry.target.classList.add('ns-inview')
          observer.unobserve(entry.target)
        })
      },
      {
        threshold: 0.08,
        rootMargin: '0px 0px -8% 0px',
      }
    )

    const wireRevealTargets = () => {
      appRoot.querySelectorAll(revealSelector).forEach((element) => {
        if (observed.has(element)) return
        observed.add(element)

        const parent = element.parentElement
        const siblings = parent ? Array.from(parent.children) : []
        const index = siblings.indexOf(element)
        const cappedIndex = Math.max(0, Math.min(index, 7))
        element.style.setProperty('--ns-reveal-delay', `${cappedIndex * 55}ms`)
        element.classList.add('ns-reveal')
        observer.observe(element)
      })
    }

    wireRevealTargets()

    const mutationObserver = new MutationObserver(wireRevealTargets)
    mutationObserver.observe(appRoot, { childList: true, subtree: true })

    return () => {
      mutationObserver.disconnect()
      observer.disconnect()
    }
  }, [])

  // Header depth changes subtly as the customer scrolls.
  useEffect(() => {
    const header = document.querySelector('.header')
    if (!header) return undefined

    const updateHeader = () => {
      header.classList.toggle('is-scrolled', window.scrollY > 18)
    }

    updateHeader()
    window.addEventListener('scroll', updateHeader, { passive: true })

    return () => window.removeEventListener('scroll', updateHeader)
  }, [])

  // Cart badge gets a single physical response whenever quantity changes.
  useEffect(() => {
    const badge = document.querySelector('.cart b')
    if (!badge || cartCount <= 0) return

    badge.classList.remove('ns-cart-bump')
    void badge.offsetWidth
    badge.classList.add('ns-cart-bump')
  }, [cartCount])

  return (
    <div className="app">

      {/* NOTIFICATION */}
      {notification && (
        <div className="ns-notification" role="status" aria-live="polite">
          <span className="ns-notification__icon">✓</span>
          <span className="ns-notification__text">{notification}</span>
        </div>
      )}

      {/* HEADER */}
      <header className="header">
        <div className="logo">NexSecond<span>.</span></div>

        <div className="mobile-quick-actions" aria-label="Quick actions">
          <button
            type="button"
            className="mobile-quick-location"
            onClick={() => setIsLocationOpen(true)}
          >
            <NexIcon name="location" size={17} strokeWidth={2.1} />
            <span>{location}</span>
            <span className="mobile-quick-chevron" aria-hidden="true">⌄</span>
          </button>

          <button
            type="button"
            className="mobile-menu-button"
            aria-label={user ? 'Open account menu' : 'Open login'}
            onClick={() => {
              if (user) {
                setIsAccountOpen((open) => !open)
              } else {
                setIsLoginOpen(true)
              }
            }}
          >
            <span></span>
            <span></span>
            <span></span>
          </button>
        </div>

        <button
          className="location"
          onClick={() => setIsLocationOpen(true)}
        >
          <NexIcon name="location" size={18} strokeWidth={2} />
          <div>
            <small>Delivering to</small>
            <strong>{location}</strong>
          </div>
        </button>

        <div className="search-container">
          <NexIcon name="search" size={18} strokeWidth={2} />

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
          {user ? (
            <>
              <NexIcon name="user" size={17} strokeWidth={2} />
              <span>Account</span>
            </>
          ) : 'Login'}
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
              <><NexIcon name="orders" size={16} strokeWidth={2} /> My Orders</>
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
          <NexIcon name="cart" size={18} strokeWidth={2} /> <span>Cart</span>
          <b>{cartCount}</b>
        </button>
      </header>

      <div className="mobile-actions">
        <button
          className="mobile-action mobile-nav-active"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="Go to home"
        >
          <svg className="mobile-nav-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M3.5 10.8 12 3.8l8.5 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M5.5 9.8V20h13V9.8" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            <path d="M9.5 20v-5h5v5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          </svg>
          <small>Home</small>
        </button>

        <button
          className="mobile-action"
          onClick={() => {
            const input = document.querySelector('.search-container .search')
            input?.focus()
            input?.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }}
          aria-label="Search products"
        >
          <NexIcon name="search" size={19} strokeWidth={2.1} />
          <small>Search</small>
        </button>

        <button
          className="mobile-action"
          onClick={() => {
            document.querySelector('.categories-section, .categories')?.scrollIntoView({
              behavior: 'smooth',
              block: 'start',
            })
          }}
          aria-label="Browse categories"
        >
          <svg className="mobile-nav-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="4" y="4" width="6" height="6" rx="1.3" stroke="currentColor" strokeWidth="2" />
            <rect x="14" y="4" width="6" height="6" rx="1.3" stroke="currentColor" strokeWidth="2" />
            <rect x="4" y="14" width="6" height="6" rx="1.3" stroke="currentColor" strokeWidth="2" />
            <rect x="14" y="14" width="6" height="6" rx="1.3" stroke="currentColor" strokeWidth="2" />
          </svg>
          <small>Categories</small>
        </button>

        <button
          className="mobile-action mobile-cart-action"
          onClick={() => setIsCartOpen(true)}
          aria-label={`Open cart with ${cartCount} item${cartCount === 1 ? '' : 's'}`}
        >
          <span className="mobile-cart-icon-wrap">
            <NexIcon name="cart" size={20} strokeWidth={2.1} />
            <span className="mobile-cart-count" aria-hidden="true">{cartCount}</span>
          </span>
          <small>Cart</small>
        </button>
      </div>

      {/* HERO */}
      <section className="hero-section hero-refined" aria-label="NexSecond quick delivery">
        <div className="hero-content">
          <p className="tag">
            <span className="tag-mark">
              <NexIcon name="truck" size={14} strokeWidth={2.2} />
            </span>
            QUICK DELIVERY · EVERYDAY ESSENTIALS
          </p>

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
            className="shop-btn hero-refined-cta"
            onClick={() =>
              document.querySelector('.products-section')
                ?.scrollIntoView({ behavior: 'smooth' })
            }
          >
            Shop now <span aria-hidden="true">→</span>
          </button>

          <div className="hero-proof-row" aria-label="NexSecond service highlights">
            <div className="hero-proof-item">
              <span className="hero-proof-icon"><NexIcon name="truck" size={16} strokeWidth={2.1} /></span>
              <span><strong>Fast delivery</strong><small>Local service</small></span>
            </div>
            <div className="hero-proof-item">
              <span className="hero-proof-icon"><NexIcon name="orders" size={16} strokeWidth={2.1} /></span>
              <span><strong>Fresh essentials</strong><small>Picked for you</small></span>
            </div>
            <div className="hero-proof-item">
              <span className="hero-proof-icon"><NexIcon name="location" size={16} strokeWidth={2.1} /></span>
              <span><strong>Inside your area</strong><small>Boundary verified</small></span>
            </div>
          </div>
        </div>

        <div className="hero-visual hero-refined-visual" aria-hidden="true">
          <div className="hero-refined-glow"></div>
          <div className="hero-refined-halo hero-refined-halo--one"></div>
          <div className="hero-refined-halo hero-refined-halo--two"></div>

          <div className="hero-command-card">
            <div className="hero-command-head">
              <div>
                <span className="hero-command-kicker">NEXSECOND</span>
                <strong>Local delivery, simplified.</strong>
              </div>
              <span className="hero-command-live"><i></i> LIVE</span>
            </div>

            <div className="hero-command-route">
              <div className="hero-route-point hero-route-point--start">
                <span className="hero-route-dot"></span>
                <div>
                  <small>ORDER</small>
                  <strong>Picked</strong>
                </div>
              </div>
              <div className="hero-route-line"><span></span></div>
              <div className="hero-route-point hero-route-point--end">
                <span className="hero-route-pin"><NexIcon name="location" size={14} strokeWidth={2.2} /></span>
                <div>
                  <small>DESTINATION</small>
                  <strong>Your area</strong>
                </div>
              </div>
            </div>

            <div className="hero-command-status">
              <div className="hero-command-status-icon">
                <NexIcon name="cart" size={24} strokeWidth={1.9} />
              </div>
              <div>
                <strong>Everyday essentials</strong>
                <span>Fast, local and easy to order.</span>
              </div>
              <span className="hero-command-arrow">→</span>
            </div>

            <div className="hero-command-footer">
              <span><NexIcon name="truck" size={13} strokeWidth={2.1} /> Local delivery</span>
              <span><b>₹169+</b> free delivery</span>
            </div>
          </div>

          <div className="hero-float-chip hero-float-chip--top">
            <span className="hero-float-chip__dot"></span>
            <div><small>READY</small><strong>Essentials packed</strong></div>
          </div>

          <div className="hero-float-chip hero-float-chip--bottom">
            <NexIcon name="location" size={15} strokeWidth={2.15} />
            <div><small>SERVICE AREA</small><strong>Exact location checked</strong></div>
          </div>
        </div>
      </section>
      {/* LAUNCH OFFER — quiet, useful, always visible without blocking the shop */}
      {!launchPromotionLoading && launchHasOffer && (
        <section className="launch-panel" aria-label="NexSecond launch offer">
          <div className="launch-offer">
            <div className="launch-offer-main">
              <span className="launch-eyebrow">NEXSECOND LAUNCH SAVING</span>

              <div className="launch-offer-copy">
                <strong>{launchDiscountPercent}% off</strong>
                <span>on orders above ₹{launchDiscountMin.toFixed(0)}</span>
              </div>

              <p>Your eligible saving is applied automatically at checkout.</p>
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

        </section>
      )}

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
                      <button
                        type="button"
                        aria-label={`Decrease ${product.name} quantity`}
                        onClick={() => decreaseQuantity(product.id)}
                      >
                        −
                      </button>

                      <span aria-live="polite">{quantity}</span>

                      <button
                        type="button"
                        aria-label={`Increase ${product.name} quantity`}
                        onClick={() => addToCart(product)}
                      >
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
                  <strong>
                    {quotedDeliveryFee == null
                      ? 'Calculating…'
                      : quotedDeliveryFee === 0
                      ? 'FREE'
                      : `₹${quotedDeliveryFee.toFixed(2)}`}
                  </strong>
                </div>

                <div className="price-row total-row">
                  <strong>Total</strong>
                  <strong>
                    {finalTotal == null
                      ? 'Calculating…'
                      : `₹${finalTotal.toFixed(2)}`}
                  </strong>
                </div>

                <button
                  className="checkout-btn"
                  onClick={() => {
                    setCheckoutError('')
                    setIsCartOpen(false)
                    setShowCheckoutLocationPrompt(true)
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
            <h2>Set your delivery location</h2>
            <p>
              NexSecond uses your current location to check whether we can deliver to your exact spot.
              Your browser will ask for permission after you tap the button.
            </p>

            <div className="location-permission-steps">
              <div><span>1</span><strong>Tap “Enable precise location”</strong></div>
              <div><span>2</span><strong>When your browser asks, tap “Allow”</strong></div>
              <div><span>3</span><strong>Wait for the exact location check to finish</strong></div>
            </div>

            <div className="location-permission-benefits">
              <div>✓ Delivery boundary checked using GPS</div>
              <div>✓ Exact location rechecked before checkout</div>
              <div>✓ You can update your location anytime</div>
            </div>

            <button className="allow-location-btn" onClick={allowLocation} disabled={isDetectingLocation}>
              Enable precise location
            </button>

            <button className="deny-location-btn" onClick={denyLocation}>
              Not now
            </button>

            <small className="location-permission-note">You can change your location anytime from the location button.</small>
          </div>
        </div>
      )}

      {/* EXACT LOCATION GATE — shown before checkout can open */}
      {showCheckoutLocationPrompt && (
        <div className="checkout-location-gate-overlay">
          <div className="checkout-location-gate" role="dialog" aria-modal="true" aria-labelledby="checkout-location-title">
            <button
              className="checkout-location-gate__close"
              type="button"
              aria-label="Back to cart"
              onClick={() => {
                setShowCheckoutLocationPrompt(false)
                setIsCartOpen(true)
              }}
            >
              ✕
            </button>

            <div className="checkout-location-gate__icon" aria-hidden="true">
              📍
            </div>

            <span className="checkout-location-gate__eyebrow">BEFORE YOU CHECK OUT</span>
            <h2 id="checkout-location-title">Confirm your exact delivery location</h2>
            <p>
              We need your current GPS location to make sure NexSecond can deliver to your exact spot.
            </p>

            <div className="checkout-location-gate__steps">
              <div><span>1</span><strong>Tap “Use my current location”</strong></div>
              <div><span>2</span><strong>Tap “Allow” in your browser prompt</strong></div>
              <div><span>3</span><strong>Wait until NexSecond says the location is verified</strong></div>
            </div>

            <div className={`checkout-location-gate__status${deliveryServiceability?.is_serviceable ? ' is-ready' : ''}`}>
              <div className="checkout-location-gate__status-main">
                <span className="checkout-location-gate__status-dot" aria-hidden="true"></span>
                <div>
                  <strong>
                    {isDetectingLocation || deliveryServiceabilityLoading
                      ? 'Checking your current location…'
                      : deliveryServiceability?.is_serviceable && locationAccuracy != null
                      ? 'Delivery available at your exact location'
                      : userLatitude != null && userLongitude != null
                      ? 'Location found — accuracy needs another check'
                      : 'Current location not verified yet'}
                  </strong>
                  <span>
                    {locationAccuracy != null
                      ? `GPS accuracy: ±${Math.round(locationAccuracy)} m`
                      : 'For best results, keep precise location enabled.'}
                  </span>
                </div>
              </div>

              {deliveryServiceability?.is_serviceable && locationAccuracy != null && locationAccuracy <= 100 && (
                <span className="checkout-location-gate__verified">✓ Verified</span>
              )}
            </div>

            <button
              className="checkout-location-gate__primary"
              type="button"
              disabled={isDetectingLocation || deliveryServiceabilityLoading}
              onClick={async () => {
                if (isDetectingLocation || deliveryServiceabilityLoading) return

                setIsDetectingLocation(true)
                const liveLocation = await refreshLiveLocationAndCheck(true)
                setIsDetectingLocation(false)

                if (
                  liveLocation?.serviceability?.is_serviceable &&
                  Number(liveLocation.accuracy) <= 100
                ) {
                  setShowCheckoutLocationPrompt(false)
                  setIsCheckoutOpen(true)
                  showNotification(`Exact delivery location verified (±${Math.round(liveLocation.accuracy)} m) ✓`)
                  return
                }

                if (liveLocation?.serviceability?.is_serviceable) {
                  showNotification(
                    `Location is serviceable, but GPS accuracy is ±${Math.round(liveLocation.accuracy)} m. Tap again for a stronger fix.`
                  )
                } else if (liveLocation) {
                  showNotification('NexSecond is outside the delivery boundary at this exact location.')
                }
              }}
            >
              {isDetectingLocation || deliveryServiceabilityLoading
                ? '📍 Detecting precise location…'
                : '📍 Use my current location'}
            </button>

            <p className="checkout-location-gate__note">
              We re-check your live location again when you place the order.
            </p>
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

              <button onClick={getCurrentLocation} disabled={isDetectingLocation}>
                {isDetectingLocation ? '📍 Detecting precise location…' : '📍 Use my current location'}
              </button>

              <div
                style={{
                  marginTop: '12px',
                  padding: '12px 14px',
                  borderRadius: '12px',
                  background: deliveryServiceability?.is_serviceable ? '#f0fdf4' : '#f8fafc',
                  border: '1px solid #e5e7eb',
                  fontSize: '13px',
                  lineHeight: 1.45,
                }}
              >
                <strong>Delivery boundary</strong>
                <div style={{ marginTop: '5px' }}>
                  {deliveryServiceabilityLoading
                    ? 'Checking your exact location…'
                    : deliveryServiceability?.is_serviceable
                    ? `✓ Delivery available in ${deliveryServiceability?.area_name || 'your location'}`
                    : userLatitude != null && userLongitude != null
                    ? '✕ This exact location is outside the NexSecond delivery boundary.'
                    : 'Live GPS verification is required. Area names alone cannot verify the delivery boundary.'}
                </div>
              </div>

              <p className="location-label">
                AREA LABELS
              </p>

              <button
                onClick={() => {
                  clearExactLocation()
                  setLocation('Harohalli')
                  localStorage.setItem('nexsecond_location', 'Harohalli')
                  localStorage.setItem('nexsecond_location_prompt_asked', 'true')
                  setIsLocationOpen(false)
                  showNotification('Harohalli selected. Use exact location to verify delivery 📍')
                }}
              >
                Harohalli
              </button>

              <button
                onClick={() => {
                  clearExactLocation()
                  setLocation('Kanakapura Road')
                  localStorage.setItem('nexsecond_location', 'Kanakapura Road')
                  localStorage.setItem('nexsecond_location_prompt_asked', 'true')
                  setIsLocationOpen(false)
                  showNotification('Kanakapura Road selected. Use exact location to verify delivery 📍')
                }}
              >
                Kanakapura Road
              </button>

              <button
                onClick={() => {
                  clearExactLocation()
                  setLocation('Bangalore')
                  localStorage.setItem('nexsecond_location', 'Bangalore')
                  localStorage.setItem('nexsecond_location_prompt_asked', 'true')
                  setIsLocationOpen(false)
                  showNotification('Bangalore selected. Use exact location to verify delivery 📍')
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
                <small
                  style={{
                    display: 'block',
                    marginTop: '7px',
                    fontWeight: 700,
                    color: deliveryServiceability?.is_serviceable ? '#0c831f' : '#9a3412',
                  }}
                >
                  {deliveryServiceabilityLoading
                    ? 'Checking delivery boundary…'
                    : deliveryServiceability?.is_serviceable
                    ? '✓ Delivery available at this exact location'
                    : userLatitude == null || userLongitude == null
                    ? 'Exact location verification required before placing the order.'
                    : '✕ This exact location is outside the NexSecond delivery boundary.'}
                </small>
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

                {hasCheckoutBenefit && (
                  <div
                    key={`benefit-${discountAmount}-${deliveryDiscountAmount}-${quotedSubtotal >= FREE_DELIVERY_THRESHOLD}`}
                    className={`checkout-benefit-reveal${totalSavings > 0 ? ' checkout-benefit-reveal--saved' : ''}`}
                  >
                    <div className="checkout-benefit-reveal__icon">
                      {discountAmount > 0 && deliveryDiscountAmount > 0 ? (
                        <span className="checkout-benefit-reveal__icon-stack" aria-hidden="true">
                          <span className="checkout-benefit-reveal__mini-icon">🎉</span>
                          <span className="checkout-benefit-reveal__mini-icon">🚚</span>
                        </span>
                      ) : (
                        <span className="checkout-benefit-reveal__single-icon" aria-hidden="true">
                          {discountAmount > 0 ? '🎉' : '🚚'}
                        </span>
                      )}
                    </div>

                    <div className="checkout-benefit-reveal__content">
                      <strong>{checkoutBenefitTitle}</strong>
                      <span>{checkoutBenefitText}</span>
                    </div>

                    {totalSavings > 0 && (
                      <div className="checkout-benefit-reveal__celebration" aria-hidden="true">
                        <span className="checkout-benefit-reveal__spark checkout-benefit-reveal__spark--1">✦</span>
                        <span className="checkout-benefit-reveal__spark checkout-benefit-reveal__spark--2">✦</span>
                        <span className="checkout-benefit-reveal__spark checkout-benefit-reveal__spark--3">·</span>
                        <span className="checkout-benefit-reveal__saved-chip">
                          ₹{totalSavings.toFixed(2)} saved
                        </span>
                      </div>
                    )}
                  </div>
                )}

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
                  <strong>
                    {quotedDeliveryFee == null
                      ? 'Calculating…'
                      : quotedDeliveryFee === 0
                      ? 'FREE'
                      : `₹${quotedDeliveryFee.toFixed(2)}`}
                  </strong>
                </div>

                {deliveryDiscountAmount > 0 && (
                  <div className="delivery-discount-row">
                    <span>Delivery discount</span>
                    <strong>−₹{deliveryDiscountAmount.toFixed(2)}</strong>
                  </div>
                )}

                {quotedSubtotal < FREE_DELIVERY_THRESHOLD && cartCount > 0 && (
                  <div className="free-delivery-hint">
                    ₹{(FREE_DELIVERY_THRESHOLD - quotedSubtotal).toFixed(2)} more for FREE delivery
                  </div>
                )}

                {totalSavings > 0 && (
                  <div className="discount-hint">
                    🎉 You save ₹{totalSavings.toFixed(2)} in total
                    {deliveryDiscountAmount > 0 && (
                      <span className="discount-hint__delivery">
                        Delivery waived: ₹{deliveryDiscountAmount.toFixed(2)}
                      </span>
                    )}
                  </div>
                )}

                <div className="checkout-total">
                  <strong>Total</strong>
                  <strong>
                    {finalTotal == null
                      ? 'Calculating…'
                      : `₹${finalTotal.toFixed(2)}`}
                  </strong>
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

                  // Re-check the LIVE GPS position immediately before the order is
                  // created. This prevents an order using stale coordinates from an
                  // earlier in-boundary location.
                  const liveLocation = await refreshLiveLocationAndCheck(false)

                  if (!liveLocation?.serviceability?.is_serviceable) {
                    setCheckoutError(
                      'NexSecond is not delivering to your current exact location.'
                    )
                    setIsLocationOpen(true)
                    return
                  }

                  if (Number(liveLocation.accuracy) > 100) {
                    setCheckoutError(
                      `Your GPS accuracy is ±${Math.round(liveLocation.accuracy)} m. Please use your current location again for a more precise fix before placing the order.`
                    )
                    setIsPlacingOrder(false)
                    setIsCheckoutOpen(false)
                    setShowCheckoutLocationPrompt(true)
                    return
                  }

                  const orderLatitude = liveLocation.latitude
                  const orderLongitude = liveLocation.longitude

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
                        p_latitude: orderLatitude,
                        p_longitude: orderLongitude
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

            {/* FOOTER */}
      <footer className="site-footer">
        <div className="site-footer-main">

          <div className="footer-brand">
            <div className="footer-logo">
              NexSecond<span>.</span>
            </div>

            <p>
              Need it now? Get it NexSecond.
            </p>

            <small>
              Everyday essentials delivered locally,
              simply and conveniently.
            </small>

            <div className="footer-trust-row">
              <span>🔐 Secure login</span>
              <span>💵 COD available</span>
              <span>📍 Local delivery</span>
            </div>
          </div>

          <div className="footer-column">
            <h3>Useful Links</h3>

            <button
              type="button"
              onClick={() =>
                window.scrollTo({
                  top: 0,
                  behavior: 'smooth',
                })
              }
            >
              Home
            </button>

            <button
              type="button"
              onClick={() =>
                document
                  .querySelector('.products-section')
                  ?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start',
                  })
              }
            >
              Shop
            </button>

            <button
              type="button"
              onClick={() => {
                setSelectedCategory('All')
                document
                  .querySelector('.products-section')
                  ?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start',
                  })
              }}
            >
              Categories
            </button>

            <button
              type="button"
              onClick={() => {
                if (!user) {
                  setIsLoginOpen(true)
                  return
                }

                setIsOrderHistoryOpen(true)
                fetchOrderHistory()
              }}
            >
              My Orders
            </button>

            <button
              type="button"
              onClick={() => {
                if (user) {
                  setIsAccountOpen(true)
                } else {
                  setIsLoginOpen(true)
                }
              }}
            >
              Account
            </button>

            <button
              type="button"
              onClick={() => setIsCartOpen(true)}
            >
              Cart
            </button>
          </div>

          <div className="footer-column">
            <h3>Categories</h3>

            {[
              'Vegetables',
              'Fruits',
              'Dairy',
              'Snacks',
              'Drinks',
              'Groceries',
            ].map((category) => (
              <button
                type="button"
                key={category}
                onClick={() => {
                  setSelectedCategory(category)

                  document
                    .querySelector('.products-section')
                    ?.scrollIntoView({
                      behavior: 'smooth',
                      block: 'start',
                    })
                }}
              >
                {category}
              </button>
            ))}
          </div>

          <div className="footer-column footer-service">
            <h3>NexSecond Service</h3>

            <button
              type="button"
              onClick={() => setIsLocationOpen(true)}
            >
              📍 Delivery Area
            </button>

            <div className="footer-info">
              <strong>₹169</strong>
              <span>Minimum order</span>
            </div>

            <div className="footer-info">
              <strong>FREE</strong>
              <span>Delivery above ₹169</span>
            </div>

            <div className="footer-info">
              <strong>₹16–₹20</strong>
              <span>Delivery below ₹169</span>
            </div>

            <div className="footer-info">
              <strong>COD</strong>
              <span>Cash on Delivery</span>
            </div>
          </div>

        </div>

        <div className="site-footer-bottom">
          <span>
            © 2026 NexSecond. All rights reserved.
          </span>

          <span>
            Local essentials • Fast delivery • Simple ordering
          </span>
        </div>
      </footer>


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
  {new Date(order.created_at).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })}
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