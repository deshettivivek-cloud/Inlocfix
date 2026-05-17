const express = require('express')
const router = express.Router()
const { protect } = require('../middleware/authMiddleware')
const { createBooking, acceptBooking, getSearchingBookings, getBookingById, getMyBookings, updateBookingStatus } = require('../controllers/bookingController')

router.post('/', protect, createBooking)
router.get('/', protect, getMyBookings)
router.get('/searching', protect, getSearchingBookings)
router.get('/:id', protect, getBookingById)
router.post('/:id/accept', protect, acceptBooking)
router.patch('/:id/status', protect, updateBookingStatus)

module.exports = router