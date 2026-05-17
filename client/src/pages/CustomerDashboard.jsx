import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  User, Calendar, Star, Search, AlertCircle, Plus, LogOut, ChevronRight,
  Clock, MapPin, Phone, Mail, ShieldCheck, X, Loader2
} from 'lucide-react'
import { API_BASE_URL } from '../lib/capacitor'

export default function CustomerDashboard() {
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [profileNotFound, setProfileNotFound] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')
  const [bookings, setBookings] = useState([])
  const [bookingsLoading, setBookingsLoading] = useState(false)

  // Verify modal state
  const [verifyModal, setVerifyModal] = useState({ open: false, bookingId: null })
  const [verifyOtp, setVerifyOtp] = useState('')
  const [verifySending, setVerifySending] = useState(false)
  const [verifyChecking, setVerifyChecking] = useState(false)
  const [verifyOtpSent, setVerifyOtpSent] = useState(false)
  const [verifyError, setVerifyError] = useState('')
  const [showSuccess, setShowSuccess] = useState(false)

  useEffect(() => {
    if (authLoading) return
    let cancelled = false
    const fetchData = async () => {
      setLoading(true)
      try {
        const { data: { session } } = await Promise.race([
          supabase.auth.getSession(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
        ])
        if (cancelled) return
        if (!session) { navigate('/login/customer'); return }

        const { data: p, error } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
        if (cancelled) return
        if (error || !p) { setProfileNotFound(true); return }

        // Redirect workers to their dashboard
        if (p.role === 'service_worker') { navigate('/dashboard/worker'); return }

        setProfile(p)
      } catch (err) {
        console.error('[CustomerDashboard]', err.message)
        if (!cancelled) setProfileNotFound(true)
      } finally { if (!cancelled) setLoading(false) }
    }
    fetchData()
    const timer = setTimeout(() => { if (!cancelled) setLoading(false) }, 5000)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [authLoading, user])

  // Fetch bookings
  useEffect(() => {
    if (activeTab !== 'bookings' || !profile || !user) return
    const fetchBookings = async () => {
      setBookingsLoading(true)
      try {
        const { data, error } = await supabase.from('bookings').select('*').eq('customer_id', user.id).order('created_at', { ascending: false })
        if (error) { setBookings([]); return }
        const enriched = await Promise.all(
          (data || []).map(async (b) => {
            if (!b.worker_id) return { ...b, other_name: null, other_phone: '' }
            const { data: prof } = await supabase.from('profiles').select('full_name, phone').eq('id', b.worker_id).maybeSingle()
            return { ...b, other_name: prof?.full_name || 'Assigned', other_phone: prof?.phone || '' }
          })
        )
        setBookings(enriched)
      } catch (err) { console.error('Bookings error:', err) }
      finally { setBookingsLoading(false) }
    }
    fetchBookings()
  }, [activeTab, profile, user])

  const handleSignOut = async () => {
    try {
      await Promise.race([supabase.auth.signOut(), new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 2000))])
    } catch (err) {
      Object.keys(localStorage).forEach((k) => { if (k.startsWith('sb-')) localStorage.removeItem(k) })
    } finally { navigate('/login/customer'); window.location.reload() }
  }

  // Worker verification
  const handleSendVerifyOtp = async (bookingId) => {
    setVerifySending(true); setVerifyError('')
    try {
      const res = await fetch(`${API_BASE_URL}/api/otp/worker-verify/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bookingId }) })
      const data = await res.json()
      if (!data.success) throw new Error(data.message)
      setVerifyOtpSent(true)
    } catch (err) { setVerifyError(err.message) }
    finally { setVerifySending(false) }
  }

  const handleConfirmVerifyOtp = async () => {
    setVerifyChecking(true); setVerifyError('')
    try {
      const res = await fetch(`${API_BASE_URL}/api/otp/worker-verify/confirm`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bookingId: verifyModal.bookingId, otp: verifyOtp }) })
      const data = await res.json()
      if (!data.success) throw new Error(data.message)
      setBookings(prev => prev.map(b => b.id === verifyModal.bookingId ? { ...b, status: 'verified' } : b))
      setVerifyModal({ open: false, bookingId: null }); setVerifyOtp(''); setVerifyOtpSent(false)
      setShowSuccess(true); setTimeout(() => setShowSuccess(false), 3000)
    } catch (err) { setVerifyError(err.message) }
    finally { setVerifyChecking(false) }
  }

  const openVerifyModal = (bookingId) => {
    setVerifyModal({ open: true, bookingId }); setVerifyOtp(''); setVerifyOtpSent(false); setVerifyError('')
  }

  const statusColor = (s) => {
    if (s === 'verified') return 'bg-emerald-500/20 text-emerald-400'
    if (s === 'confirmed') return 'bg-green-500/20 text-green-400'
    if (s === 'cancelled') return 'bg-red-500/20 text-red-400'
    if (s === 'searching') return 'bg-blue-500/20 text-blue-400 animate-pulse'
    return 'bg-yellow-500/20 text-yellow-400'
  }

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0b1120]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 text-sm">Loading your dashboard...</p>
        </div>
      </div>
    )
  }

  if (profileNotFound || !profile) {
    return (
      <div className="min-h-screen bg-[#0b1120] flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-slate-800/60 backdrop-blur-sm border border-white/10 rounded-2xl p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center mx-auto mb-5">
            <AlertCircle size={28} className="text-yellow-400" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Profile Not Found</h2>
          <p className="text-slate-400 text-sm mb-6">Your account exists but no profile has been set up yet.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button type="button" onClick={() => navigate('/create-profile')} className="px-5 py-2.5 bg-blue-500 hover:bg-blue-400 text-white font-semibold rounded-xl text-sm transition flex items-center justify-center gap-2 cursor-pointer">
              <Plus size={16} /> Create Profile
            </button>
            <button type="button" onClick={handleSignOut} className="px-5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 font-semibold rounded-xl text-sm transition flex items-center justify-center gap-2 cursor-pointer">
              <LogOut size={16} /> Sign Out
            </button>
          </div>
        </div>
      </div>
    )
  }

  const TABS = [
    { id: 'overview', label: 'Overview', icon: Search },
    { id: 'bookings', label: 'My Bookings', icon: Calendar },
    { id: 'account', label: 'Account', icon: User },
  ]

  return (
    <div className="min-h-screen bg-[#0b1120]">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Profile Header */}
        <div className="relative bg-gradient-to-br from-slate-800 via-slate-800 to-blue-900/40 border border-white/10 rounded-2xl p-6 mb-6 overflow-hidden">
          <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '32px 32px' }} />
          <div className="relative flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-400 to-cyan-600 flex items-center justify-center text-white font-bold text-2xl shadow-lg shadow-blue-500/20 shrink-0">
              {profile.full_name?.charAt(0)?.toUpperCase() || '?'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-blue-400 text-xs font-medium mb-0.5">Welcome back,</p>
              <h1 className="text-xl md:text-2xl font-bold text-white truncate">{profile.full_name}</h1>
              <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full mt-1.5 border bg-blue-500/20 text-blue-400 border-blue-500/30">
                👤 Customer
              </span>
            </div>
            <button type="button" onClick={handleSignOut} className="shrink-0 px-4 py-2 bg-white/5 hover:bg-red-500/10 border border-white/10 hover:border-red-500/30 text-slate-400 hover:text-red-400 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer">
              <LogOut size={14} /> Sign Out
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-1 mb-6 bg-slate-800/40 p-1 rounded-xl border border-white/5">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" onClick={() => setActiveTab(id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition cursor-pointer ${
                activeTab === id ? 'bg-blue-500/15 text-blue-400 border border-blue-500/20' : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}>
              <Icon size={16} /> {label}
            </button>
          ))}
        </div>

        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-slate-800/60 border border-white/5 rounded-2xl p-6">
              <h2 className="font-bold text-white mb-4 flex items-center gap-2"><Mail size={16} className="text-blue-400" /> Your Info</h2>
              <div className="space-y-0">
                {[
                  { icon: Mail, label: 'Email', value: profile.email || user?.email || 'Not set' },
                  { icon: Phone, label: 'Phone', value: profile.phone || 'Not set' },
                  { icon: MapPin, label: 'City', value: profile.city || 'Not set' },
                  { icon: User, label: 'Account Type', value: 'Customer' },
                ].map(({ icon: Ic, label, value }) => (
                  <div key={label} className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
                    <span className="text-sm text-slate-500 flex items-center gap-2"><Ic size={13} />{label}</span>
                    <span className="text-sm font-medium text-slate-300">{value}</span>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => navigate('/create-profile')} className="mt-4 w-full py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 rounded-xl text-sm font-medium transition flex items-center justify-center gap-2 cursor-pointer">
                Edit Profile <ChevronRight size={14} />
              </button>
            </div>
            <div className="bg-slate-800/60 border border-white/5 rounded-2xl p-6">
              <h2 className="font-bold text-white mb-4 flex items-center gap-2"><Search size={16} className="text-blue-400" /> Quick Search</h2>
              <p className="text-slate-400 text-sm mb-5">Find trusted service workers near you.</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { icon: '⚡', label: 'Electrician' }, { icon: '🔧', label: 'Plumber' },
                  { icon: '❄️', label: 'AC Repair' }, { icon: '🪚', label: 'Carpenter' },
                  { icon: '🎨', label: 'Painter' }, { icon: '📱', label: 'Technician' },
                ].map(({ icon, label }) => (
                  <Link key={label} to="/search"
                    className="flex items-center gap-2.5 px-3.5 py-2.5 bg-white/5 hover:bg-blue-500/10 border border-white/5 hover:border-blue-500/20 rounded-xl transition-all text-sm">
                    <span className="text-base">{icon}</span>
                    <span className="text-slate-300 font-medium">{label}</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* BOOKINGS TAB */}
        {activeTab === 'bookings' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold text-white">My Bookings</h2>
              <Link to="/search" className="text-blue-400 text-sm font-medium hover:text-blue-300 flex items-center gap-1">Find Workers <ChevronRight size={14} /></Link>
            </div>
            {bookingsLoading ? (
              <div className="flex items-center justify-center py-16"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
            ) : bookings.length === 0 ? (
              <div className="bg-slate-800/60 border border-white/5 rounded-2xl p-8 text-center">
                <Calendar size={32} className="text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400 text-sm">No bookings yet.</p>
                <Link to="/search" className="inline-flex items-center gap-2 mt-4 px-5 py-2.5 bg-blue-500 hover:bg-blue-400 text-white font-semibold rounded-xl text-sm transition">
                  <Search size={15} /> Find Workers
                </Link>
              </div>
            ) : bookings.map((b) => (
              <div key={b.id} className={`bg-slate-800/60 border rounded-2xl p-5 transition mb-3 ${b.status === 'searching' ? 'border-blue-500/20' : 'border-white/5 hover:border-white/10'}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    {b.status === 'searching' ? (
                      <div className="w-10 h-10 rounded-full bg-blue-500/15 border border-blue-500/25 flex items-center justify-center shrink-0 mt-0.5">
                        <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-cyan-600 flex items-center justify-center text-white font-bold text-sm shrink-0 mt-0.5">
                        {b.other_name?.charAt(0)?.toUpperCase() || '?'}
                      </div>
                    )}
                    <div className="min-w-0">
                      {b.status === 'searching' ? (
                        <>
                          <p className="text-blue-400 font-semibold text-sm">Searching for workers...</p>
                          <p className="text-slate-500 text-xs mt-0.5">Waiting for a professional to accept</p>
                        </>
                      ) : (
                        <>
                          <p className="text-white font-semibold text-sm truncate">{b.other_name || 'Worker'}</p>
                          <p className="text-blue-400 text-xs capitalize mt-0.5">{b.service_type || 'Service'}</p>
                          {b.other_phone && <p className="text-slate-500 text-xs mt-0.5 flex items-center gap-1"><Phone size={10} /> {b.other_phone}</p>}
                        </>
                      )}
                    </div>
                  </div>
                  <span className={`text-[10px] px-2.5 py-1 rounded-full font-medium capitalize shrink-0 ${statusColor(b.status)}`}>{b.status || 'pending'}</span>
                </div>
                <div className="flex items-center gap-4 mt-3 pt-3 border-t border-white/5">
                  <span className="text-slate-400 text-xs flex items-center gap-1.5"><Calendar size={12} /> {b.booking_date || 'No date'}</span>
                  <span className="text-slate-400 text-xs flex items-center gap-1.5"><Clock size={12} /> {b.time_slot || 'No time'}</span>
                </div>
                {b.note && <p className="mt-2 text-slate-500 text-xs italic">"{b.note}"</p>}
                {b.status === 'searching' && (
                  <div className="mt-3 w-full py-2.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 animate-pulse">
                    <Loader2 size={13} className="animate-spin" /> Looking for nearby workers...
                  </div>
                )}
                {b.status === 'confirmed' && (
                  <button type="button" onClick={() => openVerifyModal(b.id)}
                    className="mt-3 w-full py-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center justify-center gap-1.5">
                    <ShieldCheck size={14} /> Verify Worker
                  </button>
                )}
                {b.status === 'verified' && (
                  <div className="mt-3 w-full py-2.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5">
                    <ShieldCheck size={14} /> Worker Verified ✓
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ACCOUNT TAB */}
        {activeTab === 'account' && (
          <div className="max-w-lg mx-auto space-y-4">
            <div className="bg-slate-800/60 border border-white/5 rounded-2xl p-6">
              <h2 className="font-bold text-white mb-5 flex items-center gap-2"><User size={16} className="text-blue-400" /> Account Settings</h2>
              <div className="flex items-center gap-4 p-4 bg-white/5 rounded-xl mb-5">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-400 to-cyan-600 flex items-center justify-center text-white font-bold text-xl shrink-0">
                  {profile.full_name?.charAt(0)?.toUpperCase() || '?'}
                </div>
                <div>
                  <p className="text-white font-semibold">{profile.full_name}</p>
                  <p className="text-slate-400 text-sm">{profile.email || user?.email}</p>
                  <span className="inline-block text-[10px] px-2 py-0.5 rounded-full mt-1 font-medium bg-blue-500/20 text-blue-400">👤 Customer</span>
                </div>
              </div>
              <div className="space-y-0">
                {[
                  { label: 'Full Name', value: profile.full_name },
                  { label: 'Email', value: profile.email || user?.email },
                  { label: 'Phone', value: profile.phone || 'Not set' },
                  { label: 'City', value: profile.city || 'Not set' },
                  { label: 'Role', value: 'Customer' },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
                    <span className="text-sm text-slate-500">{label}</span>
                    <span className="text-sm font-medium text-slate-300 capitalize">{value}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-3 mt-5">
                <button type="button" onClick={() => navigate('/create-profile')} className="flex-1 py-2.5 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-400 rounded-xl text-sm font-semibold transition cursor-pointer">Edit Profile</button>
                <button type="button" onClick={handleSignOut} className="flex-1 py-2.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 rounded-xl text-sm font-semibold transition cursor-pointer">Sign Out</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* OTP Verification Modal */}
      {verifyModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4" style={{animation:'fadeIn .2s ease'}}>
          <div className="bg-slate-800 border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl" style={{animation:'scaleIn .25s ease'}}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-bold text-lg flex items-center gap-2"><ShieldCheck size={18} className="text-emerald-400" /> Verify Worker</h3>
              <button type="button" onClick={() => setVerifyModal({ open: false, bookingId: null })} className="text-slate-400 hover:text-white transition cursor-pointer"><X size={18} /></button>
            </div>
            <p className="text-slate-400 text-sm mb-5">An OTP will be sent to the worker's phone. Ask the worker to share the code with you.</p>
            {verifyError && <p className="text-red-400 text-xs mb-3 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{verifyError}</p>}
            {!verifyOtpSent ? (
              <button type="button" onClick={() => handleSendVerifyOtp(verifyModal.bookingId)} disabled={verifySending}
                className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white font-semibold rounded-xl text-sm transition flex items-center justify-center gap-2 cursor-pointer">
                {verifySending ? <><Loader2 size={15} className="animate-spin" /> Sending...</> : <>Send OTP to Worker</>}
              </button>
            ) : (
              <div>
                <label className="text-slate-400 text-xs mb-1.5 block">Enter the 6-digit OTP from the worker</label>
                <input type="text" maxLength={6} value={verifyOtp} onChange={e => setVerifyOtp(e.target.value.replace(/\D/g,''))}
                  className="w-full px-4 py-3 bg-slate-700/50 border border-white/10 rounded-xl text-white text-center text-xl tracking-[0.5em] font-mono focus:outline-none focus:border-emerald-500/50 mb-4" placeholder="• • • • • •" />
                <button type="button" onClick={handleConfirmVerifyOtp} disabled={verifyOtp.length < 6 || verifyChecking}
                  className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white font-semibold rounded-xl text-sm transition flex items-center justify-center gap-2 cursor-pointer">
                  {verifyChecking ? <><Loader2 size={15} className="animate-spin" /> Verifying...</> : <>Verify</>}
                </button>
                <button type="button" onClick={() => { setVerifyOtpSent(false); setVerifyError('') }} className="w-full mt-2 py-2 text-slate-400 hover:text-white text-xs transition cursor-pointer">Resend OTP</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Success Popup */}
      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" style={{animation:'fadeIn .2s ease'}}>
          <div className="bg-slate-800 border border-emerald-500/30 rounded-2xl p-8 text-center shadow-2xl max-w-xs" style={{animation:'bounceIn .4s ease'}}>
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-500/40 flex items-center justify-center mx-auto mb-4" style={{animation:'pulseGlow 1.5s infinite'}}>
              <ShieldCheck size={32} className="text-emerald-400" />
            </div>
            <h3 className="text-white font-bold text-xl mb-1">Worker Verified!</h3>
            <p className="text-slate-400 text-sm">The worker has been verified successfully.</p>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes scaleIn { from { opacity: 0; transform: scale(0.9) } to { opacity: 1; transform: scale(1) } }
        @keyframes bounceIn { 0% { opacity:0; transform:scale(0.5) } 60% { transform:scale(1.1) } 100% { opacity:1; transform:scale(1) } }
        @keyframes pulseGlow { 0%,100% { box-shadow: 0 0 0 0 rgba(16,185,129,0.3) } 50% { box-shadow: 0 0 20px 8px rgba(16,185,129,0.15) } }
      `}</style>
    </div>
  )
}
