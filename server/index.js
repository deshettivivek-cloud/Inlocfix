const express = require('express')
const cors = require('cors')
require('dotenv').config()

const errorHandler = require('./middleware/errorHandler')
const authRoutes = require('./routes/auth')
const workerRoutes = require('./routes/workers')
const bookingRoutes = require('./routes/bookings')
const reviewRoutes = require('./routes/reviews')
const otpRoutes = require('./routes/otp')

const app = express()

app.use(cors())
app.use(express.json())

app.get('/', (req, res) => {
  res.json({ message: '🌐 TrustSphere API is running!' })
})

app.use('/api/auth', authRoutes)
app.use('/api/workers', workerRoutes)
app.use('/api/bookings', bookingRoutes)
app.use('/api/reviews', reviewRoutes)
app.use('/api/otp', otpRoutes)

app.use(errorHandler)

// Start the server (Supabase only — no MongoDB needed)
const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`)
})