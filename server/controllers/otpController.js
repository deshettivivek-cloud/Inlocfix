const supabase = require('../db/supabase')
const jwt = require('jsonwebtoken')
const axios = require('axios')

const OTP_EXPIRY_MINUTES = 5

// Generate a random 6-digit OTP
const generateOtp = () => String(Math.floor(100000 + Math.random() * 900000))

/**
 * Send SMS via Fast2SMS
 */
const sendSms = async (phone, otp) => {
  const number = phone.replace('+91', '').replace(/\D/g, '')
  
  try {
    // Use Quick Transactional SMS route ('q') — works without website verification
    const response = await axios.get(
      'https://www.fast2sms.com/dev/bulkV2',
      {
        params: {
          authorization: process.env.FAST2SMS_API_KEY,
          message: `Your InLocFix verification code is ${otp}. Valid for 5 minutes. Do not share this code.`,
          language: 'english',
          route: 'q',
          numbers: number,
        },
        headers: {
          'cache-control': 'no-cache',
        },
      }
    )

    console.log(`📱 SMS sent to ${number}:`, response.data)
    
    if (response.data && response.data.return === false) {
      console.error('❌ Fast2SMS returned error:', response.data.message)
      throw new Error(response.data.message || 'SMS sending failed')
    }
    
    return response.data
  } catch (err) {
    console.error('❌ Fast2SMS error:', err.response?.data || err.message)
    throw new Error('Failed to send OTP SMS. Please try again.')
  }
}

/**
 * POST /api/otp/send
 * Body: { phone: "9876543210" }
 */
const sendOtp = async (req, res, next) => {
  try {
    let { phone } = req.body

    if (!phone || phone.trim().length < 10) {
      return res.status(400).json({ success: false, message: 'Valid phone number is required' })
    }

    // Normalize: strip spaces, ensure it starts with country code
    phone = phone.replace(/\s+/g, '')
    if (!phone.startsWith('+')) {
      phone = '+91' + phone // default to India
    }

    // Check if user with this phone exists in Supabase profiles
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, phone')
      .eq('phone', phone.replace('+91', ''))
      .maybeSingle()

    if (!profile) {
      // Also try with the full phone format
      const { data: profile2 } = await supabase
        .from('profiles')
        .select('id, full_name, phone')
        .eq('phone', phone)
        .maybeSingle()

      if (!profile2) {
        return res.status(404).json({
          success: false,
          message: 'No account found with this phone number. Please register first.',
        })
      }
    }

    // Delete any existing OTPs for this phone
    await supabase.from('otps').delete().eq('phone', phone)

    // Generate and store new OTP
    const otp = generateOtp()
    const expires_at = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000).toISOString()

    const { error: insertErr } = await supabase.from('otps').insert({
      phone,
      otp,
      expires_at,
      purpose: 'login',
    })

    if (insertErr) {
      console.error('❌ Failed to store OTP:', insertErr.message)
      return res.status(500).json({ success: false, message: 'Failed to generate OTP' })
    }

    // Send SMS via Fast2SMS (with dev-mode fallback)
    try {
      await sendSms(phone, otp)
    } catch (smsErr) {
      console.warn(`⚠️ SMS delivery failed: ${smsErr.message}`)
      console.warn(`📱 DEV MODE — OTP for ${phone}: ${otp} (use this to test)`)
      // Don't throw — let the user verify with the console OTP in dev
    }
    console.log(`📱 OTP for ${phone}: ${otp} (expires in ${OTP_EXPIRY_MINUTES} min)`)

    res.json({
      success: true,
      message: `OTP sent to ${phone}. Valid for ${OTP_EXPIRY_MINUTES} minutes.`,
    })
  } catch (err) {
    next(err)
  }
}

/**
 * POST /api/otp/verify
 * Body: { phone: "9876543210", otp: "123456" }
 *
 * Verifies the OTP, finds the Supabase user by phone, and returns a JWT
 * that the client can use like a normal auth token.
 */
const verifyOtp = async (req, res, next) => {
  try {
    let { phone, otp } = req.body

    if (!phone || !otp) {
      return res.status(400).json({ success: false, message: 'Phone and OTP are required' })
    }

    phone = phone.replace(/\s+/g, '')
    if (!phone.startsWith('+')) {
      phone = '+91' + phone
    }

    // Find the OTP record (not expired)
    const { data: otpRecord, error: otpErr } = await supabase
      .from('otps')
      .select('*')
      .eq('phone', phone)
      .eq('otp', otp)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()

    if (otpErr || !otpRecord) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired OTP. Please try again.',
      })
    }

    // OTP is valid — delete it so it can't be reused
    await supabase.from('otps').delete().eq('phone', phone)

    // Find the user in Supabase profiles by phone
    const phoneClean = phone.replace('+91', '')
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone, role, city')
      .or(`phone.eq.${phoneClean},phone.eq.${phone}`)
      .maybeSingle()

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'User profile not found.',
      })
    }

    // Generate a JWT for the client (same format as Supabase would)
    const token = jwt.sign(
      {
        sub: profile.id,
        id: profile.id,
        email: profile.email,
        phone: profile.phone,
        role: profile.role,
        aud: 'authenticated',
      },
      process.env.JWT_SECRET || process.env.SUPABASE_SERVICE_KEY,
      { expiresIn: '7d' }
    )

    res.json({
      success: true,
      message: 'OTP verified successfully!',
      token,
      user: {
        id: profile.id,
        email: profile.email,
        full_name: profile.full_name,
        phone: profile.phone,
        role: profile.role,
        city: profile.city,
      },
    })
  } catch (err) {
    next(err)
  }
}

/**
 * POST /api/otp/worker-verify/send
 * Body: { bookingId: "uuid" }
 *
 * Sends an OTP to the worker's phone so the customer can verify
 * the worker's identity on-site.
 */
const sendWorkerVerificationOtp = async (req, res, next) => {
  try {
    const { bookingId } = req.body

    if (!bookingId) {
      return res.status(400).json({ success: false, message: 'Booking ID is required' })
    }

    // Fetch the booking to get worker_id
    const { data: booking, error: bookingErr } = await supabase
      .from('bookings')
      .select('id, worker_id, status')
      .eq('id', bookingId)
      .single()

    if (bookingErr || !booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' })
    }

    if (booking.status === 'verified') {
      return res.status(400).json({ success: false, message: 'This booking is already verified' })
    }

    // Get the worker's phone from their profile
    const { data: workerProfile, error: wpErr } = await supabase
      .from('profiles')
      .select('id, phone, full_name')
      .eq('id', booking.worker_id)
      .single()

    if (wpErr || !workerProfile || !workerProfile.phone) {
      return res.status(404).json({
        success: false,
        message: 'Worker phone number not found',
      })
    }

    let workerPhone = workerProfile.phone.replace(/\s+/g, '')
    if (!workerPhone.startsWith('+')) {
      workerPhone = '+91' + workerPhone
    }

    // Delete any existing worker-verification OTPs for this booking
    await supabase.from('otps').delete().eq('booking_id', bookingId)

    // Generate and store OTP with booking reference
    const otp = generateOtp()
    const expires_at = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000).toISOString()

    const { error: insertErr } = await supabase.from('otps').insert({
      phone: workerPhone,
      otp,
      expires_at,
      booking_id: bookingId,
      purpose: 'worker_verification',
    })

    if (insertErr) {
      console.error('❌ Failed to store OTP:', insertErr.message)
      return res.status(500).json({ success: false, message: 'Failed to generate verification OTP' })
    }

    // Send SMS to the worker
    try {
      await sendSms(workerPhone, otp)
    } catch (smsErr) {
      console.warn(`⚠️ SMS delivery failed: ${smsErr.message}`)
      console.warn(`📱 DEV MODE — Worker verification OTP: ${otp}`)
    }
    console.log(`📱 Worker verification OTP for booking ${bookingId}: ${otp}`)

    res.json({
      success: true,
      message: `Verification OTP sent to worker's phone. Ask the worker to share the code.`,
      workerName: workerProfile.full_name,
    })
  } catch (err) {
    next(err)
  }
}

/**
 * POST /api/otp/worker-verify/confirm
 * Body: { bookingId: "uuid", otp: "123456" }
 *
 * Verifies the OTP and marks the booking as 'verified'.
 */
const verifyWorkerOtp = async (req, res, next) => {
  try {
    const { bookingId, otp } = req.body

    if (!bookingId || !otp) {
      return res.status(400).json({ success: false, message: 'Booking ID and OTP are required' })
    }

    // Find the OTP record by bookingId + otp
    const { data: otpRecord, error: otpErr } = await supabase
      .from('otps')
      .select('*')
      .eq('booking_id', bookingId)
      .eq('otp', otp)
      .eq('purpose', 'worker_verification')
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()

    if (otpErr || !otpRecord) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired OTP. Please try again.',
      })
    }

    // OTP is valid — delete it
    await supabase.from('otps').delete().eq('booking_id', bookingId).eq('purpose', 'worker_verification')

    // Update booking status to 'verified'
    const { data: updated, error: updateErr } = await supabase
      .from('bookings')
      .update({ status: 'verified' })
      .eq('id', bookingId)
      .select()
      .single()

    if (updateErr) {
      console.error('Booking update error:', updateErr.message)
      return res.status(500).json({ success: false, message: 'Failed to update booking status' })
    }

    res.json({
      success: true,
      message: 'Worker verified successfully!',
      booking: updated,
    })
  } catch (err) {
    next(err)
  }
}

module.exports = { sendOtp, verifyOtp, sendWorkerVerificationOtp, verifyWorkerOtp }
