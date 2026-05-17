import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { API_BASE_URL } from '../lib/capacitor'
import {
  MapPin, Clock, CalendarDays, CheckCircle, AlertCircle,
  Navigation, Loader2, Shield, ArrowLeft, Star, Phone, User
} from 'lucide-react'

const SERVICES = [
  { label:'Electrician', icon:'⚡' }, { label:'Plumber', icon:'🔧' },
  { label:'AC Repair', icon:'❄️' }, { label:'Carpenter', icon:'🪚' },
  { label:'Painter', icon:'🎨' }, { label:'Technician', icon:'📱' },
  { label:'Cleaner', icon:'🧹' },
]
const SLOTS = ['09:00 AM','10:00 AM','11:00 AM','12:00 PM','01:00 PM','02:00 PM','03:00 PM','04:00 PM','05:00 PM','06:00 PM']

export default function Search() {
  const { user } = useAuth()
  const [svc, setSvc] = useState('')
  const [date, setDate] = useState('')
  const [slot, setSlot] = useState('')
  const [note, setNote] = useState('')
  const [addr, setAddr] = useState('')
  const [lat, setLat] = useState(null)
  const [lng, setLng] = useState(null)
  const [locL, setLocL] = useState(false)
  const [error, setError] = useState('')
  // Phases: form | searching | found | confirmed
  const [phase, setPhase] = useState('form')
  const [searchMsg, setSearchMsg] = useState('')
  const [bookingId, setBookingId] = useState(null)
  const [foundWorker, setFoundWorker] = useState(null)
  const pollRef = useRef(null)

  useEffect(() => { return () => { if (pollRef.current) clearInterval(pollRef.current) } }, [])

  const geoLoc = () => {
    if (!navigator.geolocation) { setError('Geolocation not supported.'); return }
    setLocL(true); setError('')
    navigator.geolocation.getCurrentPosition(
      async (p) => { setLat(p.coords.latitude); setLng(p.coords.longitude); try { const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${p.coords.latitude}&lon=${p.coords.longitude}`); const d = await r.json(); setAddr(d.display_name || '') } catch {} setLocL(false) },
      () => { setLocL(false); setError('Could not get location.') }, { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const minD = () => { const d = new Date(); d.setDate(d.getDate()+1); return d.toISOString().split('T')[0] }

  const getToken = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token
  }

  const submit = async () => {
    if (!svc) { setError('Please select a service.'); return }
    if (!date || !slot) { setError('Please select date and time.'); return }
    if (!lat && !addr.trim()) { setError('Please provide your location.'); return }
    setError('')
    setPhase('searching')

    // Animate search messages
    const msgs = ['Looking for nearby professionals...','Checking availability...','Sending request to workers...','Waiting for a worker to accept...']
    let i = 0
    setSearchMsg(msgs[0])
    const msgInterval = setInterval(() => { i++; if (i < msgs.length) setSearchMsg(msgs[i]) }, 1500)

    try {
      const token = await getToken()
      const res = await fetch(`${API_BASE_URL}/api/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ service_type: svc, booking_date: date, time_slot: slot, note: note.trim() || null, customer_lat: lat, customer_lng: lng, customer_address: addr.trim() || null, city: addr.split(',').slice(-3, -2)[0]?.trim() || '' })
      })
      const json = await res.json()
      clearInterval(msgInterval)
      if (!json.success) { setError(json.message || 'Failed to create booking.'); setPhase('form'); return }

      setBookingId(json.data.id)
      setSearchMsg('Waiting for a worker to accept...')

      // Poll for worker acceptance
      pollRef.current = setInterval(async () => {
        try {
          const t = await getToken()
          const r = await fetch(`${API_BASE_URL}/api/bookings/${json.data.id}`, { headers: { Authorization: `Bearer ${t}` } })
          const d = await r.json()
          if (d.success && d.data.status === 'confirmed' && d.data.worker) {
            clearInterval(pollRef.current)
            setFoundWorker(d.data.worker)
            setPhase('found')
            setTimeout(() => setPhase('confirmed'), 2500)
          }
        } catch {}
      }, 3000)

    } catch (err) {
      clearInterval(msgInterval)
      setError('Network error. Please try again.')
      setPhase('form')
    }
  }

  const reset = () => {
    if (pollRef.current) clearInterval(pollRef.current)
    setPhase('form'); setSvc(''); setDate(''); setSlot(''); setNote(''); setAddr(''); setLat(null); setLng(null)
    setBookingId(null); setFoundWorker(null); setError('')
  }

  // ===== FULLSCREEN PHASES =====
  if (phase !== 'form') return (
    <div className="fixed inset-0 z-50 bg-[#0b1120] flex items-center justify-center" style={{animation:'fadeIn .3s ease'}}>
      {phase === 'searching' && (
        <div className="text-center px-6">
          <div className="relative w-44 h-44 mx-auto mb-8">
            <div className="absolute inset-0 rounded-full border-2 border-blue-500/20 animate-[radarPulse_2s_ease-out_infinite]" />
            <div className="absolute inset-4 rounded-full border-2 border-blue-500/30 animate-[radarPulse_2s_ease-out_0.4s_infinite]" />
            <div className="absolute inset-8 rounded-full border-2 border-blue-500/40 animate-[radarPulse_2s_ease-out_0.8s_infinite]" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/30 animate-pulse">
                <span className="text-2xl">{SERVICES.find(s=>s.label===svc)?.icon || '🔧'}</span>
              </div>
            </div>
            <div className="absolute w-3 h-3 bg-blue-400 rounded-full top-2 left-1/2 animate-[floatDot_3s_ease-in-out_infinite]" />
            <div className="absolute w-2 h-2 bg-cyan-400 rounded-full bottom-4 right-4 animate-[floatDot_3s_ease-in-out_infinite]" style={{animationDelay:'1s'}} />
            <div className="absolute w-2.5 h-2.5 bg-blue-300 rounded-full top-8 left-2 animate-[floatDot_3s_ease-in-out_infinite]" style={{animationDelay:'2s'}} />
          </div>
          <p className="text-white font-bold text-lg mb-2" key={searchMsg} style={{animation:'fadeSlide .4s ease'}}>{searchMsg}</p>
          <p className="text-slate-500 text-sm">{svc} · {date} · {slot}</p>
          <div className="mt-3 flex items-center justify-center gap-1.5 text-slate-600 text-xs"><Shield size={11} /> Workers are being notified</div>
          <button onClick={reset} className="mt-8 px-6 py-2 bg-white/5 border border-white/10 text-slate-400 rounded-xl text-xs cursor-pointer hover:text-white transition">Cancel Request</button>
        </div>
      )}
      {phase === 'found' && (
        <div className="text-center px-6" style={{animation:'bounceIn .5s ease'}}>
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center mx-auto mb-5 shadow-xl shadow-blue-500/30">
            <User size={40} className="text-white" />
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/20 border border-emerald-500/30 rounded-full mb-4">
            <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
            <span className="text-emerald-400 text-xs font-semibold">Worker Found!</span>
          </div>
          <h2 className="text-white font-bold text-xl mb-1">{foundWorker?.full_name}</h2>
          <div className="flex items-center justify-center gap-3 text-slate-500 text-xs mt-2">
            {foundWorker?.city && <span className="flex items-center gap-1"><MapPin size={11} /> {foundWorker.city}</span>}
            {foundWorker?.phone && <span className="flex items-center gap-1"><Phone size={11} /> {foundWorker.phone}</span>}
          </div>
          <p className="text-slate-600 text-xs mt-4">Confirming your booking...</p>
        </div>
      )}
      {phase === 'confirmed' && (
        <div className="text-center px-6" style={{animation:'bounceIn .5s ease'}}>
          <div className="w-20 h-20 rounded-full bg-emerald-500/15 border-2 border-emerald-500/30 flex items-center justify-center mx-auto mb-5" style={{animation:'pulseGlow 2s infinite'}}>
            <CheckCircle size={36} className="text-emerald-400" />
          </div>
          <h2 className="text-white font-bold text-2xl mb-2">Booking Confirmed! 🎉</h2>
          <div className="bg-slate-800/60 border border-white/5 rounded-2xl p-5 max-w-xs mx-auto mt-5 text-left space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-cyan-600 flex items-center justify-center text-white font-bold shrink-0">{foundWorker?.full_name?.charAt(0) || '?'}</div>
              <div><p className="text-white font-bold text-sm">{foundWorker?.full_name}</p><p className="text-blue-400 text-xs capitalize">{svc}</p></div>
            </div>
            <div className="border-t border-white/5 pt-3 space-y-1.5 text-xs">
              <div className="flex justify-between"><span className="text-slate-500">📅 Date</span><span className="text-white font-medium">{date}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">🕐 Time</span><span className="text-white font-medium">{slot}</span></div>
              {foundWorker?.phone && <div className="flex justify-between"><span className="text-slate-500">📞 Phone</span><span className="text-white font-medium">{foundWorker.phone}</span></div>}
              <div className="flex justify-between"><span className="text-slate-500">Status</span><span className="text-emerald-400 font-bold">Confirmed ✓</span></div>
            </div>
          </div>
          <div className="flex gap-3 justify-center mt-6">
            <Link to="/dashboard/customer" className="px-6 py-2.5 bg-blue-500 text-white text-sm font-semibold rounded-xl shadow-lg shadow-blue-500/20">My Bookings</Link>
            <button onClick={reset} className="px-6 py-2.5 bg-white/5 border border-white/10 text-slate-300 text-sm font-semibold rounded-xl cursor-pointer">Book Another</button>
          </div>
        </div>
      )}
      <style>{`
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes fadeSlide{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes bounceIn{0%{opacity:0;transform:scale(.5)}60%{transform:scale(1.05)}100%{opacity:1;transform:scale(1)}}
        @keyframes pulseGlow{0%,100%{box-shadow:0 0 0 0 rgba(16,185,129,.3)}50%{box-shadow:0 0 24px 8px rgba(16,185,129,.15)}}
        @keyframes radarPulse{0%{transform:scale(.8);opacity:.8}100%{transform:scale(1.8);opacity:0}}
        @keyframes floatDot{0%,100%{transform:translateY(0) scale(1);opacity:.6}50%{transform:translateY(-12px) scale(1.3);opacity:1}}
      `}</style>
    </div>
  )

  // ===== FORM PHASE =====
  return (
    <div className="min-h-screen bg-[#0b1120]">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="relative bg-gradient-to-br from-slate-800 via-slate-800 to-blue-900/40 border border-white/10 rounded-2xl p-6 mb-6 overflow-hidden">
          <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '32px 32px' }} />
          <div className="relative flex items-center justify-between">
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-white">Book a Service</h1>
              <p className="text-slate-400 text-xs mt-1">Select what you need and we'll find the best professional nearby</p>
            </div>
            <Link to="/dashboard/customer" className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-white rounded-xl text-xs font-medium transition flex items-center gap-1.5">
              <ArrowLeft size={14} /> Dashboard
            </Link>
          </div>
        </div>

        <div className="bg-slate-800/60 border border-white/5 rounded-2xl p-6 space-y-6">
          {/* Service Type */}
          <div>
            <label className="text-sm font-semibold text-white mb-3 block">What service do you need?</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {SERVICES.map(s => (
                <button key={s.label} onClick={() => setSvc(s.label)}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition cursor-pointer ${svc === s.label ? 'bg-blue-500/15 border-blue-500/30 shadow-lg shadow-blue-500/10' : 'bg-white/5 border-white/5 hover:border-white/10 hover:bg-white/10'}`}>
                  <span className="text-2xl">{s.icon}</span>
                  <span className={`text-xs font-medium ${svc === s.label ? 'text-blue-400' : 'text-slate-400'}`}>{s.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Date */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-semibold text-white mb-2"><CalendarDays size={14} className="text-blue-400" /> When do you need it?</label>
            <input type="date" min={minD()} value={date} onChange={e => setDate(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-blue-500/50 text-sm" />
          </div>

          {/* Time */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-semibold text-white mb-2"><Clock size={14} className="text-blue-400" /> Preferred time</label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {SLOTS.map(s => (
                <button key={s} onClick={() => setSlot(s)}
                  className={`py-2.5 rounded-xl text-xs font-medium cursor-pointer transition ${slot === s ? 'bg-blue-500/15 text-blue-400 border border-blue-500/20' : 'bg-white/5 text-slate-400 border border-white/5 hover:text-white'}`}>{s}</button>
              ))}
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-semibold text-white mb-2"><MapPin size={14} className="text-blue-400" /> Your location</label>
            {lat ? (
              <div className="flex items-center gap-2 p-3 bg-white/5 rounded-xl border border-white/5">
                <p className="text-slate-300 text-xs truncate flex-1">📍 {addr || `${lat.toFixed(4)}, ${lng.toFixed(4)}`}</p>
                <button onClick={() => { setLat(null); setLng(null); setAddr('') }} className="text-red-400 text-xs cursor-pointer hover:text-red-300">✕ Remove</button>
              </div>
            ) : (
              <div className="space-y-2">
                <button onClick={geoLoc} disabled={locL} className="w-full py-3 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-xl text-xs font-medium cursor-pointer flex items-center justify-center gap-1.5">
                  {locL ? <><Loader2 size={13} className="animate-spin" /> Detecting...</> : <><Navigation size={13} /> Use Current Location</>}
                </button>
                <div className="flex items-center gap-2"><div className="flex-1 h-px bg-white/5" /><span className="text-slate-600 text-[10px]">or</span><div className="flex-1 h-px bg-white/5" /></div>
                <input value={addr} onChange={e => setAddr(e.target.value)} placeholder="Type your address..."
                  className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-blue-500/50" />
              </div>
            )}
          </div>

          {/* Note */}
          <div>
            <label className="text-sm font-semibold text-white mb-2 block">Describe your issue (optional)</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="E.g. Leaking pipe in kitchen..." rows={2}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 text-sm resize-none focus:outline-none focus:border-blue-500/50" />
          </div>

          {error && <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3"><AlertCircle size={14} className="text-red-400 shrink-0" /><p className="text-red-400 text-xs">{error}</p></div>}

          <button onClick={submit} className="w-full py-3.5 bg-blue-500 hover:bg-blue-400 text-white font-bold rounded-xl text-sm cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 transition">
            Find Workers Nearby
          </button>

          <div className="flex items-center justify-center gap-1.5 text-slate-600 text-[10px]"><Shield size={10} /> All professionals are verified & background-checked</div>
        </div>
      </div>
    </div>
  )
}