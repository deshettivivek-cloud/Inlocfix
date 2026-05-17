const supabase = require('../db/supabase')

// Customer creates a booking request (no worker assigned yet)
const createBooking = async (req, res, next) => {
  try {
    const { service_type, booking_date, time_slot, note, customer_lat, customer_lng, customer_address, city } = req.body
    const customer_id = req.user.id

    if (!service_type) return res.status(400).json({ success: false, message: 'Service type is required' })

    const { data, error } = await supabase
      .from('bookings')
      .insert([{
        customer_id,
        worker_id: null,
        service_type,
        booking_date,
        time_slot,
        note: note || null,
        customer_lat: customer_lat || null,
        customer_lng: customer_lng || null,
        customer_address: customer_address || null,
        city: city || null,
        status: 'searching',
      }])
      .select()
      .single()

    if (error) throw error
    res.status(201).json({ success: true, data })
  } catch (err) { next(err) }
}

// Worker accepts a booking (first-wins atomic logic)
const acceptBooking = async (req, res, next) => {
  try {
    const { id } = req.params
    const worker_id = req.user.id

    // Only update if status is still 'searching' (atomic first-wins)
    const { data, error } = await supabase
      .from('bookings')
      .update({ worker_id, status: 'confirmed' })
      .eq('id', id)
      .eq('status', 'searching')
      .is('worker_id', null)
      .select()
      .single()

    if (error || !data) {
      return res.status(409).json({ success: false, message: 'This job has already been accepted by another worker.' })
    }

    res.json({ success: true, data })
  } catch (err) { next(err) }
}

// Workers fetch available booking requests matching their service type + city
const getSearchingBookings = async (req, res, next) => {
  try {
    const worker_id = req.user.id

    // Get worker's profile to know their service_type and city
    const { data: wp } = await supabase
      .from('worker_profiles')
      .select('service_type, location')
      .eq('user_id', worker_id)
      .single()

    const { data: profile } = await supabase
      .from('profiles')
      .select('city')
      .eq('id', worker_id)
      .single()

    let query = supabase
      .from('bookings')
      .select('id, service_type, booking_date, time_slot, note, customer_address, city, customer_lat, customer_lng, created_at')
      .eq('status', 'searching')
      .is('worker_id', null)
      .order('created_at', { ascending: false })

    // Filter by service type if worker has one
    if (wp?.service_type) {
      query = query.ilike('service_type', wp.service_type)
    }

    const { data, error } = await query
    if (error) throw error

    res.json({ success: true, data: data || [] })
  } catch (err) { next(err) }
}

// Get a single booking by ID (for customer polling)
const getBookingById = async (req, res, next) => {
  try {
    const { id } = req.params

    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !data) {
      return res.status(404).json({ success: false, message: 'Booking not found' })
    }

    // If worker assigned, fetch worker details
    let worker = null
    if (data.worker_id) {
      const { data: wp } = await supabase
        .from('profiles')
        .select('full_name, phone, city')
        .eq('id', data.worker_id)
        .single()
      worker = wp
    }

    res.json({ success: true, data: { ...data, worker } })
  } catch (err) { next(err) }
}

const getMyBookings = async (req, res, next) => {
  try {
    const userId = req.user.id
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .or(`customer_id.eq.${userId},worker_id.eq.${userId}`)
      .order('created_at', { ascending: false })

    if (error) throw error
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

const updateBookingStatus = async (req, res, next) => {
  try {
    const { id } = req.params
    const { status } = req.body
    const { data, error } = await supabase
      .from('bookings')
      .update({ status })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

module.exports = { createBooking, acceptBooking, getSearchingBookings, getBookingById, getMyBookings, updateBookingStatus }