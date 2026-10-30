import { useState } from 'react'
import { autoLevel, latencyTest, measureNoise } from '../audio/calibration'
import type { InputKind } from '../audio/InputSource'
import { createDeviceSource, createFileSource, listAudioInputs } from '../audio/sources'
import { DetectionStatus } from './DetectionStatus'
import { LevelMeter } from './LevelMeter'
import { Tuner } from './Tuner'
import { rememberInput, useEngine } from './hooks'

const KINDS: { kind: InputKind; label: string; hint: string }[] = [
  { kind: 'mic', label: '🎤 Amp + Mic', hint: 'Mic close to the amp speaker, moderate volume.' },
  { kind: 'interface', label: '🔌 Audio Interface', hint: 'Bass plugged straight into the interface input.' },
  { kind: 'file', label: '📁 Test File', hint: 'Play a recorded bass clip into the detector.' },
]

export function Setup({ onBack }: { onBack: () => void }) {
  const e = useEngine()
  const [kind, setKind] = useState<InputKind>(e.source?.kind ?? 'mic')
  const [devices, setDevices] = useState<MediaDeviceInfo[] | null>(null)
  const [deviceId, setDeviceId] = useState<string>('')
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [levelMsg, setLevelMsg] = useState<string | null>(null)
  const [beat, setBeat] = useState<{ n: number; counting: boolean } | null>(null)

  async function loadDevices() {
    try {
      const list = await listAudioInputs()
      setDevices(list)
      if (!deviceId && list[0]) setDeviceId(list[0].deviceId)
    } catch (err) {
      setMsg(`Microphone permission denied: ${String(err)}`)
    }
  }

  async function connectDevice() {
    if (kind === 'file') return
    const dev = devices?.find((d) => d.deviceId === deviceId)
    const label = dev?.label || 'Default input'
    await e.connect(createDeviceSource(kind, deviceId || undefined, label))
    if (e.source) rememberInput({ kind, deviceId: deviceId || undefined, label })
  }

  async function connectFile(file: File) {
    await e.connect(createFileSource(file))
  }

  async function runNoise() {
    setBusy('noise')
    setMsg('Stay quiet… mute your strings with your hand.')
    const gate = await measureNoise(e)
    e.updateProfile({ gate })
    setMsg(`Noise gate set to ${gate.toFixed(4)}.`)
    setBusy(null)
  }

  async function runAutoLevel() {
    setBusy('auto')
    const r = await autoLevel(e, (step) =>
      setMsg(step === 'silence' ? 'Step 1/2: stay silent — rest your hand on the strings…' : 'Step 2/2: pluck open E over and over, like you normally would!'),
    )
    if (r.ok) e.updateProfile({ gainDb: r.gainDb, gate: r.gate })
    setLevelMsg(r.message)
    setMsg(null)
    setBusy(null)
  }

  async function runLatency() {
    setBusy('latency')
    setMsg('Listen to 4 count-in clicks, then pluck open E on each of the next 8 clicks.')
    const r = await latencyTest(e, (n, counting) => setBeat({ n, counting }))
    setBeat(null)
    if (r.matched < 4) setMsg(`Only heard ${r.matched}/${r.total} notes. Turn the gain up or check the level meter, then try again.`)
    else {
      e.updateProfile({ latencyMs: r.latencyMs })
      setMsg(`Latency: ${r.latencyMs} ms (heard ${r.matched}/${r.total}). Your hits will be corrected by this amount.`)
    }
    setBusy(null)
  }

  const p = e.profile

  return (
    <div className="screen setup">
      <header className="screen-head">
        <button className="ghost" onClick={onBack}>← Back</button>
        <h1>Setup</h1>
      </header>

      <section className="card">
        <h2>1 · Input</h2>
        <div className="seg">
          {KINDS.map((k) => (
            <button key={k.kind} className={kind === k.kind ? 'on' : ''} onClick={() => setKind(k.kind)}>
              {k.label}
            </button>
          ))}
        </div>
        <p className="muted">{KINDS.find((k) => k.kind === kind)!.hint}</p>

        {kind === 'file' ? (
          <input type="file" accept="audio/*" onChange={(ev) => ev.target.files?.[0] && connectFile(ev.target.files[0])} />
        ) : devices === null ? (
          <button onClick={loadDevices}>Allow microphone access</button>
        ) : (
          <div className="row">
            <select value={deviceId} onChange={(ev) => setDeviceId(ev.target.value)}>
              {devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || 'Unnamed input'}
                </option>
              ))}
            </select>
            <button className="primary" onClick={connectDevice}>Connect</button>
          </div>
        )}
        {e.error && <p className="error">{e.error}</p>}
        {e.source && <p className="ok">Connected: {e.source.label}</p>}
      </section>

      {e.source && p && (
        <>
          <section className="card">
            <h2>2 · Level</h2>
            <p className="muted">Pluck hard: the bar should get near the right but stay out of the red. When you're silent it should sit left of the white line.</p>
            <div className="row">
              <button className="primary" disabled={!!busy} onClick={runAutoLevel}>{busy === 'auto' ? 'Listening…' : '✨ Auto-level'}</button>
              <span className="muted">Sets gain and noise gate for you (5 seconds).</span>
            </div>
            {busy === 'auto' && msg && <p className="beat-flash play">{msg}</p>}
            {levelMsg && <p className="muted">{levelMsg}</p>}
            <LevelMeter />
            <DetectionStatus />
            <div className="sliders">
              <label>
                Gain <b>{p.gainDb} dB</b>
                <input type="range" min={-12} max={36} value={p.gainDb} onChange={(ev) => e.updateProfile({ gainDb: Number(ev.target.value) })} />
              </label>
              <label>
                Bass boost <b>{p.bassBoostDb} dB</b>
                <input type="range" min={0} max={15} value={p.bassBoostDb} onChange={(ev) => e.updateProfile({ bassBoostDb: Number(ev.target.value) })} />
              </label>
              <label>
                Noise gate <b>{p.gate.toFixed(4)}</b>
                <input
                  type="range" min={-3} max={-1} step={0.05} value={Math.log10(p.gate)}
                  onChange={(ev) => e.updateProfile({ gate: 10 ** Number(ev.target.value) })}
                />
              </label>
              {e.source.kind === 'interface' && (
                <label>
                  Channel
                  <select value={p.channel} onChange={async (ev) => {
                    e.updateProfile({ channel: Number(ev.target.value) as 0 | 1 })
                    await e.connect(e.source!)
                  }}>
                    <option value={0}>Input 1</option>
                    <option value={1}>Input 2</option>
                  </select>
                </label>
              )}
            </div>
          </section>

          <section className="card">
            <h2>3 · Tune up</h2>
            <Tuner />
          </section>

          <section className="card">
            <h2>4 · Calibrate</h2>
            <div className="row">
              <button disabled={!!busy} onClick={runNoise}>{busy === 'noise' ? 'Listening…' : 'Measure room noise'}</button>
              <button disabled={!!busy} onClick={runLatency}>{busy === 'latency' ? 'Running…' : 'Latency test'}</button>
              <span className="muted">Current latency: {p.latencyMs} ms</span>
            </div>
            {beat && (
              <div className={`beat-flash ${beat.counting ? 'counting' : 'play'}`} key={beat.n}>
                {beat.counting ? `Count ${beat.n + 1}` : 'PLUCK E!'}
              </div>
            )}
            {msg && <p className="muted">{msg}</p>}
          </section>
        </>
      )}
    </div>
  )
}
