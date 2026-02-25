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
  const [hasCompletedStudy, setHasCompletedStudy] = useState(false)
  const [checkingCompletion, setCheckingCompletion] = useState(true)

  const trialInputRef = useRef<HTMLInputElement>(null)
  const prevTrialValueRef = useRef("")

  useEffect(() => {
    const isTouchDevice = navigator.maxTouchPoints > 0
    const isSmallScreen = window.innerWidth < 768
    setDeviceType(isTouchDevice || isSmallScreen ? "mobile" : "desktop")

    if (localStorage.getItem("hasCompletedStudy") === "true") {
      setHasCompletedStudy(true)
    }
    setCheckingCompletion(false)
  }, [])

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

  const startStudy = () => {
    setStudyData({ ...studyData, startTime: Date.now() })
    setCurrentScreen("registration")
  }

  const registerPassword = () => {
    if (registerValue.length <= 15) return
    setTargetPassword(registerValue)
    const order = shuffleArray([0, 1, 2, 3])
    setTrialOrder(order)
    setCurrentTrialIndex(0)
    setupTrial()
    setCurrentScreen("testing")
  }

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
    if (currentMethod?.id === "LASTCHAR") {
      const displayValue = e.target.value
      if (lastCharTimeout) clearTimeout(lastCharTimeout)
      
      const prevLength = prevTrialValueRef.current.length
      const currentLength = displayValue.length
      
      if (currentLength < prevLength) {
        const newValue = trialValue.slice(0, -1)
        setTrialValue(newValue)
        setLastCharDisplay("•".repeat(newValue.length))
      } else if (currentLength > prevLength) {
        const newChar = displayValue.slice(-1)
        const newValue = trialValue + newChar
        setTrialValue(newValue)
        const masked = "•".repeat(newValue.length - 1) + newChar
        setLastCharDisplay(masked)

        const timeout = setTimeout(() => {
          setLastCharDisplay("•".repeat(newValue.length))
        }, 250)
        setLastCharTimeout(timeout)
      }
      prevTrialValueRef.current = displayValue
    } else if (currentMethod?.id !== "GROUPED") {
      const value = e.target.value
      setTrialValue(value)
      if (value.length > targetPassword.length) setOverflowDetected(true)
    }
  }

  const renderGroupedDisplay = (value: string) => {
    const display = document.getElementById("grouped-display")
    if (!display) return

    if (value.length === 0) {
      display.innerHTML = '<span class="placeholder text-zinc-600">...</span>'
      return
    }

    let html = '<span class="grouped-content">'
    for (let i = 0; i < value.length; i++) {
      html += '<span class="char">•</span>'
      if ((i + 1) % 4 === 0 && i < value.length - 1) {
        html += '<span class="space"></span>'
      }
    }
    html += '<span class="cursor"></span>'
    html += '</span>'
    display.innerHTML = html
  }

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
    if (preferredMethod === methodId) setPreferredMethod(null)
    else if (hatedMethod === methodId) setHatedMethod(null)
    else if (!preferredMethod) setPreferredMethod(methodId)
    else if (!hatedMethod) setHatedMethod(methodId)
  }

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
      if (!error) localStorage.setItem("hasCompletedStudy", "true")
    } catch (err) {
      console.error(err)
    }
    setCurrentScreen("thanks")
  }

  const targetColors = hashToColors(targetPassword)
  const currentColors = hashToColors(currentMethod?.id === "GROUPED" ? groupedRealValue : trialValue)

  const canFinish =
    preferredMethod !== null &&
    hatedMethod !== null &&
    Object.values(methodRatings).every(
      (r) => r.visibility !== null && r.error_recovery !== null && r.security !== null && r.distraction !== null
    )

  const inputBaseClasses =
    "w-[140px] bg-zinc-900/80 border border-zinc-700/50 rounded-xl px-5 py-4 font-mono text-2xl text-white placeholder:text-zinc-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 transition-all duration-200"

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4 sm:p-6">
      <div className="fixed inset-0 bg-gradient-to-br from-zinc-950 via-zinc-950 to-zinc-950 pointer-events-none" />

      {checkingCompletion ? (
        <div className="relative z-10 text-zinc-500 text-sm">Laden...</div>
      ) : hasCompletedStudy ? (
        <div className="relative z-10 w-full max-w-md">
          <div className="bg-zinc-900/80 border border-zinc-800/50 rounded-3xl shadow-2xl p-8 text-center space-y-6">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 rounded-full mx-auto">
              <Shield className="w-8 h-8 text-emerald-400" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-white">Vielen Dank!</h1>
              <p className="text-zinc-400 leading-relaxed text-sm">
                Sie haben diese Studie bereits abgeschlossen. Eine mehrfache Teilnahme ist nicht möglich.
              </p>
            </div>
            <div className="pt-2 border-t border-zinc-800">
              <p className="text-zinc-600 text-xs">Universität Bonn - Institut für Informatik</p>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-cyan-950/20 via-transparent to-transparent pointer-events-none" />
          <div className="relative w-full max-w-lg">
            <div className="relative bg-zinc-900/70 backdrop-blur-2xl border border-zinc-800/80 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-black/50">
              <div className="absolute -inset-px bg-gradient-to-br from-cyan-500/10 via-transparent to-blue-500/10 rounded-3xl pointer-events-none" />
              <div className="relative">
                {currentScreen === "instructions" && (
                  <AnimatedScreen className="space-y-6">
                    <div className="text-center space-y-3">
                      <div className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-500/10 border border-cyan-500/20 rounded-full text-cyan-400 text-sm font-medium">
                        <Lock className="w-4 h-4" /> HCI-Forschungsstudie
                      </div>
                      <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Einwilligungserklärung</h1>
                      <p className="text-zinc-400 text-sm">Universität Bonn - Institut für Informatik</p>
                    </div>
                    <div className="space-y-4 text-sm text-zinc-300 leading-relaxed">
                      <div className="bg-zinc-800/50 border border-zinc-700/30 rounded-2xl p-4 space-y-3">
                        <h2 className="font-semibold text-white">Ziel der Studie</h2>
                        <p>Diese Studie untersucht verschiedene Methoden zur Passwort-Eingabe...</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setConsentChecked(!consentChecked)}
                      className="w-full flex items-start gap-3 p-4 bg-zinc-800/50 border border-zinc-700/50 rounded-2xl hover:bg-zinc-800/70 transition-colors text-left"
                    >
                      <div className={`flex-shrink-0 w-6 h-6 rounded-lg border-2 flex items-center justify-center ${consentChecked ? "bg-cyan-500 border-cyan-500" : "border-zinc-600"}`}>
                        {consentChecked && <Check className="w-4 h-4 text-white" />}
                      </div>
                      <span className="text-sm text-zinc-300">Ich stimme der Teilnahme zu.</span>
                    </button>
                    <button
                      onClick={startStudy}
                      disabled={!consentChecked}
                      className="w-full min-h-[48px] bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-semibold py-4 rounded-xl disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      Studie beginnen <ChevronRight className="w-5 h-5" />
                    </button>
                  </AnimatedScreen>
                )}

                {currentScreen === "registration" && (
                  <AnimatedScreen className="space-y-6">
                    <div className="text-center space-y-2">
                      <h1 className="text-2xl font-bold text-white">Passwort erstellen</h1>
                      <p className="text-zinc-400 text-sm">Mindestens 16 Zeichen.</p>
                    </div>
                    <input
                      type="text"
                      style={{ WebkitTextSecurity: 'disc' }}
                      value={registerValue}
                      onChange={(e) => setRegisterValue(e.target.value)}
                      className={inputBaseClasses + " !w-full"}
                      placeholder="Passwort eingeben..."
                    />
                    <button
                      onClick={registerPassword}
                      disabled={registerValue.length <= 15}
                      className="w-full bg-cyan-600 text-white py-4 rounded-xl disabled:opacity-50"
                    >
                      Weiter
                    </button>
                  </AnimatedScreen>
                )}

                {currentScreen === "testing" && currentMethod && (
                  <AnimatedScreen key={currentTrialIndex} className="space-y-6">
                    <div className="text-center space-y-3">
                      <h1 className="text-2xl font-bold text-white">Methode: {currentMethod.name}</h1>
                    </div>
                    <div className="flex justify-center">
                      {currentMethod.id === "STANDARD" && (
                        <input
                          ref={trialInputRef}
                          type="text"
                          style={{ WebkitTextSecurity: 'disc' }}
                          value={trialValue}
                          onChange={handleTrialChange}
                          onKeyDown={handleTrialKeydown}
                          className={inputBaseClasses}
                        />
                      )}
                      {currentMethod.id === "GROUPED" && (
                         <div className="relative">
                           <input
                             ref={trialInputRef}
                             type="text"
                             onKeyDown={handleTrialKeydown}
                             className={`${inputBaseClasses} text-transparent caret-transparent`}
                           />
                           <div id="grouped-display" className="absolute inset-0 px-5 py-4 font-mono text-white pointer-events-none flex items-center overflow-hidden">
                             <span className="placeholder text-zinc-600">...</span>
                           </div>
                         </div>
                      )}
                      {currentMethod.id === "LASTCHAR" && (
                        <input
                          ref={trialInputRef}
                          type="text"
                          value={lastCharDisplay || trialValue}
                          onChange={handleTrialChange}
                          onKeyDown={handleTrialKeydown}
                          className={inputBaseClasses}
                        />
                      )}
                      {currentMethod.id === "CHROMA" && (
                        <div className="flex flex-col items-center gap-4">
                           <input
                            ref={trialInputRef}
                            type="text"
                            style={{ WebkitTextSecurity: 'disc' }}
                            value={trialValue}
                            onChange={handleTrialChange}
                            onKeyDown={handleTrialKeydown}
                            className={inputBaseClasses}
                          />
                          <div className="flex gap-2">
                            {currentColors.map((c, i) => <div key={i} className="w-8 h-3 rounded-full" style={{backgroundColor: c}} />)}
                          </div>
                        </div>
                      )}
                    </div>
                    <button onClick={submitTrial} className="w-full bg-cyan-600 text-white py-4 rounded-xl">Absenden</button>
                  </AnimatedScreen>
                )}

                {currentScreen === "result" && (
                  <AnimatedScreen className="space-y-6 text-center">
                    <h1 className="text-2xl font-bold text-white">{resultSuccess ? "Erfolgreich!" : "Fehler"}</h1>
                    <button onClick={nextTrial} className="w-full bg-cyan-600 text-white py-4 rounded-xl">Weiter</button>
                  </AnimatedScreen>
                )}

                {currentScreen === "feedback" && (
                  <AnimatedScreen className="space-y-8">
                    <h1 className="text-2xl font-bold text-white text-center">Feedback</h1>
                    <div className="grid grid-cols-2 gap-3">
                      {methods.map(m => (
                        <button 
                          key={m.id} 
                          onClick={() => handleMethodClick(m.id)}
                          className={`p-4 border-2 rounded-xl ${preferredMethod === m.id ? 'border-emerald-500 bg-emerald-500/10' : hatedMethod === m.id ? 'border-red-500 bg-red-500/10' : 'border-zinc-700'}`}
                        >
                          <span className="text-white text-sm font-bold">{m.name}</span>
                        </button>
                      ))}
                    </div>
                    <button onClick={downloadResults} disabled={!canFinish} className="w-full bg-emerald-600 text-white py-4 rounded-xl disabled:opacity-50">
                      Abschließen
                    </button>
                  </AnimatedScreen>
                )}

                {currentScreen === "thanks" && (
                  <AnimatedScreen className="text-center py-8">
                    <h1 className="text-2xl font-bold text-white">Vielen Dank!</h1>
                  </AnimatedScreen>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
