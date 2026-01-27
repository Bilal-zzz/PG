"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import { createClient } from "@supabase/supabase-js"
import { CheckCircle2, XCircle, ChevronRight, Star, Lock, Eye, Shield, Sparkles, Check } from "lucide-react"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface Method {
  id: string
  name: string
  description: string
  icon: React.ReactNode
}

interface TrialData {
  method: string
  success: boolean
  durationMs: number
  timeToFirstKey: number | null
  averageKeystrokeInterval: number | null
  backspaceCount: number
  overflowDetected: boolean
}

interface StudyData {
  startTime: number | null
  trials: TrialData[]
  feedback: {
    preferred_method?: string
    hated_method?: string
    method_ratings?: {
      [key: string]: {
        visibility: number | null
        error_recovery: number | null
        security: number | null
        distraction: number | null
      }
    }
    open_feedback?: string
  }
}

const methods: Method[] = [
  {
    id: "STANDARD",
    name: "Standard",
    description: "Ein Standard-Passwortfeld mit maskierten Zeichen.",
    icon: <Lock className="w-5 h-5" />,
  },
  {
    id: "GROUPED",
    name: "Gruppierte Maskierung",
    description: "Zeichen werden alle 4 Zeichen visuell gruppiert für bessere Übersicht.",
    icon: <Eye className="w-5 h-5" />,
  },
  {
    id: "LASTCHAR",
    name: "Letztes Zeichen Sichtbar",
    description: "Letztes Zeichen kurz sichtbar. Sofortiges Feedback (Mobile-Standard).",
    icon: <Shield className="w-5 h-5" />,
  },
  {
    id: "CHROMA",
    name: "Chroma Hash",
    description: "Farbige Balken als visueller Anker. Permanentes Feedback ohne Text.",
    icon: <Sparkles className="w-5 h-5" />,
  },
]

// Animation wrapper component
function AnimatedScreen({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const [isVisible, setIsVisible] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 50)
    return () => clearTimeout(timer)
  }, [])
  return (
    <div
      className={`transition-all duration-500 ease-out ${
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
      } ${className}`}
    >
      {children}
    </div>
  )
}

// Star rating component with improved UX
function StarRating({
  value,
  onChange,
  label,
}: {
  value: number | null
  onChange: (val: number) => void
  label: string
}) {
  const [hovered, setHovered] = useState<number | null>(null)

  return (
    <div className="space-y-2">
      <label className="block text-sm text-zinc-300 leading-relaxed">{label}</label>
      <div className="flex gap-1" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((val) => {
          const isActive = (hovered !== null ? hovered >= val : (value ?? 0) >= val)
          return (
            <button
              key={val}
              type="button"
              role="radio"
              aria-checked={value === val}
              aria-label={`${val} von 5 Sternen`}
              onClick={() => onChange(val)}
              onMouseEnter={() => setHovered(val)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(val)}
              onBlur={() => setHovered(null)}
              className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 ${
                isActive
                  ? "bg-gradient-to-br from-cyan-500 to-blue-600 text-white scale-105 shadow-lg shadow-cyan-500/30"
                  : "bg-zinc-800/80 text-zinc-500 hover:bg-zinc-700/80 hover:text-zinc-400 border border-zinc-700/50"
              }`}
            >
              <Star className={`w-5 h-5 ${isActive ? "fill-current" : ""}`} />
            </button>
          )
        })}
      </div>
      <div className="flex justify-between text-xs text-zinc-600">
        <span>Stimme nicht zu</span>
        <span>Stimme voll zu</span>
      </div>
    </div>
  )
}

export default function PasswordStudy() {
  const [currentScreen, setCurrentScreen] = useState<
    "instructions" | "registration" | "testing" | "result" | "feedback" | "thanks"
  >("instructions")
  const [targetPassword, setTargetPassword] = useState("")
  const [registerValue, setRegisterValue] = useState("")
  const [trialOrder, setTrialOrder] = useState<number[]>([])
  const [currentTrialIndex, setCurrentTrialIndex] = useState(0)
  const [studyData, setStudyData] = useState<StudyData>({
    startTime: null,
    trials: [],
    feedback: {},
  })

  // Trial tracking
  const [trialValue, setTrialValue] = useState("")
  const [trialStartTime, setTrialStartTime] = useState<number | null>(null)
  const [firstKeyTime, setFirstKeyTime] = useState<number | null>(null)
  const [keystrokeTimestamps, setKeystrokeTimestamps] = useState<number[]>([])
  const [backspaceCount, setBackspaceCount] = useState(0)
  const [overflowDetected, setOverflowDetected] = useState(false)
  const [resultSuccess, setResultSuccess] = useState(false)
  const [lastCharTimeout, setLastCharTimeout] = useState<NodeJS.Timeout | null>(null)
  const [groupedRealValue, setGroupedRealValue] = useState("")
  const [lastCharDisplay, setLastCharDisplay] = useState("")

  const [preferredMethod, setPreferredMethod] = useState<string | null>(null)
  const [hatedMethod, setHatedMethod] = useState<string | null>(null)
  const [methodRatings, setMethodRatings] = useState<{
    [key: string]: {
      visibility: number | null
      error_recovery: number | null
      security: number | null
      distraction: number | null
    }
  }>({
    STANDARD: { visibility: null, error_recovery: null, security: null, distraction: null },
    GROUPED: { visibility: null, error_recovery: null, security: null, distraction: null },
    LASTCHAR: { visibility: null, error_recovery: null, security: null, distraction: null },
    CHROMA: { visibility: null, error_recovery: null, security: null, distraction: null },
  })
  const [openFeedback, setOpenFeedback] = useState("")
  const [consentChecked, setConsentChecked] = useState(false)
  const [deviceType, setDeviceType] = useState<"mobile" | "desktop">("desktop")

  const trialInputRef = useRef<HTMLInputElement>(null)
  const prevTrialValueRef = useRef("")

  // Detect device type on mount
  useEffect(() => {
    const isTouchDevice = navigator.maxTouchPoints > 0
    const isSmallScreen = window.innerWidth < 768
    setDeviceType(isTouchDevice || isSmallScreen ? "mobile" : "desktop")
  }, [])

  // Utilities
  const shuffleArray = (array: number[]) => {
    const arr = [...array]
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
    return arr
  }

  const djb2Hash = (str: string) => {
    let hash = 5381
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) + hash + str.charCodeAt(i)
      hash = hash & hash
    }
    return Math.abs(hash)
  }

  const hashToColors = (str: string) => {
    if (!str) return ["hsl(220, 15%, 25%)", "hsl(220, 15%, 25%)", "hsl(220, 15%, 25%)"]
    const hash1 = djb2Hash(str)
    const hash2 = djb2Hash(str + "salt1")
    const hash3 = djb2Hash(str + "salt2")
    return [
      `hsl(${hash1 % 360}, 75%, 55%)`,
      `hsl(${hash2 % 360}, 75%, 55%)`,
      `hsl(${hash3 % 360}, 75%, 55%)`,
    ]
  }

  const currentMethod = trialOrder.length > 0 ? methods[trialOrder[currentTrialIndex]] : null

  // Start study
  const startStudy = () => {
    setStudyData({ ...studyData, startTime: Date.now() })
    setCurrentScreen("registration")
  }

  // Register password
  const registerPassword = () => {
    if (registerValue.length <= 15) return
    setTargetPassword(registerValue)
    const order = shuffleArray([0, 1, 2, 3])
    setTrialOrder(order)
    setCurrentTrialIndex(0)
    setupTrial()
    setCurrentScreen("testing")
  }

  // Setup trial
  const setupTrial = () => {
    setTrialValue("")
    setTrialStartTime(Date.now())
    setFirstKeyTime(null)
    setKeystrokeTimestamps([])
    setBackspaceCount(0)
    setOverflowDetected(false)
    setGroupedRealValue("")
    setLastCharDisplay("")
    prevTrialValueRef.current = ""
    setTimeout(() => trialInputRef.current?.focus(), 100)
  }

  const handleTrialKeydown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Handle Enter to submit
    if (e.key === "Enter") {
      e.preventDefault()
      submitTrial()
      return
    }

    const now = Date.now()
    if (!firstKeyTime) setFirstKeyTime(now)
    setKeystrokeTimestamps([...keystrokeTimestamps, now])

    if (e.key === "Backspace") {
      setBackspaceCount(backspaceCount + 1)
    }

    if (currentMethod?.id === "GROUPED") {
      e.preventDefault()
      let newValue = groupedRealValue

      if (e.key === "Backspace") {
        newValue = newValue.slice(0, -1)
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        newValue += e.key
        if (newValue.length > targetPassword.length) {
          setOverflowDetected(true)
        }
      }

      setGroupedRealValue(newValue)
      renderGroupedDisplay(newValue)
    }
  }

  const handleTrialChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setTrialValue(value)

    if (value.length > targetPassword.length) {
      setOverflowDetected(true)
    }

    if (currentMethod?.id === "LASTCHAR") {
      // Clear any existing timeout
      if (lastCharTimeout) clearTimeout(lastCharTimeout)
      
      if (value.length === 0) {
        setLastCharDisplay("")
      } else {
        // Check if this was a deletion (value got shorter)
        const wasDeleted = value.length < prevTrialValueRef.current.length
        
        if (wasDeleted) {
          // On deletion, just show all dots (no reveal)
          setLastCharDisplay("•".repeat(value.length))
        } else {
          // On addition, show last character briefly
          const masked = "•".repeat(value.length - 1) + value.slice(-1)
          setLastCharDisplay(masked)

          const timeout = setTimeout(() => {
            setLastCharDisplay("•".repeat(value.length))
          }, 1000)
          setLastCharTimeout(timeout)
        }
      }
      
      // Update the ref for next comparison
      prevTrialValueRef.current = value
    }
  }

  // Render grouped display
  const renderGroupedDisplay = (value: string) => {
    const display = document.getElementById("grouped-display")
    if (!display) return

    if (value.length === 0) {
      display.innerHTML = '<span class="placeholder">Geben Sie Ihr Passwort ein...</span>'
      return
    }

    let html = ""
    for (let i = 0; i < value.length; i++) {
      html += '<span class="char">•</span>'
      if ((i + 1) % 4 === 0 && i < value.length - 1) {
        html += '<span class="space"></span>'
      }
    }
    html += '<span class="cursor"></span>'
    display.innerHTML = html
  }

  // Submit trial
  const submitTrial = () => {
    const endTime = Date.now()
    const actualValue = currentMethod?.id === "GROUPED" ? groupedRealValue : trialValue
    const success = actualValue === targetPassword

    let avgInterval = null
    if (keystrokeTimestamps.length > 1) {
      const intervals = []
      for (let i = 1; i < keystrokeTimestamps.length; i++) {
        intervals.push(keystrokeTimestamps[i] - keystrokeTimestamps[i - 1])
      }
      avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length
    }

    const trialData: TrialData = {
      method: currentMethod?.id || "",
      success,
      durationMs: endTime - (trialStartTime || endTime),
      timeToFirstKey: firstKeyTime && trialStartTime ? firstKeyTime - trialStartTime : null,
      averageKeystrokeInterval: avgInterval,
      backspaceCount,
      overflowDetected,
    }

    setStudyData({ ...studyData, trials: [...studyData.trials, trialData] })
    setResultSuccess(success)
    setCurrentScreen("result")
  }

  // Next trial
  const nextTrial = () => {
    if (currentTrialIndex < 3) {
      setCurrentTrialIndex(currentTrialIndex + 1)
      setupTrial()
      setCurrentScreen("testing")
    } else {
      setCurrentScreen("feedback")
    }
  }

  const handleMethodClick = (methodId: string) => {
    if (preferredMethod === methodId) {
      setPreferredMethod(null)
    } else if (hatedMethod === methodId) {
      setHatedMethod(null)
    } else if (!preferredMethod) {
      setPreferredMethod(methodId)
    } else if (!hatedMethod) {
      setHatedMethod(methodId)
    }
  }

  // Download results and send to Supabase
  const downloadResults = async () => {
    const finalData = {
      device_type: deviceType,
      trials: studyData.trials,
      survey: {
        preferred_method: preferredMethod,
        hated_method: hatedMethod,
        method_ratings: methodRatings,
        open_feedback: openFeedback,
      },
      endTime: Date.now(),
    }

    try {
      const { error } = await supabase.from("UserstudyDaten").insert({
        data: finalData,
        created_at: new Date().toISOString(),
      })

      if (error) {
        console.error("Supabase error:", error)
      }
    } catch (err) {
      console.error("Failed to send to Supabase:", err)
    }

    setCurrentScreen("thanks")
  }

  // Target colors for Chroma Hash
  const targetColors = hashToColors(targetPassword)
  const currentColors = hashToColors(currentMethod?.id === "GROUPED" ? groupedRealValue : trialValue)

  const canFinish =
    preferredMethod !== null &&
    hatedMethod !== null &&
    Object.values(methodRatings).every(
      (r) => r.visibility !== null && r.error_recovery !== null && r.security !== null && r.distraction !== null
    )

  // Common input classes with overflow guarantee - max-w set to overflow at ~15 characters
  const inputBaseClasses =
    "w-full max-w-[160px] sm:max-w-[180px] bg-zinc-900/80 border border-zinc-700/50 rounded-xl px-4 py-3.5 font-mono text-base text-white placeholder:text-zinc-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 transition-all duration-200"

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4 sm:p-6">
      {/* Subtle gradient background */}
      <div className="fixed inset-0 bg-gradient-to-br from-zinc-950 via-zinc-950 to-zinc-950 pointer-events-none" />
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-cyan-950/20 via-transparent to-transparent pointer-events-none" />

      <div className="relative w-full max-w-lg">
        {/* Glassmorphism card */}
        <div className="relative bg-zinc-900/70 backdrop-blur-2xl border border-zinc-800/80 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-black/50">
          {/* Subtle glow effect */}
          <div className="absolute -inset-px bg-gradient-to-br from-cyan-500/10 via-transparent to-blue-500/10 rounded-3xl pointer-events-none" />

          <div className="relative">
            {/* Instructions / Consent Screen */}
            {currentScreen === "instructions" && (
              <AnimatedScreen className="space-y-6">
                <div className="text-center space-y-3">
                  <div className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-500/10 border border-cyan-500/20 rounded-full text-cyan-400 text-sm font-medium">
                    <Lock className="w-4 h-4" />
                    HCI-Forschungsstudie
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Einwilligungserklärung</h1>
                  <p className="text-zinc-400 text-sm">Universität Bonn - Institut für Informatik</p>
                </div>

                <div className="space-y-4 text-sm text-zinc-300 leading-relaxed">
                  <div className="bg-zinc-800/50 border border-zinc-700/30 rounded-2xl p-4 space-y-3">
                    <h2 className="font-semibold text-white">Ziel der Studie</h2>
                    <p>
                      Diese Studie untersucht verschiedene Methoden zur Passwort-Eingabe im Rahmen einer akademischen
                      Forschungsarbeit. Wir möchten verstehen, welche Eingabemethoden als benutzerfreundlich und sicher
                      empfunden werden.
                    </p>
                  </div>

                  <div className="bg-zinc-800/50 border border-zinc-700/30 rounded-2xl p-4 space-y-3">
                    <h2 className="font-semibold text-white">Was Sie tun werden</h2>
                    <ul className="space-y-2">
                      {[
                        { id: 1, content: <>Ein <strong className="text-cyan-400">fiktives</strong> Passwort mit mehr als 15 Zeichen erstellen</> },
                        { id: 2, content: <>Dasselbe Passwort 4-mal mit verschiedenen Eingabe-Designs eingeben</> },
                        { id: 3, content: <>Kurzes Feedback zu Ihrer Erfahrung geben</> },
                      ].map((item) => (
                        <li key={item.id} className="flex items-start gap-2">
                          <span className="text-cyan-400 mt-0.5">•</span>
                          <span>{item.content}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="text-zinc-500 text-xs mt-2">Geschätzte Dauer: 3-5 Minuten</p>
                  </div>

                  <div className="bg-zinc-800/50 border border-zinc-700/30 rounded-2xl p-4 space-y-3">
                    <h2 className="font-semibold text-white">Datenschutzhinweis (DSGVO)</h2>
                    <p>
                      Ihre Daten werden <strong className="text-emerald-400">vollständig anonymisiert</strong> und sicher in
                      einer Datenbank gespeichert. Es werden keine personenbezogenen Daten erhoben. Die erhobenen Daten
                      (Tastaturanschläge, Zeitmessungen, Feedback) dienen ausschließlich der wissenschaftlichen Auswertung
                      an der Universität Bonn.
                    </p>
                  </div>
                </div>

                <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4">
                  <p className="text-amber-200/90 font-semibold text-sm leading-relaxed">
                    Wichtig: Verwenden Sie KEIN echtes Passwort! Bitte erfinden Sie ein neues Passwort für diese Studie.
                  </p>
                </div>

                {/* Consent Checkbox */}
                <button
                  type="button"
                  onClick={() => setConsentChecked(!consentChecked)}
                  className="w-full flex items-start gap-3 p-4 bg-zinc-800/50 border border-zinc-700/50 rounded-2xl hover:bg-zinc-800/70 transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900"
                  aria-pressed={consentChecked}
                >
                  <div
                    className={`flex-shrink-0 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all duration-200 ${
                      consentChecked
                        ? "bg-gradient-to-br from-cyan-500 to-blue-600 border-cyan-500"
                        : "border-zinc-600 bg-zinc-900/50"
                    }`}
                  >
                    {consentChecked && <Check className="w-4 h-4 text-white" />}
                  </div>
                  <span className="text-sm text-zinc-300 leading-relaxed">
                    Ich verstehe, dass meine Teilnahme <strong className="text-white">freiwillig</strong> und{" "}
                    <strong className="text-white">anonym</strong> ist. Ich werde{" "}
                    <strong className="text-amber-300">KEIN echtes Passwort</strong> verwenden. Ich stimme zu, dass meine
                    anonymisierten Daten für akademische Forschungszwecke verwendet werden dürfen.
                  </span>
                </button>

                <button
                  onClick={startStudy}
                  disabled={!consentChecked}
                  className="w-full min-h-[48px] bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:from-zinc-800 disabled:to-zinc-800 disabled:text-zinc-600 text-white font-semibold py-4 px-6 rounded-xl transition-all duration-200 shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30 disabled:shadow-none hover:scale-[1.02] active:scale-[0.98] disabled:scale-100 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 flex items-center justify-center gap-2"
                >
                  Studie beginnen
                  <ChevronRight className="w-5 h-5" />
                </button>
              </AnimatedScreen>
            )}

            {/* Registration Screen */}
            {currentScreen === "registration" && (
              <AnimatedScreen className="space-y-6">
                <div className="text-center space-y-2">
                  <h1 className="text-2xl font-bold text-white tracking-tight">Erstellen Sie Ihr Passwort</h1>
                  <p className="text-zinc-400 text-sm leading-relaxed">
                    Geben Sie ein Passwort ein, das Sie sich merken können. Es muss länger als 15 Zeichen sein.
                  </p>
                </div>

                <div className="space-y-3">
                  <label
                    htmlFor="register-password"
                    className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider"
                  >
                    Ihr Test-Passwort
                  </label>
                  <input
                    type="password"
                    id="register-password"
                    name="new-password-registration"
                    value={registerValue}
                    onChange={(e) => setRegisterValue(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && registerValue.length > 15 && registerPassword()}
                    className={inputBaseClasses + " !max-w-full"}
                    placeholder="Mindestens 16 Zeichen eingeben..."
                    autoComplete="new-password"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck="false"
                    data-lpignore="true"
                    data-form-type="other"
                    aria-describedby="password-length"
                  />
                  <div
                    id="password-length"
                    className={`text-sm font-medium transition-colors ${
                      registerValue.length > 15 ? "text-emerald-400" : "text-zinc-500"
                    }`}
                  >
                    {registerValue.length} / 16+ Zeichen
                    {registerValue.length > 15 && <span className="ml-2">✓</span>}
                  </div>
                </div>

                <button
                  onClick={registerPassword}
                  disabled={registerValue.length <= 15}
                  className="w-full min-h-[48px] bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:from-zinc-800 disabled:to-zinc-800 disabled:text-zinc-600 text-white font-semibold py-4 px-6 rounded-xl transition-all duration-200 shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30 disabled:shadow-none hover:scale-[1.02] active:scale-[0.98] disabled:scale-100 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 flex items-center justify-center gap-2"
                >
                  Weiter
                  <ChevronRight className="w-5 h-5" />
                </button>
              </AnimatedScreen>
            )}

            {/* Testing Screen */}
            {currentScreen === "testing" && currentMethod && (
              <AnimatedScreen key={currentTrialIndex} className="space-y-6">
                {/* Progress dots */}
                <div className="flex justify-center gap-2" role="progressbar" aria-valuenow={currentTrialIndex + 1} aria-valuemin={1} aria-valuemax={4}>
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className={`h-2 rounded-full transition-all duration-500 ${
                        i < currentTrialIndex
                          ? "w-8 bg-emerald-500"
                          : i === currentTrialIndex
                            ? "w-12 bg-gradient-to-r from-cyan-500 to-blue-500"
                            : "w-2 bg-zinc-700"
                      }`}
                    />
                  ))}
                </div>

                <div className="text-center space-y-3">
                  <h1 className="text-2xl font-bold text-white tracking-tight">Geben Sie Ihr Passwort erneut ein</h1>
                  <div className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-500/10 border border-cyan-500/20 rounded-xl text-cyan-400 text-sm font-medium">
                    {currentMethod.icon}
                    Methode {currentTrialIndex + 1}/4: {currentMethod.name}
                  </div>
                </div>

                <div className="bg-zinc-800/50 border border-zinc-700/30 rounded-2xl p-4">
                  <p className="text-zinc-400 text-sm leading-relaxed">{currentMethod.description}</p>
                </div>

                <div className="space-y-3">
                  <label
                    htmlFor="trial-input"
                    className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider"
                  >
                    Passwort
                  </label>

                  {currentMethod.id === "STANDARD" && (
                    <input
                      ref={trialInputRef}
                      type="password"
                      id="trial-input"
                      name="trial-password-standard"
                      value={trialValue}
                      onChange={handleTrialChange}
                      onKeyDown={handleTrialKeydown}
                      className={inputBaseClasses}
                      placeholder="Geben Sie Ihr Passwort ein..."
                      autoComplete="new-password"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck="false"
                      data-lpignore="true"
                      data-form-type="other"
                      aria-label="Passwort eingeben"
                    />
                  )}

                  {currentMethod.id === "GROUPED" && (
                    <div className="relative">
                      <input
                        ref={trialInputRef}
                        type="text"
                        id="trial-input"
                        name="trial-password-grouped"
                        onKeyDown={handleTrialKeydown}
                        className={`${inputBaseClasses} text-transparent caret-transparent selection:bg-transparent`}
                        autoComplete="new-password"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck="false"
                        data-lpignore="true"
                        data-form-type="other"
                        aria-label="Gruppiertes Passwort eingeben"
                      />
                      <div
                        id="grouped-display"
                        className="absolute inset-0 px-4 py-3.5 font-mono text-white pointer-events-none flex items-center overflow-hidden"
                      >
                        <span className="placeholder text-zinc-600">Geben Sie Ihr Passwort ein...</span>
                      </div>
                      <style jsx>{`
                        .char {
                          display: inline;
                          font-size: 1rem;
                        }
                        .space {
                          display: inline-block;
                          width: 0.75em;
                        }
                        .cursor {
                          display: inline-block;
                          width: 2px;
                          height: 1.25em;
                          background: linear-gradient(to bottom, #06b6d4, #3b82f6);
                          margin-left: 2px;
                          animation: blink 1s step-end infinite;
                          vertical-align: middle;
                        }
                        @keyframes blink {
                          0%,
                          100% {
                            opacity: 1;
                          }
                          50% {
                            opacity: 0;
                          }
                        }
                        .placeholder {
                          color: #52525b;
                        }
                      `}</style>
                    </div>
                  )}

                  {currentMethod.id === "LASTCHAR" && (
                    <div className="relative">
                      <input
                        ref={trialInputRef}
                        type="text"
                        id="trial-input"
                        name="trial-password-lastchar"
                        value={trialValue}
                        onChange={handleTrialChange}
                        onKeyDown={handleTrialKeydown}
                        className={`${inputBaseClasses} text-transparent caret-transparent selection:bg-transparent`}
                        autoComplete="new-password"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck="false"
                        data-lpignore="true"
                        data-form-type="other"
                        aria-label="Passwort mit letztem sichtbarem Zeichen eingeben"
                      />
                      <div className="absolute inset-0 px-4 py-3.5 font-mono text-white pointer-events-none flex items-center tracking-wider overflow-hidden">
                        {lastCharDisplay || <span className="text-zinc-600">Geben Sie Ihr Passwort ein...</span>}
                      </div>
                    </div>
                  )}

                  {currentMethod.id === "CHROMA" && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-4">
                        <input
                          ref={trialInputRef}
                          type="password"
                          id="trial-input"
                          name="trial-password-chroma"
                          value={trialValue}
                          onChange={handleTrialChange}
                          onKeyDown={handleTrialKeydown}
                          className={`${inputBaseClasses} flex-1`}
                          placeholder="Geben Sie Ihr Passwort ein..."
                          autoComplete="new-password"
                          autoCorrect="off"
                          autoCapitalize="off"
                          spellCheck="false"
                          data-lpignore="true"
                          data-form-type="other"
                          aria-label="Passwort mit Farbfeedback eingeben"
                        />
                        <div className="flex flex-col gap-1.5" aria-label="Aktuelle Farbcodes">
                          {currentColors.map((color, i) => (
                            <div
                              key={i}
                              className="w-12 h-3 rounded-full transition-all duration-300 ease-out shadow-lg"
                              style={{
                                backgroundColor: color,
                                boxShadow: `0 0 12px ${color}40`,
                              }}
                            />
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-4 justify-end">
                        <span className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">Ziel</span>
                        <div className="flex flex-col gap-1.5" aria-label="Ziel-Farbcodes">
                          {targetColors.map((color, i) => (
                            <div
                              key={i}
                              className="w-12 h-3 rounded-full border-2 border-zinc-600/50"
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <p className="text-xs text-zinc-500 text-center">Drücken Sie Enter oder klicken Sie auf Absenden</p>

                <button
                  onClick={submitTrial}
                  className="w-full min-h-[48px] bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold py-4 px-6 rounded-xl transition-all duration-200 shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30 hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900"
                >
                  Absenden
                </button>
              </AnimatedScreen>
            )}

            {/* Result Screen */}
            {currentScreen === "result" && (
              <AnimatedScreen className="space-y-6 text-center">
                <div
                  className={`w-20 h-20 mx-auto rounded-full flex items-center justify-center ${
                    resultSuccess
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-red-500/20 text-red-400"
                  }`}
                >
                  {resultSuccess ? (
                    <CheckCircle2 className="w-10 h-10" />
                  ) : (
                    <XCircle className="w-10 h-10" />
                  )}
                </div>
                <div className="space-y-2">
                  <h1 className="text-2xl font-bold text-white tracking-tight">
                    {resultSuccess ? "Erfolgreich!" : "Nicht übereinstimmend"}
                  </h1>
                  <p className="text-zinc-400 leading-relaxed">
                    {resultSuccess
                      ? "Ihr Passwort wurde korrekt eingegeben."
                      : "Das eingegebene Passwort stimmte nicht mit dem Original überein."}
                  </p>
                </div>
                <button
                  onClick={nextTrial}
                  className="w-full min-h-[48px] bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold py-4 px-6 rounded-xl transition-all duration-200 shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30 hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 flex items-center justify-center gap-2"
                >
                  {currentTrialIndex < 3 ? "Nächste Aufgabe" : "Zum Feedback"}
                  <ChevronRight className="w-5 h-5" />
                </button>
              </AnimatedScreen>
            )}

            {/* Feedback Screen */}
            {currentScreen === "feedback" && (
              <AnimatedScreen className="space-y-8">
                <div className="text-center space-y-2">
                  <h1 className="text-2xl font-bold text-white tracking-tight">Ergebnisse & Feedback</h1>
                  <p className="text-zinc-400 text-sm leading-relaxed">
                    Bewerten Sie Ihre Erfahrung mit den verschiedenen Methoden
                  </p>
                </div>

                {/* Ranking Section */}
                <div className="space-y-4">
                  <div className="space-y-1">
                    <h2 className="text-lg font-semibold text-white">Ranking</h2>
                    <p className="text-sm text-zinc-400 leading-relaxed">
                      Klicken Sie auf die <span className="text-emerald-400 font-semibold">beste</span> Methode (1.
                      Klick) und dann auf die <span className="text-red-400 font-semibold">schlechteste</span> Methode
                      (2. Klick)
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {methods.map((method) => {
                      const isPreferred = preferredMethod === method.id
                      const isHated = hatedMethod === method.id
                      return (
                        <button
                          key={method.id}
                          onClick={() => handleMethodClick(method.id)}
                          aria-pressed={isPreferred || isHated}
                          aria-label={`${method.name}${isPreferred ? " - Beste Wahl" : isHated ? " - Schlechteste Wahl" : ""}`}
                          className={`relative min-h-[80px] p-4 rounded-2xl border-2 transition-all duration-300 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 ${
                            isPreferred
                              ? "bg-emerald-500/15 border-emerald-500/50 shadow-lg shadow-emerald-500/20 scale-[1.02]"
                              : isHated
                                ? "bg-red-500/15 border-red-500/50 shadow-lg shadow-red-500/20 scale-[1.02]"
                                : "bg-zinc-800/50 border-zinc-700/50 hover:border-zinc-600 hover:bg-zinc-800/70"
                          }`}
                        >
                          {isPreferred && (
                            <span className="absolute -top-2 -right-2 bg-emerald-500 text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-lg">
                              BESTE
                            </span>
                          )}
                          {isHated && (
                            <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-lg">
                              SCHLECHTESTE
                            </span>
                          )}
                          <div className="flex items-center gap-2 mb-1">
                            <span
                              className={
                                isPreferred ? "text-emerald-400" : isHated ? "text-red-400" : "text-zinc-400"
                              }
                            >
                              {method.icon}
                            </span>
                            <span
                              className={`font-semibold ${
                                isPreferred ? "text-emerald-300" : isHated ? "text-red-300" : "text-white"
                              }`}
                            >
                              {method.name}
                            </span>
                          </div>
                          <div className="text-xs text-zinc-500 line-clamp-2">{method.description}</div>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Method Ratings */}
                <div className="space-y-6">
                  <h2 className="text-lg font-semibold text-white">Bewertungen pro Methode</h2>

                  {Object.entries(methodRatings).map(([methodKey, ratings]) => {
                    const methodNames: { [key: string]: string } = {
                      STANDARD: "Standard",
                      GROUPED: "Gruppierte Maskierung",
                      LASTCHAR: "Letztes Zeichen sichtbar",
                      CHROMA: "Farbfeedback",
                    }
                    const methodIcons: { [key: string]: React.ReactNode } = {
                      STANDARD: <Lock className="w-4 h-4" />,
                      GROUPED: <Eye className="w-4 h-4" />,
                      LASTCHAR: <Shield className="w-4 h-4" />,
                      CHROMA: <Sparkles className="w-4 h-4" />,
                    }
                    const questions = [
                      { key: "visibility", label: "Ich wusste immer, ob meine Eingabe registriert wurde." },
                      { key: "error_recovery", label: "Fehler zu korrigieren war einfach." },
                      { key: "security", label: "Ich fühlte mich geschützt vor neugierigen Blicken." },
                      { key: "distraction", label: "Die visuellen Effekte waren ablenkend." },
                    ]

                    return (
                      <div
                        key={methodKey}
                        className="p-5 rounded-2xl bg-zinc-800/40 border border-zinc-700/50 space-y-5"
                      >
                        <div className="flex items-center gap-2 text-cyan-400">
                          {methodIcons[methodKey]}
                          <h3 className="font-semibold">{methodNames[methodKey]}</h3>
                        </div>
                        {questions.map((q) => (
                          <StarRating
                            key={q.key}
                            label={q.label}
                            value={ratings[q.key as keyof typeof ratings]}
                            onChange={(val) =>
                              setMethodRatings({
                                ...methodRatings,
                                [methodKey]: { ...ratings, [q.key]: val },
                              })
                            }
                          />
                        ))}
                      </div>
                    )
                  })}
                </div>

                {/* Open Feedback */}
                <div className="space-y-3">
                  <label htmlFor="open-feedback" className="block text-sm text-zinc-300 font-medium">
                    Was hat Sie beim langen Passwort am meisten gestört?
                  </label>
                  <textarea
                    id="open-feedback"
                    rows={3}
                    value={openFeedback}
                    onChange={(e) => setOpenFeedback(e.target.value)}
                    className="w-full bg-zinc-900/80 border border-zinc-700/50 rounded-xl px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 transition-all resize-none text-sm leading-relaxed"
                    placeholder="Teilen Sie Ihre Gedanken..."
                  />
                </div>

                <button
                  onClick={downloadResults}
                  disabled={!canFinish}
                  className="w-full min-h-[48px] bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:from-zinc-800 disabled:to-zinc-800 disabled:text-zinc-600 text-white font-semibold py-4 px-6 rounded-xl transition-all duration-200 shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 disabled:shadow-none hover:scale-[1.02] active:scale-[0.98] disabled:scale-100 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900"
                >
                  Abschließen
                </button>
                {!canFinish && (
                  <p className="text-xs text-zinc-500 text-center">
                    Bitte wählen Sie beste/schlechteste Methode und bewerten Sie alle Aussagen
                  </p>
                )}
              </AnimatedScreen>
            )}

            {/* Thank You Screen */}
            {currentScreen === "thanks" && (
              <AnimatedScreen className="space-y-6 text-center py-8">
                <div className="w-20 h-20 mx-auto rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <CheckCircle2 className="w-10 h-10 text-emerald-400" />
                </div>
                <div className="space-y-2">
                  <h1 className="text-2xl font-bold text-white tracking-tight">Vielen Dank!</h1>
                  <p className="text-zinc-400 leading-relaxed">
                    Ihre Studiendaten wurden gespeichert. Vielen Dank für Ihre Teilnahme an dieser Forschung!
                  </p>
                </div>
              </AnimatedScreen>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
