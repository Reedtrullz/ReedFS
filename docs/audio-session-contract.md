# Audio session behavior

The player enables Web Audio through the AUDIO control. Starting checks the
actual context state on every gesture; later suspension offers RESUME. Locked,
running, suspended, failed, and closed context states are observable. Engine
nodes are created only while enabled and stopped/disconnected on teardown;
disposal is idempotent, including React StrictMode effect remounts.

Engine audio and new warning delivery run only during an active flight in a
visible document. Pause, reset, scenario change, saved-state recovery, and
backgrounding silence engine nodes and cancel old speech. Context suspension
also gates speech. The browser may require a new gesture to resume its context.
Accelerated simulation does not multiply sound pitch or speech rate. Warning
repeat intervals use monotonic wall time, independent of simulation rate.

GPWS selects the highest-priority applicable current condition. It never names
GLIDESLOPE without a qualified receiver/deviation contract; that mode remains
unavailable pending issue #113. These simplified envelopes are training aids,
with no GPWS/TAWS certification claim. Invalid radio altitude and nonfinite
kinematic data produce no callout.

One current GPWS utterance owns delivery. A changed condition replaces obsolete
speech immediately, urgent alerts do not inherit another alert's cooldown, and
persistent conditions do not enqueue repetitions while speech is active.
Captions use separate per-condition repeat timing and identify caption delivery;
missing voices and rejected speech cannot remove caption-only warning access.
Old completion callbacks cannot retire a newer utterance. Future crew, radio,
and system sources must extend this scheduler rather than add competing queues.

The effective master level applies to both Web Audio and speech. Zero and mute
cancel/gate speech and silence the Web Audio master. Captions have an independent
setting. Persisted settings validate their version and values; the existing
slider and checkboxes support keyboard and touch. Two maximum-N1 engines have a
combined bus gain bound of 0.192 before the master. Native offline PCM checks
exercise this bound and exact master-zero silence; speech-volume receipts do
not establish acoustic output or combined device peak level.

## Verification boundaries

Unit regressions cover condition applicability, priority, timing, cancellation,
volume, rejection, reset, context resume, and stored settings. Native Chromium
integration covers later suspension/gesture, paused engine PCM silence,
teardown, StrictMode remount node counts, master/mute cancellation, rejected
speech captions, reset, and keyboard volume persistence. Touch Chromium
emulation checks operability, not physical mobile autoplay/background behavior.
Native offline Web Audio renders overlapping engines and master-zero silence.
Speech transport is controlled in the browser test using native utterances;
voice availability, physical desktop/mobile/headset listening and accessibility
trials remain separate acceptance evidence for issue #103 and later #59/#104/#105.
